import { defineChain, type Chain } from "viem";
import { robinhood, robinhoodTestnet } from "viem/chains";

export { robinhood, robinhoodTestnet };

/** Chain ids verified via `eth_chainId` against the official RPCs (docs/feasibility.md §0). */
export const ROBINHOOD_MAINNET_ID = 4663;
export const ROBINHOOD_TESTNET_ID = 46630;

/** Local anvil fork of a Robinhood chain (keeps the forked chain id). */
export function localFork(base: Chain, rpcUrl = "http://127.0.0.1:8545"): Chain {
  return defineChain({ ...base, name: `${base.name} (local fork)`, rpcUrls: { default: { http: [rpcUrl] } } });
}
