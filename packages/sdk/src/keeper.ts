import type { Account, Address, Chain, PublicClient, Transport, WalletClient } from "viem";
import { metaTokenPaymasterAbi } from "./abis.js";

/**
 * Refresh the paymaster's cached price when it is close to expiry or older than `maxAgeSec`.
 * `updatePrice()` is permissionless; run this from a keeper (cron / bot) every minute or so.
 * Returns the transaction hash when an update was sent.
 */
export async function refreshPriceIfNeeded(args: {
  publicClient: PublicClient;
  walletClient: WalletClient<Transport, Chain, Account>;
  paymaster: Address;
  /** Refresh when the cache expires within this many seconds (default 10 min). */
  minRemainingSec?: number;
  /** Refresh when the cache is older than this many seconds (default 5 min). */
  maxAgeSec?: number;
}): Promise<`0x${string}` | undefined> {
  const [, , validUntil, updatedAt] = await args.publicClient.readContract({
    address: args.paymaster,
    abi: metaTokenPaymasterAbi,
    functionName: "priceCache",
  });
  const block = await args.publicClient.getBlock();
  const now = Number(block.timestamp);
  const remaining = Number(validUntil) - now;
  const age = now - Number(updatedAt);
  if (Number(validUntil) !== 0 && remaining > (args.minRemainingSec ?? 600) && age < (args.maxAgeSec ?? 300)) {
    return undefined;
  }
  const { request } = await args.publicClient.simulateContract({
    address: args.paymaster,
    abi: metaTokenPaymasterAbi,
    functionName: "updatePrice",
    account: args.walletClient.account,
  });
  const hash = await args.walletClient.writeContract(request);
  await args.publicClient.waitForTransactionReceipt({ hash });
  return hash;
}
