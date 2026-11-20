# META Chain — Fase 0: Riset Kelayakan

> **Disclaimer:** META Chain adalah proyek independen dan **tidak berafiliasi** dengan Meta Platforms, Inc.
> maupun Robinhood Markets, Inc. / Robinhood Assets (Jersey) Limited. META Stock Token tidak tersedia untuk
> warga/penduduk AS (U.S. Persons) dan dibatasi di beberapa yurisdiksi lain (antara lain Kanada, Inggris, Swiss).

- **Tanggal riset:** Jumat, 20 November 2026 (~11:35 UTC), blok mainnet ≈ 119.017.257
- **Metode:** setiap alamat/chain ID/URL diambil dari dokumentasi resmi lalu **diverifikasi on-chain** lewat RPC
  publik (read-only). Skrip ada di [`scripts/feasibility/`](../scripts/feasibility/).
- **Keterbatasan:** Blockscout dan Etherscan (robin.etherscan.io) memblokir akses otomatis (tantangan Cloudflare),
  jadi **source code terverifikasi kontrak token belum dibaca**. Analisis token dilakukan dari bytecode
  (selector fungsi), state on-chain, simulasi `eth_call`, dan riwayat event. Perlu dicek manual di explorer
  (lihat §7 "Pertanyaan terbuka").

Legenda: ✅ terverifikasi on-chain · 📄 dari dokumentasi resmi (belum/tidak bisa dicek on-chain) · ⚠️ risiko/perlu keputusan

---

## 0. Parameter jaringan

| Properti | Mainnet | Testnet | Sumber |
|---|---|---|---|
| Chain ID | **4663** (`0x1237`) ✅ | **46630** (`0xb626`) ✅ | docs.robinhood.com/chain/add-network-to-wallet + `eth_chainId` |
| RPC publik | `https://rpc.mainnet.chain.robinhood.com/` ✅ | `https://rpc.testnet.chain.robinhood.com` ✅ | idem (rate-limited, HTTP 429 saat burst) |
| Explorer | `robinhoodchain.blockscout.com` 📄 | `explorer.testnet.chain.robinhood.com` 📄 | idem |
| Gas token | ETH | ETH | docs |
| Stack | Arbitrum Orbit L2 (sequencer tunggal dioperasikan Robinhood, urutan FCFS, tanpa priority-fee auction) | | docs: differences-from-ethereum |

Catatan perilaku chain yang relevan untuk paymaster:
- `block.number` = estimasi blok **L1**, bukan blok L2 → jangan dipakai untuk rate limit; gunakan `block.timestamp`.
- Biaya = eksekusi L2 + data L1, keduanya sudah tergabung di gas (EntryPoint menghitung `actualGasCost` seperti biasa;
  komponen L1 masuk lewat `preVerificationGas`).
- **Screening sanksi di level sequencer**: transaksi yang terkait alamat tersanksi tidak dimasukkan ke blok.

## 1. Alamat kontrak META Stock Token

| | Alamat | Status |
|---|---|---|
| **META mainnet** | `0xc0D6457C16Cc70d6790Dd43521C899C87ce02f35` | ✅ |
| META testnet | **tidak ada** | ✅ (registry resmi hanya mencantumkan deployment `chainId 4663`) |

Verifikasi:
- Registry aset resmi `GET https://api.robinhood.com/rhj/assets` (direferensikan dari halaman *Token Contracts*
  docs.robinhood.com/chain/contracts, yang di-generate dari registry on-chain): `tokenSymbol: "META"`,
  `tokenName: "Meta Platforms • Robinhood Token"`, `isin: US30303M1027`, `deployments: [{contractAddress: 0xc0D6…2f35, chainId: 4663}]`,
  status `ASSET_STATUS_ACTIVE`. Ke-204 aset di registry seluruhnya hanya di chain 4663.
- On-chain: `name() = "Meta Platforms • Robinhood Token"`, `symbol() = "META"`, `decimals() = 18`,
  `uid() = 0x…343e7beca03644bcba2e50b8236784f5` (cocok dengan `id` di registry).
- Alamat ini juga dikutip pihak ketiga (Trust Wallet, Envio) — konsisten.

Token pendukung (dari docs/chain/contracts, ✅ ada kode on-chain):
- **USDG** `0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168` — `symbol=USDG`, `decimals=6`
- **WETH** `0x0Bd7D308f8E1639FAb988df18A8011f41EAcAD73` — `symbol=WETH`, `decimals=18`

**Implikasi testnet:** wajib membuat `MockMETA` (18 desimal + antarmuka ERC-8056 `uiMultiplier()`,
`oraclePaused()`, `paused()`, `permit`) — sesuai rencana Fase 1.

## 2. Analisis kontrak token

### 2.1 Ringkasan

| Properti | Temuan | Status |
|---|---|---|
| Standar | ERC-20, **18 desimal**, + **EIP-2612 `permit`** (`permit`, `nonces`, `DOMAIN_SEPARATOR`, `eip712Domain`) | ✅ bytecode |
| Proxy / upgradeable | **Beacon proxy** (EIP-1967 beacon slot). Beacon `0xe10b6f6b275de231345c20d14ab812db62151b00` → implementasi `0xb35490d6f9163de4f80d88dc75c3516eb64c5ae2` (11.614 byte). Implementasi bisa diganti penerbit kapan saja untuk **semua** stock token sekaligus. | ✅ ⚠️ |
| Pause global | `pause()` / `unpause()` / `paused()` ada. Saat ini `paused() = false`. | ✅ ⚠️ |
| Blocklist | Selector `isBlocked(address)` ada di bytecode, tetapi memanggil `isBlocked` langsung pada token **revert** → kemungkinan besar token memanggil **kontrak registry/kompliance eksternal**. Transfer dari/ke alamat yang diblokir akan gagal. | ✅ (mekanisme persis perlu dicek di source) ⚠️ |
| Allowlist / KYC untuk transfer | **Tidak ada** selector allowlist/whitelist. Transfer sekunder bebas (permissionless); hanya mint/burn primer yang permissioned (Authorized Participant, KYB). | ✅ bytecode + 📄 docs |
| Mint/burn | `mint(address,uint256)`, `burn(address,uint256)` — dikendalikan peran (`hasRole`), bukan `owner()` (`owner()` revert). | ✅ |
| Fee-on-transfer | Tidak ada selector fee (`fee()`, `transferFee()`, dll.). Docs: "standard ERC-20", ERC-8056 menyatakan `balanceOf`/`totalSupply` tetap. **Belum dibuktikan** dengan delta saldo → akan diuji di fork test Fase 1. | ✅ (indikasi kuat) |
| Rebasing | **Tidak** — aksi korporasi lewat multiplier ERC-8056 (`uiMultiplier()`), saldo mentah tidak berubah. Saat ini `uiMultiplier = 1.000541459879451635e18`. | ✅ + 📄 |
| Oracle pause flag | `oraclePaused()` / `pauseOracle()` / `unpauseOracle()` ada; saat ini `false`. Advisori (tidak memblokir transfer). | ✅ |
| Lain-lain | `updateMultiplier(uint256)` & `updateMultiplier(uint256,uint256)`, `newUIMultiplier()`, `effectiveAt()`, `balanceOfUI()`, `totalSupplyUI()` | ✅ |
| Total supply | ≈ 10.527,82 META | ✅ |

### 2.2 PENTING — apakah META bisa ditransfer ke/dari kontrak? **YA** ✅

Bukti empiris:
1. **Simulasi `eth_call`** (read-only, `from` = holder EOA `0x9f736f87…acf1ae`) `transfer(to, 1 META)` mengembalikan `true` untuk:
   - EntryPoint v0.7 `0x0000000071727De22E5E9d8BAf0edAc6f37da032` (kontrak)
   - Safe 4337 Module v0.3.0 `0x75cf…c226` (kontrak)
   - akun EIP-7702 `0x0068cb…f777`
   - EOA `0x…dEaD`
2. **Riwayat transfer** (50.000 blok terakhir, 2.635 event `Transfer`): mayoritas pengirim/penerima adalah **kontrak**, termasuk
   PoolManager Uniswap V4 (pemegang ~3.833 META), pool Uniswap V3, router/aggregator, **proxy minimal ERC-1167**
   (pola smart account, mis. `0xc7289753…5f1d`) dan **akun EIP-7702** (kode `0xef0100…`, mis. delegasi ke `0x69007702…e139`).
3. Docs: "Stock Tokens are standard ERC-20s and can be transferred and held in any wallet", dipakai sebagai kolateral di Morpho.

**Kesimpulan:** arsitektur ERC-20 token paymaster **layak**. Paymaster dapat menarik META dari smart account via
`transferFrom` (atau `permit` + `transferFrom`).

### 2.3 Risiko spesifik token untuk paymaster ⚠️
- **Pause global / upgrade beacon / blocklist** dapat membuat `transferFrom` gagal mendadak. Untuk EntryPoint v0.7
  ini aman bila pre-charge dilakukan di `validatePaymasterUserOp` (op ditolak sebelum dieksekusi). Refund di `postOp`
  harus ditulis agar **tidak revert** bila transfer gagal (kalau tidak, paymaster tetap menanggung gas).
- Bila **alamat paymaster sendiri** masuk blocklist, layanan berhenti total → perlu runbook & kemampuan migrasi.
- Paymaster harus mengecek `paused()` token di validasi (murah) agar tidak menerima op yang pasti gagal.

## 3. ERC-4337 di Robinhood Chain

### 3.1 EntryPoint & modul (sumber: docs.robinhood.com/chain/account-abstraction)

| Kontrak | Alamat | Mainnet | Testnet |
|---|---|---|---|
| EntryPoint v0.6.0 | `0x5FF137D4b0FDCD49DcA30c7CF57E578a026d2789` | ✅ 23.689 B | ✅ ada kode |
| **EntryPoint v0.7.0** | `0x0000000071727De22E5E9d8BAf0edAc6f37da032` | ✅ 16.035 B | ✅ ada kode |
| EntryPoint v0.8.0 | `0x4337084D9E255Ff0702461CF8895CE9E3b5Ff108` | ✅ 21.738 B | ✅ ada kode |
| SenderCreator v0.7.0 | `0xEFC2c1444eBCC4Db75e7613d20C6a62fF67A167C` | 📄 | 📄 |
| Safe Module Setup v0.3.0 | `0x2dd68b007B46fBe91B9A7c3EDa5A7a1063cB5b47` | ✅ 547 B | 📄 |
| Safe 4337 Module v0.3.0 (EP v0.7) | `0x75cf11467937ce3F2f357CE24ffc3DBF8fD5c226` | ✅ 8.373 B | ✅ ada kode |

EIP-7702 juga didukung (docs + Pimlico).

### 3.2 Bundler

| Penyedia | Dukungan Robinhood | Sumber |
|---|---|---|
| **Alchemy** | Penyedia AA resmi. Bundler/RPC `https://robinhood-mainnet.g.alchemy.com/v2/{API_KEY}`; Gas Manager (sponsorship). | 📄 docs Robinhood |
| **Pimlico** | Mainnet (slug `robinhood`) & testnet (`robinhood-testnet`): bundler + paymaster untuk EP v0.6/v0.7/v0.8; v0.9 (`0x433709009B8330FDa32311DF1C2AFA402eD8D009`) bundler saja. EIP-7702 ✅. Akun terdeploy untuk EP v0.7: Safe 1.4.1, Kernel 0.2.x, Light 1.1/2.0, SimpleAccount, Biconomy, Etherspot, Thirdweb. **Kernel 0.3.0/0.3.1 dan Nexus ditandai ❌.** | 📄 docs.pimlico.io/guides/supported-chains |
| **ZeroDev** | Alternatif resmi (contoh di docs memakai `KERNEL_V3_1`, chain 4663). | 📄 docs Robinhood |
| Gelato, Biconomy (bundler), lainnya | Tidak diverifikasi. | — |

**Kesimpulan:** tidak perlu self-host bundler (Rundler/Skandha). Pimlico menyediakan bundler di **mainnet dan testnet**,
sehingga cocok untuk pengembangan; Alchemy untuk produksi sebagai cadangan/redundansi.

⚠️ Ada inkonsistensi Kernel v3.1: docs Robinhood mencontohkannya, tetapi tabel Pimlico menandainya tidak terdeploy.
Akan diverifikasi on-chain di awal Fase 1 sebelum memilih modul session key.

## 4. Sumber harga

### 4.1 Chainlink (sumber: docs.chain.link/data-feeds/price-feeds/addresses?network=robinhood) — ✅ dibaca on-chain

| Feed | Proxy | Desimal | Heartbeat | Deviasi | Jam pasar | Nilai saat riset | Umur update |
|---|---|---|---|---|---|---|---|
| **Robinhood META / USD** | `0x7C38C00C30BEe9378381E7B6135d7283356D71b1` | 8 | 86400 s | 0,5% | `us_equities_24/5` | **$583,4988** | 161 s |
| (proxy sekunder META/USD, SVR) | `0x5cBC53D382E56cBb223f118CF8Eefb6c9c2759f5` | 8 | | | | $583,4988 | 183 s |
| **ETH / USD** | `0x78F3556b67E17Df817D51Ef5a990cDaF09E8d3A9` | 8 | 86400 s | 0,5% | Crypto 24/7 | $1.748,27 | 1.303 s |
| USDG / USD | `0x61B7e5650328764B076A108EFF5fa7282a1B9aD2` | 8 | 86400 s | 0,5% | Crypto | $1,00001 | ~19,7 jam |

Sifat penting feed META/USD:
- Mengembalikan **harga per token** = harga saham × `uiMultiplier` (sudah disesuaikan dividen/split).
  **Ini persis satuan yang dibutuhkan paymaster** (USD per 1 META token) — tidak perlu mengalikan multiplier sendiri.
- Saat aksi korporasi, `oraclePaused()` di token = `true` dan feed membeku di harga terakhir.
- **Tidak ada heartbeat di luar jam pasar** (weekend/libur) → `updatedAt` bisa berumur > 48 jam.
- Feed ini terdaftar hanya untuk **mainnet**; tidak ada feed Chainlink di testnet → testnet memakai `MockAggregator`.

⚠️ **L2 Sequencer Uptime Feed:** docs Robinhood menyarankan pengecekan sequencer uptime, tetapi halaman Chainlink
L2 Sequencer Feeds **tidak mencantumkan** Robinhood Chain dan alamatnya tidak dipublikasikan. Untuk saat ini tidak bisa
diimplementasikan; mitigasi: staleness check ketat + parameter alamat feed opsional (bisa diisi kelak).

Opsi tambahan: **Chainlink Data Streams** (pull-based, sub-detik) — Verifier Proxy mainnet
`0xcE73c8ad08CBDEaCa6078BF0627C8fe0a9a536E7` 📄. Memerlukan langganan; tidak untuk MVP.

### 4.2 Uniswap — TWAP

Alamat dari developers.uniswap.org (deployments), ✅ ada kode on-chain:
- V4 PoolManager `0x8366a39cc670b4001a1121b8f6a443a643e40951`, StateView `0xf3334192d15450cdd385c8b70e03f9a6bd9e673b`
- V3 Factory `0x1f7d7550b1b028f7571e69a784071f0205fd2efa`

⚠️ **Temuan kunci: pool Uniswap V4 tanpa hook tidak menyimpan observasi harga — tidak ada TWAP bawaan.**
Di V4, TWAP hanya tersedia lewat hook oracle khusus. Dari 4.002 pool V4 yang melibatkan META (mayoritas spam dengan
hook acak), pool likuid terbaik tidak memakai hook:

| Pool V4 (poolId) | Pasangan | Fee | Hook | Harga META | Kedalaman ±2% (perkiraan) |
|---|---|---|---|---|---|
| `0x5875d407…6ae36` | USDG/META | 0,30% | — | $584,48 | ~33,6 META (~$19,6k) |
| `0x4ac4259e…aa4f5` | USDG/META | dinamis | `0x8af95932…` | $583,13 | ~1,2 META |
| `0xf89d7090…dd801` | ETH/META | 0,21% | — | 0,3338 ETH | ~0,56 META (~$325) |
| `0xc58bb680…2872f` | USDG/META | 0,031% | — | $583,38 | ~0,36 META |

**Alternatif yang memenuhi kebutuhan TWAP: pool Uniswap V3** (punya `observe()` bawaan, kardinalitas sudah dinaikkan):

| Pool V3 | Pasangan | Fee | Kardinalitas observasi | Saldo META di pool | Kedalaman ±2% (perkiraan) |
|---|---|---|---|---|---|
| **`0x107a7cb40d8665360ba10e59471af06150a50922`** | META/USDG | 0,30% | **3.601** | ~223 META | ~10,6 META (~$6,2k) |
| **`0xa4bdb396a69617eb7f70e2cc1ef526f7340b1b0d`** | WETH/META | 0,30% | **7.200** | ~167 META | ~27 META (~$15,8k) |
| `0xbfeb2e8adc8ad18878cb4c625e24030b9671e44d` | META/USDG | 0,05% | 1 (tanpa TWAP) | ~25 META | — |

⚠️ Likuiditas on-chain **tipis** (puluhan ribu dolar per 2%). TWAP 30 menit tetap bisa dimanipulasi dengan modal
yang relatif kecil (terutama di luar jam pasar ketika arbitrase lemah). Karena itu TWAP **hanya layak sebagai
pengecek deviasi / fallback terbatas**, bukan sumber utama. Likuiditas utama stock token ada di RFQ (0x, 1inch Fusion,
LiFi), propAMM (Rialto), dan Lighter — tidak bisa dibaca sebagai oracle on-chain.

### 4.3 Harga ETH/USD
Chainlink ETH/USD (atas) sebagai sumber utama. Fallback: TWAP V3 WETH/META digabung META/USD tidak independen,
jadi fallback ETH yang wajar adalah TWAP pool WETH/USDG (belum disurvei — Fase 1) atau cukup menolak op bila ETH/USD basi
(ETH/USD 24/7, heartbeat 24 jam, risiko basi rendah).

## 5. Jam bursa & risiko harga basi

| Jendela | Perilaku |
|---|---|
| Feed Chainlink META | `us_equities_24/5`: regular + pre/post-market + overnight, kira-kira **Minggu 20:00 ET → Jumat 20:00 ET** |
| Weekend | Tidak ada update ±48 jam (Jumat 20:00 ET → Minggu 20:00 ET); feed menahan harga terakhir |
| Libur bursa AS | Gap bisa ≥ 72 jam. Terdekat: **Thanksgiving, Kamis 26 Nov 2026** (tutup), Jumat 27 Nov (tutup lebih awal) |
| Aksi korporasi | `oraclePaused() = true`, feed membeku sampai Robinhood unpause |
| Tokenization window (mint/burn primer) | Senin 02:00 CET → Sabtu 02:00 CET; di luar itu transfer & trading sekunder tetap jalan |

Risiko: saat pasar tutup, token tetap diperdagangkan on-chain tapi oracle tidak bergerak → **gap harga saat pembukaan**
(berita weekend). Untuk paymaster, eksposurnya per-op sangat kecil: biaya gas L2 umumnya beberapa sen dolar, jadi gap
10% berarti kerugian/keuntungan sepersekian sen per op. Risiko agregat dibatasi oleh batas per-user/per-periode dan
saldo META yang ditahan paymaster (sapu/convert secara berkala).

Opsi kebijakan (perlu keputusan, lihat §7):
- **A. Ketat** — tolak op bila `updatedAt` > `maxStaleness` (mis. 1 jam). Paymaster mati tiap weekend/libur. Aman tapi UX buruk.
- **B. Mode pasar tutup (direkomendasikan)** — dua ambang: `maxStalenessOpen` (mis. 1 jam saat sesi aktif) dan
  `maxStalenessClosed` (mis. 80 jam saat weekend/libur), dengan **markup tambahan** saat closed, **batas biaya per-op
  lebih rendah**, dan **wajib lolos cek deviasi vs TWAP V3** (circuit breaker). Penentuan "sesi aktif" tidak bisa
  andal on-chain (libur), jadi dipakai heuristik: harga dianggap "open" bila `updatedAt` baru; bila tidak, berlaku
  parameter closed yang lebih konservatif.

## 6. Rekomendasi arsitektur final

```
 Pengguna / Agen AI
   │  (session key berbatas)
   ▼
 Smart Account (Safe 1.4.1 + Safe4337Module v0.3.0, EP v0.7)
   + ERC-7579 adapter & modul session key (Rhinestone Smart Sessions)   ← diverifikasi deployment di Fase 1
   │  UserOperation (paymasterAndData → MetaTokenPaymaster)
   ▼
 Bundler: Pimlico (mainnet+testnet) / Alchemy (cadangan)
   ▼
 EntryPoint v0.7  0x0000000071727De22E5E9d8BAf0edAc6f37da032
   ▼
 MetaTokenPaymaster (milik kita, berbasis eth-infinitism BasePaymaster + OZ Ownable2Step/Pausable/SafeERC20)
   ├─ validatePaymasterUserOp: cek token.paused(), oraclePaused(), batas user;
   │    harga = PriceOracle; pre-charge maxCost→USD→META (+markup) via transferFrom
   ├─ postOp: hitung biaya aktual (+ overhead postOp), refund selisih META (tanpa revert)
   └─ PriceOracle (kontrak terpisah, bisa di-upgrade dengan menukar alamat oleh owner)
        primary : Chainlink META/USD 0x7C38…71b1, ETH/USD 0x78F3…d3A9 (staleness + answer>0)
        check   : TWAP Uniswap V3 META/USDG 0,3% 0x107a…0922 (× USDG/USD Chainlink)
        breaker : |chainlink − twap| > maxDeviation → tolak
        fallback: bila Chainlink basi di luar ambang → TWAP saja dengan batas per-op lebih kecil & markup lebih besar
                  (bisa dimatikan owner)
```

Keputusan dan alasannya:
1. **EntryPoint v0.7** — sesuai brief; didukung Pimlico (bundler+paymaster), Safe4337Module v0.3.0 resmi, permissionless.js.
   v0.8 tersedia bila nanti ingin dukungan EIP-7702 penuh (banyak holder META memakai akun 7702 — calon pengguna).
2. **Smart account: Safe + Rhinestone (ERC-7579 Smart Sessions)** sebagai default karena Safe 4337 Module tercantum di
   docs resmi Robinhood dan terverifikasi on-chain. Alternatif: Kernel v3.1 + ZeroDev permissions (dicontohkan docs
   Robinhood) — dipilih bila deployment-nya terverifikasi dan Safe7579/Smart Sessions tidak ada di chain ini.
   Keduanya modul teraudit; kita tidak menulis logika session key sendiri.
3. **Oracle: Chainlink primer + TWAP Uniswap V3 (bukan V4)** — menyimpang dari brief karena pool V4 likuid tidak memiliki
   oracle. Harga feed sudah per-token (termasuk multiplier) sehingga konversi USD→META langsung.
4. **Paymaster tidak bergantung pada swap on-chain**: META yang terkumpul ditarik owner dan dikonversi off-chain/RFQ
   (likuiditas AMM terlalu tipis untuk auto-swap ke ETH per op).
5. **Testnet:** `MockMETA` + `MockAggregator` (META/USD, ETH/USD) + mock TWAP; EntryPoint v0.7 & bundler Pimlico tersedia di testnet.
6. **Kepatuhan:** UI menampilkan disclaimer non-afiliasi + pembatasan AS/yurisdiksi; paymaster bisa di-pause; tidak ada
   fungsi yang memindahkan META milik pengguna selain pre-charge yang disetujui (allowance/permit).

## 7. Pertanyaan terbuka / keputusan yang dibutuhkan

1. **TWAP: setuju memakai Uniswap V3** (META/USDG 0,3%, kardinalitas 3.601) sebagai pengganti "TWAP Uniswap V4"?
   Alternatif: menulis/deploy hook oracle V4 sendiri — tetapi pool baru itu akan kosong likuiditas.
2. **Kebijakan harga basi:** opsi A (ketat) atau **B (mode pasar tutup, direkomendasikan)**? Usulan default:
   `maxStalenessOpen = 1 jam`, `maxStalenessClosed = 80 jam`, markup 5% (+5% saat closed), deviasi maks 3% (open) / 8% (closed).
3. **Sequencer uptime feed** tidak tersedia untuk Robinhood Chain — terima mitigasi staleness saja?
4. **Smart account:** Safe + Rhinestone Smart Sessions (default) atau Kernel v3.1 + ZeroDev?
5. **Verifikasi source token**: mohon cek manual (atau izinkan saya) source implementasi
   `0xb35490d6f9163de4f80d88dc75c3516eb64c5ae2` di robinhoodchain.blockscout.com — terutama logika `isBlocked`/registry
   kompliance dan hook transfer. Akses otomatis diblokir Cloudflare; saya tidak mencoba mengakalinya.
6. **Bundler untuk dev:** Pimlico (perlu API key, disimpan di `.env`) — setuju?
7. **Hukum:** produk memproses token sekuritas yang dibatasi untuk U.S. Persons; tinjauan hukum diperlukan sebelum mainnet
   (masuk checklist Fase 4).

## 8. Sumber

- Robinhood Chain docs: [overview](https://docs.robinhood.com/chain/), [add network](https://docs.robinhood.com/chain/add-network-to-wallet/),
  [account abstraction](https://docs.robinhood.com/chain/account-abstraction/), [oracles & price feeds](https://docs.robinhood.com/chain/oracles-and-price-feeds/),
  [stock tokens](https://docs.robinhood.com/chain/stock-tokens/), [building with stock tokens](https://docs.robinhood.com/chain/building-with-stock-tokens/),
  [stock token APIs](https://docs.robinhood.com/chain/stock-token-apis/), [token contracts](https://docs.robinhood.com/chain/contracts/),
  [data streams](https://docs.robinhood.com/chain/data-streams/), [gas & fees](https://docs.robinhood.com/chain/gas-and-fees/),
  [differences from Ethereum](https://docs.robinhood.com/chain/differences-from-ethereum/)
- Registry aset: `https://api.robinhood.com/rhj/assets`
- Chainlink: [Robinhood feed addresses](https://docs.chain.link/data-feeds/price-feeds/addresses?network=robinhood),
  [Robinhood tokenized equities](https://docs.chain.link/data-feeds/tokenized-equity-feeds/robinhood),
  [L2 sequencer feeds](https://docs.chain.link/data-feeds/l2-sequencer-feeds)
- Pimlico: [supported chains](https://docs.pimlico.io/guides/supported-chains)
- Uniswap: [v4 deployments](https://developers.uniswap.org/contracts/v4/deployments),
  [v3 Robinhood deployments](https://developers.uniswap.org/docs/protocols/v3/deployments/v3-robinhood-chain-deployments)
- Verifikasi on-chain: RPC `https://rpc.mainnet.chain.robinhood.com`, `https://rpc.testnet.chain.robinhood.com` — skrip di `scripts/feasibility/`
