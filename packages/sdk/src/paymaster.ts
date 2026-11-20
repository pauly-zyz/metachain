import { encodeAbiParameters, type Address, type Hex, type PublicClient } from "viem";
import { getPaymasterState, maxCostWei, usdToMetaWithMarkup, weiToUsd, assertPriceUsable, BPS } from "./fees.js";

/** Defaults sized from Foundry measurements (validation ≈ 60-90k, postOp ≤ ~60k cold). */
export const PAYMASTER_VERIFICATION_GAS_LIMIT = 150_000n;
export const PAYMASTER_POST_OP_GAS_LIMIT = 120_000n;

/**
 * Encodes MetaTokenPaymaster `paymasterData`: an optional user-signed ceiling (`maxMetaCost`) on the META
 * pre-charge. `0n` means "no ceiling". Always 32 bytes so stub and final data have equal length.
 */
export function encodePaymasterData(maxMetaCost: bigint = 0n): Hex {
  return encodeAbiParameters([{ type: "uint256" }], [maxMetaCost]);
}

export interface MetaPaymasterOptions {
  client: PublicClient;
  paymaster: Address;
  /** Extra tolerance on the pre-charge ceiling, in bps (default 200 = 2%). Set `null` to disable the ceiling. */
  slippageBps?: bigint | null;
  verificationGasLimit?: bigint;
  postOpGasLimit?: bigint;
  /** Check the cached price before building data (default true). */
  checkPrice?: boolean;
}

type GasFields = {
  callGasLimit?: bigint;
  verificationGasLimit?: bigint;
  preVerificationGas?: bigint;
  maxFeePerGas?: bigint;
};

/**
 * viem/permissionless-compatible paymaster (`paymaster:` option of a bundler / smart account client)
 * that routes gas payment through MetaTokenPaymaster.
 */
export function createMetaPaymaster(opts: MetaPaymasterOptions) {
  const pmVer = opts.verificationGasLimit ?? PAYMASTER_VERIFICATION_GAS_LIMIT;
  const pmPost = opts.postOpGasLimit ?? PAYMASTER_POST_OP_GAS_LIMIT;
  const slippage = opts.slippageBps === undefined ? 200n : opts.slippageBps;

  const base = {
    paymaster: opts.paymaster,
    paymasterVerificationGasLimit: pmVer,
    paymasterPostOpGasLimit: pmPost,
  };

  return {
    async getPaymasterStubData(_params: GasFields) {
      return { ...base, paymasterData: encodePaymasterData(0n), isFinal: false };
    },
    async getPaymasterData(params: GasFields) {
      if (slippage === null) return { ...base, paymasterData: encodePaymasterData(0n) };
      const state = await getPaymasterState(opts.client, opts.paymaster);
      if (opts.checkPrice !== false) assertPriceUsable(state);
      const cost = maxCostWei({
        callGasLimit: params.callGasLimit ?? 0n,
        verificationGasLimit: params.verificationGasLimit ?? 0n,
        preVerificationGas: params.preVerificationGas ?? 0n,
        paymasterVerificationGasLimit: pmVer,
        paymasterPostOpGasLimit: pmPost,
        maxFeePerGas: params.maxFeePerGas ?? 0n,
      });
      const preCharge = usdToMetaWithMarkup(weiToUsd(cost, state.ethUsd), state.metaUsd, state.markupBps);
      const ceiling = (preCharge * (BPS + slippage)) / BPS + 1n;
      return { ...base, paymasterData: encodePaymasterData(ceiling) };
    },
  };
}
