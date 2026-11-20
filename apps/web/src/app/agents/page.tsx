"use client";
import { useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { parseAbiItem, parseUnits, type Address, type Hex } from "viem";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";
import {
  buildAgentSession,
  createMetaAccountClient,
  getCreateAgentSessionCalls,
  getRevokeAgentSessionCalls,
  isAgentSessionEnabled,
} from "@metachain/sdk";
import { config } from "@/lib/config";
import { useMetaAccount } from "@/lib/useMetaAccount";
import { errMsg, meta, short, ts, usd } from "@/lib/format";
import { Badge, Button, Card, Field, Notice, Row, TxLink } from "@/components/ui";

interface StoredSession {
  permissionId: Hex;
  sessionKey: Address;
  validUntil: number;
  maxUses: string;
  createdAt: number;
  label: string;
}

const storageKey = (account: string) => `metachain:sessions:${config.chain.id}:${account.toLowerCase()}`;

function loadSessions(account?: string): StoredSession[] {
  if (!account) return [];
  try {
    return JSON.parse(localStorage.getItem(storageKey(account)) ?? "[]");
  } catch {
    return [];
  }
}

function saveSessions(account: string, sessions: StoredSession[]) {
  try {
    localStorage.setItem(storageKey(account), JSON.stringify(sessions));
  } catch {
    // storage unavailable (private mode) — sessions still exist on-chain
  }
}

function download(name: string, data: unknown) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const el = document.createElement("a");
  el.href = url;
  el.download = name;
  el.click();
  URL.revokeObjectURL(url);
}

const paymentEvent = parseAbiItem(
  "event PaymentSent(uint256 indexed id, address indexed payer, address indexed payee, address token, uint256 amount, uint256 usdValue, bytes32 memoHash, string memo)",
);

export default function AgentsPage() {
  const { client, account, readiness } = useMetaAccount();
  const a = config.addresses;
  const [sessions, setSessions] = useState<StoredSession[]>([]);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<{ tone: "good" | "bad" | "neutral"; msg: string; hash?: string } | null>(null);
  const [form, setForm] = useState({
    label: "agen-inferensi",
    perPeriodMeta: "0.05",
    perPeriodUsd: "25",
    periodHours: "1",
    maxTx: "10",
    validDays: "7",
    maxUses: "100",
    allowance: "0.5",
  });
  const set = (k: keyof typeof form) => (v: string) => setForm((f) => ({ ...f, [k]: v }));

  useEffect(() => setSessions(loadSessions(account?.address)), [account?.address]);

  const statuses = useQuery({
    queryKey: ["session-status", account?.address, sessions.map((s) => s.permissionId).join()],
    enabled: !!account && sessions.length > 0 && !!a,
    refetchInterval: 10_000,
    queryFn: async () =>
      Object.fromEntries(
        await Promise.all(
          sessions.map(async (s) => [s.permissionId, await isAgentSessionEnabled(client, account!.address, s.permissionId, a!.smartSessions)] as const),
        ),
      ),
  });

  const history = useQuery({
    queryKey: ["payments", account?.address],
    enabled: !!account && !!a,
    refetchInterval: 10_000,
    queryFn: async () => {
      const logs = await client.getLogs({
        address: a!.agentPayments,
        event: paymentEvent,
        args: { payer: account!.address },
        fromBlock: BigInt(config.deployment?.deployBlock ?? 0),
        toBlock: "latest",
      });
      return logs.reverse();
    },
  });

  const limits = useQuery({
    queryKey: ["limits", account?.address],
    enabled: !!account && !!a,
    refetchInterval: 10_000,
    queryFn: async () => {
      const { agentPaymentsAbi } = await import("@metachain/sdk");
      return client.readContract({
        address: a!.agentPayments,
        abi: agentPaymentsAbi,
        functionName: "remaining",
        args: [account!.address, a!.meta],
      });
    },
  });

  async function createSession() {
    if (!account || !a) return;
    setBusy(true);
    setStatus({ tone: "neutral", msg: "Membuat session key…" });
    try {
      const key = generatePrivateKey();
      const sessionKey = privateKeyToAccount(key);
      const now = Number((await client.getBlock()).timestamp);
      const validUntil = now + Math.round(Number(form.validDays) * 86400);
      const session = buildAgentSession({
        chainId: config.chain.id,
        sessionKey: sessionKey.address,
        agentPayments: a.agentPayments,
        validUntil,
        maxUses: BigInt(form.maxUses),
      });
      const { calls, permissionId } = await getCreateAgentSessionCalls({
        client,
        account: account.address,
        addresses: a,
        session,
        token: a.meta,
        limits: {
          maxAmountPerPeriod: parseUnits(form.perPeriodMeta || "0", 18),
          maxUsdPerPeriod: parseUnits(form.perPeriodUsd || "0", 18),
          period: Math.round(Number(form.periodHours) * 3600),
          maxTxPerPeriod: Number(form.maxTx),
        },
        allowance: parseUnits(form.allowance || "0", 18),
      });
      const c = createMetaAccountClient({ account, chain: config.chain, client, bundlerUrl: config.bundlerUrl, addresses: a });
      const hash = await c.sendUserOperation({ calls });
      const rec = await c.waitForUserOperationReceipt({ hash });
      if (!rec.success) throw new Error("UserOperation gagal");

      const stored: StoredSession = {
        permissionId,
        sessionKey: sessionKey.address,
        validUntil,
        maxUses: form.maxUses,
        createdAt: now,
        label: form.label,
      };
      const next = [stored, ...sessions];
      setSessions(next);
      saveSessions(account.address, next);
      // The private key is shown ONCE as a download for the agent; it is never stored by this app.
      download(`agent-${form.label}-${sessionKey.address.slice(2, 8)}.json`, {
        warning: "SECRET — give only to your agent. Limited by on-chain session policies.",
        chainId: config.chain.id,
        accountAddress: account.address,
        sessionPrivateKey: key,
        permissionId,
        validUntil,
        addresses: { paymaster: a.paymaster, agentPayments: a.agentPayments, smartSessions: a.smartSessions, meta: a.meta },
        bundlerUrl: config.bundlerUrl,
      });
      setStatus({ tone: "good", msg: "Session key dibuat — kredensial agen diunduh.", hash: rec.receipt.transactionHash });
    } catch (e) {
      setStatus({ tone: "bad", msg: `Gagal: ${errMsg(e)}` });
    } finally {
      setBusy(false);
    }
  }

  async function revoke(s: StoredSession) {
    if (!account || !a) return;
    setBusy(true);
    setStatus({ tone: "neutral", msg: "Mencabut session…" });
    try {
      const c = createMetaAccountClient({ account, chain: config.chain, client, bundlerUrl: config.bundlerUrl, addresses: a });
      const hash = await c.sendUserOperation({ calls: getRevokeAgentSessionCalls({ permissionId: s.permissionId }) });
      const rec = await c.waitForUserOperationReceipt({ hash });
      if (!rec.success) throw new Error("UserOperation gagal");
      setStatus({ tone: "good", msg: "Session dicabut.", hash: rec.receipt.transactionHash });
      await statuses.refetch();
    } catch (e) {
      setStatus({ tone: "bad", msg: `Gagal: ${errMsg(e)}` });
    } finally {
      setBusy(false);
    }
  }

  const ready = !!readiness.data?.ready;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold text-white">Agen AI</h1>
        <p className="mt-1 text-sm text-slate-400">
          Beri agen AI session key yang hanya boleh memanggil <code>AgentPayments.pay</code>, dengan masa berlaku, batas jumlah
          pemakaian, batas belanja per periode (META & USD), rate limit, dan plafon allowance. Gas dibayar META.
        </p>
      </div>
      {!account && <Notice>Hubungkan wallet dan aktifkan smart account di halaman Akun terlebih dahulu.</Notice>}
      {account && !ready && <Notice tone="bad">Smart account belum aktif (deploy + approve) — buka halaman Akun.</Notice>}

      {account && a && (
        <div className="grid gap-6 md:grid-cols-2">
          <Card title="Buat session key">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Label" value={form.label} onChange={set("label")} />
              <Field label="Berlaku (hari)" value={form.validDays} onChange={set("validDays")} />
              <Field label="Maks. META / periode" value={form.perPeriodMeta} onChange={set("perPeriodMeta")} />
              <Field label="Maks. USD / periode" value={form.perPeriodUsd} onChange={set("perPeriodUsd")} hint="Dinilai oracle; 0 = tanpa batas USD" />
              <Field label="Periode (jam)" value={form.periodHours} onChange={set("periodHours")} />
              <Field label="Maks. transaksi / periode" value={form.maxTx} onChange={set("maxTx")} hint="Rate limit" />
              <Field label="Maks. pemakaian total" value={form.maxUses} onChange={set("maxUses")} />
              <Field label="Plafon allowance (META)" value={form.allowance} onChange={set("allowance")} />
            </div>
            <div className="mt-4">
              <Button disabled={busy || !ready} onClick={createSession}>
                Buat & unduh kredensial agen
              </Button>
            </div>
            <p className="mt-2 text-xs text-slate-500">
              Kunci privat session dibuat di browser dan hanya diberikan sebagai file unduhan; aplikasi tidak menyimpannya.
            </p>
          </Card>

          <Card title="Sisa batas periode ini (META)">
            {limits.data ? (
              <>
                <Row label="Sisa jumlah">{limits.data[0] > 10n ** 40n ? "tanpa batas" : meta(limits.data[0])}</Row>
                <Row label="Sisa USD">{limits.data[1] > 10n ** 40n ? "tanpa batas" : usd(limits.data[1], 2)}</Row>
                <Row label="Sisa transaksi">{limits.data[2] > 10n ** 40n ? "tanpa batas" : limits.data[2].toString()}</Row>
                <Row label="Periode berakhir">{ts(limits.data[3])}</Row>
              </>
            ) : (
              <p className="text-sm text-slate-400">Belum ada batas yang diatur.</p>
            )}
          </Card>
        </div>
      )}

      {account && sessions.length > 0 && (
        <Card title="Session key">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="text-left text-xs uppercase text-slate-400">
                <tr>
                  <th className="py-2">Label</th>
                  <th>Session key</th>
                  <th>Berlaku s/d</th>
                  <th>Status</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {sessions.map((s) => {
                  const enabled = statuses.data?.[s.permissionId];
                  const expired = s.validUntil * 1000 < Date.now();
                  return (
                    <tr key={s.permissionId} className="border-t border-ink-line">
                      <td className="py-2">{s.label}</td>
                      <td className="font-mono">{short(s.sessionKey)}</td>
                      <td>{ts(s.validUntil)}</td>
                      <td>
                        {enabled === undefined ? (
                          <Badge tone="neutral">…</Badge>
                        ) : !enabled ? (
                          <Badge tone="bad">Dicabut</Badge>
                        ) : expired ? (
                          <Badge tone="warn">Kedaluwarsa</Badge>
                        ) : (
                          <Badge tone="good">Aktif</Badge>
                        )}
                      </td>
                      <td className="text-right">
                        {enabled && (
                          <Button variant="danger" disabled={busy} onClick={() => revoke(s)}>
                            Cabut
                          </Button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {account && a && (
        <Card title="Riwayat pembayaran & receipt">
          {history.data && history.data.length > 0 ? (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="text-left text-xs uppercase text-slate-400">
                  <tr>
                    <th className="py-2">#</th>
                    <th>Penerima</th>
                    <th>Jumlah</th>
                    <th>USD</th>
                    <th>Memo</th>
                    <th>memoHash</th>
                    <th>Tx</th>
                  </tr>
                </thead>
                <tbody>
                  {history.data.map((l) => (
                    <tr key={`${l.transactionHash}-${l.logIndex}`} className="border-t border-ink-line">
                      <td className="py-2 font-mono">{l.args.id?.toString()}</td>
                      <td className="font-mono">{short(l.args.payee)}</td>
                      <td className="font-mono">{meta(l.args.amount)}</td>
                      <td className="font-mono">{l.args.usdValue ? usd(l.args.usdValue, 2) : "—"}</td>
                      <td>{l.args.memo}</td>
                      <td className="font-mono text-xs">{l.args.memoHash?.slice(0, 12)}…</td>
                      <td>
                        <TxLink hash={l.transactionHash ?? undefined} explorer={config.explorer} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <p className="text-sm text-slate-400">Belum ada pembayaran agen dari akun ini.</p>
          )}
        </Card>
      )}

      {status && (
        <Notice tone={status.tone}>
          {status.msg} {status.hash && <TxLink hash={status.hash} explorer={config.explorer} />}
        </Notice>
      )}
    </div>
  );
}
