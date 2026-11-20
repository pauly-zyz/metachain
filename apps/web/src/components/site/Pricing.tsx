"use client";
import { fmtUsd, TYPICAL_OP_GAS, useMainnetOracle } from "@/lib/mainnetOracle";
import { Reveal, SectionLabel } from "./Reveal";

const MODES = [
  {
    id: "open",
    t: "Pasar buka",
    sub: "Chainlink < 1 jam",
    markup: "5%",
    cap: "$5 / op",
    dev: "≤ 3%",
    d: "Harga Chainlink 24/5 segar. TWAP Uniswap V3 dipakai sebagai pemeriksa silang.",
  },
  {
    id: "closed",
    t: "Pasar tutup",
    sub: "Chainlink < 80 jam",
    markup: "10%",
    cap: "$1 / op",
    dev: "≤ 8%",
    d: "Weekend & libur bursa: harga terakhir tetap dipakai, cek TWAP wajib, markup lebih tinggi.",
  },
  {
    id: "fallback",
    t: "Fallback",
    sub: "Chainlink basi / di-pause",
    markup: "15%",
    cap: "$1 / op",
    dev: "TWAP saja",
    d: "Aksi korporasi atau feed basi: TWAP 30 menit, harga berlaku 5 menit, atau berhenti bila dimatikan.",
  },
] as const;

function Term({ label, value, accent = false }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="flex flex-col items-center px-2">
      <span className={`font-mono text-base tabular-nums sm:text-xl ${accent ? "text-accent" : "text-white"}`}>{value}</span>
      <span className="hud mt-1 text-center">{label}</span>
    </div>
  );
}

export function Pricing() {
  const { data } = useMainnetOracle();
  const gasEth = data ? (TYPICAL_OP_GAS * data.gasPriceGwei) / 1e9 : undefined;
  return (
    <section id="harga" className="relative overflow-hidden border-b border-ink-line py-28">
      <div className="absolute inset-0 -z-10 grid-bg opacity-60" />
      <div className="absolute -right-40 top-20 -z-10 h-[520px] w-[520px] rounded-full bg-accent/10 blur-[120px]" />
      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        <Reveal>
          <SectionLabel index="02">HARGA</SectionLabel>
          <h2 className="mt-5 max-w-3xl font-display text-[clamp(2.2rem,5vw,4rem)] font-semibold uppercase leading-[0.95] text-white">
            Dipatok USD. <br />
            Dibayar <span className="text-accent">META.</span>
          </h2>
        </Reveal>

        <Reveal delay={100}>
          <div className="panel brackets mt-12 p-6 sm:p-10">
            <div className="flex items-center justify-between">
              <span className="hud">RUMUS · DIHITUNG LIVE DARI MAINNET</span>
              <span className="hud text-good">{data ? "LIVE" : "MEMUAT"}</span>
            </div>
            <div className="mt-8 flex flex-wrap items-center justify-center gap-y-6 font-mono text-bone-mute">
              <Term label={`gas (${TYPICAL_OP_GAS.toLocaleString("en-US")})`} value={gasEth ? `${gasEth.toExponential(2)} ETH` : "—"} />
              <span className="px-2 text-2xl">×</span>
              <Term label="ETH/USD" value={data ? fmtUsd(data.ethUsd) : "—"} />
              <span className="px-2 text-2xl">×</span>
              <Term label="markup" value="1.05" />
              <span className="px-2 text-2xl">÷</span>
              <Term label="META/USD" value={data ? fmtUsd(data.metaUsd) : "—"} />
              <span className="px-2 text-2xl">=</span>
              <Term label={`≈ ${data ? fmtUsd(data.opCostUsd * 1.05, 4) : "—"}`} value={data ? `${data.opCostMeta.toFixed(8)} META` : "—"} accent />
            </div>
            <p className="mx-auto mt-8 max-w-3xl text-center text-sm text-bone-dim">
              Pre-charge biaya terburuk saat validasi, refund selisih di postOp. Plafon <code>maxMetaCost</code> Anda
              tandatangani sendiri. Paymaster juga menambahkan batas atas penalti 10% EntryPoint v0.7 atas gas yang tidak
              terpakai — tidak pernah rugi, tidak pernah menagih lebih dari pre-charge.
            </p>
          </div>
        </Reveal>

        <div className="mt-10 grid gap-6 md:grid-cols-3">
          {MODES.map((m, i) => {
            const active = data?.mode === m.id;
            return (
              <Reveal key={m.id} delay={i * 120} className="h-full">
                <div className={`panel h-full p-7 transition ${active ? "border-accent/70 shadow-[0_0_60px_-20px_rgba(255,91,31,0.6)]" : ""}`}>
                  <div className="flex items-center justify-between">
                    <span className="hud">{m.sub}</span>
                    {active && (
                      <span className="flex items-center gap-2 font-mono text-[10px] tracking-hud text-accent">
                        <span className="h-1.5 w-1.5 animate-pulseDot bg-accent" /> AKTIF SEKARANG
                      </span>
                    )}
                  </div>
                  <h3 className="mt-6 font-display text-3xl font-semibold uppercase text-white">{m.t}</h3>
                  <p className="mt-3 min-h-[60px] text-sm text-bone-dim">{m.d}</p>
                  <dl className="mt-6 grid grid-cols-3 gap-2 border-t border-ink-line pt-5">
                    {[
                      ["Markup", m.markup],
                      ["Batas", m.cap],
                      ["Deviasi", m.dev],
                    ].map(([k, v]) => (
                      <div key={k}>
                        <dt className="hud">{k}</dt>
                        <dd className="mt-1 font-mono text-sm text-white">{v}</dd>
                      </div>
                    ))}
                  </dl>
                </div>
              </Reveal>
            );
          })}
        </div>
      </div>
    </section>
  );
}
