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
      setStatus({ tone: "good", msg: `${label} succeeded`, hash });
      await readiness.refetch();
    } catch (e) {
      setStatus({ tone: "bad", msg: `${label} failed: ${errMsg(e)}` });
    } finally {
      setBusy(false);
    }
  }

  const sampleCalls = () => {
    if (!isAddress(recipient)) throw new Error("Invalid recipient address");
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
        <h1 className="font-display text-4xl font-semibold uppercase leading-none text-white sm:text-5xl">Pay gas with META</h1>
        <p className="mt-1 text-sm text-bone-mute">
          A Kernel v3.1 (ERC-4337) smart account that pays Robinhood Chain transaction fees in META Stock Token. Fees are
          pegged in USD; the META amount follows the oracle price.
        </p>
      </div>

      {!eoa && <AppIntro />}
      {accountError && <Notice tone="bad">Failed to derive smart account: {errMsg(accountError)}</Notice>}

      {eoa && a && (
        <div className="grid gap-6 md:grid-cols-2">
          <Card title="1 · Smart account" right={r?.ready ? <Badge tone="good">Ready</Badge> : <Badge tone="warn">Not ready</Badge>}>
            <Row label="Owner (EOA)">{short(eoa)}</Row>
            <Row label="Smart account">{account ? account.address : "computing…"}</Row>
            <Row label="Deployed">{r ? (r.deployed ? "yes" : "not yet") : "—"}</Row>
            <Row label="META balance">{meta(r?.balance)}</Row>
            <Row label="Paymaster allowance">{r ? (r.allowance > 0n ? "granted" : "not yet") : "—"}</Row>
            <Row label="Account ETH balance">{eth(accountEth.data)}</Row>
          </Card>

          <Card title="2 · Activation">
            <div className="space-y-3 text-sm">
              <Row label="ETH in wallet">{eth(eoaBalances.data?.eth)}</Row>
              <Row label="META in wallet">{meta(eoaBalances.data?.meta)}</Row>
              {config.isMock && (
                <Button
                  variant="secondary"
                  disabled={busy}
                  onClick={() =>
                    run("Testnet META faucet", async () => {
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
                  <Field label="Deposit META to smart account" value={deposit} onChange={setDeposit} />
                </div>
                <Button
                  disabled={busy || !account}
                  onClick={() =>
                    run("Deposit META", async () => {
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
                  Deposit
                </Button>
              </div>
              {!r?.deployed || (r && r.allowance === 0n) ? (
                <>
                  <p className="text-xs text-bone-mute">
                    The first operation (deploy account + allow the paymaster to pull META) is paid once in ETH, because the
                    paymaster pulls META before an approval in the same operation executes. It really costs a few cents; 0.003
                    ETH is needed for the bundler simulation to pass, and the rest stays in your smart account.
                  </p>
                  <div className="flex flex-wrap gap-2">
                    <Button
                      variant="secondary"
                      disabled={busy || !account}
                      onClick={() =>
                        run("Send 0.003 ETH for activation", async () =>
                          walletClient!.sendTransaction({
                            to: account!.address,
                            value: parseEther("0.003"),
                            chain: config.chain,
                            account: eoa,
                          }),
                        )
                      }
                    >
                      Send 0.003 ETH
                    </Button>
                    <Button
                      disabled={busy || !account}
                      onClick={() =>
                        run("Activation (deploy + approve)", async () => {
                          const boot = createBootstrapClient({ account: account!, chain: config.chain, client, bundlerUrl: config.bundlerUrl });
                          const hash = await boot.sendUserOperation({ calls: [approveMetaCall(a)] });
                          const rec = await boot.waitForUserOperationReceipt({ hash });
                          if (!rec.success) throw new Error("UserOperation failed");
                          return rec.receipt.transactionHash;
                        })
                      }
                    >
                      Activate
                    </Button>
                  </div>
                </>
              ) : (
                <Notice tone="good">Account active — every following transaction pays gas in META.</Notice>
              )}
            </div>
          </Card>
        </div>
      )}

      {eoa && a && (
        <Card
          title="3 · Sample transaction (gas paid in META)"
          right={
            pm.data ? (
              <Badge tone={priceOk ? (pm.data.mode === 0 ? "good" : "warn") : "bad"}>
                {priceOk ? PRICE_MODE_LABEL[pm.data.mode] : "Paymaster price expired"}
              </Badge>
            ) : null
          }
        >
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-3">
              <Field label="Send META to" value={recipient} onChange={setRecipient} hint="Recipient address (0x…)" />
              <Field label="META amount" value={amount} onChange={setAmount} />
              <div className="flex gap-2">
                <Button
                  variant="secondary"
                  disabled={busy || !r?.ready}
                  onClick={() =>
                    run("Fee estimate", async () => {
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
                  Estimate fee
                </Button>
                <Button
                  disabled={busy || !r?.ready}
                  onClick={() =>
                    run("Send transaction", async () => {
                      const c = metaClient();
                      const hash = await c.sendUserOperation({ calls: sampleCalls() });
                      const rec = await c.waitForUserOperationReceipt({ hash });
                      setPaid(parseMetaGasPaid(rec.logs, a.paymaster) ?? null);
                      if (!rec.success) throw new Error("The call inside the UserOperation reverted (gas was still paid in META)");
                      return rec.receipt.transactionHash;
                    })
                  }
                >
                  Send
                </Button>
              </div>
            </div>
            <div>
              {estimate && (
                <div className="border border-ink-line bg-ink p-3">
                  <div className="hud mb-2">Estimate before sending</div>
                  <Row label="Max (pre-charge)">
                    {meta(estimate.maxMeta, 8)} ≈ {usd(estimate.maxUsd)}
                  </Row>
                  <Row label="META/USD price">{usd(estimate.metaUsd, 2)}</Row>
                  <Row label="ETH/USD price">{usd(estimate.ethUsd, 2)}</Row>
                  <Row label="Markup">{Number(estimate.markupBps) / 100}%</Row>
                  <Row label="Price mode">{estimate.modeLabel}</Row>
                  <Row label="Price valid until">{ts(estimate.priceValidUntil)}</Row>
                  <p className="mt-2 text-xs text-bone-mute">
                    The pre-charge is pulled up front; the difference is refunded automatically in postOp.
                  </p>
                </div>
              )}
              {paid && (
                <div className="mt-3 border border-good/40 bg-good/5 p-3">
                  <div className="hud mb-2 text-good">Actual cost</div>
                  <Row label="META charged">{meta(paid.metaCharged, 8)}</Row>
                  <Row label="USD equivalent">{usd(paid.usdCharged)}</Row>
                  <Row label="Gas cost (ETH)">{eth(paid.gasCostWei, 9)}</Row>
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
