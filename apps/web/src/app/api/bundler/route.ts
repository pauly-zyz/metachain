import { NextResponse, type NextRequest } from "next/server";
import { createPublicClient, createWalletClient, http, type Hex } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { metaTokenPaymasterAbi } from "@metachain/sdk";
import { config } from "@/lib/config";

/**
 * Server-side JSON-RPC proxy to the ERC-4337 bundler.
 * - keeps the bundler API key (e.g. Pimlico) out of the browser
 * - avoids CORS issues with self-hosted bundlers
 * - acts as a lazy price keeper: before a UserOperation is estimated/sent, it refreshes the paymaster's cached
 *   oracle price (permissionless `updatePrice()`) when the cache is about to expire. Requires KEEPER_PRIVATE_KEY
 *   (a hot key holding a little ETH for gas) — optional; run the SDK keeper elsewhere otherwise.
 * Only ERC-4337 / read methods are forwarded.
 */
const ALLOWED = new Set([
  "eth_chainId",
  "eth_supportedEntryPoints",
  "eth_estimateUserOperationGas",
  "eth_sendUserOperation",
  "eth_getUserOperationByHash",
  "eth_getUserOperationReceipt",
  "pimlico_getUserOperationGasPrice",
  "pimlico_getUserOperationStatus",
]);
const NEEDS_FRESH_PRICE = new Set(["eth_estimateUserOperationGas", "eth_sendUserOperation"]);
const REFRESH_MARGIN_SEC = 180;

let refreshing: Promise<void> | null = null;

async function ensureFreshPrice() {
  const key = process.env.KEEPER_PRIVATE_KEY as Hex | undefined;
  const paymaster = config.addresses?.paymaster;
  if (!key || !paymaster) return;
  const publicClient = createPublicClient({ chain: config.chain, transport: http(config.rpcUrl) });
  const [, , validUntil] = await publicClient.readContract({
    address: paymaster,
    abi: metaTokenPaymasterAbi,
    functionName: "priceCache",
  });
  // compare against chain time — that is what the EntryPoint checks validUntil against
  const now = Number((await publicClient.getBlock()).timestamp);
  if (Number(validUntil) - now > REFRESH_MARGIN_SEC) return;
  const account = privateKeyToAccount(key);
  const wallet = createWalletClient({ account, chain: config.chain, transport: http(config.rpcUrl) });
  const { request } = await publicClient.simulateContract({
    address: paymaster,
    abi: metaTokenPaymasterAbi,
    functionName: "updatePrice",
    account,
  });
  const hash = await wallet.writeContract(request);
  await publicClient.waitForTransactionReceipt({ hash, timeout: 30_000 });
}

export async function POST(req: NextRequest) {
  const upstream = process.env.BUNDLER_RPC_URL;
  if (!upstream) return NextResponse.json({ error: "BUNDLER_RPC_URL not configured" }, { status: 500 });

  const body = await req.json().catch(() => null);
  const calls = Array.isArray(body) ? body : [body];
  if (!body || calls.some((c) => !c || typeof c.method !== "string" || !ALLOWED.has(c.method))) {
    return NextResponse.json({ jsonrpc: "2.0", id: null, error: { code: -32601, message: "method not allowed" } }, { status: 400 });
  }

  if (calls.some((c) => NEEDS_FRESH_PRICE.has(c.method))) {
    try {
      refreshing ??= ensureFreshPrice().finally(() => (refreshing = null));
      await refreshing;
    } catch (e) {
      // a failed refresh (e.g. circuit breaker tripped) must not hide the bundler's own error message
      console.error("[keeper] updatePrice failed:", (e as Error).message);
    }
  }

  const res = await fetch(upstream, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    cache: "no-store",
  });
  return new NextResponse(await res.text(), { status: res.status, headers: { "content-type": "application/json" } });
}
