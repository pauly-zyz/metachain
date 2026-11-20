import type { Metadata } from "next";
import type { ReactNode } from "react";
import "./globals.css";
import { Providers } from "@/components/Providers";
import { Header } from "@/components/Header";
import { DisclaimerBanner } from "@/components/DisclaimerBanner";
import { ConfigNotice } from "@/components/ConfigNotice";

export const metadata: Metadata = {
  title: "META Chain",
  description:
    "Bayar gas di Robinhood Chain dengan META Stock Token (ERC-4337 paymaster). Tidak berafiliasi dengan Meta Platforms maupun Robinhood.",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="id">
      <body className="min-h-screen bg-ink text-slate-200 antialiased">
        <Providers>
          <DisclaimerBanner />
          <Header />
          <main className="mx-auto max-w-5xl space-y-6 px-4 py-8">
            <ConfigNotice />
            {children}
          </main>
          <footer className="mx-auto max-w-5xl px-4 pb-10 text-xs text-slate-500">
            META Chain adalah perangkat lunak eksperimental, belum diaudit. Tidak berafiliasi dengan Meta Platforms, Inc.
            maupun Robinhood. Tidak untuk U.S. Persons.
          </footer>
        </Providers>
      </body>
    </html>
  );
}
