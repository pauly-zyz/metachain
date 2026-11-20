"use client";
import { fmtUsd, MODE_LABEL, useMainnetOracle } from "@/lib/mainnetOracle";

const SEGMENTS = 64;
const START = 135; // degrees, gauge opens at the bottom
const SWEEP = 270;
const R_OUT = 168;
const R_IN = 138;

function polar(r: number, deg: number) {
  const a = (deg * Math.PI) / 180;
  return [200 + r * Math.cos(a), 200 + r * Math.sin(a)] as const;
}

function segmentPath(i: number) {
  const gap = 1.2;
  const step = SWEEP / SEGMENTS;
  const a0 = START + i * step + gap / 2;
  const a1 = START + (i + 1) * step - gap / 2;
  const [x0, y0] = polar(R_OUT, a0);
  const [x1, y1] = polar(R_OUT, a1);
  const [x2, y2] = polar(R_IN, a1);
  const [x3, y3] = polar(R_IN, a0);
  return `M${x0},${y0} A${R_OUT},${R_OUT} 0 0 1 ${x1},${y1} L${x2},${y2} A${R_IN},${R_IN} 0 0 0 ${x3},${y3} Z`;
}

/**
 * "Fuel gauge": lit segments = oracle consensus (100% when Chainlink and the Uniswap V3 TWAP agree,
 * 0% at the 3% circuit-breaker bound). Center shows the live Chainlink META/USD price on Robinhood Chain.
 */
export function FuelGauge() {
  const { data } = useMainnetOracle();
  const consensus = data ? Math.max(0, Math.min(1, 1 - data.deviation / 0.03)) : 0;
  const lit = Math.round(consensus * SEGMENTS);

  return (
    <div className="relative mx-auto aspect-square w-full max-w-[460px]">
      <svg viewBox="0 0 400 400" className="h-full w-full" role="img" aria-label="Live META/USD price gauge">
        <defs>
          <radialGradient id="core" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="#0866ff" stopOpacity="0.22" />
            <stop offset="70%" stopColor="#0866ff" stopOpacity="0.03" />
            <stop offset="100%" stopColor="#0866ff" stopOpacity="0" />
          </radialGradient>
          <filter id="glow" x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="3" result="b" />
            <feMerge>
              <feMergeNode in="b" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>
        <circle cx="200" cy="200" r="190" fill="url(#core)" />
        {/* rotating outer tick ring */}
        <g className="origin-center animate-[spin_60s_linear_infinite]" style={{ transformOrigin: "200px 200px" }}>
          {Array.from({ length: 120 }, (_, i) => {
            const [x0, y0] = polar(188, i * 3);
            const [x1, y1] = polar(i % 10 === 0 ? 178 : 183, i * 3);
            return <line key={i} x1={x0} y1={y0} x2={x1} y2={y1} stroke="#e7edf7" strokeOpacity={i % 10 === 0 ? 0.35 : 0.12} />;
          })}
        </g>
        {/* segments */}
        <g filter="url(#glow)">
          {Array.from({ length: SEGMENTS }, (_, i) => {
            const on = i < lit;
            const hot = i / SEGMENTS;
            return (
              <path
                key={i}
                d={segmentPath(i)}
                fill={on ? (hot > 0.8 ? "#5cc8ff" : "#0866ff") : "#182133"}
                fillOpacity={on ? 0.55 + hot * 0.45 : 0.9}
                style={{ transition: `fill .5s ${i * 12}ms, fill-opacity .5s ${i * 12}ms` }}
              />
            );
          })}
        </g>
        {/* inner ring */}
        <circle cx="200" cy="200" r="126" fill="none" stroke="#e7edf7" strokeOpacity="0.08" />
        <circle cx="200" cy="200" r="118" fill="none" stroke="#0866ff" strokeOpacity="0.25" strokeDasharray="2 6" />
      </svg>

      <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
        <span className="hud text-accent">META / USD · Chainlink</span>
        <span className="mt-2 font-display text-5xl font-semibold tabular-nums text-white text-glow sm:text-6xl">
          {data ? fmtUsd(data.metaUsd) : "$———"}
        </span>
        <span className="mt-2 font-mono text-xs text-bone-dim">
          TWAP {data ? fmtUsd(data.twapUsd) : "—"} · Δ {data ? `${(data.deviation * 100).toFixed(2)}%` : "—"}
        </span>
        <span className="mt-4 inline-flex items-center gap-2 border border-ink-line bg-ink/70 px-3 py-1 font-mono text-[10px] tracking-hud text-bone">
          <span className={`h-1.5 w-1.5 animate-pulseDot ${data?.mode === "open" ? "bg-good" : "bg-amber"}`} />
          {data ? MODE_LABEL[data.mode] : "LOADING ORACLE"}
        </span>
      </div>

      {/* gauge scale labels */}
      <span className="hud absolute bottom-[14%] left-[16%]">0%</span>
      <span className="hud absolute bottom-[14%] right-[13%]">100%</span>
      <span className="hud absolute bottom-[4%] left-1/2 -translate-x-1/2 whitespace-nowrap">
        Oracle consensus {Math.round(consensus * 100)}%
      </span>
    </div>
  );
}
