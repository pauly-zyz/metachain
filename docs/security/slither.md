# Slither: laporan & triase

- **Tool:** Slither 0.11.6, solc 0.8.28
- **Cakupan:** `src/MetaTokenPaymaster.sol`, `src/oracle/MetaPriceOracle.sol`, `src/AgentPayments.sol`
  (tidak termasuk `lib/`, `test/`, `script/`, dan `src/mocks/` yang khusus testnet)
- **Perintah:** `cd contracts && slither . --filter-paths "lib/|test/|script/|src/mocks/" --exclude-dependencies`
- **Hasil:** 37 temuan. **Tidak ada yang bisa dieksploitasi** setelah triase; semuanya tercatat di bawah.

| Dampak | Detektor | Jml | Status | Penjelasan |
|---|---|---|---|---|
| High | arbitrary-send-erc20 | 1 | **False positive (by design)** | `token.safeTransferFrom(ctx.sender, …)` di `_validatePaymasterUserOp`. Fungsi hanya bisa dipanggil oleh EntryPoint (`_requireFromEntryPoint`). EntryPoint memanggilnya **setelah** akun `sender` memvalidasi tanda tangannya sendiri, dan transfer butuh allowance yang diberikan akun itu sendiri. Ini pola standar token paymaster (TokenPaymaster eth-infinitism). Jumlahnya dibatasi `maxUsdPerOp`, opsional `maxMetaCost` yang ditandatangani user, dan batas per-periode. |
| Medium | incorrect-equality | 5 | False positive | Perbandingan enum (`mode == Closed`), cek nol (`metaUsd == 0`, `periodStart == 0`), dan `ret.length == 0`. Tidak ada nilai saldo/timestamp yang bisa dimanipulasi agar persis sama. |
| Medium | uninitialized-local | 2 | False positive | `ticks` di-assign di cabang `try`; cabang `catch` langsung return. `ctx` (struct) sengaja diinisialisasi nol lalu diisi per field. |
| Medium | unused-return | 3 | Disengaja | `latestRoundData()` / `observe()`: hanya field yang dibutuhkan yang dibaca, sesuai praktik Chainlink. Ronde tidak lengkap ditangani lewat `updatedAt == 0`, jawaban ≤ 0, dan staleness. |
| Low | reentrancy-benign / reentrancy-events | 2 | Diterima, terdokumentasi | Di `_postOp`, `owedRefunds`/`totalOwed` dan event ditulis setelah transfer refund (harus begitu, karena bergantung pada hasil transfer). Akuntansi user dan statistik sudah dipindah ke **sebelum** call. Reentrancy tidak mungkin: postOp hanya bisa dipanggil EntryPoint (`nonReentrant`), dan token-nya META yang tepercaya. |
| Low | timestamp | 15 | Disengaja | Logika staleness/periode memang butuh `block.timestamp`. Fungsi validasi ERC-4337 **tidak** memakai TIMESTAMP (ERC-7562); waktu ditegakkan lewat `validUntil`/`validAfter`. |
| Info | naming-convention | 8 | Diterima | Immutable ditulis UPPER_CASE, mengikuti gaya OpenZeppelin. |
| Info | low-level-calls | 1 | Disengaja | `_tryTransfer` memakai `call` agar refund yang gagal (token di-pause / alamat diblokir) tidak me-revert postOp. Kalau postOp revert di v0.7, user kehilangan seluruh pre-charge. |

Perbaikan yang diterapkan setelah run pertama:
- Event alamat diberi `indexed` (`OracleUpdated`, `TwapPoolUpdated`, `SequencerFeedUpdated`).
- Konstanta tak terpakai (`WAD`) dihapus.
- State user dan statistik di postOp ditulis sebelum external call.
- `SafeCast` untuk semua downcast akumulator.

## Pertimbangan keamanan lain (di luar cakupan Slither)

1. **ERC-7562 / reputasi bundler:** validasi membaca storage paymaster sendiri dan memanggil `META.transferFrom`
   (storage token yang tidak terasosiasi dengan sender). Konsekuensinya paymaster **wajib di-stake**: skrip deploy
   memanggil `addStake`. Validasi tidak memakai opcode terlarang (TIMESTAMP/NUMBER/BASEFEE dll.).
2. **Penalti gas tak terpakai v0.7 (10%)** tidak masuk ke `actualGasCost` yang diterima postOp. Biaya menambahkan
   batas atasnya, jadi paymaster tidak pernah rugi; ini diverifikasi tes `test_ChargeCoversRealGasCost` dan fuzz
   `testFuzz_ChargeConservationAndCoverage`.
3. **postOp tidak boleh revert:** refund gagal dicatat sebagai `owedRefunds`. Dengan `postOpGasLimit` < ~60k,
   postOp bisa kehabisan gas. SDK memakai default 120k dan `postOpOverheadGas` 65k (terukur ~58k di storage dingin).
4. **Harga basi di cache:** `validUntil` dibatasi oleh umur Chainlink META dan ETH, sehingga EntryPoint menolak op
   dengan harga kedaluwarsa. Keeper sebaiknya memanggil `updatePrice()` tiap ≤ 10 menit (lihat runbook).
5. **Banyak op dari sender yang sama dalam satu bundle** divalidasi terhadap state periode yang sama, sehingga batas
   per-user bisa terlampaui sebanyak jumlah op dalam satu bundle. Ini dibatasi aturan mempool bundler (maks ~4 op per
   sender tanpa stake).
6. **Risiko token penerbit** (upgrade beacon, pause, blocklist): lihat `docs/feasibility.md` §2.3 dan runbook.
