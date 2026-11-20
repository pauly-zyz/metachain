// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/// @notice Subset of the Robinhood Stock Token interface used by META Chain.
/// @dev Selectors verified against the on-chain implementation bytecode (see docs/feasibility.md §2).
///      `uiMultiplier` is defined by ERC-8056 (Scaled UI Amount Extension).
interface IStockToken is IERC20 {
    function decimals() external view returns (uint8);

    function paused() external view returns (bool);

    /// @notice Advisory flag set by the issuer while a corporate action is processed. Chainlink freezes the feed.
    function oraclePaused() external view returns (bool);

    /// @notice Shares-per-token ratio, 1e18 = 1.0. The Chainlink feed already includes it.
    function uiMultiplier() external view returns (uint256);
}
