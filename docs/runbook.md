# Runbook operasional & darurat

Runbook ini berlaku untuk `MetaTokenPaymaster`, `MetaPriceOracle`, dan `AgentPayments`. Owner semua kontrak sebaiknya
**multisig** (Safe) di mainnet. Kepemilikan paymaster dipindah dua langkah (`transferOwnership` → `acceptOwnership`), dan
`renounceOwnership` dinonaktifkan.

## 0. Tindakan cepat (copy-paste)

```bash
export RPC=https://rpc.testnet.chain.robinhood.com
export PM=<paymaster>
export ORACLE=<oracle>
```

Hentikan semua pembayaran gas dengan META (UserOperation baru langsung ditolak di validasi):

```bash
cast send $PM "pause()" --rpc-url $RPC --private-key $OWNER_KEY
```

Lanjutkan kembali:

```bash
cast send $PM "unpause()" --rpc-url $RPC --private-key $OWNER_KEY
```

Cek status harga dan paymaster:

```bash
cast call $PM "priceCache()(uint128,uint128,uint48,uint48,uint8)" --rpc-url $RPC
```

```bash
cast call $PM "paused()(bool)" --rpc-url $RPC
```

```bash
cast call $PM "getDeposit()(uint256)" --rpc-url $RPC
```

Kalau dari owner yang berupa multisig, ajukan transaksi yang sama lewat antarmuka Safe.

## 1. Pemantauan (alert)

| Sinyal | Cara cek | Ambang alert | Tindakan |
|---|---|---|---|
| Cache harga hampir kedaluwarsa | `priceCache().validUntil - now` | < 10 menit | pastikan keeper hidup (§2) |
| `updatePrice()` revert | log keeper (`PriceDeviation`, `NoValidPrice`, `TwapUnavailable`, `StaleEthPrice`) | sekali terjadi | §3 |
| Deviasi Chainlink vs TWAP | dashboard / `twapMetaUsd()` vs feed | > 2% saat pasar buka | investigasi likuiditas pool / manipulasi |
| Mode `Fallback` aktif | `priceCache().mode == 2` | sekali terjadi | §3.2 |
| Deposit EntryPoint menipis | `getDeposit()` | < 2× biaya gas harian | top-up (§4) |
| `RefundDeferred` dipancarkan | event log | sekali terjadi | §5 |
| Token META di-pause / `oraclePaused` | `paused()` / `oraclePaused()` pada token | true | §6 |
| Upgrade beacon token | event `Upgraded` pada beacon `0xe10b…1b00` | sekali terjadi | §6 |
| Lonjakan penggunaan satu akun | event `MetaGasPaid` per sender | > batas wajar | turunkan `userLimit` |

## 2. Keeper harga

`updatePrice()` bersifat permissionless. Jalankan keeper ini minimal di dua tempat (redundansi):

```bash
RPC_URL=$RPC CHAIN_ID=46630 PAYMASTER=$PM KEEPER_PRIVATE_KEY=0x... npm run keeper -w @metachain/sdk
```

Keeper hanya mengirim transaksi bila cache tersisa < 10 menit atau berumur > 5 menit. Biayanya cuma gas L2.

## 3. Masalah oracle

### 3.1 `PriceDeviation`: circuit breaker aktif
Chainlink dan TWAP Uniswap V3 berselisih lebih dari 3% (pasar buka) atau 8% (pasar tutup). Ketika ini terjadi, cache
lama tetap berlaku sampai `validUntil`, lalu paymaster otomatis berhenti menerima op.
1. Cek apakah pool V3 sedang dimanipulasi atau likuiditasnya ditarik (lihat Swap/Burn terbaru di pool `0x107a…0922`).
2. Cek apakah ada berita/gap harga saham (pembukaan pasar setelah weekend).
3. Jangan langsung melonggarkan ambang deviasi. Bila ragu, biarkan saja: paymaster berhenti dengan aman.
4. Bila pool rusak permanen, ganti ke pool lain lewat `setTwapPool`, atau `setTwapPool(0)` untuk hanya memakai Chainlink
   saat pasar buka (mode tutup lalu ditolak).

### 3.2 Mode `Fallback` (TWAP saja)
Muncul saat Chainlink basi > 80 jam atau issuer menyalakan `oraclePaused` (aksi korporasi). Markup naik +10% dan batas per
op turun ke `maxUsdPerOpRestricted`. Kalau berlangsung > beberapa jam, pertimbangkan `pause()`, atau matikan fallback
dengan `setConfig(... twapFallbackEnabled: false)`.

### 3.3 `StaleEthPrice`
Feed ETH/USD basi > 25 jam. Ini kejadian langka. Cek status Chainlink di Robinhood Chain; paymaster berhenti sendiri.

### 3.4 Sequencer
Robinhood belum memublikasikan L2 Sequencer Uptime Feed. Kalau nanti tersedia, aktifkan dengan
`MetaPriceOracle.setSequencerUptimeFeed(<alamat>)`.

## 4. Deposit & stake EntryPoint

Top-up deposit (siapa pun boleh):

```bash
cast send $PM "deposit()" --value 0.05ether --rpc-url $RPC --private-key $KEY
```

Tarik deposit (owner):

```bash
cast send $PM "withdrawTo(address,uint256)" $TREASURY <wei> --rpc-url $RPC --private-key $OWNER_KEY
```

Stake wajib karena paymaster menyentuh storage token saat validasi (ERC-7562). Kalau ingin keluar: `unlockStake()`, tunggu
`unstakeDelay` (1 hari), lalu `withdrawStake(addr)`. Paymaster tanpa stake akan ditolak bundler.

## 5. Refund tertunda (`RefundDeferred`)

Refund gagal dikirim, biasanya karena token di-pause atau akun diblokir issuer. Dana dicatat di
`owedRefunds[account]`, dan pemiliknya bisa mengklaim lewat `claimRefund(to)` dari smart account. Owner **tidak bisa**
menarik dana ini: `withdrawTokens` dibatasi `balance - totalOwed`.

## 6. Risiko dari penerbit token (Robinhood Assets (Jersey) Ltd)

- **Token di-pause:** semua `transferFrom` gagal, sehingga op ditolak di validasi tanpa kerugian. Pertimbangkan `pause()`
  agar UI memberi pesan jelas.
- **Paymaster masuk blocklist:** paymaster tidak bisa menerima META. Lakukan `pause()`, tarik saldo, deploy paymaster
  baru, lalu umumkan alamatnya (SDK `DEPLOYMENTS`).
- **Upgrade implementasi (beacon):** jalankan ulang fork test (`forge test --match-path "test/fork/*"`) untuk memastikan
  perilaku `transfer/transferFrom/decimals` tidak berubah. Bila berubah, lakukan `pause()`.
- **Aksi korporasi (split/dividen):** harga feed tetap per-token (multiplier sudah termasuk), jadi tidak perlu tindakan.
  Selama `oraclePaused`, sistem berjalan di mode Fallback (§3.2).

## 7. Session key agen bocor

Pemilik akun mengirim `getRevokeAgentSessionCalls({ permissionId, token, agentPayments })` (tombol **Cabut** di halaman
Agen AI). Ini menghapus session dan meng-nol-kan allowance ke AgentPayments. Kerugian maksimum sebelum dicabut dibatasi
oleh allowance, batas per periode, rate limit, dan jumlah pemakaian.

## 8. Kunci owner bocor

Segera `pause()` dari owner yang sah (kalau masih bisa), `transferOwnership` ke multisig baru, lalu tarik deposit dan
saldo META ke treasury. Karena itu owner **wajib** multisig dengan threshold ≥ 2.
