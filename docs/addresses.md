# Alamat kontrak (terverifikasi)

Setiap alamat di bawah diambil dari sumber resmi, lalu dicek on-chain lewat `eth_getCode` (dan untuk sebagian, lewat
pemanggilan read-only) pada 20 November 2026.

- ✅ = ada kode di jaringan tersebut
- — = tidak ada / tidak berlaku

## Infrastruktur bersama: alamat sama di mainnet (4663) dan testnet (46630)

| Kontrak | Alamat | Mainnet | Testnet | Sumber |
|---|---|---|---|---|
| ERC-4337 EntryPoint v0.7 | `0x0000000071727De22E5E9d8BAf0edAc6f37da032` | ✅ | ✅ | docs.robinhood.com/chain/account-abstraction |
| Kernel v3.1 implementation | `0xBAC849bB641841b44E965fB01A4Bf5F074f84b4D` | ✅ | ✅ | @zerodev/sdk, permissionless |
| Kernel v3.1 factory | `0xaac5D4240AF87249B3f71BC8E4A2cae074A3E419` | ✅ | ✅ | idem |
| Kernel meta factory | `0xd703aaE79538628d27099B8c4f621bE4CCd142d5` | ✅ | ✅ | idem |
| Kernel ECDSA validator (≥0.3.1) | `0x845ADb2C711129d4f3966735eD98a9F09fC4cE57` | ✅ | ✅ | @zerodev/ecdsa-validator |
| Rhinestone Smart Sessions | `0x00000000008bDABA73cD9815d79069c247Eb4bDA` | ✅ | ✅ | @rhinestone/module-sdk (GLOBAL_CONSTANTS) |
| OwnableValidator (session signer) | `0x000000000013fdB5234E4E3162a810F54d9f7E98` | ✅ | ✅ | idem |
| SudoPolicy | `0x0000000000FEEc8D74e3143fBaBbca515358d869` | ✅ | ✅ | idem |
| TimeFramePolicy | `0x0000000000D30f611fA3bf652ac6879428586930` | ✅ | ✅ | idem |
| UsageLimitPolicy | `0x00000000001d4479FA2A947026204d0283ceDe4B` | ✅ | ✅ | idem |
| Safe 4337 Module v0.3.0 | `0x75cf11467937ce3F2f357CE24ffc3DBF8fD5c226` | ✅ | ✅ | docs Robinhood (tidak dipakai) |
| Safe7579 adapter | `0x7579EE8307284F293B1927136486880611F20002` | ✅ | — | rhinestonewtf/safe7579 |
| Safe7579 launchpad | `0x7579011aB74c46090561ea277Ba79D510c6C00ff` | — | — | idem, **penyebab Kernel dipilih ketimbang Safe** |

## Aset & oracle: hanya mainnet

| Kontrak | Alamat | Catatan |
|---|---|---|
| META (Meta Platforms • Robinhood Token) | `0xc0D6457C16Cc70d6790Dd43521C899C87ce02f35` | beacon proxy, 18 desimal, **tidak ada di testnet** |
| USDG | `0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168` | 6 desimal |
| WETH | `0x0Bd7D308f8E1639FAb988df18A8011f41EAcAD73` | |
| Chainlink "Robinhood META / USD" | `0x7C38C00C30BEe9378381E7B6135d7283356D71b1` | 8 desimal, `us_equities_24/5` |
| Chainlink ETH / USD | `0x78F3556b67E17Df817D51Ef5a990cDaF09E8d3A9` | 8 desimal |
| Chainlink USDG / USD | `0x61B7e5650328764B076A108EFF5fa7282a1B9aD2` | 8 desimal |
| Uniswap V3 META/USDG 0,3% | `0x107a7Cb40d8665360ba10E59471Af06150A50922` | kardinalitas observasi 3601 (sumber TWAP) |
| Uniswap V3 Factory | `0x1f7d7550b1b028f7571e69a784071f0205fd2efa` | developers.uniswap.org |
| Uniswap V4 PoolManager | `0x8366a39cc670b4001a1121b8f6a443a643e40951` | pool likuid tanpa hook oracle → tidak dipakai untuk TWAP |

## Jaringan

| | Mainnet | Testnet |
|---|---|---|
| Chain ID | 4663 | 46630 |
| RPC | `https://rpc.mainnet.chain.robinhood.com` | `https://rpc.testnet.chain.robinhood.com` |
| Explorer | `https://robinhoodchain.blockscout.com` | `https://explorer.testnet.chain.robinhood.com` |
| Bundler (Pimlico) | slug `robinhood` | slug `robinhood-testnet` |

## Kontrak META Chain

**Belum di-deploy** ke testnet maupun mainnet publik. Deploy testnet membutuhkan private key yang punya ETH testnet
(lihat README → Deploy). Setelah deploy, alamatnya tercatat di `contracts/deployments/robinhood-testnet.json` dan
`DEPLOYMENTS` di `packages/sdk/src/addresses.ts`.
