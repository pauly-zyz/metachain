import { getAddress, type Address } from "viem";
import { ROBINHOOD_MAINNET_ID, ROBINHOOD_TESTNET_ID } from "./chains.js";

/**
 * Infrastructure deployed at identical addresses on Robinhood Chain mainnet (4663) and testnet (46630).
 * Every address was verified on-chain (eth_getCode) — see docs/addresses.md.
 */
export const SHARED_ADDRESSES = {
  entryPoint: "0x0000000071727De22E5E9d8BAf0edAc6f37da032", // ERC-4337 EntryPoint v0.7
  kernelImplementation: "0xBAC849bB641841b44E965fB01A4Bf5F074f84b4D", // Kernel v3.1
  kernelFactory: "0xaac5D4240AF87249B3f71BC8E4A2cae074A3E419",
  kernelMetaFactory: "0xd703aaE79538628d27099B8c4f621bE4CCd142d5",
  kernelEcdsaValidator: "0x845ADb2C711129d4f3966735eD98a9F09fC4cE57",
  smartSessions: "0x00000000008bDABA73cD9815d79069c247Eb4bDA", // Rhinestone Smart Sessions
  ownableValidator: "0x000000000013fdB5234E4E3162a810F54d9f7E98",
  sudoPolicy: "0x0000000000FEEc8D74e3143fBaBbca515358d869",
  timeFramePolicy: "0x0000000000D30f611fA3bf652ac6879428586930",
  usageLimitPolicy: "0x00000000001d4479FA2A947026204d0283ceDe4B",
} as const satisfies Record<string, Address>;

/** Real Robinhood Chain mainnet assets & price sources (docs/feasibility.md). */
export const MAINNET_ASSETS = {
  meta: "0xc0D6457C16Cc70d6790Dd43521C899C87ce02f35", // Meta Platforms • Robinhood Token
  usdg: "0x5fc5360D0400a0Fd4f2af552ADD042D716F1d168",
  weth: "0x0Bd7D308f8E1639FAb988df18A8011f41EAcAD73",
  chainlinkMetaUsd: "0x7C38C00C30BEe9378381E7B6135d7283356D71b1",
  chainlinkEthUsd: "0x78F3556b67E17Df817D51Ef5a990cDaF09E8d3A9",
  chainlinkUsdgUsd: "0x61B7e5650328764B076A108EFF5fa7282a1B9aD2",
  uniswapV3MetaUsdg: "0x107a7Cb40d8665360ba10E59471Af06150A50922",
} as const satisfies Record<string, Address>;

/** Addresses a META Chain client needs. */
export interface MetaChainAddresses {
  entryPoint: Address;
  meta: Address;
  quoteToken: Address;
  oracle: Address;
  paymaster: Address;
  agentPayments: Address;
  kernelFactory: Address;
  kernelEcdsaValidator: Address;
  smartSessions: Address;
  ownableValidator: Address;
  timeFramePolicy: Address;
  usageLimitPolicy: Address;
}

/** Shape of contracts/deployments/<name>.json written by `script/Deploy.s.sol`. */
export interface DeploymentJson {
  chainId: number;
  entryPoint: string;
  meta: string;
  quoteToken: string;
  oracle: string;
  paymaster: string;
  agentPayments: string;
  [k: string]: unknown;
}

export function addressesFromDeployment(d: DeploymentJson): MetaChainAddresses {
  return {
    entryPoint: getAddress(d.entryPoint),
    meta: getAddress(d.meta),
    quoteToken: getAddress(d.quoteToken),
    oracle: getAddress(d.oracle),
    paymaster: getAddress(d.paymaster),
    agentPayments: getAddress(d.agentPayments),
    kernelFactory: SHARED_ADDRESSES.kernelFactory,
    kernelEcdsaValidator: SHARED_ADDRESSES.kernelEcdsaValidator,
    smartSessions: SHARED_ADDRESSES.smartSessions,
    ownableValidator: SHARED_ADDRESSES.ownableValidator,
    timeFramePolicy: SHARED_ADDRESSES.timeFramePolicy,
    usageLimitPolicy: SHARED_ADDRESSES.usageLimitPolicy,
  };
}

/**
 * Official META Chain deployments. Empty until contracts are deployed — the testnet deploy needs a funded
 * key (see README "Deploy"). Pass your own `MetaChainAddresses` (e.g. via `addressesFromDeployment`) meanwhile.
 */
export const DEPLOYMENTS: Partial<Record<number, MetaChainAddresses>> = {};

export function getDeployment(chainId: number): MetaChainAddresses {
  const d = DEPLOYMENTS[chainId];
  if (!d) {
    const known = [ROBINHOOD_MAINNET_ID, ROBINHOOD_TESTNET_ID].join(", ");
    throw new Error(`META Chain is not deployed on chain ${chainId} yet (supported: ${known}). Pass addresses explicitly.`);
  }
  return d;
}
