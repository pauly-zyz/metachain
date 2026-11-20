import {
  decodeEventLog,
  formatUnits,
  type Address,
  type Hex,
  type Log,
  type PublicClient,
} from "viem";
import { metaTokenPaymasterAbi } from "./abis.js";

/** Price modes reported by MetaPriceOracle (see contracts/src/interfaces/IMetaPriceOracle.sol). */
export const PriceMode = { Open: 0, Closed: 1, Fallback: 2 } as const;
export type PriceModeValue = (typeof PriceMode)[keyof typeof PriceMode];
export const PRICE_MODE_LABEL: Record<number, string> = {
  0: "Market open (fresh Chainlink)",
  1: "Market closed (last Chainlink price + TWAP check)",
  2: "Fallback (Uniswap V3 TWAP)",
};

export const BPS = 10_000n;
export const WAD = 10n ** 18n;
/** EntryPoint v0.7 PENALTY_PERCENT on unused execution gas. */
export const UNUSED_GAS_PENALTY_PERCENT = 10n;

export interface PaymasterState {
  metaUsd: bigint; // 18 decimals
  ethUsd: bigint; // 18 decimals
  validUntil: number;
  updatedAt: number;
  mode: PriceModeValue;
  markupBps: bigint;
  maxUsdPerOp: bigint;
  postOpOverheadGas: bigint;
  paused: boolean;
}

export interface UserOpGas {
  callGasLimit: bigint;
  verificationGasLimit: bigint;
  preVerificationGas: bigint;
  paymasterVerificationGasLimit: bigint;
  paymasterPostOpGasLimit: bigint;
  maxFeePerGas: bigint;
}

export interface MetaFeeEstimate {
  /** Worst-case cost charged up-front (EntryPoint requiredPrefund). */
  maxCostWei: bigint;
  maxUsd: bigint; // 18 decimals, incl. markup
  maxMeta: bigint; // token units, incl. markup — pre-charged then partially refunded
  /** Expected cost assuming gas limits are ~fully used at the current effective gas price. */
  expectedCostWei: bigint;
  expectedUsd: bigint;
  expectedMeta: bigint;
  mode: PriceModeValue;
  modeLabel: string;
  metaUsd: bigint;
  ethUsd: bigint;
  markupBps: bigint;
  priceValidUntil: number;
}

// ---------------------------------------------------------------- pure math (mirrors the contract)

function mulDivUp(a: bigint, b: bigint, d: bigint): bigint {
  const p = a * b;
  return p % d === 0n ? p / d : p / d + 1n;
}

export function weiToUsd(wei: bigint, ethUsd: bigint): bigint {
  return mulDivUp(wei, ethUsd, WAD);
}

/** META (token units, 18 decimals) for a USD amount incl. markup — identical rounding to the paymaster. */
export function usdToMetaWithMarkup(usd: bigint, metaUsd: bigint, markupBps: bigint, tokenUnit = WAD): bigint {
  return mulDivUp(usd * (BPS + markupBps), tokenUnit, metaUsd * BPS);
}

export function metaToUsd(meta: bigint, metaUsd: bigint, tokenUnit = WAD): bigint {
  return (meta * metaUsd) / tokenUnit;
}

/** EntryPoint v0.7 requiredPrefund. */
export function maxCostWei(gas: UserOpGas): bigint {
  return (
    (gas.callGasLimit +
      gas.verificationGasLimit +
      gas.preVerificationGas +
      gas.paymasterVerificationGasLimit +
      gas.paymasterPostOpGasLimit) *
    gas.maxFeePerGas
  );
}

/** META the paymaster will actually charge for a given EntryPoint `actualGasCost` (postOp formula). */
export function computeActualCharge(args: {
  actualGasCost: bigint;
  actualUserOpFeePerGas: bigint;
  executionGasLimit: bigint; // callGasLimit + paymasterPostOpGasLimit
  postOpOverheadGas: bigint;
  metaUsd: bigint;
  ethUsd: bigint;
  markupBps: bigint;
  preCharge: bigint;
}): bigint {
  const unusedBound =
    args.executionGasLimit > args.postOpOverheadGas ? args.executionGasLimit - args.postOpOverheadGas : 0n;
  const extraGas = args.postOpOverheadGas + (unusedBound * UNUSED_GAS_PENALTY_PERCENT) / 100n;
  const gasCostWei = args.actualGasCost + extraGas * args.actualUserOpFeePerGas;
  const charge = usdToMetaWithMarkup(weiToUsd(gasCostWei, args.ethUsd), args.metaUsd, args.markupBps);
  return charge < args.preCharge ? charge : args.preCharge;
}

// ---------------------------------------------------------------- on-chain reads

export async function getPaymasterState(client: PublicClient, paymaster: Address): Promise<PaymasterState> {
  const [cache, paused] = await Promise.all([
    client.readContract({ address: paymaster, abi: metaTokenPaymasterAbi, functionName: "priceCache" }),
    client.readContract({ address: paymaster, abi: metaTokenPaymasterAbi, functionName: "paused" }),
  ]);
  const [metaUsd, ethUsd, validUntil, updatedAt, mode] = cache;
  const [params, fee] = await Promise.all([
    client.readContract({ address: paymaster, abi: metaTokenPaymasterAbi, functionName: "modeParams", args: [mode] }),
    client.readContract({ address: paymaster, abi: metaTokenPaymasterAbi, functionName: "feeConfig" }),
  ]);
  return {
    metaUsd,
    ethUsd,
    validUntil: Number(validUntil),
    updatedAt: Number(updatedAt),
    mode: mode as PriceModeValue,
    markupBps: params[0],
    maxUsdPerOp: params[1],
    postOpOverheadGas: BigInt(fee[3]),
    paused,
  };
}

/** Throws a descriptive error when the cached paymaster price cannot be used right now. */
export function assertPriceUsable(state: PaymasterState, nowSec = Math.floor(Date.now() / 1000), marginSec = 30) {
  if (state.paused) throw new Error("MetaTokenPaymaster is paused by the admin.");
  if (state.validUntil === 0) throw new Error("Paymaster price not initialized (call updatePrice()).");
  if (state.validUntil <= nowSec + marginSec) {
    throw new Error(
      `Paymaster price expired at ${new Date(state.validUntil * 1000).toISOString()} — a keeper must call updatePrice().`,
    );
  }
}

/** Estimate the META/USD cost of a UserOperation before sending it. */
export async function estimateMetaFee(args: {
  client: PublicClient;
  paymaster: Address;
  gas: UserOpGas;
  /** Effective gas price expected on inclusion; defaults to maxFeePerGas. */
  effectiveGasPrice?: bigint;
  state?: PaymasterState;
}): Promise<MetaFeeEstimate> {
  const state = args.state ?? (await getPaymasterState(args.client, args.paymaster));
  const maxCost = maxCostWei(args.gas);
  const maxUsd = weiToUsd(maxCost, state.ethUsd);
  const maxMeta = usdToMetaWithMarkup(maxUsd, state.metaUsd, state.markupBps);

  const price = args.effectiveGasPrice ?? args.gas.maxFeePerGas;
  const expectedCost = maxCostWei({ ...args.gas, maxFeePerGas: price });
  const expectedUsdRaw = weiToUsd(expectedCost, state.ethUsd);
  const expectedMeta = usdToMetaWithMarkup(expectedUsdRaw, state.metaUsd, state.markupBps);
  return {
    maxCostWei: maxCost,
    maxUsd: (maxUsd * (BPS + state.markupBps)) / BPS,
    maxMeta,
    expectedCostWei: expectedCost,
    expectedUsd: (expectedUsdRaw * (BPS + state.markupBps)) / BPS,
    expectedMeta,
    mode: state.mode,
    modeLabel: PRICE_MODE_LABEL[state.mode] ?? "unknown",
    metaUsd: state.metaUsd,
    ethUsd: state.ethUsd,
    markupBps: state.markupBps,
    priceValidUntil: state.validUntil,
  };
}

export interface MetaGasPaid {
  sender: Address;
  userOpHash: Hex;
  metaCharged: bigint;
  gasCostWei: bigint;
  usdCharged: bigint;
  metaUsd: bigint;
  ethUsd: bigint;
  mode: number;
}

/** Extract the `MetaGasPaid` event (actual META charged) from a transaction receipt's logs. */
export function parseMetaGasPaid(logs: readonly Log[], paymaster: Address): MetaGasPaid | undefined {
  for (const log of logs) {
    if (log.address.toLowerCase() !== paymaster.toLowerCase()) continue;
    try {
      const ev = decodeEventLog({ abi: metaTokenPaymasterAbi, data: log.data, topics: log.topics });
      if (ev.eventName === "MetaGasPaid") return ev.args as unknown as MetaGasPaid;
    } catch {
      // not ours
    }
  }
  return undefined;
}

export function formatUsd(usd18: bigint, decimals = 4): string {
  return `$${Number(formatUnits(usd18, 18)).toFixed(decimals)}`;
}

export function formatMeta(meta: bigint, decimals = 8): string {
  return `${Number(formatUnits(meta, 18)).toFixed(decimals)} META`;
}
