import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import "./globals.css";
import { Providers } from "@/components/Providers";
import { DisclaimerBanner } from "@/components/DisclaimerBanner";

export const metadata: Metadata = {
  title: "META CHAIN — Equity is fuel",
  description:
    "Bayar gas di Robinhood Chain dengan META Stock Token (ERC-4337 paymaster), dipatok USD dan dihargai oracle Chainlink + TWAP. Tidak berafiliasi dengan Meta Platforms maupun Robinhood.",
};

export const viewport: Viewport = { themeColor: "#07070a" };

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="id">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        {/* eslint-disable-next-line @next/next/no-page-custom-font */}
        <link
          rel="stylesheet"
          href="https://fonts.googleapis.com/css2?family=Chakra+Petch:wght@400;500;600;700&family=Inter:wght@400;500;600&family=JetBrains+Mono:wght@400;500&display=swap"
        />
      </head>
      <body className="min-h-screen bg-ink font-sans text-bone antialiased">
        <Providers>
          <DisclaimerBanner />
          {children}
        </Providers>
      </body>
    </html>
  );
}
