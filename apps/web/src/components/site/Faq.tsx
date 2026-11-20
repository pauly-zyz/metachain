"use client";
import { useState } from "react";
import { Reveal, SectionLabel } from "./Reveal";

const QA: [string, string][] = [
  [
    "What is META Chain?",
    "A gas payment layer on Robinhood Chain (an Arbitrum L2). ERC-4337 smart accounts pay transaction fees in META Stock Token through a paymaster, which pays the network in ETH. It is not a new chain or L3.",
  ],
  [
    "Is META Chain affiliated with Meta Platforms or Robinhood?",
    "No. META Chain is an independent project and is not affiliated with, endorsed by or sponsored by Meta Platforms, Inc. or Robinhood (Robinhood Markets, Inc. / Robinhood Assets (Jersey) Limited).",
  ],
  [
    "Who can use META Stock Tokens?",
    "META Stock Tokens are tokenized debt securities that are not available to U.S. Persons and are restricted in other jurisdictions (including Canada, the UK and Switzerland). Make sure you are eligible where you live.",
  ],
  [
    "How much does a transaction cost?",
    "Fees are pegged in USD: actual gas × ETH price, plus a 5% markup when the market is open. On Robinhood Chain that is usually a fraction of a cent — about $0.008 per operation in our mainnet fork test. The META amount follows the stock price.",
  ],
  [
    "What happens when the stock market is closed?",
    "The Chainlink META feed updates 24/5. On weekends and holidays the last price stays valid for up to 80 hours with a higher markup, a lower per-transaction cap and a mandatory Uniswap V3 TWAP check. Beyond that the system switches to a TWAP fallback or halts safely.",
  ],
  [
    "How is the price protected from manipulation?",
    "Chainlink is the primary source; a 30-minute Uniswap V3 TWAP is the cross-check. If they diverge by more than 3% (market open) or 8% (market closed), the circuit breaker rejects the price. USD caps per transaction and per account limit exposure.",
  ],
  [
    "Do I need ETH?",
    "Only once, to activate the account (deploy + allow the paymaster to pull META), because the paymaster pulls META before an approval in the same operation takes effect. After that, all gas is paid in META.",
  ],
  [
    "Are the contracts audited and is mainnet live?",
    "Not yet. The code is open source, tested (unit, fuzz, mainnet fork, end-to-end) and analysed with Slither, but not externally audited. The mainnet oracle on this site is live; the mainnet paymaster launches after its security review.",
  ],
];

export function Faq() {
  const [open, setOpen] = useState(0);
  return (
    <section id="faq" className="relative border-b border-ink-line py-28">
      <div className="mx-auto grid max-w-7xl grid-cols-1 gap-12 px-4 sm:px-6 lg:grid-cols-[0.8fr_1.2fr] [&>*]:min-w-0">
        <Reveal>
          <SectionLabel index="06">FAQ</SectionLabel>
          <h2 className="mt-5 font-display text-[clamp(2.2rem,5vw,4rem)] font-semibold uppercase leading-[0.95] text-white">
            Eight questions. <span className="text-accent">Clear answers.</span>
          </h2>
          <p className="mt-5 max-w-sm text-bone-dim">Full technical detail lives in the README and feasibility study on GitHub.</p>
        </Reveal>
        <Reveal delay={100}>
          <ul className="border-t border-ink-line">
            {QA.map(([q, a], i) => {
              const isOpen = open === i;
              return (
                <li key={q} className="border-b border-ink-line">
                  <button
                    className="group flex w-full items-center gap-5 py-6 text-left"
                    onClick={() => setOpen(isOpen ? -1 : i)}
                    aria-expanded={isOpen}
                  >
                    <span className="font-mono text-[11px] text-bone-mute">{String(i + 1).padStart(2, "0")}</span>
                    <span
                      className={`flex-1 font-display text-lg font-medium uppercase tracking-wide transition sm:text-xl ${isOpen ? "text-accent" : "text-white group-hover:text-accent"}`}
                    >
                      {q}
                    </span>
                    <span className="relative h-4 w-4 shrink-0">
                      <span className="absolute left-0 top-1/2 h-px w-4 bg-accent" />
                      <span className={`absolute left-1/2 top-0 h-4 w-px bg-accent transition ${isOpen ? "scale-y-0" : ""}`} />
                    </span>
                  </button>
                  <div className={`grid transition-[grid-template-rows] duration-300 ${isOpen ? "grid-rows-[1fr]" : "grid-rows-[0fr]"}`}>
                    <div className="min-h-0 overflow-hidden">
                      <p className="pb-6 pl-10 pr-6 text-bone-dim">{a}</p>
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        </Reveal>
      </div>
    </section>
  );
}
