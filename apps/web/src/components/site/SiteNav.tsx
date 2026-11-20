"use client";
import Link from "next/link";
import { useEffect, useState } from "react";
import { Logo } from "./Logo";

const LINKS = [
  { href: "#token", label: "$METAC" },
  { href: "#how-it-works", label: "How it works" },
  { href: "#pricing", label: "Pricing" },
  { href: "#agents", label: "AI agents" },
  { href: "#architecture", label: "Architecture" },
  { href: "#developer", label: "Developer" },
  { href: "#faq", label: "FAQ" },
];

export function SiteNav() {
  const [scrolled, setScrolled] = useState(false);
  const [progress, setProgress] = useState(0);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const on = () => {
      setScrolled(window.scrollY > 24);
      const max = document.documentElement.scrollHeight - window.innerHeight;
      setProgress(max > 0 ? window.scrollY / max : 0);
    };
    on();
    window.addEventListener("scroll", on, { passive: true });
    return () => window.removeEventListener("scroll", on);
  }, []);

  return (
    <header
      className={`sticky top-0 z-50 border-b transition-colors ${scrolled ? "border-ink-line bg-ink/85 backdrop-blur-md" : "border-transparent bg-transparent"}`}
    >
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-6 px-4 sm:px-6">
        <Link href="/" aria-label="META Chain">
          <Logo />
        </Link>
        <nav className="hidden items-center gap-7 lg:flex">
          {LINKS.map((l) => (
            <a key={l.href} href={l.href} className="font-mono text-[11px] uppercase tracking-wide2 text-bone-dim transition hover:text-white">
              {l.label}
            </a>
          ))}
        </nav>
        <div className="flex items-center gap-4">
          <span className="hidden items-center gap-2 font-mono text-[10px] tracking-hud text-bone-mute sm:flex">
            ORACLE <span className="h-1.5 w-1.5 animate-pulseDot bg-good" /> <span className="text-good">LIVE</span>
          </span>
          <Link href="/app" className="btn-plasma whitespace-nowrap !px-4 !py-2 !text-xs">
            Launch App
          </Link>
          <button className="text-bone lg:hidden" onClick={() => setOpen((o) => !o)} aria-label="Menu" aria-expanded={open}>
            <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="1.5">
              {open ? <path d="M6 6l12 12M18 6 6 18" /> : <path d="M4 7h16M4 12h16M4 17h16" />}
            </svg>
          </button>
        </div>
      </div>
      {open && (
        <nav className="border-t border-ink-line bg-ink px-4 py-3 lg:hidden">
          {LINKS.map((l) => (
            <a key={l.href} href={l.href} onClick={() => setOpen(false)} className="block py-2 font-mono text-xs uppercase tracking-wide2 text-bone-dim">
              {l.label}
            </a>
          ))}
        </nav>
      )}
      <div className="h-px bg-accent/80 transition-[width]" style={{ width: `${progress * 100}%` }} />
    </header>
  );
}
