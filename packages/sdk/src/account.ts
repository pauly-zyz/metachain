import {
  encodeFunctionData,
  erc20Abi,
  http,
  maxUint256,
  type Account,
  type Address,
  type Chain,
  type EIP1193Provider,
  type LocalAccount,
  type PublicClient,
  type Transport,
  type WalletClient,
} from "viem";
import { entryPoint07Address } from "viem/account-abstraction";
import { createSmartAccountClient, type SmartAccountClient } from "permissionless";
import { toKernelSmartAccount } from "permissionless/accounts";
import { createMetaPaymaster } from "./paymaster.js";
import type { MetaChainAddresses } from "./addresses.js";

export type AccountOwner = LocalAccount | WalletClient<Transport, Chain | undefined, Account> | EIP1193Provider;

export interface Call {
  to: Address;
  data?: `0x${string}`;
  value?: bigint;
}

/**
 * Kernel v3.1 smart account (ERC-7579, EntryPoint v0.7) owned by an ECDSA signer.
 * Kernel v3.1 is used because it is deployed (and verified) on both Robinhood Chain mainnet and testnet,
 * while the Safe7579 launchpad is not (docs/feasibility.md, Phase 1 notes).
 */
export async function createMetaSmartAccount(args: {
  client: PublicClient;
  owner: AccountOwner;
  index?: bigint;
  /** Use an already-deployed account address instead of deriving it. */
  address?: Address;
}) {
  return toKernelSmartAccount({
    client: args.client,
    version: "0.3.1",
    entryPoint: { address: entryPoint07Address, version: "0.7" },
    owners: [args.owner as LocalAccount],
    index: args.index ?? 0n,
    address: args.address,
  });
}

export type MetaSmartAccount = Awaited<ReturnType<typeof createMetaSmartAccount>>;

export type MetaAccountClient = SmartAccountClient<Transport, Chain, MetaSmartAccount>;

export type FeeEstimator = () => Promise<{ maxFeePerGas: bigint; maxPriorityFeePerGas: bigint }>;

/** Default fee estimator: node fee estimate with a floor on the priority fee (Robinhood Chain is FCFS). */
export function defaultFeeEstimator(client: PublicClient): FeeEstimator {
  return async () => {
    const block = await client.getBlock();
    const base = block.baseFeePerGas ?? 10_000_000n;
    const maxPriorityFeePerGas = 0n;
    return { maxFeePerGas: base * 2n + maxPriorityFeePerGas, maxPriorityFeePerGas };
  };
}

/**
 * Smart account client whose UserOperations pay gas in META through MetaTokenPaymaster.
 * The account must hold META and have approved the paymaster (see {@link approveMetaCall}).
 */
export function createMetaAccountClient(args: {
  account: MetaSmartAccount;
  chain: Chain;
  client: PublicClient;
  bundlerUrl: string;
  addresses: Pick<MetaChainAddresses, "paymaster">;
  slippageBps?: bigint | null;
  fees?: FeeEstimator;
}): MetaAccountClient {
  return createSmartAccountClient({
    account: args.account,
    chain: args.chain,
    client: args.client,
    bundlerTransport: http(args.bundlerUrl),
    paymaster: createMetaPaymaster({
      client: args.client,
      paymaster: args.addresses.paymaster,
      slippageBps: args.slippageBps,
    }),
    userOperation: { estimateFeesPerGas: args.fees ?? defaultFeeEstimator(args.client) },
  });
}

/**
 * Client WITHOUT the META paymaster, used once to bootstrap an account (deploy + approve) when it holds ETH.
 * A brand-new account cannot pay its very first operation in META because the paymaster pulls META with
 * `transferFrom` during validation, i.e. before the approval inside that same operation executes.
 */
export function createBootstrapClient(args: {
  account: MetaSmartAccount;
  chain: Chain;
  client: PublicClient;
  bundlerUrl: string;
  fees?: FeeEstimator;
}): MetaAccountClient {
  return createSmartAccountClient({
    account: args.account,
    chain: args.chain,
    client: args.client,
    bundlerTransport: http(args.bundlerUrl),
    userOperation: { estimateFeesPerGas: args.fees ?? defaultFeeEstimator(args.client) },
  });
}

/** `META.approve(paymaster, amount)` — required once before paying gas in META. */
export function approveMetaCall(addresses: Pick<MetaChainAddresses, "meta" | "paymaster">, amount = maxUint256): Call {
  return {
    to: addresses.meta,
    data: encodeFunctionData({ abi: erc20Abi, functionName: "approve", args: [addresses.paymaster, amount] }),
    value: 0n,
  };
}

/** Whether `account` can pay gas in META right now (deployed, META balance, allowance). */
export async function getMetaReadiness(
  client: PublicClient,
  addresses: Pick<MetaChainAddresses, "meta" | "paymaster">,
  account: Address,
) {
  const [code, balance, allowance] = await Promise.all([
    client.getCode({ address: account }),
    client.readContract({ address: addresses.meta, abi: erc20Abi, functionName: "balanceOf", args: [account] }),
    client.readContract({
      address: addresses.meta,
      abi: erc20Abi,
      functionName: "allowance",
      args: [account, addresses.paymaster],
    }),
  ]);
  const deployed = !!code && code !== "0x";
  return { deployed, balance, allowance, ready: deployed && balance > 0n && allowance > 0n };
}
