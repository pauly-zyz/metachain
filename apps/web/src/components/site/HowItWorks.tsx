import { Reveal, SectionLabel } from "./Reveal";

const STEPS = [
  {
    n: "01",
    t: "Smart account",
    d: "Wallet Anda memiliki smart account Kernel v3.1 (ERC-4337). Sekali aktivasi, izinkan paymaster menarik META.",
    k: ["KERNEL v3.1", "ERC-7579"],
  },
  {
    n: "02",
    t: "UserOperation",
    d: "Transaksi dikirim ke bundler dengan paymasterAndData → MetaTokenPaymaster dan plafon META yang Anda tandatangani.",
    k: ["ENTRYPOINT v0.7", "BUNDLER"],
  },
  {
    n: "03",
    t: "Pre-charge META",
    d: "Paymaster mengonversi biaya gas terburuk ETH → USD → META dengan harga oracle ter-cache, lalu menarik META.",
    k: ["CHAINLINK", "TWAP V3"],
  },
  {
    n: "04",
    t: "Refund otomatis",
    d: "Setelah eksekusi, biaya aktual dihitung ulang dan selisihnya dikembalikan ke akun Anda di postOp.",
    k: ["POSTOP", "USD-PEGGED"],
  },
];

export function HowItWorks() {
  return (
    <section id="cara-kerja" className="relative border-b border-ink-line py-28">
      <div className="mx-auto max-w-7xl px-4 sm:px-6">
        <Reveal>
          <SectionLabel index="01">CARA KERJA</SectionLabel>
          <h2 className="mt-5 max-w-3xl font-display text-[clamp(2.2rem,5vw,4rem)] font-semibold uppercase leading-[0.95] text-white">
            Empat langkah. <span className="text-accent">Nol ETH</span> untuk gas.
          </h2>
          <p className="mt-5 max-w-2xl text-bone-dim">
            Gas tetap dibayar ke jaringan dalam ETH — oleh paymaster. Anda cukup memegang META. Semua aturan ditegakkan
            on-chain oleh EntryPoint resmi ERC-4337.
          </p>
        </Reveal>

        <div className="relative mt-16 grid gap-px bg-ink-line md:grid-cols-4">
          {/* animated flow line */}
          <svg className="pointer-events-none absolute -top-6 left-0 hidden h-3 w-full md:block" preserveAspectRatio="none" viewBox="0 0 100 3">
            <line x1="0" y1="1.5" x2="100" y2="1.5" stroke="#ff5b1f" strokeOpacity="0.6" strokeWidth="0.4" strokeDasharray="2 2" className="animate-flow" />
          </svg>
          {STEPS.map((s, i) => (
            <Reveal key={s.n} delay={i * 120} className="h-full">
              <div className="group relative h-full bg-ink p-7 transition hover:bg-ink-soft">
                <div className="flex items-center justify-between">
                  <span className="font-mono text-xs text-accent">{s.n}</span>
                  <span className="h-2 w-2 border border-accent/70 transition group-hover:bg-accent" />
                </div>
                <div className="mt-10 font-display text-6xl font-semibold text-ink-line transition group-hover:text-accent/20">{s.n}</div>
                <h3 className="mt-2 font-display text-2xl font-semibold uppercase text-white">{s.t}</h3>
                <p className="mt-3 text-sm leading-relaxed text-bone-dim">{s.d}</p>
                <div className="mt-6 flex flex-wrap gap-2">
                  {s.k.map((k) => (
                    <span key={k} className="border border-ink-line px-2 py-1 font-mono text-[10px] tracking-wide2 text-bone-mute">
                      {k}
                    </span>
                  ))}
                </div>
              </div>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}
