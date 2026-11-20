"use client";
import { useState } from "react";
import { Reveal, SectionLabel } from "./Reveal";

const QA: [string, string][] = [
  [
    "Apa itu META Chain?",
    "Lapisan pembayaran gas di Robinhood Chain (Arbitrum L2). Smart account ERC-4337 membayar biaya transaksi dengan META Stock Token lewat paymaster; paymaster membayar ETH ke jaringan. Bukan chain atau L3 baru.",
  ],
  [
    "Apakah META Chain berafiliasi dengan Meta Platforms atau Robinhood?",
    "Tidak. META Chain adalah proyek independen dan tidak berafiliasi, didukung, maupun disponsori oleh Meta Platforms, Inc. atau Robinhood (Robinhood Markets, Inc. / Robinhood Assets (Jersey) Limited).",
  ],
  [
    "Siapa yang boleh memakai META Stock Token?",
    "META Stock Token adalah sekuritas utang ter-tokenisasi yang tidak tersedia untuk warga/penduduk AS (U.S. Persons) dan dibatasi di beberapa yurisdiksi lain (antara lain Kanada, Inggris, Swiss). Pastikan Anda memenuhi syarat di yurisdiksi Anda.",
  ],
  [
    "Berapa biaya satu transaksi?",
    "Biaya dipatok USD: gas aktual × harga ETH, ditambah markup 5% (pasar buka). Di Robinhood Chain biasanya hanya pecahan sen — fork test mainnet ≈ $0,008 per operasi. Jumlah META menyesuaikan harga saham.",
  ],
  [
    "Apa yang terjadi saat pasar saham tutup?",
    "Feed Chainlink META bergerak 24/5. Saat weekend/libur, harga terakhir tetap dipakai sampai 80 jam dengan markup lebih tinggi, batas per transaksi lebih kecil, dan pemeriksaan TWAP Uniswap V3 wajib. Di luar itu sistem pindah ke fallback TWAP atau berhenti dengan aman.",
  ],
  [
    "Bagaimana harga dilindungi dari manipulasi?",
    "Chainlink adalah sumber utama; TWAP Uniswap V3 30 menit menjadi pemeriksa silang. Bila selisihnya melebihi 3% (pasar buka) atau 8% (pasar tutup), circuit breaker menolak harga. Batas USD per transaksi dan per akun membatasi eksposur.",
  ],
  [
    "Apakah saya butuh ETH?",
    "Hanya sekali untuk aktivasi akun (deploy + izin META ke paymaster), karena paymaster menarik META sebelum izin di operasi yang sama berlaku. Sesudahnya semua gas dibayar META.",
  ],
  [
    "Apakah kontraknya sudah diaudit dan mainnet sudah aktif?",
    "Belum. Kode bersumber terbuka, diuji (unit, fuzz, fork test mainnet, e2e) dan dianalisis Slither, tetapi belum diaudit eksternal. Oracle mainnet di halaman ini live; kontrak paymaster mainnet menunggu audit dan persetujuan pemilik proyek.",
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
            Delapan pertanyaan. <span className="text-accent">Jawaban jelas.</span>
          </h2>
          <p className="mt-5 max-w-sm text-bone-dim">Detail teknis lengkap ada di README dan riset kelayakan di GitHub.</p>
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
