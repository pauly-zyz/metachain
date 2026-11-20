"use client";
import { useState } from "react";
import { MAINNET_ASSETS, SHARED_ADDRESSES } from "@metachain/sdk";
import { Reveal, SectionLabel } from "./Reveal";

const EXPLORER = "https://robinhoodchain.blockscout.com/address/";

const ROWS: [string, string, string][] = [
  ["META Stock Token", MAINNET_ASSETS.meta, "18 decimals · Robinhood Assets (Jersey)"],
  ["Chainlink META / USD", MAINNET_ASSETS.chainlinkMetaUsd, "24/5 · multiplier-adjusted"],
  ["Chainlink ETH / USD", MAINNET_ASSETS.chainlinkEthUsd, "8 decimals"],
  ["Uniswap V3 META/USDG", MAINNET_ASSETS.uniswapV3MetaUsdg, "0.3% · 30-min TWAP"],
  ["EntryPoint v0.7", SHARED_ADDRESSES.entryPoint, "ERC-4337"],
  ["Kernel v3.1 factory", SHARED_ADDRESSES.kernelFactory, "smart account"],
  ["Smart Sessions", SHARED_ADDRESSES.smartSessions, "Rhinestone · session key"],
];

function CopyButton({ text }: { text: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      onClick={() => {
        navigator.clipboard?.writeText(text).then(() => {
          setDone(true);
          setTimeout(() => setDone(false), 1200);
        });
      }}
      className="border border-ink-line px-2 py-0.5 font-mono text-[10px] tracking-wide2 text-bone-mute transition hover:border-accent hover:text-accent"
    >
      {done ? "COPIED" : "COPY"}
    </button>
  );
}

export function Developers() {
  return (
    <section id="developer" className="relative border-b border-ink-line py-28">
      <div className="mx-auto grid max-w-7xl grid-cols-1 gap-14 px-4 sm:px-6 lg:grid-cols-[0.8fr_1.2fr] [&>*]:min-w-0">
        <Reveal>
          <SectionLabel index="05">DEVELOPER</SectionLabel>
          <h2 className="mt-5 font-display text-[clamp(2.2rem,5vw,4rem)] font-semibold uppercase leading-[0.95] text-white">
            EVM in. <span className="text-accent">META</span> out.
          </h2>
          <p className="mt-5 text-bone-dim">
            One TypeScript SDK (viem + permissionless): smart accounts, USD/META fee estimates, the paymaster and agent
            session keys. Foundry contracts with 72 unit/fuzz tests and mainnet fork tests.
          </p>
          <div className="panel mt-8 flex items-center justify-between gap-3 px-4 py-3 font-mono text-sm">
            <span>
              <span className="text-accent">$</span> npm i @metachain/sdk
            </span>
            <CopyButton text="npm i @metachain/sdk" />
          </div>
          <div className="mt-8 flex flex-wrap gap-5">
            <a href="https://github.com/pauly-zyz/metachain" target="_blank" rel="noreferrer" className="btn-ghost">
              GitHub
            </a>
            <a href="/dashboard" className="btn-ghost">
              Oracle dashboard
            </a>
          </div>
        </Reveal>

        <Reveal delay={120}>
          <div className="panel">
            <div className="flex items-center justify-between border-b border-ink-line px-5 py-3">
              <span className="hud">VERIFIED CONTRACTS · ROBINHOOD CHAIN 4663</span>
              <span className="hud text-good">ON-CHAIN ✓</span>
            </div>
            <ul>
              {ROWS.map(([name, addr, note]) => (
                <li key={addr} className="grid gap-1 border-b border-ink-line/70 px-5 py-4 last:border-0 sm:grid-cols-[180px_1fr_auto] sm:items-center sm:gap-4">
                  <div>
                    <div className="text-sm text-white">{name}</div>
                    <div className="hud mt-0.5 normal-case tracking-wide">{note}</div>
                  </div>
                  <a href={`${EXPLORER}${addr}`} target="_blank" rel="noreferrer" className="break-all font-mono text-xs text-accent hover:underline">
                    {addr}
                  </a>
                  <CopyButton text={addr} />
                </li>
              ))}
            </ul>
            <p className="hud border-t border-ink-line px-5 py-3 normal-case tracking-wide">
              Only the META address above is the official Robinhood Stock Token. Other tokens with the same name are not.
            </p>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
