// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/// @notice Robinhood Chain addresses, each verified on-chain (see docs/feasibility.md and docs/addresses.md).
library RobinhoodMainnet {
    uint256 internal constant CHAIN_ID = 4663;

    // Robinhood Stock Token (docs.robinhood.com/chain/contracts + api.robinhood.com/rhj/assets)
    address internal constant META = 0xc0D6457C16Cc70d6790Dd43521C899C87ce02f35;
    address internal constant USDG = 0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168;
    address internal constant WETH = 0x0Bd7D308f8E1639FAb988df18A8011f41EAcAD73;

    // Chainlink (docs.chain.link/data-feeds/price-feeds/addresses?network=robinhood)
    address internal constant CL_META_USD = 0x7C38C00C30BEe9378381E7B6135d7283356D71b1;
    address internal constant CL_ETH_USD = 0x78F3556b67E17Df817D51Ef5a990cDaF09E8d3A9;
    address internal constant CL_USDG_USD = 0x61B7e5650328764B076A108EFF5fa7282a1B9aD2;

    // Uniswap V3 META/USDG 0.3% pool (factory 0x1f7d7550b1b028f7571e69a784071f0205fd2efa), cardinality 3601
    address internal constant UNI_V3_META_USDG_3000 = 0x107a7Cb40d8665360ba10E59471Af06150A50922;

    // ERC-4337 (docs.robinhood.com/chain/account-abstraction)
    address internal constant ENTRYPOINT_V07 = 0x0000000071727De22E5E9d8BAf0edAc6f37da032;
}

library RobinhoodShared {
    // Deployed at the same address on Robinhood Chain mainnet (4663) and testnet (46630), verified on-chain.
    address internal constant ENTRYPOINT_V07 = 0x0000000071727De22E5E9d8BAf0edAc6f37da032;
    address internal constant KERNEL_V3_1_IMPL = 0xBAC849bB641841b44E965fB01A4Bf5F074f84b4D;
    address internal constant KERNEL_V3_1_FACTORY = 0xaac5D4240AF87249B3f71BC8E4A2cae074A3E419;
    address internal constant KERNEL_META_FACTORY = 0xd703aaE79538628d27099B8c4f621bE4CCd142d5;
    address internal constant KERNEL_ECDSA_VALIDATOR = 0x845ADb2C711129d4f3966735eD98a9F09fC4cE57;
    address internal constant SMART_SESSIONS = 0x00000000008bDABA73cD9815d79069c247Eb4bDA;
}
