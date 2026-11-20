import { Reveal, SectionLabel } from "./Reveal";

const LAYERS = [
  { y: 40, label: "SMART ACCOUNT", sub: "Kernel v3.1 · Smart Sessions", hot: true },
  { y: 150, label: "META PAYMASTER", sub: "Paymaster · Oracle · AgentPayments", hot: false },
  { y: 260, label: "ROBINHOOD CHAIN", sub: "EntryPoint v0.7 · Arbitrum L2 → Ethereum", hot: false },
];

/** Isometric stack: smart account → META paymaster layer → Robinhood Chain. */
function Stack() {
  const plate = (y: number) => `M200 ${y} L360 ${y + 70} L200 ${y + 140} L40 ${y + 70} Z`;
  const side = (y: number) => `M40 ${y + 70} L200 ${y + 140} L360 ${y + 70} L360 ${y + 80} L200 ${y + 150} L40 ${y + 80} Z`;
  return (
    <svg viewBox="0 0 660 440" className="h-auto w-full" role="img" aria-label="Diagram arsitektur berlapis">
      <defs>
        <linearGradient id="plateHot" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#ff5b1f" stopOpacity="0.28" />
          <stop offset="1" stopColor="#ff5b1f" stopOpacity="0.04" />
        </linearGradient>
        <linearGradient id="plate" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#ece8e1" stopOpacity="0.06" />
          <stop offset="1" stopColor="#ece8e1" stopOpacity="0.01" />
        </linearGradient>
      </defs>
      {/* vertical flow between layers */}
      {[110, 220].map((y) => (
        <line key={y} x1="200" y1={y + 30} x2="200" y2={y + 70} stroke="#ff5b1f" strokeWidth="1.5" strokeDasharray="3 4" className="animate-flow" />
      ))}
      {[...LAYERS].reverse().map((l) => (
        <g key={l.label}>
          <path d={side(l.y)} fill={l.hot ? "#ff5b1f" : "#ece8e1"} fillOpacity={l.hot ? 0.35 : 0.08} />
          <path d={plate(l.y)} fill={l.hot ? "url(#plateHot)" : "url(#plate)"} stroke={l.hot ? "#ff5b1f" : "#ece8e1"} strokeOpacity={l.hot ? 0.9 : 0.3} />
          {/* circuit marks */}
          <path d={`M120 ${l.y + 70} L200 ${l.y + 108} L280 ${l.y + 70}`} fill="none" stroke={l.hot ? "#ffb020" : "#ece8e1"} strokeOpacity={l.hot ? 0.7 : 0.15} />
          <circle cx="200" cy={l.y + 70} r={l.hot ? 16 : 10} fill="none" stroke={l.hot ? "#ffb020" : "#ece8e1"} strokeOpacity={l.hot ? 0.9 : 0.25} />
          <line x1="360" y1={l.y + 70} x2="392" y2={l.y + 70} stroke="#ece8e1" strokeOpacity="0.25" />
          <text x="400" y={l.y + 66} fill={l.hot ? "#ff5b1f" : "#ece8e1"} fontFamily="Chakra Petch, sans-serif" fontSize="15" letterSpacing="2">
            {l.label}
          </text>
          <text x="400" y={l.y + 84} fill="#6d6a64" fontFamily="JetBrains Mono, monospace" fontSize="9">
            {l.sub}
          </text>
        </g>
      ))}
    </svg>
  );
}

export function Architecture() {
  return (
    <section id="arsitektur" className="relative overflow-hidden border-b border-ink-line py-28">
      <div className="absolute inset-0 -z-10 bg-[radial-gradient(ellipse_at_80%_50%,rgba(255,91,31,0.12),transparent_60%)]" />
      <span className="pointer-events-none absolute -bottom-10 left-0 -z-10 select-none font-display text-[22vw] font-bold uppercase leading-none text-transparent [-webkit-text-stroke:1px_rgba(236,232,225,0.05)]">
        stack
      </span>
      <div className="mx-auto grid max-w-7xl grid-cols-1 items-center gap-12 px-4 sm:px-6 lg:grid-cols-2 [&>*]:min-w-0">
        <Reveal>
          <SectionLabel index="04">ARSITEKTUR</SectionLabel>
          <h2 className="mt-5 font-display text-[clamp(2.2rem,5vw,4rem)] font-semibold uppercase leading-[0.95] text-white">
            Tiga lapis.
            <br />
            Satu <span className="text-accent">tagihan.</span>
          </h2>
          <p className="mt-6 max-w-xl text-bone-dim">
            Tanpa chain baru, tanpa bridge. META Chain adalah lapisan paymaster di atas Robinhood Chain: akun Anda
            menandatangani, paymaster membayar ETH ke jaringan dan menagih META, EntryPoint resmi menegakkan semuanya.
          </p>
          <div className="mt-10 grid grid-cols-2 gap-6 border-t border-ink-line pt-8 sm:grid-cols-3">
            {[
              ["ERC-4337", "account abstraction"],
              ["v0.7", "entrypoint resmi"],
              ["0", "bridge / L3 baru"],
            ].map(([v, k]) => (
              <div key={k}>
                <div className="font-display text-3xl font-semibold text-white">{v}</div>
                <div className="hud mt-1">{k}</div>
              </div>
            ))}
          </div>
        </Reveal>
        <Reveal delay={150}>
          <Stack />
        </Reveal>
      </div>
    </section>
  );
}
