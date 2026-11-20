import type { ReactNode } from "react";
import { Header } from "@/components/Header";
import { ConfigNotice } from "@/components/ConfigNotice";

export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <div className="relative min-h-screen">
      <div className="pointer-events-none fixed inset-0 -z-10 grid-bg opacity-60" />
      <div className="pointer-events-none fixed -top-40 right-0 -z-10 h-[480px] w-[480px] rounded-full bg-accent/10 blur-[120px]" />
      <Header />
      <main className="mx-auto max-w-6xl space-y-6 px-4 py-10 sm:px-6">
        <ConfigNotice />
        {children}
      </main>
      <footer className="mx-auto max-w-6xl border-t border-ink-line px-4 py-8 text-xs text-bone-mute sm:px-6">
        META Chain is experimental, unaudited software. Not affiliated with Meta Platforms, Inc. or Robinhood. Not for U.S.
        Persons.
      </footer>
    </div>
  );
}
