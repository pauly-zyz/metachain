# Checklist pra-mainnet

> **Jangan deploy ke mainnet tanpa persetujuan eksplisit pemilik proyek.** Skrip `DeployMainnet` sengaja menolak jalan
> tanpa `CONFIRM_MAINNET_DEPLOY=I_UNDERSTAND_THIS_IS_MAINNET` dan `OWNER` (multisig).

## A. Keamanan kontrak
- [ ] **Audit eksternal** oleh firma independen untuk `MetaTokenPaymaster`, `MetaPriceOracle`, dan `AgentPayments`.
      Fokus audit:
  - [ ] pre-charge/refund dan penalti gas v0.7
  - [ ] kepatuhan ERC-7562 (tidak ada opcode terlarang saat validasi)
  - [ ] logika `validUntil`/`validAfter`
  - [ ] TWAP & circuit breaker
  - [ ] batas per periode
- [ ] Semua temuan audit ditutup atau diterima secara tertulis.
- [ ] Slither bersih dari temuan baru (lihat `docs/security/slither.md`); pertimbangkan juga Aderyn/Mythril.
- [ ] Fuzz run panjang: `FOUNDRY_PROFILE=ci forge test` (5.000 run) plus invariant test untuk konservasi saldo.
- [ ] Fork test terhadap mainnet di blok terbaru lulus (`ROBINHOOD_RPC_URL=… forge test --match-path "test/fork/*"`).
- [ ] Bug bounty (mis. Immunefi) aktif sebelum TVL signifikan.
- [ ] Verifikasi manual source token META (implementasi `0xb354…5ae2`) di Blockscout: logika `isBlocked` dan hook transfer.

## B. Kepatuhan & hukum
- [ ] **Tinjauan hukum** di yurisdiksi operator: produk ini memproses sekuritas ter-tokenisasi (RHJ). Evaluasi status
      "penerimaan sekuritas sebagai pembayaran", AML, serta perizinan VASP/money transmitter.
- [ ] Geo-blocking & attestasi: META Stock Token **tidak boleh** ditawarkan ke U.S. Persons. Terapkan blokir IP/attestasi di
      UI, dan pertimbangkan hal yang sama untuk Kanada, Inggris, Swiss, dll. (daftar di docs.robinhood.com/rhj).
- [ ] Disclaimer non-afiliasi (Meta Platforms & Robinhood) ada di UI, README, dan SDK. ✅ sudah ada.
- [ ] Syarat & ketentuan serta kebijakan privasi.
- [ ] Penggunaan nama/merek "META": tinjau risiko merek dagang (Meta Platforms) dan pedoman merek Robinhood.
- [ ] Perlakuan pajak & akuntansi atas META yang terkumpul sebagai pendapatan.

## C. Operasional
- [ ] Owner semua kontrak = **multisig** (≥ 2/3) dengan hardware wallet; uji `acceptOwnership`.
- [ ] Deposit & stake EntryPoint terisi; ada alert saldo rendah.
- [ ] Keeper `updatePrice()` berjalan di ≥ 2 infrastruktur independen, dengan alert bila gagal.
- [ ] Monitoring (lihat `docs/runbook.md` §1): deviasi oracle, mode fallback, `RefundDeferred`, pause token, upgrade
      beacon, dan anomali per akun.
- [ ] Runbook darurat diuji di testnet: latihan `pause()`/`unpause()`, migrasi paymaster, `claimRefund`.
- [ ] Bundler produksi: Pimlico dan Alchemy (fallback); API key hanya di server (`/api/bundler`).
- [ ] Rencana konversi META terkumpul → ETH (RFQ/OTC) agar deposit tetap terisi tanpa bergantung pada AMM yang tipis.
- [ ] Parameter awal konservatif:
  - [ ] `maxUsdPerOpOpen` $5 / `maxUsdPerOpRestricted` $1
  - [ ] batas user $50/hari
  - [ ] markup 5% (+5% saat pasar tutup, +10% saat fallback)

## D. Parameter oracle (tinjau ulang)
- [ ] `maxStalenessOpen` 1 jam / `maxStalenessClosed` 80 jam: cukup untuk libur 3 hari? (Thanksgiving + weekend = ±4 hari →
      pertimbangkan 104 jam dengan markup lebih tinggi.)
- [ ] `maxDeviationOpenBps` 3% / `maxDeviationClosedBps` 8%.
- [ ] Kedalaman pool V3 META/USDG masih memadai (~$6k per 2% saat riset). Bila turun, pertimbangkan
      `twapFallbackEnabled=false`.
- [ ] Sequencer uptime feed: aktifkan bila Chainlink memublikasikannya untuk Robinhood Chain.

## E. Produk
- [ ] UX bootstrap: operasi pertama butuh ETH (atau sponsor pihak ketiga). Pertimbangkan sponsorship untuk aktivasi.
- [ ] Dukungan EIP-7702 (banyak pemegang META memakai akun 7702) dengan EntryPoint v0.8.
- [ ] Testnet publik: deploy, verifikasi di explorer, dan isi `DEPLOYMENTS` di SDK.
