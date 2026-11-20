"use client";
import Link from "next/link";
import { config } from "@/lib/config";
import { Notice } from "./ui";

/**
 * Public notice shown while the META Chain contracts are not configured for the current network.
 * Developer setup instructions live in the README (apps/web/.env.example), not in the public UI.
 */
export function ConfigNotice() {
  if (config.addresses) return null;

  if (config.deploymentChainMismatch) {
    // misconfiguration: keep the message short for visitors, details are logged for operators
    if (typeof window !== "undefined") {
      console.warn(`[META Chain] NEXT_PUBLIC_DEPLOYMENT_JSON targets another chain (expected ${config.chain.id}).`);
    }
  }

  if (config.network === "mainnet") {
    return (
      <div className="panel brackets relative overflow-hidden px-5 py-4 sm:px-6">
        <div className="pointer-events-none absolute -left-16 -top-16 h-40 w-40 rounded-full bg-accent/20 blur-[60px]" />
        <div className="relative flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <span className="mt-1.5 h-2 w-2 shrink-0 animate-pulseDot bg-amber" />
            <div>
              <div className="font-display text-sm font-semibold uppercase tracking-wide2 text-white">
                Preview mode · Gas payments in META are launching soon
              </div>
              <p className="mt-1 text-sm text-bone-dim">
                The paymaster goes live on Robinhood Chain mainnet after its security review. Until then you can explore the
                app and follow the live META/USD oracle.
              </p>
            </div>
          </div>
          <Link href="/dashboard" className="btn-ghost shrink-0 !px-4 !py-2 !text-xs">
            Live oracle
          </Link>
        </div>
      </div>
    );
  }

  return (
    <Notice tone="warn">
      This network is not configured yet. Please check back soon or switch to Robinhood Chain mainnet.
    </Notice>
  );
}
