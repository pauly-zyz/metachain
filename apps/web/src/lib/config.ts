import type { Chain } from "viem";
import {
  addressesFromDeployment,
  localFork,
  robinhood,
  robinhoodTestnet,
  type DeploymentJson,
  type MetaChainAddresses,
} from "@metachain/sdk";

export type NetworkName = "local" | "testnet" | "mainnet";

export interface AppConfig {
  network: NetworkName;
  chain: Chain;
  rpcUrl: string;
  bundlerUrl: string;
  addresses: MetaChainAddresses | null;
  deployment: (DeploymentJson & { deployBlock?: number }) | null;
  explorer: string | null;
  isMock: boolean;
  /** A NEXT_PUBLIC_DEPLOYMENT_JSON was provided but for a different chain id. */
  deploymentChainMismatch: boolean;
}

function parseDeployment(): (DeploymentJson & { deployBlock?: number }) | null {
  const raw = process.env.NEXT_PUBLIC_DEPLOYMENT_JSON;
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export function getConfig(): AppConfig {
  // Default: Robinhood Chain mainnet. The local demo script sets NEXT_PUBLIC_NETWORK=local explicitly.
  const network = (process.env.NEXT_PUBLIC_NETWORK as NetworkName) || "mainnet";
  const base = network === "mainnet" ? robinhood : robinhoodTestnet;
  const rpcUrl =
    process.env.NEXT_PUBLIC_RPC_URL || (network === "local" ? "http://127.0.0.1:8545" : base.rpcUrls.default.http[0]!);
  const chain = network === "local" ? localFork(base, rpcUrl) : base;
  const parsed = parseDeployment();
  // Ignore a deployment file that belongs to another chain (e.g. testnet JSON on a mainnet site).
  const deployment = parsed && Number(parsed.chainId) === chain.id ? parsed : null;
  return {
    network,
    chain,
    rpcUrl,
    // Default: the server-side proxy (/api/bundler → BUNDLER_RPC_URL), which keeps API keys server-side.
    bundlerUrl:
      process.env.NEXT_PUBLIC_BUNDLER_URL ||
      (typeof window !== "undefined" ? `${window.location.origin}/api/bundler` : "http://127.0.0.1:3000/api/bundler"),
    addresses: deployment ? addressesFromDeployment(deployment) : null,
    deployment,
    explorer: network === "local" ? null : (base.blockExplorers?.default.url ?? null),
    isMock: network !== "mainnet",
    deploymentChainMismatch: !!parsed && !deployment,
  };
}

export const config = getConfig();
