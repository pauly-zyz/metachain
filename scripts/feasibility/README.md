# Skrip verifikasi Fase 0 (read-only)

Skrip Python minimal (tanpa web3) yang dipakai untuk memverifikasi temuan di
`docs/feasibility.md` langsung terhadap RPC publik Robinhood Chain. Semua panggilan
bersifat **read-only** (`eth_call`, `eth_getCode`, `eth_getLogs`, `eth_getStorageAt`);
tidak ada transaksi yang dikirim.

```bash
pip install pycryptodome
cd scripts/feasibility
python3 01_meta_token_state.py
```

Variabel `RPC` dapat di-override (default `https://rpc.mainnet.chain.robinhood.com`).
RPC publik dibatasi laju (HTTP 429); skrip sudah memberi jeda antar-panggilan.

| Skrip | Isi |
|---|---|
| 01_meta_token_state.py | name/symbol/decimals/supply, slot proxy EIP-1967, uiMultiplier, oraclePaused, paused |
| 02_impl_selectors.py | daftar selector fungsi di bytecode implementasi (deteksi blocklist/fee/allowlist) |
| 03_transfer_sim_entrypoints.py | simulasi `transfer` META ke EntryPoint/Safe module/EOA/akun 7702; cek kode EntryPoint; feed Chainlink |
| 04_chainlink_feeds.py | ETH/USD, USDG/USD, META/USD (proxy sekunder) |
| 05_find_v4_pools.py | event `Initialize` PoolManager Uniswap V4 yang melibatkan META |
| 06_rank_v4_pools.py | likuiditas in-range & harga pool V4 META (via StateView) |
| 07_v4_depth_v3_pools.py | kedalaman ±2% pool V4, pool V3 META + kardinalitas observasi TWAP |
