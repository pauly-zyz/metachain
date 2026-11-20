"use client";
import { useConnect } from "wagmi";
import { config } from "@/lib/config";
import { fmtUsd, MODE_LABEL, useMainnetOracle } from "@/lib/mainnetOracle";

const STEPS = [
  ["01", "Hubungkan wallet", "MetaMask atau wallet EVM lain menjadi pemilik smart account Anda."],
  ["02", "Aktifkan akun", "Satu kali: deploy smart account Kernel v3.1 dan izinkan paymaster menarik META."],
  ["03", "Bertransaksi", "Setiap transaksi berikutnya membayar gas dengan META, dipatok USD."],
];

/** Empty state for the app when no wallet is connected. */
export function AppIntro() {
  const { connect, connectors, isPending } = useConnect();
  const { data } = useMainnetOracle();
  const showOracle = config.network === "mainnet";
  return (
    <div className="panel brackets relative overflow-hidden">
      <div className="pointer-events-none absolute -right-24 -top-24 h-72 w-72 rounded-full bg-accent/15 blur-[90px]" />
      <div className="grid gap-px bg-ink-line lg:grid-cols-[1.2fr_1fr]">
        <div className="bg-ink-soft p-6 sm:p-10">
          <span className="hud text-accent">MULAI DALAM 3 LANGKAH</span>
          <ol className="mt-6 space-y-6">
            {STEPS.map(([n, t, d]) => (
              <li key={n} className="flex gap-5">
                <span className="font-display text-3xl font-semibold text-accent/80">{n}</span>
                <div>
                  <div className="font-display text-lg font-semibold uppercase tracking-wide text-white">{t}</div>
                  <p className="mt-1 text-sm text-bone-dim">{d}</p>
                </div>
              </li>
            ))}
          </ol>
          <button
            onClick={() => connectors[0] && connect({ connector: connectors[0] })}
            disabled={isPending || !connectors[0]}
            className="btn-plasma mt-9 disabled:opacity-40"
          >
            {isPending ? "Menghubungkan…" : connectors[0] ? "Hubungkan wallet" : "Pasang wallet EVM terlebih dahulu"}
          </button>
        </div>
        <div className="flex flex-col justify-between bg-ink p-6 sm:p-10">
          {showOracle ? (
            <>
              <div>
                <div className="flex items-center justify-between">
                  <span className="hud">META / USD · CHAINLINK</span>
                  <span className="flex items-center gap-2 font-mono text-[10px] tracking-hud text-good">
                    <span className="h-1.5 w-1.5 animate-pulseDot bg-good" /> LIVE
                  </span>
                </div>
                <div className="mt-3 font-display text-5xl font-semibold tabular-nums text-white text-glow">
                  {data ? fmtUsd(data.metaUsd) : "$———"}
                </div>
                <div className="mt-2 font-mono text-xs text-bone-dim">
                  TWAP {data ? fmtUsd(data.twapUsd) : "—"} · {data ? MODE_LABEL[data.mode] : "MEMUAT"}
                </div>
              </div>
              <dl className="mt-8 grid grid-cols-2 gap-5 border-t border-ink-line pt-6">
                <div>
                  <dt className="hud">Biaya / transaksi</dt>
                  <dd className="mt-1 font-mono text-lg text-accent">{data ? fmtUsd(data.opCostUsd * 1.05, 4) : "—"}</dd>
                </div>
                <div>
                  <dt className="hud">Dalam META</dt>
                  <dd className="mt-1 font-mono text-lg text-white">{data ? data.opCostMeta.toFixed(8) : "—"}</dd>
                </div>
              </dl>
            </>
          ) : (
            <p className="text-sm text-bone-dim">
              Jaringan: <span className="text-white">{config.chain.name}</span>
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
