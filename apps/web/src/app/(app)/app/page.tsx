"use client";
import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { encodeFunctionData, erc20Abi, isAddress, parseEther, parseUnits, type Hex } from "viem";
import {
  approveMetaCall,
  createBootstrapClient,
  createMetaAccountClient,
  estimateMetaFee,
  getPaymasterState,
  mockMetaAbi,
  parseMetaGasPaid,
  PRICE_MODE_LABEL,
  type MetaFeeEstimate,
  type MetaGasPaid,
} from "@metachain/sdk";
import { config } from "@/lib/config";
import { useMetaAccount } from "@/lib/useMetaAccount";
import { errMsg, eth, meta, short, ts, usd } from "@/lib/format";
import { Badge, Button, Card, Field, Notice, Row, TxLink } from "@/components/ui";
import { AppIntro } from "@/components/AppIntro";

type Status = { tone: "good" | "warn" | "bad" | "neutral"; msg: string; hash?: string } | null;

export default function AccountPage() {
  const { client, eoa, walletClient, account, accountError, readiness } = useMetaAccount();
  const a = config.addresses;
  const [status, setStatus] = useState<Status>(null);
  const [busy, setBusy] = useState(false);
  const [deposit, setDeposit] = useState("1");
  const [recipient, setRecipient] = useState("");
  const [amount, setAmount] = useState("0.001");
  const [estimate, setEstimate] = useState<MetaFeeEstimate | null>(null);
  const [paid, setPaid] = useState<MetaGasPaid | null>(null);

  const eoaBalances = useQuery({
    queryKey: ["eoa-balances", eoa],
    enabled: !!eoa && !!a,
    refetchInterval: 5_000,
    queryFn: async () => ({
      eth: await client.getBalance({ address: eoa! }),
      meta: await client.readContract({ address: a!.meta, abi: erc20Abi, functionName: "balanceOf", args: [eoa!] }),
    }),
  });
  const accountEth = useQuery({
    queryKey: ["acct-eth", account?.address],
    enabled: !!account,
    refetchInterval: 5_000,
    queryFn: () => client.getBalance({ address: account!.address }),
  });
  const pm = useQuery({
    queryKey: ["pm-state"],
    enabled: !!a,
    refetchInterval: 15_000,
    queryFn: () => getPaymasterState(client, a!.paymaster),
  });

  async function run(label: string, fn: () => Promise<string | undefined>) {
    setBusy(true);
    setStatus({ tone: "neutral", msg: `${label}…` });
    try {
      const hash = await fn();
      setStatus({ tone: "good", msg: `${label} berhasil`, hash });
      await readiness.refetch();
    } catch (e) {
      setStatus({ tone: "bad", msg: `${label} gagal: ${errMsg(e)}` });
    } finally {
      setBusy(false);
    }
  }

  const sampleCalls = () => {
    if (!isAddress(recipient)) throw new Error("Alamat penerima tidak valid");
    return [
      {
        to: a!.meta,
        value: 0n,
        data: encodeFunctionData({
          abi: erc20Abi,
          functionName: "transfer",
          args: [recipient, parseUnits(amount || "0", 18)],
        }) as Hex,
      },
    ];
  };

  const metaClient = () =>
    createMetaAccountClient({ account: account!, chain: config.chain, client, bundlerUrl: config.bundlerUrl, addresses: a! });

  const r = readiness.data;
  const priceOk = pm.data && pm.data.validUntil * 1000 > Date.now() && !pm.data.paused;

  return (
    <div className="space-y-6">
      <div>
        <h1 className="font-display text-4xl font-semibold uppercase leading-none text-white sm:text-5xl">Bayar gas dengan META</h1>
        <p className="mt-1 text-sm text-bone-mute">
          Smart account (Kernel v3.1, ERC-4337) yang membayar biaya transaksi Robinhood Chain dalam META Stock Token. Biaya
          dipatok dalam USD; jumlah META menyesuaikan harga oracle.
        </p>
      </div>

      {!eoa && <AppIntro />}
      {accountError && <Notice tone="bad">Gagal menurunkan smart account: {errMsg(accountError)}</Notice>}

      {eoa && a && (
        <div className="grid gap-6 md:grid-cols-2">
          <Card title="1 · Smart account" right={r?.ready ? <Badge tone="good">Siap</Badge> : <Badge tone="warn">Belum siap</Badge>}>
            <Row label="Pemilik (EOA)">{short(eoa)}</Row>
            <Row label="Smart account">{account ? account.address : "menghitung…"}</Row>
            <Row label="Ter-deploy">{r ? (r.deployed ? "ya" : "belum") : "—"}</Row>
            <Row label="Saldo META">{meta(r?.balance)}</Row>
            <Row label="Allowance ke paymaster">{r ? (r.allowance > 0n ? "ada" : "belum") : "—"}</Row>
            <Row label="Saldo ETH akun">{eth(accountEth.data)}</Row>
          </Card>

          <Card title="2 · Aktivasi">
            <div className="space-y-3 text-sm">
              <Row label="ETH di wallet">{eth(eoaBalances.data?.eth)}</Row>
              <Row label="META di wallet">{meta(eoaBalances.data?.meta)}</Row>
              {config.isMock && (
                <Button
                  variant="secondary"
                  disabled={busy}
                  onClick={() =>
                    run("Faucet META testnet", async () => {
                      // simulate first so custom errors (e.g. FaucetCooldown) are decoded instead of a generic wallet error
                      const { request } = await client.simulateContract({ address: a.meta, abi: mockMetaAbi, functionName: "faucet", account: eoa });
                      return walletClient!.writeContract({ ...request, chain: config.chain });
                    })
                  }
                >
                  Faucet MockMETA (testnet)
                </Button>
              )}
              <div className="flex items-end gap-2">
                <div className="flex-1">
                  <Field label="Setor META ke smart account" value={deposit} onChange={setDeposit} />
                </div>
                <Button
                  disabled={busy || !account}
                  onClick={() =>
                    run("Setor META", async () => {
                      const { request } = await client.simulateContract({
                        address: a.meta,
                        abi: erc20Abi,
                        functionName: "transfer",
                        args: [account!.address, parseUnits(deposit || "0", 18)],
                        account: eoa,
                      });
                      return walletClient!.writeContract({ ...request, chain: config.chain });
                    })
                  }
                >
                  Setor
                </Button>
              </div>
              {!r?.deployed || (r && r.allowance === 0n) ? (
                <>
                  <p className="text-xs text-bone-mute">
                    Operasi pertama (deploy akun + izin META ke paymaster) dibayar sekali dengan ETH, karena paymaster menarik
                    META sebelum izin di operasi yang sama dieksekusi. Biaya nyatanya hanya beberapa sen; 0.003 ETH dibutuhkan
                    agar simulasi bundler lolos, dan sisanya tetap menjadi milik smart account Anda.
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      variant="secondary"
                      disabled={busy || !account}
                      onClick={() =>
                        run("Kirim 0.003 ETH untuk aktivasi", async () =>
                          walletClient!.sendTransaction({
                            to: account!.address,
                            value: parseEther("0.003"),
                            chain: config.chain,
                            account: eoa,
                          }),
                        )
                      }
                    >
                      Kirim 0.003 ETH
                    </Button>
                    <Button
                      disabled={busy || !account}
                      onClick={() =>
                        run("Aktivasi (deploy + approve)", async () => {
                          const boot = createBootstrapClient({ account: account!, chain: config.chain, client, bundlerUrl: config.bundlerUrl });
                          const hash = await boot.sendUserOperation({ calls: [approveMetaCall(a)] });
                          const rec = await boot.waitForUserOperationReceipt({ hash });
                          if (!rec.success) throw new Error("UserOperation gagal");
                          return rec.receipt.transactionHash;
                        })
                      }
                    >
                      Aktifkan
                    </Button>
                  </div>
                </>
              ) : (
                <Notice tone="good">Akun aktif — semua transaksi berikutnya membayar gas dengan META.</Notice>
              )}
            </div>
          </Card>
        </div>
      )}

      {eoa && a && (
        <Card
          title="3 · Transaksi contoh (gas dibayar META)"
          right={
            pm.data ? (
              <Badge tone={priceOk ? (pm.data.mode === 0 ? "good" : "warn") : "bad"}>
                {priceOk ? PRICE_MODE_LABEL[pm.data.mode] : "Harga paymaster kedaluwarsa"}
              </Badge>
            ) : null
          }
        >
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-3">
              <Field label="Kirim META ke" value={recipient} onChange={setRecipient} hint="Alamat penerima (0x…)" />
              <Field label="Jumlah META" value={amount} onChange={setAmount} />
              <div className="flex gap-2">
                <Button
                  variant="secondary"
                  disabled={busy || !r?.ready}
                  onClick={() =>
                    run("Estimasi biaya", async () => {
                      const op = await metaClient().prepareUserOperation({ calls: sampleCalls() });
                      setEstimate(
                        await estimateMetaFee({
                          client,
                          paymaster: a.paymaster,
                          gas: {
                            callGasLimit: op.callGasLimit,
                            verificationGasLimit: op.verificationGasLimit,
                            preVerificationGas: op.preVerificationGas,
                            paymasterVerificationGasLimit: op.paymasterVerificationGasLimit ?? 0n,
                            paymasterPostOpGasLimit: op.paymasterPostOpGasLimit ?? 0n,
                            maxFeePerGas: op.maxFeePerGas,
                          },
                        }),
                      );
                      return undefined;
                    })
                  }
                >
                  Estimasi biaya
                </Button>
                <Button
                  disabled={busy || !r?.ready}
                  onClick={() =>
                    run("Kirim transaksi", async () => {
                      const c = metaClient();
                      const hash = await c.sendUserOperation({ calls: sampleCalls() });
                      const rec = await c.waitForUserOperationReceipt({ hash });
                      setPaid(parseMetaGasPaid(rec.logs, a.paymaster) ?? null);
                      if (!rec.success) throw new Error("Panggilan di dalam UserOperation revert (gas tetap dibayar META)");
                      return rec.receipt.transactionHash;
                    })
                  }
                >
                  Kirim
                </Button>
              </div>
            </div>
            <div>
              {estimate && (
                <div className="border border-ink-line bg-ink p-3">
                  <div className="hud mb-2">Estimasi sebelum kirim</div>
                  <Row label="Maks. (pre-charge)">
                    {meta(estimate.maxMeta, 8)} ≈ {usd(estimate.maxUsd)}
                  </Row>
                  <Row label="Harga META/USD">{usd(estimate.metaUsd, 2)}</Row>
                  <Row label="Harga ETH/USD">{usd(estimate.ethUsd, 2)}</Row>
                  <Row label="Markup">{Number(estimate.markupBps) / 100}%</Row>
                  <Row label="Mode harga">{estimate.modeLabel}</Row>
                  <Row label="Harga berlaku s/d">{ts(estimate.priceValidUntil)}</Row>
                  <p className="mt-2 text-xs text-bone-mute">
                    Pre-charge ditarik di awal; selisih dikembalikan otomatis di postOp.
                  </p>
                </div>
              )}
              {paid && (
                <div className="mt-3 border border-good/40 bg-good/5 p-3">
                  <div className="hud mb-2 text-good">Biaya aktual</div>
                  <Row label="META ditagih">{meta(paid.metaCharged, 8)}</Row>
                  <Row label="Setara USD">{usd(paid.usdCharged)}</Row>
                  <Row label="Biaya gas (ETH)">{eth(paid.gasCostWei, 9)}</Row>
                </div>
              )}
            </div>
          </div>
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
