import { formatUnits } from "viem";

export const short = (a?: string) => (a ? `${a.slice(0, 6)}…${a.slice(-4)}` : "—");

export const usd = (v18?: bigint, d = 4) => (v18 === undefined ? "—" : `$${Number(formatUnits(v18, 18)).toFixed(d)}`);

export const meta = (v?: bigint, d = 6) => (v === undefined ? "—" : `${Number(formatUnits(v, 18)).toFixed(d)} META`);

export const eth = (v?: bigint, d = 6) => (v === undefined ? "—" : `${Number(formatUnits(v, 18)).toFixed(d)} ETH`);

export const ts = (s?: number | bigint) =>
  s === undefined || Number(s) === 0 ? "—" : new Date(Number(s) * 1000).toLocaleString("id-ID");

type ViemLikeError = {
  shortMessage?: string;
  details?: string;
  message?: string;
  walk?: (fn: (e: unknown) => boolean) => unknown;
};

/** Human-readable error; decodes custom Solidity errors (e.g. `FaucetCooldown(1795…)`) when viem has the ABI. */
export function errMsg(e: unknown): string {
  const err = (e ?? {}) as ViemLikeError;
  const reverted = err.walk?.((x) => !!(x as { data?: { errorName?: string } })?.data?.errorName) as
    | { data?: { errorName: string; args?: readonly unknown[] } }
    | undefined;
  if (reverted?.data?.errorName) {
    const args = (reverted.data.args ?? []).map((a) => String(a)).join(", ");
    return `${reverted.data.errorName}(${args})`;
  }
  return [err.shortMessage, err.details].filter(Boolean).join(" — ") || err.message || String(e);
}
