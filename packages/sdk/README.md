# @metachain/sdk

SDK TypeScript untuk META Chain di Robinhood Chain. Dengan SDK ini Anda bisa:

- membuat smart account (Kernel v3.1, ERC-4337 v0.7) yang membayar gas dengan **META Stock Token**,
- mengestimasi biaya dalam USD dan META sebelum mengirim transaksi,
- membuat dan mencabut **session key berbatas** untuk agen AI (Rhinestone Smart Sessions + `AgentPayments`).

> Tidak berafiliasi dengan Meta Platforms, Inc. maupun Robinhood. META Stock Token tidak tersedia untuk U.S. Persons.

## Smart account & gas dalam META

```ts
import { createMetaSmartAccount, createMetaAccountClient, createBootstrapClient, approveMetaCall,
         getMetaReadiness, estimateMetaFee, parseMetaGasPaid } from "@metachain/sdk";

const account = await createMetaSmartAccount({ client, owner });          // owner: LocalAccount | WalletClient
const ready = await getMetaReadiness(client, addresses, account.address); // { deployed, balance, allowance, ready }

if (!ready.ready) {                                                        // sekali: deploy + approve, bayar ETH
  const boot = createBootstrapClient({ account, chain, client, bundlerUrl });
  await boot.sendUserOperation({ calls: [approveMetaCall(addresses)] });
}

const metaClient = createMetaAccountClient({ account, chain, client, bundlerUrl, addresses });
const op = await metaClient.prepareUserOperation({ calls });
const fee = await estimateMetaFee({ client, paymaster: addresses.paymaster, gas: {
  callGasLimit: op.callGasLimit, verificationGasLimit: op.verificationGasLimit,
  preVerificationGas: op.preVerificationGas, paymasterVerificationGasLimit: op.paymasterVerificationGasLimit!,
  paymasterPostOpGasLimit: op.paymasterPostOpGasLimit!, maxFeePerGas: op.maxFeePerGas } });
// fee.maxMeta, fee.maxUsd, fee.modeLabel, fee.metaUsd, fee.ethUsd

const hash = await metaClient.sendUserOperation({ calls });
const receipt = await metaClient.waitForUserOperationReceipt({ hash });
parseMetaGasPaid(receipt.logs, addresses.paymaster); // META aktual yang ditagih
```

`createMetaPaymaster` otomatis menetapkan plafon `maxMetaCost` (pre-charge + toleransi 2%), dan menolak sejak awal bila
harga di cache paymaster sudah kedaluwarsa.

## Session key untuk agen AI

Pemilik akun menjalankan langkah ini sekali:

```ts
import { buildAgentSession, getCreateAgentSessionCalls } from "@metachain/sdk";

const session = buildAgentSession({
  chainId, sessionKey: agentAddress, agentPayments: addresses.agentPayments,
  validUntil: now + 7 * 86400, maxUses: 100n,
});
const { calls, permissionId } = await getCreateAgentSessionCalls({
  client, account: account.address, addresses, session, token: addresses.meta,
  limits: { maxAmountPerPeriod: parseUnits("0.05", 18), maxUsdPerPeriod: parseUnits("25", 18), period: 3600, maxTxPerPeriod: 10 },
  allowance: parseUnits("0.5", 18),
});
await metaClient.sendUserOperation({ calls }); // gas dibayar META
```

Lapisan pembatas yang berlaku pada session key:

| Batas | Ditegakkan oleh | Kapan |
|---|---|---|
| Hanya boleh memanggil `AgentPayments.pay` | Smart Sessions (action) | validasi |
| Masa berlaku | TimeFramePolicy | validasi (via `validUntil`) |
| Jumlah pemakaian total | UsageLimitPolicy | validasi |
| Maks. META / USD / transaksi per periode | `AgentPayments` | eksekusi |
| Plafon total yang bisa ditarik | allowance ERC-20 | eksekusi |
| Biaya gas per akun per periode | `MetaTokenPaymaster.userLimit` | validasi/postOp |

Agen hanya memegang kunci session, tidak pernah memegang kunci pemilik:

```ts
import { createAgentClient } from "@metachain/sdk";
const agent = await createAgentClient({ client, chain, bundlerUrl, accountAddress, sessionKey, permissionId, addresses });
const res = await agent.pay({ token: addresses.meta, payee, amount: parseUnits("0.004", 18), memo: "job #1", memoHash });
// res.paymentId → AgentPayments.getReceipt(id); res.gas.metaCharged
```

Untuk mencabut session: `getRevokeAgentSessionCalls({ permissionId, token, agentPayments })`.

Catatan kompatibilitas Kernel v3.1 (sudah ditangani SDK):

- nonce validator non-root memakai tipe `0x01` (`kernelValidatorNonceKey`),
- `installModule` harus menyertakan selector `execute` (`encodeKernelValidatorInstall`),
- OwnableValidator mengharapkan tanda tangan atas hash mentah, atau `eth_sign` dengan `v + 4` (`signForOwnableValidator`).

## Keeper

```ts
import { refreshPriceIfNeeded } from "@metachain/sdk";
await refreshPriceIfNeeded({ publicClient, walletClient, paymaster });
```

Atau jalankan dari CLI:

```bash
npm run keeper -w @metachain/sdk
```

## Pengembangan

```bash
npm run build -w @metachain/sdk
```

```bash
npm test -w @metachain/sdk
```

```bash
scripts/e2e-local.sh test
```
