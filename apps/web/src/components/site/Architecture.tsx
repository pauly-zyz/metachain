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
    <svg viewBox="0 0 660 440" className="h-auto w-full" role="img" aria-label="Layered architecture diagram">
      <defs>
        <linearGradient id="plateHot" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#0866ff" stopOpacity="0.28" />
          <stop offset="1" stopColor="#0866ff" stopOpacity="0.04" />
        </linearGradient>
        <linearGradient id="plate" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#e7edf7" stopOpacity="0.06" />
          <stop offset="1" stopColor="#e7edf7" stopOpacity="0.01" />
        </linearGradient>
      </defs>
      {/* vertical flow between layers */}
      {[110, 220].map((y) => (
        <line key={y} x1="200" y1={y + 30} x2="200" y2={y + 70} stroke="#0866ff" strokeWidth="1.5" strokeDasharray="3 4" className="animate-flow" />
      ))}
      {[...LAYERS].reverse().map((l) => (
        <g key={l.label}>
          <path d={side(l.y)} fill={l.hot ? "#0866ff" : "#e7edf7"} fillOpacity={l.hot ? 0.35 : 0.08} />
          <path d={plate(l.y)} fill={l.hot ? "url(#plateHot)" : "url(#plate)"} stroke={l.hot ? "#0866ff" : "#e7edf7"} strokeOpacity={l.hot ? 0.9 : 0.3} />
          {/* circuit marks */}
          <path d={`M120 ${l.y + 70} L200 ${l.y + 108} L280 ${l.y + 70}`} fill="none" stroke={l.hot ? "#5cc8ff" : "#e7edf7"} strokeOpacity={l.hot ? 0.7 : 0.15} />
          <circle cx="200" cy={l.y + 70} r={l.hot ? 16 : 10} fill="none" stroke={l.hot ? "#5cc8ff" : "#e7edf7"} strokeOpacity={l.hot ? 0.9 : 0.25} />
          <line x1="360" y1={l.y + 70} x2="392" y2={l.y + 70} stroke="#e7edf7" strokeOpacity="0.25" />
          <text x="400" y={l.y + 66} fill={l.hot ? "#0866ff" : "#e7edf7"} fontFamily="Chakra Petch, sans-serif" fontSize="15" letterSpacing="2">
            {l.label}
          </text>
          <text x="400" y={l.y + 84} fill="#64718a" fontFamily="JetBrains Mono, monospace" fontSize="9">
            {l.sub}
          </text>
        </g>
      ))}
    </svg>
  );
}

export function Architecture() {
  return (
    <section id="architecture" className="relative overflow-hidden border-b border-ink-line py-28">
      <div className="absolute inset-0 -z-10 bg-[radial-gradient(ellipse_at_80%_50%,rgba(8,102,255,0.12),transparent_60%)]" />
      <span className="pointer-events-none absolute -bottom-10 left-0 -z-10 select-none font-display text-[22vw] font-bold uppercase leading-none text-transparent [-webkit-text-stroke:1px_rgba(231,237,247,0.05)]">
        stack
      </span>
      <div className="mx-auto grid max-w-7xl grid-cols-1 items-center gap-12 px-4 sm:px-6 lg:grid-cols-2 [&>*]:min-w-0">
        <Reveal>
          <SectionLabel index="04">ARCHITECTURE</SectionLabel>
          <h2 className="mt-5 font-display text-[clamp(2.2rem,5vw,4rem)] font-semibold uppercase leading-[0.95] text-white">
            Three layers.
            <br />
            One <span className="text-accent">bill.</span>
          </h2>
          <p className="mt-6 max-w-xl text-bone-dim">
            No new chain, no bridge. META Chain is a paymaster layer on Robinhood Chain: your account signs, the paymaster
            pays the network in ETH and bills you in META, and the canonical EntryPoint enforces everything.
          </p>
          <div className="mt-10 grid grid-cols-2 gap-6 border-t border-ink-line pt-8 sm:grid-cols-3">
            {[
              ["ERC-4337", "account abstraction"],
              ["v0.7", "canonical entrypoint"],
              ["0", "bridges / new L3s"],
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
