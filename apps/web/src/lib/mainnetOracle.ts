"use client";
import { useQuery } from "@tanstack/react-query";
import { createPublicClient, http, parseAbi } from "viem";
import { MAINNET_ASSETS, robinhood } from "@metachain/sdk";

const feedAbi = parseAbi([
  "function latestRoundData() view returns (uint80, int256, uint256, uint256, uint80)",
  "function decimals() view returns (uint8)",
]);
const poolAbi = parseAbi([
  "function observe(uint32[] secondsAgos) view returns (int56[] tickCumulatives, uint160[] secondsPerLiquidityCumulativeX128s)",
  "function token0() view returns (address)",
]);
const tokenAbi = parseAbi([
  "function oraclePaused() view returns (bool)",
  "function paused() view returns (bool)",
  "function uiMultiplier() view returns (uint256)",
]);

export const TWAP_WINDOW = 1800;
/** Gas of a simple ERC-4337 operation paid through the paymaster (measured on a mainnet fork). */
export const TYPICAL_OP_GAS = 280_000;
const MARKUP_OPEN = 0.05;

export const mainnetClient = createPublicClient({
  chain: robinhood,
  transport: http(robinhood.rpcUrls.default.http[0]),
  batch: { multicall: true },
});

async function readFeed(address: `0x${string}`) {
  const [round, dec] = await Promise.all([
    mainnetClient.readContract({ address, abi: feedAbi, functionName: "latestRoundData" }),
    mainnetClient.readContract({ address, abi: feedAbi, functionName: "decimals" }),
  ]);
  return { price: Number(round[1]) / 10 ** dec, updatedAt: Number(round[3]) };
}

export type OracleMode = "open" | "closed" | "fallback";

export interface MainnetOracle {
  metaUsd: number;
  metaUpdatedAt: number;
  ethUsd: number;
  twapUsd: number;
  deviation: number; // fraction
  mode: OracleMode;
  oraclePaused: boolean;
  tokenPaused: boolean;
  multiplier: number;
  gasPriceGwei: number;
  block: number;
  /** Estimated cost of a typical paymaster op */
  opCostUsd: number;
  opCostMeta: number;
}

export async function fetchMainnetOracle(): Promise<MainnetOracle> {
  const [metaFeed, ethFeed, usdgFeed, ticks, token0, oraclePaused, tokenPaused, multiplier, gasPrice, block] =
    await Promise.all([
      readFeed(MAINNET_ASSETS.chainlinkMetaUsd),
      readFeed(MAINNET_ASSETS.chainlinkEthUsd),
      readFeed(MAINNET_ASSETS.chainlinkUsdgUsd),
      mainnetClient.readContract({
        address: MAINNET_ASSETS.uniswapV3MetaUsdg,
        abi: poolAbi,
        functionName: "observe",
        args: [[TWAP_WINDOW, 0]],
      }),
      mainnetClient.readContract({ address: MAINNET_ASSETS.uniswapV3MetaUsdg, abi: poolAbi, functionName: "token0" }),
      mainnetClient.readContract({ address: MAINNET_ASSETS.meta, abi: tokenAbi, functionName: "oraclePaused" }),
      mainnetClient.readContract({ address: MAINNET_ASSETS.meta, abi: tokenAbi, functionName: "paused" }),
      mainnetClient.readContract({ address: MAINNET_ASSETS.meta, abi: tokenAbi, functionName: "uiMultiplier" }),
      mainnetClient.getGasPrice(),
      mainnetClient.getBlockNumber(),
    ]);
  const meanTick = Math.floor(Number(ticks[0][1] - ticks[0][0]) / TWAP_WINDOW);
  const raw = 1.0001 ** meanTick; // token1 per token0 in raw units; META 18 dec, USDG 6 dec
  const metaIsToken0 = token0.toLowerCase() === MAINNET_ASSETS.meta.toLowerCase();
  const usdgPerMeta = metaIsToken0 ? raw * 1e12 : (1 / raw) * 1e12;
  const twapUsd = usdgPerMeta * usdgFeed.price;
  const age = Date.now() / 1000 - metaFeed.updatedAt;
  const mode: OracleMode = oraclePaused || age > 80 * 3600 ? "fallback" : age > 3600 ? "closed" : "open";
  const gasPriceGwei = Number(gasPrice) / 1e9;
  const opCostUsd = TYPICAL_OP_GAS * Number(gasPrice) * 1e-18 * ethFeed.price;
  return {
    metaUsd: metaFeed.price,
    metaUpdatedAt: metaFeed.updatedAt,
    ethUsd: ethFeed.price,
    twapUsd,
    deviation: Math.abs(twapUsd - metaFeed.price) / metaFeed.price,
    mode,
    oraclePaused,
    tokenPaused,
    multiplier: Number(multiplier) / 1e18,
    gasPriceGwei,
    block: Number(block),
    opCostUsd,
    opCostMeta: (opCostUsd * (1 + MARKUP_OPEN)) / metaFeed.price,
  };
}

export function useMainnetOracle() {
  return useQuery({ queryKey: ["mainnet-oracle"], queryFn: fetchMainnetOracle, refetchInterval: 20_000 });
}

export const MODE_LABEL: Record<OracleMode, string> = {
  open: "PASAR BUKA",
  closed: "PASAR TUTUP",
  fallback: "FALLBACK TWAP",
};

export const fmtUsd = (n?: number, d = 2) =>
  n === undefined ? "—" : `$${n.toLocaleString("en-US", { minimumFractionDigits: d, maximumFractionDigits: d })}`;
