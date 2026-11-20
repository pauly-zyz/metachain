import { Reveal, SectionLabel } from "./Reveal";

const FEATURES = [
  { t: "Session key berbatas", d: "Agen hanya memegang kunci session — tidak pernah kunci pemilik. Hanya boleh memanggil AgentPayments.pay." },
  { t: "Batas per periode", d: "Maks. META, maks. USD (dinilai oracle) dan maks. jumlah transaksi per jam/hari — ditegakkan on-chain." },
  { t: "Receipt inferensi", d: "Setiap pembayaran mencatat payer, payee, jumlah, nilai USD dan memoHash — bukti on-chain untuk job AI." },
  { t: "Masa berlaku & cabut", d: "TimeFrame + UsageLimit policy. Pemilik bisa mencabut session kapan saja dalam satu transaksi." },
  { t: "Gas juga META", d: "UserOperation agen dibayar lewat paymaster yang sama — agen tidak perlu ETH sama sekali." },
  { t: "Modul teraudit", d: "Rhinestone Smart Sessions + Kernel v3.1 yang sudah ter-deploy di Robinhood Chain, bukan logika buatan sendiri." },
];

const CODE = `import { createAgentClient } from "@metachain/sdk";

const agent = await createAgentClient({
  client, chain, bundlerUrl,
  accountAddress,          // smart account pemilik
  sessionKey,              // kunci terbatas milik agen
  permissionId, addresses,
});

const receipt = await agent.pay({
  token: addresses.meta,
  payee: providerAgent,
  amount: parseUnits("0.004", 18),
  memo: "inference #4217",
  memoHash: keccak256(job),
});
// receipt.paymentId · receipt.gas.metaCharged`;

function highlight(code: string) {
  return code.split("\n").map((line, i) => {
    const comment = line.indexOf("//");
    const body = comment >= 0 ? line.slice(0, comment) : line;
    const rest = comment >= 0 ? line.slice(comment) : "";
    const parts = body.split(/("[^"]*")/g).map((p, j) =>
      p.startsWith('"') ? (
        <span key={j} className="text-amber">
          {p}
        </span>
      ) : (
        <span key={j}>
          {p.split(/\b(import|from|const|await)\b/g).map((w, k) =>
            ["import", "from", "const", "await"].includes(w) ? (
              <span key={k} className="text-accent">
                {w}
              </span>
            ) : (
              w
            ),
          )}
        </span>
      ),
    );
    return (
      <div key={i} className="whitespace-pre">
        <span className="mr-4 inline-block w-5 select-none text-right text-bone-mute/50">{i + 1}</span>
        {parts}
        {rest && <span className="text-bone-mute">{rest}</span>}
      </div>
    );
  });
}

export function Agents() {
  return (
    <section id="agen" className="relative border-b border-ink-line py-28">
      <div className="mx-auto grid max-w-7xl grid-cols-1 gap-14 px-4 sm:px-6 lg:grid-cols-2 [&>*]:min-w-0">
        <div>
          <Reveal>
            <SectionLabel index="03">AGEN AI</SectionLabel>
            <h2 className="mt-5 font-display text-[clamp(2.2rem,5vw,4rem)] font-semibold uppercase leading-[0.95] text-white">
              Mesin yang <span className="text-accent">saling membayar.</span>
            </h2>
            <p className="mt-5 max-w-xl text-bone-dim">
              Beri agen AI dompet yang bisa membayar agen lain secara otonom — dengan batas yang tidak bisa ia langgar.
            </p>
          </Reveal>
          <div className="mt-10 grid gap-px bg-ink-line sm:grid-cols-2">
            {FEATURES.map((f, i) => (
              <Reveal key={f.t} delay={i * 80} className="h-full">
                <div className="h-full bg-ink p-5 transition hover:bg-ink-soft">
                  <div className="flex items-center gap-2">
                    <span className="font-mono text-[10px] text-accent">{String(i + 1).padStart(2, "0")}</span>
                    <h3 className="font-display text-base font-semibold uppercase tracking-wide text-white">{f.t}</h3>
                  </div>
                  <p className="mt-2 text-sm leading-relaxed text-bone-dim">{f.d}</p>
                </div>
              </Reveal>
            ))}
          </div>
        </div>

        <Reveal delay={150} className="lg:pt-24">
          <div className="panel overflow-hidden">
            <div className="flex items-center justify-between border-b border-ink-line px-4 py-3">
              <div className="flex gap-1.5">
                <span className="h-2.5 w-2.5 bg-accent/80" />
                <span className="h-2.5 w-2.5 bg-amber/70" />
                <span className="h-2.5 w-2.5 bg-bone-mute/40" />
              </div>
              <span className="hud">agent.ts</span>
            </div>
            <pre className="overflow-x-auto p-5 font-mono text-[12.5px] leading-6 text-bone">{highlight(CODE)}</pre>
            <div className="grid grid-cols-3 divide-x divide-ink-line border-t border-ink-line">
              {[
                ["0,02 META", "maks / jam"],
                ["10 tx", "rate limit"],
                ["24 jam", "masa berlaku"],
              ].map(([v, k]) => (
                <div key={k} className="px-4 py-3">
                  <div className="font-mono text-sm text-accent">{v}</div>
                  <div className="hud mt-0.5">{k}</div>
                </div>
              ))}
            </div>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
