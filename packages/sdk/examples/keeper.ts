/**
 * Keeper: keeps MetaTokenPaymaster's cached price fresh by calling the permissionless `updatePrice()`.
 *   RPC_URL=... KEEPER_PRIVATE_KEY=0x... PAYMASTER=0x... npm run keeper -w @metachain/sdk
 * The keeper pays a tiny amount of ETH per update (Robinhood Chain L2 gas).
 */
import { createPublicClient, createWalletClient, http, type Address, type Hex, type PublicClient } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { refreshPriceIfNeeded, robinhood, robinhoodTestnet } from "../src/index.js";

const RPC_URL = process.env.RPC_URL ?? robinhoodTestnet.rpcUrls.default.http[0]!;
const chain = Number(process.env.CHAIN_ID ?? robinhoodTestnet.id) === robinhood.id ? robinhood : robinhoodTestnet;
const PAYMASTER = process.env.PAYMASTER as Address;
const KEY = process.env.KEEPER_PRIVATE_KEY as Hex;
const INTERVAL_MS = Number(process.env.INTERVAL_MS ?? 60_000);

async function main() {
  if (!PAYMASTER || !KEY) throw new Error("Set PAYMASTER and KEEPER_PRIVATE_KEY");
  const publicClient = createPublicClient({ chain, transport: http(RPC_URL) }) as PublicClient;
  const walletClient = createWalletClient({ account: privateKeyToAccount(KEY), chain, transport: http(RPC_URL) });
  for (;;) {
    try {
      const hash = await refreshPriceIfNeeded({ publicClient, walletClient, paymaster: PAYMASTER });
      console.log(new Date().toISOString(), hash ? `updatePrice ${hash}` : "fresh");
    } catch (e) {
      // e.g. PriceDeviation / NoValidPrice: the circuit breaker is doing its job → alert operators
      console.error(new Date().toISOString(), "updatePrice failed:", (e as Error).message.split("\n")[0]);
    }
    await new Promise((r) => setTimeout(r, INTERVAL_MS));
  }
}

main();
