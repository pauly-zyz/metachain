import { NextResponse, type NextRequest } from "next/server";

/**
 * Server-side JSON-RPC proxy to the ERC-4337 bundler.
 * - keeps the bundler API key (e.g. Pimlico) out of the browser
 * - avoids CORS issues with self-hosted bundlers
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

export async function POST(req: NextRequest) {
  const upstream = process.env.BUNDLER_RPC_URL;
  if (!upstream) return NextResponse.json({ error: "BUNDLER_RPC_URL not configured" }, { status: 500 });

  const body = await req.json().catch(() => null);
  const calls = Array.isArray(body) ? body : [body];
  if (!body || calls.some((c) => !c || typeof c.method !== "string" || !ALLOWED.has(c.method))) {
    return NextResponse.json({ jsonrpc: "2.0", id: null, error: { code: -32601, message: "method not allowed" } }, { status: 400 });
  }
  const res = await fetch(upstream, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
    cache: "no-store",
  });
  return new NextResponse(await res.text(), { status: res.status, headers: { "content-type": "application/json" } });
}
