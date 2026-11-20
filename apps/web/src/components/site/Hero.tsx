"use client";
import Link from "next/link";
import { EmberField } from "./EmberField";
import { FuelGauge } from "./FuelGauge";
import { fmtUsd, useMainnetOracle } from "@/lib/mainnetOracle";

function Corner({ className }: { className: string }) {
  return <span className={`pointer-events-none absolute h-4 w-4 border-accent/60 ${className}`} />;
}

export function Hero() {
  const { data } = useMainnetOracle();
  return (
    <section className="relative isolate overflow-hidden border-b border-ink-line">
      <div className="absolute inset-0 -z-10 grid-bg" />
      <div className="absolute inset-x-0 bottom-0 -z-10 h-[85%] opacity-90">
        <EmberField />
      </div>
      <div className="absolute inset-0 -z-10 bg-[linear-gradient(to_bottom,#05070d_0%,transparent_35%,transparent_80%,#05070d_100%)]" />

      <div className="relative mx-auto grid min-h-[calc(100vh-64px)] max-w-7xl grid-cols-1 items-center gap-12 px-4 pb-12 pt-12 sm:px-6 md:pb-28 lg:grid-cols-[1.05fr_1fr] lg:pt-10 [&>*]:min-w-0">
        <div className="animate-rise">
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
            <span className="h-px w-8 bg-bone-mute/60" />
            <span className="hud text-bone-dim">META CHAIN</span>
            <span className="hud text-accent">ERC-4337 PAYMASTER · ROBINHOOD CHAIN</span>
          </div>
          <h1 className="mt-6 font-display text-[clamp(3rem,8vw,6.5rem)] font-semibold uppercase leading-[0.9] tracking-tight text-white">
            Equity
            <br />
            is <span className="text-accent text-glow">fuel.</span>
          </h1>
          <p className="mt-7 max-w-xl text-lg leading-relaxed text-bone-dim">
            <span className="text-white">Pay gas with a tokenized stock.</span> Every transaction on Robinhood Chain is paid
            in META Stock Token — pegged in USD, priced by Chainlink and guarded by a TWAP circuit breaker. Built for humans
            and AI agents.
          </p>
          <div className="mt-10 flex flex-wrap gap-5">
            <Link href="/app" className="btn-plasma">
              Launch App
              <svg viewBox="0 0 16 16" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.6">
                <path d="M2 8h11M9 4l4 4-4 4" />
              </svg>
            </Link>
            <a href="#how-it-works" className="btn-ghost">
              How it works
            </a>
          </div>
        </div>

        <div className="relative animate-rise [animation-delay:150ms]">
          <div className="relative border border-ink-line/70 bg-ink/40 p-6 backdrop-blur-[2px] sm:p-10">
            <Corner className="-left-px -top-px border-l border-t" />
            <Corner className="-right-px -top-px border-r border-t" />
            <Corner className="-bottom-px -left-px border-b border-l" />
            <Corner className="-bottom-px -right-px border-b border-r" />
            <div className="mb-2 flex items-center justify-between">
              <span className="hud">FIG. 01 — FUEL GAUGE</span>
              <span className="hud flex items-center gap-2 text-good">
                <span className="h-1.5 w-1.5 animate-pulseDot bg-good" /> MAINNET 4663
              </span>
            </div>
            <FuelGauge />
            <div className="mt-2 flex items-center justify-between">
              <span className="hud">BLOCK #{data ? data.block.toLocaleString("en-US") : "—"}</span>
              <span className="hud">ETH {data ? fmtUsd(data.ethUsd) : "—"}</span>
            </div>
          </div>
        </div>
      </div>

      {/* bottom status strip */}
      <div className="relative border-t border-ink-line bg-ink/70 backdrop-blur-md md:absolute md:inset-x-0 md:bottom-0">
        <div className="mx-auto grid max-w-7xl grid-cols-2 divide-ink-line px-4 sm:px-6 md:grid-cols-4 md:divide-x">
          {[
            ["Gas token", "META", "stock token"],
            ["Pegged to", "USD", "not ETH"],
            ["Cost / transaction", data ? fmtUsd(data.opCostUsd, 4) : "—", "live estimate"],
            ["Settles on", "ROBINHOOD CHAIN", "L2 → Ethereum"],
          ].map(([k, v, s]) => (
            <div key={k} className="py-4 md:px-6 first:md:pl-0">
              <div className="hud">{k}</div>
              <div className="mt-1 flex items-baseline gap-2">
                <span className={`font-display font-semibold text-accent ${String(v).length > 10 ? "text-base sm:text-lg xl:text-xl" : "text-xl sm:text-2xl"}`}>{v}</span>
                <span className="hud hidden sm:inline">{s}</span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
