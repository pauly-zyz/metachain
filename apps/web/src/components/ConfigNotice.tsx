"use client";
import { config } from "@/lib/config";
import { Notice } from "./ui";

export function ConfigNotice() {
  if (config.addresses) return null;
  if (config.deploymentChainMismatch) {
    return (
      <Notice tone="bad">
        <code>NEXT_PUBLIC_DEPLOYMENT_JSON</code> contains a deployment for another network (not chain {config.chain.id}). Use
        the correct {config.network === "mainnet" ? "mainnet" : "testnet"} deployment file.
      </Notice>
    );
  }
  if (config.network === "mainnet") {
    return (
      <Notice tone="warn">
        The META Chain paymaster contracts are <strong>not yet deployed on Robinhood Chain mainnet</strong>. Paying gas in META
        is not available yet; the Dashboard shows live mainnet price data. After deployment, set{" "}
        <code>NEXT_PUBLIC_DEPLOYMENT_JSON</code> to <code>contracts/deployments/robinhood-mainnet.json</code>.
      </Notice>
    );
  }
  return (
    <Notice tone="warn">
      META Chain contract addresses are not configured. Set <code>NEXT_PUBLIC_DEPLOYMENT_JSON</code> to the contents of{" "}
      <code>contracts/deployments/&lt;name&gt;.json</code> (see <code>apps/web/.env.example</code>). For the local demo, run{" "}
      <code>scripts/e2e-local.sh up</code>, which writes <code>apps/web/.env.local</code> automatically.
    </Notice>
  );
}
