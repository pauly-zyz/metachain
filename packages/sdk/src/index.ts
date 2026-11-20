/**
 * @metachain/sdk — pay gas with META Stock Token on Robinhood Chain.
 *
 * DISCLAIMER: META Chain is independent and NOT affiliated with Meta Platforms, Inc. or Robinhood.
 * META Stock Tokens are not available to U.S. persons and are restricted in other jurisdictions.
 */
export * from "./chains.js";
export * from "./addresses.js";
export * from "./fees.js";
export * from "./paymaster.js";
export * from "./account.js";
export * from "./sessions.js";
export * from "./agent.js";
export * from "./keeper.js";
export {
  metaTokenPaymasterAbi,
  metaPriceOracleAbi,
  agentPaymentsAbi,
  mockMetaAbi,
  mockAggregatorAbi,
  mockUniswapV3PoolAbi,
} from "./abis.js";

export const DISCLAIMER =
  "META Chain tidak berafiliasi dengan Meta Platforms, Inc. maupun Robinhood. META Stock Token tidak tersedia untuk warga/penduduk AS dan dibatasi di beberapa yurisdiksi lain.";
