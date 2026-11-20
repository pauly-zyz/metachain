import Link from "next/link";
import { Logo } from "./Logo";

export function SiteFooter() {
  return (
    <footer className="relative overflow-hidden">
      <div className="mx-auto max-w-7xl px-4 pt-24 sm:px-6">
        <div className="flex flex-col items-start justify-between gap-10 md:flex-row md:items-end">
          <div>
            <h2 className="font-display text-[clamp(2.4rem,6vw,5rem)] font-semibold uppercase leading-[0.9] text-white">
              Isi bensinmu
              <br />
              dengan <span className="text-accent text-glow">ekuitas.</span>
            </h2>
            <div className="mt-8 flex flex-wrap gap-5">
              <Link href="/app" className="btn-plasma">
                Buka App
              </Link>
              <Link href="/dashboard" className="btn-ghost">
                Lihat oracle live
              </Link>
            </div>
          </div>
          <nav className="grid grid-cols-2 gap-x-12 gap-y-3 font-mono text-xs uppercase tracking-wide2 text-bone-dim">
            <a href="#cara-kerja" className="hover:text-white">Cara kerja</a>
            <Link href="/app" className="hover:text-white">App</Link>
            <a href="#harga" className="hover:text-white">Harga</a>
            <Link href="/agents" className="hover:text-white">Agen AI</Link>
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
          <p>
            META Chain adalah perangkat lunak eksperimental dan belum diaudit. <strong className="text-bone-dim">Tidak berafiliasi</strong>{" "}
            dengan Meta Platforms, Inc. maupun Robinhood (Robinhood Markets, Inc. / Robinhood Assets (Jersey) Limited). META
            Stock Token adalah sekuritas utang ter-tokenisasi yang tidak tersedia untuk U.S. Persons dan dibatasi di
            beberapa yurisdiksi lain. Bukan nasihat investasi. Data harga dibaca langsung dari kontrak Chainlink dan Uniswap
            di Robinhood Chain dan dapat tertunda.
          </p>
        </div>
      </div>
      <div
        aria-hidden
        className="pointer-events-none select-none text-center font-display text-[18vw] font-bold uppercase leading-[0.8] tracking-tight text-transparent [-webkit-text-stroke:1px_rgba(255,91,31,0.18)]"
      >
        META·CHAIN
      </div>
    </footer>
  );
}
