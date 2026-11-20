"use client";
import { useQuery } from "@tanstack/react-query";
import { createPublicClient, http, parseAbi } from "viem";
import { MAINNET_ASSETS, robinhood } from "@metachain/sdk";
import { errMsg, ts, usd } from "@/lib/format";
import { Badge, Card, Notice, Row } from "./ui";

const feedAbi = parseAbi([
  "function latestRoundData() view returns (uint80, int256, uint256, uint256, uint80)",
  "function decimals() view returns (uint8)",
]);
const poolAbi = parseAbi([
  "function observe(uint32[] secondsAgos) view returns (int56[] tickCumulatives, uint160[] secondsPerLiquidityCumulativeX128s)",
  "function token0() view returns (address)",
]);
const tokenAbi = parseAbi(["function oraclePaused() view returns (bool)", "function paused() view returns (bool)", "function uiMultiplier() view returns (uint256)"]);

const TWAP_WINDOW = 1800;
const mainnet = createPublicClient({ chain: robinhood, transport: http(robinhood.rpcUrls.default.http[0]) });

async function readFeed(address: `0x${string}`) {
  const [round, dec] = await Promise.all([
    mainnet.readContract({ address, abi: feedAbi, functionName: "latestRoundData" }),
    mainnet.readContract({ address, abi: feedAbi, functionName: "decimals" }),
  ]);
  return { price: Number(round[1]) / 10 ** dec, updatedAt: Number(round[3]) };
}

/**
 * Live read-only view of the real Robinhood Chain mainnet price sources META Chain uses
 * (Chainlink "Robinhood META / USD", ETH / USD, and the Uniswap V3 META/USDG 30-min TWAP),
 * shown even before the META Chain contracts are deployed on mainnet.
 */
export function LiveMainnetOracle() {
  const q = useQuery({
    queryKey: ["mainnet-oracle"],
    refetchInterval: 30_000,
    queryFn: async () => {
      const [metaFeed, ethFeed, usdgFeed, ticks, token0, oraclePaused, paused, multiplier] = await Promise.all([
        readFeed(MAINNET_ASSETS.chainlinkMetaUsd),
        readFeed(MAINNET_ASSETS.chainlinkEthUsd),
        readFeed(MAINNET_ASSETS.chainlinkUsdgUsd),
        mainnet.readContract({ address: MAINNET_ASSETS.uniswapV3MetaUsdg, abi: poolAbi, functionName: "observe", args: [[TWAP_WINDOW, 0]] }),
        mainnet.readContract({ address: MAINNET_ASSETS.uniswapV3MetaUsdg, abi: poolAbi, functionName: "token0" }),
        mainnet.readContract({ address: MAINNET_ASSETS.meta, abi: tokenAbi, functionName: "oraclePaused" }),
        mainnet.readContract({ address: MAINNET_ASSETS.meta, abi: tokenAbi, functionName: "paused" }),
        mainnet.readContract({ address: MAINNET_ASSETS.meta, abi: tokenAbi, functionName: "uiMultiplier" }),
      ]);
      const meanTick = Math.floor(Number(ticks[0][1] - ticks[0][0]) / TWAP_WINDOW);
      // price of token1 in token0 raw units = 1.0001^tick ; META 18 dec, USDG 6 dec
      const raw = 1.0001 ** meanTick;
      const metaIsToken0 = token0.toLowerCase() === MAINNET_ASSETS.meta.toLowerCase();
      const usdgPerMeta = metaIsToken0 ? raw * 1e12 : (1 / raw) * 1e12;
      const twapUsd = usdgPerMeta * usdgFeed.price;
      const now = Date.now() / 1000;
      const age = now - metaFeed.updatedAt;
      const deviation = Math.abs(twapUsd - metaFeed.price) / metaFeed.price;
      const mode = oraclePaused || age > 80 * 3600 ? "Fallback (TWAP)" : age > 3600 ? "Pasar tutup" : "Pasar buka";
      return { metaFeed, ethFeed, twapUsd, age, deviation, mode, oraclePaused, paused, multiplier: Number(multiplier) / 1e18 };
    },
  });

  const d = q.data;
  const toUsd18 = (n: number) => BigInt(Math.round(n * 1e6)) * 10n ** 12n;
  return (
    <Card
      title="Oracle Robinhood Chain mainnet (live)"
      right={d ? <Badge tone={d.deviation > 0.03 ? "bad" : d.mode === "Pasar buka" ? "good" : "warn"}>{d.mode}</Badge> : null}
    >
      {q.error && <Notice tone="bad">Gagal membaca mainnet: {errMsg(q.error)}</Notice>}
      {d ? (
        <>
          <Row label="Chainlink Robinhood META / USD">{usd(toUsd18(d.metaFeed.price), 4)}</Row>
          <Row label="Diperbarui">{ts(d.metaFeed.updatedAt)}</Row>
          <Row label="TWAP Uniswap V3 META/USDG (30 mnt)">{usd(toUsd18(d.twapUsd), 4)}</Row>
          <Row label="Deviasi Chainlink vs TWAP">{(d.deviation * 100).toFixed(2)}%</Row>
          <Row label="Chainlink ETH / USD">{usd(toUsd18(d.ethFeed.price), 2)}</Row>
          <Row label="META uiMultiplier">{d.multiplier.toFixed(6)}</Row>
          <Row label="Token di-pause / oracle di-pause">
            {d.paused ? "ya" : "tidak"} / {d.oraclePaused ? "ya" : "tidak"}
          </Row>
          <p className="mt-3 text-xs text-slate-500">
            Dibaca langsung dari kontrak resmi di Robinhood Chain (4663): META {MAINNET_ASSETS.meta}, Chainlink{" "}
            {MAINNET_ASSETS.chainlinkMetaUsd}, pool Uniswap V3 {MAINNET_ASSETS.uniswapV3MetaUsdg}.
          </p>
        </>
      ) : (
        !q.error && <p className="text-sm text-slate-400">Memuat…</p>
      )}
    </Card>
  );
}
