"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAccount, useConnect, useDisconnect } from "wagmi";
import { config } from "@/lib/config";
import { short } from "@/lib/format";

const NAV = [
  { href: "/", label: "Akun" },
  { href: "/agents", label: "Agen AI" },
  { href: "/dashboard", label: "Dashboard" },
];

export function Header() {
  const path = usePathname();
  const { address, isConnected } = useAccount();
  const { connect, connectors, isPending } = useConnect();
  const { disconnect } = useDisconnect();
  const network = { local: "Lokal (fork testnet)", testnet: "Robinhood Chain Testnet", mainnet: "Robinhood Chain" }[
    config.network
  ];

  return (
    <header className="border-b border-ink-line bg-ink/80 backdrop-blur">
      <div className="mx-auto flex max-w-5xl flex-wrap items-center justify-between gap-3 px-4 py-3">
        <div className="flex items-center gap-6">
          <Link href="/" className="font-semibold text-white">
            META<span className="text-accent">Chain</span>
          </Link>
          <nav className="flex gap-1 text-sm">
            {NAV.map((n) => (
              <Link
                key={n.href}
                href={n.href}
                className={`rounded-md px-3 py-1.5 ${path === n.href ? "bg-accent-soft text-white" : "text-slate-400 hover:text-white"}`}
              >
                {n.label}
              </Link>
            ))}
          </nav>
        </div>
        <div className="flex items-center gap-3 text-sm">
          <span className="hidden rounded-full border border-ink-line px-2.5 py-1 text-xs text-slate-400 sm:inline">{network}</span>
          {isConnected ? (
            <button
              onClick={() => disconnect()}
              className="rounded-lg border border-ink-line px-3 py-1.5 font-mono text-slate-200 hover:border-slate-500"
              title="Putuskan"
            >
              {short(address)}
            </button>
          ) : (
            <button
              onClick={() => connectors[0] && connect({ connector: connectors[0] })}
              disabled={isPending || !connectors[0]}
              className="rounded-lg bg-accent px-3 py-1.5 font-medium text-white hover:bg-blue-500 disabled:opacity-40"
            >
              {isPending ? "Menghubungkan…" : "Hubungkan wallet"}
            </button>
          )}
        </div>
      </div>
    </header>
  );
}
