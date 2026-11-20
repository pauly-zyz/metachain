import Link from "next/link";
import { Logo } from "./Logo";
import { METAC } from "@/lib/token";
import { CopyCA } from "./TokenSection";

export function SiteFooter() {
  return (
    <footer className="relative overflow-hidden">
      <div className="mx-auto max-w-7xl px-4 pt-24 sm:px-6">
        <div className="flex flex-col items-start justify-between gap-10 md:flex-row md:items-end">
          <div>
            <h2 className="font-display text-[clamp(2.4rem,6vw,5rem)] font-semibold uppercase leading-[0.9] text-white">
              Fuel up
              <br />
              with <span className="text-accent text-glow">equity.</span>
            </h2>
            <div className="mt-8 flex flex-wrap gap-5">
              <Link href="/app" className="btn-plasma">
                Launch App
              </Link>
              <Link href="/dashboard" className="btn-ghost">
                View live oracle
              </Link>
            </div>
          </div>
          <nav className="grid grid-cols-2 gap-x-12 gap-y-3 font-mono text-xs uppercase tracking-wide2 text-bone-dim">
            <a href="#how-it-works" className="hover:text-white">How it works</a>
            <Link href="/app" className="hover:text-white">App</Link>
            <a href="#pricing" className="hover:text-white">Pricing</a>
            <Link href="/agents" className="hover:text-white">AI agents</Link>
            <a href="#developer" className="hover:text-white">Developer</a>
            <Link href="/dashboard" className="hover:text-white">Dashboard</Link>
            <a href="#faq" className="hover:text-white">FAQ</a>
            <a href="https://github.com/pauly-zyz/metachain" target="_blank" rel="noreferrer" className="hover:text-white">GitHub</a>
          </nav>
        </div>

        <div className="mt-20 border-t border-ink-line py-8 text-xs leading-relaxed text-bone-mute">
          <div className="mb-4 flex items-center justify-between">
            <Logo />
            <span className="hud">ROBINHOOD CHAIN · 4663</span>
          </div>
          <div className="mb-5 flex flex-wrap items-center gap-3 border border-ink-line bg-ink-soft px-4 py-3">
            <span className="hud text-accent">${METAC.symbol} CA</span>
            <a href={METAC.explorer} target="_blank" rel="noreferrer" className="break-all font-mono text-xs text-bone hover:text-accent">
              {METAC.address}
            </a>
            <CopyCA compact />
          </div>
          <p>
            META Chain is experimental, unaudited software. <strong className="text-bone-dim">Not affiliated</strong> with Meta
            Platforms, Inc. or Robinhood (Robinhood Markets, Inc. / Robinhood Assets (Jersey) Limited). META Stock Tokens are
            tokenized debt securities that are not available to U.S. Persons and are restricted in other jurisdictions. Not
            investment advice. Price data is read directly from Chainlink and Uniswap contracts on Robinhood Chain and may be
            delayed.
          </p>
        </div>
      </div>
      <div
        aria-hidden
        className="pointer-events-none select-none text-center font-display text-[18vw] font-bold uppercase leading-[0.8] tracking-tight text-transparent [-webkit-text-stroke:1px_rgba(8,102,255,0.18)]"
      >
        META·CHAIN
      </div>
    </footer>
  );
}
