// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

/// @notice Price source used by MetaTokenPaymaster and AgentPayments.
interface IMetaPriceOracle {
    /// @dev Open     = Chainlink fresh (US equity session active), tight deviation bound.
    ///      Closed   = Chainlink older than `maxStalenessOpen` but within `maxStalenessClosed`
    ///                 (weekend / holiday / overnight gap); TWAP cross-check mandatory, wider bound.
    ///      Fallback = Chainlink unusable (too stale, invalid, or issuer oracle pause); TWAP only.
    enum Mode {
        Open,
        Closed,
        Fallback
    }

    struct Prices {
        uint256 metaUsd; // USD per 1 whole META token, 18 decimals
        uint256 ethUsd; // USD per 1 ETH, 18 decimals
        Mode mode;
        uint48 validUntil; // timestamp after which these prices must not be used
        uint48 sourceTimestamp; // Chainlink META updatedAt (or block.timestamp for Fallback)
    }

    /// @notice Computes current prices. Reverts if no safe price exists.
    function getPrices() external view returns (Prices memory);

    /// @notice USD value (18 decimals) of `amount` of `token`. Supports META and the configured quote stablecoin.
    function usdValue(address token, uint256 amount) external view returns (uint256);

    function metaToken() external view returns (address);
}
