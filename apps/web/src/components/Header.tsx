"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAccount, useConnect, useDisconnect } from "wagmi";
import { config } from "@/lib/config";
import { short } from "@/lib/format";
import { Logo } from "./site/Logo";

const NAV = [
  { href: "/app", label: "Account" },
  { href: "/agents", label: "AI agents" },
  { href: "/dashboard", label: "Dashboard" },
];

function NavLinks({ path, mobile = false }: { path: string; mobile?: boolean }) {
  return (
    <>
      {NAV.map((n) => {
        const active = path === n.href;
        return (
          <Link
            key={n.href}
            href={n.href}
            className={`relative whitespace-nowrap px-3 py-2 font-mono text-[11px] uppercase tracking-wide2 transition ${active ? "text-white" : "text-bone-mute hover:text-white"}`}
          >
            {n.label}
            {active && <span className={`absolute inset-x-3 h-px bg-accent ${mobile ? "bottom-0" : "-bottom-[17px]"}`} />}
          </Link>
        );
      })}
    </>
  );
}

export function Header() {
  const path = usePathname();
  const { address, isConnected } = useAccount();
  const { connect, connectors, isPending } = useConnect();
  const { disconnect } = useDisconnect();
  const network = { local: "LOCAL · TESTNET FORK", testnet: "TESTNET · 46630", mainnet: "MAINNET · 4663" }[config.network];

  return (
    <header className="sticky top-0 z-40 border-b border-ink-line bg-ink/85 backdrop-blur-md">
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between gap-3 px-4 sm:px-6">
        <div className="flex min-w-0 items-center gap-8">
          <Link href="/" aria-label="Home" className="shrink-0">
            <Logo />
          </Link>
          <nav className="hidden gap-1 md:flex">
            <NavLinks path={path} />
          </nav>
        </div>
        <div className="flex shrink-0 items-center gap-4">
          <span className="hidden items-center gap-2 font-mono text-[10px] tracking-hud text-bone-mute lg:flex">
            <span className={`h-1.5 w-1.5 animate-pulseDot ${config.network === "mainnet" ? "bg-good" : "bg-amber"}`} />
            {network}
          </span>
          {isConnected ? (
            <button
              onClick={() => disconnect()}
              className="btn-ghost !px-3 !py-1.5 !font-mono !text-xs !normal-case !tracking-normal"
              title="Disconnect wallet"
            >
              {short(address)}
            </button>
          ) : (
            <button
              onClick={() => connectors[0] && connect({ connector: connectors[0] })}
              disabled={isPending || !connectors[0]}
              className="btn-plasma whitespace-nowrap !px-4 !py-2 !text-xs disabled:opacity-40"
            >
              {isPending ? "Connecting…" : "Connect wallet"}
            </button>
          )}
        </div>
      </div>
      {/* mobile: nav on its own row */}
      <nav className="flex justify-center gap-1 overflow-x-auto border-t border-ink-line px-2 md:hidden">
        <NavLinks path={path} mobile />
      </nav>
    </header>
  );
}
