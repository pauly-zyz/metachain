"use client";
import { fmtUsd, MODE_LABEL, useMainnetOracle } from "@/lib/mainnetOracle";

/** Infinite marquee of live mainnet readings. */
export function LiveTicker() {
  const { data } = useMainnetOracle();
  const items: [string, string][] = data
    ? [
        ["META/USD · CHAINLINK", fmtUsd(data.metaUsd)],
        ["META/USD · TWAP V3 30M", fmtUsd(data.twapUsd)],
        ["DEVIATION", `${(data.deviation * 100).toFixed(2)}%`],
        ["ETH/USD", fmtUsd(data.ethUsd)],
        ["GAS PRICE", `${data.gasPriceGwei.toFixed(4)} GWEI`],
        ["COST / OP", `${data.opCostMeta.toFixed(8)} META`],
        ["MULTIPLIER", data.multiplier.toFixed(6)],
        ["ORACLE MODE", MODE_LABEL[data.mode]],
        ["BLOCK", `#${data.block.toLocaleString("en-US")}`],
      ]
    : [["ORACLE", "CONNECTING TO ROBINHOOD CHAIN…"]];
  const row = (
    <div className="flex shrink-0 items-center">
      {items.map(([k, v]) => (
        <span key={k} className="flex items-center gap-3 px-8">
          <span className="h-1 w-1 bg-accent" />
          <span className="hud">{k}</span>
          <span className="font-mono text-sm text-white">{v}</span>
        </span>
      ))}
    </div>
  );
  return (
    <div className="relative overflow-hidden border-b border-ink-line bg-ink-deep py-3">
      <div className="flex w-max animate-marquee">
        {row}
        {row}
      </div>
      <div className="pointer-events-none absolute inset-y-0 left-0 w-24 bg-gradient-to-r from-ink-deep to-transparent" />
      <div className="pointer-events-none absolute inset-y-0 right-0 w-24 bg-gradient-to-l from-ink-deep to-transparent" />
    </div>
  );
}
