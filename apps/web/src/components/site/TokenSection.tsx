"use client";
import { useState } from "react";
import { METAC } from "@/lib/token";
import { Reveal, SectionLabel } from "./Reveal";

export function CopyCA({ compact = false }: { compact?: boolean }) {
  const [done, setDone] = useState(false);
  return (
    <button
      onClick={() =>
        navigator.clipboard?.writeText(METAC.address).then(() => {
          setDone(true);
          setTimeout(() => setDone(false), 1400);
        })
      }
      className={`border font-mono tracking-wide2 transition ${
        done ? "border-good text-good" : "border-accent/60 text-accent hover:bg-accent hover:text-white"
      } ${compact ? "px-2 py-0.5 text-[10px]" : "px-3 py-1 text-[11px]"}`}
      aria-label="Copy contract address"
    >
      {done ? "COPIED" : "COPY"}
    </button>
  );
}

export function TokenSection() {
  const rows: [string, React.ReactNode][] = [
    ["Ticker", <span key="t">${METAC.symbol} <span className="text-bone-mute">· {METAC.name.toUpperCase()}</span></span>],
    [
      "Contract",
      <span key="c" className="flex flex-wrap items-center gap-3">
        <a href={METAC.explorer} target="_blank" rel="noreferrer" className="break-all text-accent hover:underline">
          {METAC.address}
        </a>
        <CopyCA />
      </span>,
    ],
    ["Network", <span key="n">Robinhood Chain <span className="text-bone-mute">{METAC.chainId}</span></span>],
    ["Standard", <span key="s">ERC-20 <span className="text-bone-mute">· {METAC.decimals} decimals</span></span>],
    ["Supply", METAC.totalSupply],
  ];
  return (
    <section id="token" className="relative overflow-hidden border-b border-ink-line py-24">
      <div className="absolute -left-40 top-10 -z-10 h-[420px] w-[420px] rounded-full bg-accent/10 blur-[110px]" />
      <div className="mx-auto grid max-w-7xl grid-cols-1 items-center gap-12 px-4 sm:px-6 lg:grid-cols-[0.9fr_1.1fr] [&>*]:min-w-0">
        <Reveal>
          <SectionLabel index="$">{`${METAC.symbol} · COMMUNITY TOKEN`}</SectionLabel>
          <h2 className="mt-5 font-display text-[clamp(2.4rem,6vw,4.8rem)] font-semibold uppercase leading-[0.92] text-white">
            ${METAC.symbol} is <span className="text-accent text-glow">live.</span>
          </h2>
          <p className="mt-5 max-w-lg text-bone-dim">
            The community token of META Chain, deployed on Robinhood Chain mainnet. Always verify the contract address
            below before interacting.
          </p>
          <div className="mt-9 flex flex-wrap gap-5">
            <a href={METAC.explorer} target="_blank" rel="noreferrer" className="btn-plasma">
              View on explorer
              <svg viewBox="0 0 16 16" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.6">
                <path d="M5 11 11 5M6 5h5v5" />
              </svg>
            </a>
            <button
              onClick={() => navigator.clipboard?.writeText(METAC.address)}
              className="btn-ghost"
            >
              Copy contract
            </button>
          </div>
        </Reveal>

        <Reveal delay={120}>
          <div className="panel brackets">
            <div className="flex items-center justify-between border-b border-ink-line px-5 py-3">
              <span className="hud">TOKEN DETAILS · VERIFIED ON-CHAIN</span>
              <span className="flex items-center gap-2 font-mono text-[10px] tracking-hud text-good">
                <span className="h-1.5 w-1.5 animate-pulseDot bg-good" /> MAINNET
              </span>
            </div>
            <dl>
              {rows.map(([k, v]) => (
                <div key={k} className="grid gap-1 border-b border-ink-line/70 px-5 py-4 last:border-0 sm:grid-cols-[120px_1fr] sm:items-center sm:gap-6">
                  <dt className="hud">{k}</dt>
                  <dd className="font-mono text-sm text-white">{v}</dd>
                </div>
              ))}
            </dl>
            <p className="hud border-t border-ink-line px-5 py-3 normal-case tracking-wide">
              Only this contract is official. Other tokens may use the same name or ticker. $METAC is not a Robinhood Stock
              Token and is not affiliated with Meta Platforms, Inc. or Robinhood.
            </p>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
