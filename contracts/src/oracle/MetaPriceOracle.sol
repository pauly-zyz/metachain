// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Ownable, Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {IERC20Metadata} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import {IUniswapV3Pool} from "@uniswap/v3-core/contracts/interfaces/IUniswapV3Pool.sol";
import {OracleLibrary} from "@uniswap/v3-periphery/contracts/libraries/OracleLibrary.sol";

import {IChainlinkAggregator} from "../interfaces/IChainlinkAggregator.sol";
import {IStockToken} from "../interfaces/IStockToken.sol";
import {IMetaPriceOracle} from "../interfaces/IMetaPriceOracle.sol";

/// @title MetaPriceOracle
/// @notice Hybrid META/USD + ETH/USD price source for META Chain.
///         Primary: Chainlink "Robinhood META / USD" (already multiplier-adjusted, i.e. USD per token).
///         Cross-check / fallback: Uniswap V3 TWAP of META against a USD stablecoin (USDG), converted to USD
///         with the stablecoin's Chainlink feed.
///         Circuit breaker: rejects when Chainlink and TWAP deviate more than the mode's bound.
/// @dev Uniswap V4 pools without an oracle hook keep no observations, hence V3 (see docs/feasibility.md §4.2).
///      This contract is view-only for consumers; it uses block.timestamp and therefore MUST NOT be called
///      during ERC-4337 validation. MetaTokenPaymaster caches its output outside validation.
contract MetaPriceOracle is IMetaPriceOracle, Ownable2Step {
    // ----------------------------------------------------------------- errors
    error InvalidConfig();
    error InvalidPool();
    error SequencerDown();
    error SequencerGracePeriod();
    error StaleEthPrice();
    error InvalidEthPrice();
    error TwapUnavailable();
    error PriceDeviation(uint256 chainlinkPrice, uint256 twapPrice, uint256 deviationBps);
    error NoValidPrice();
    error UnsupportedToken(address token);

    // ----------------------------------------------------------------- events
    event ConfigUpdated(Config config);
    event TwapPoolUpdated(address pool);
    event SequencerFeedUpdated(address feed);

    // ----------------------------------------------------------------- types
    struct Config {
        uint32 maxStalenessOpen; // e.g. 1 hour
        uint32 maxStalenessClosed; // e.g. 80 hours (weekend + holiday)
        uint32 ethMaxStaleness; // e.g. 25 hours (heartbeat 24h)
        uint32 quoteMaxStaleness; // e.g. 25 hours (USDG/USD heartbeat 24h)
        uint32 twapWindow; // e.g. 30 minutes
        uint32 fallbackValidity; // validity of a TWAP-only price, e.g. 5 minutes
        uint32 sequencerGracePeriod; // e.g. 1 hour
        uint16 maxDeviationOpenBps; // e.g. 300 = 3%
        uint16 maxDeviationClosedBps; // e.g. 800 = 8%
        bool twapFallbackEnabled;
        bool requireTwapWhenOpen;
    }

    uint256 internal constant BPS = 10_000;
    uint256 internal constant WAD = 1e18;

    // ----------------------------------------------------------------- immutables
    IStockToken public immutable META;
    uint8 public immutable META_DECIMALS;
    IChainlinkAggregator public immutable META_USD_FEED;
    IChainlinkAggregator public immutable ETH_USD_FEED;
    IChainlinkAggregator public immutable QUOTE_USD_FEED; // USDG / USD
    address public immutable QUOTE_TOKEN; // USDG
    uint8 public immutable QUOTE_DECIMALS;

    // ----------------------------------------------------------------- storage
    Config public config;
    IUniswapV3Pool public twapPool;
    /// @notice Optional Chainlink L2 sequencer uptime feed. Not published for Robinhood Chain yet → address(0).
    IChainlinkAggregator public sequencerUptimeFeed;

    constructor(
        address owner_,
        IStockToken meta,
        IChainlinkAggregator metaUsdFeed,
        IChainlinkAggregator ethUsdFeed,
        IChainlinkAggregator quoteUsdFeed,
        address quoteToken,
        IUniswapV3Pool pool,
        Config memory cfg
    ) Ownable(owner_) {
        if (
            address(meta) == address(0) || address(metaUsdFeed) == address(0) || address(ethUsdFeed) == address(0)
                || address(quoteUsdFeed) == address(0) || quoteToken == address(0)
        ) revert InvalidConfig();
        META = meta;
        META_DECIMALS = meta.decimals();
        META_USD_FEED = metaUsdFeed;
        ETH_USD_FEED = ethUsdFeed;
        QUOTE_USD_FEED = quoteUsdFeed;
        QUOTE_TOKEN = quoteToken;
        QUOTE_DECIMALS = IERC20Metadata(quoteToken).decimals();
        _setConfig(cfg);
        _setPool(pool);
    }

    // ================================================================= admin

    function setConfig(Config calldata cfg) external onlyOwner {
        _setConfig(cfg);
    }

    function setTwapPool(IUniswapV3Pool pool) external onlyOwner {
        _setPool(pool);
    }

    function setSequencerUptimeFeed(IChainlinkAggregator feed) external onlyOwner {
        sequencerUptimeFeed = feed;
        emit SequencerFeedUpdated(address(feed));
    }

    function _setConfig(Config memory cfg) internal {
        if (
            cfg.maxStalenessOpen == 0 || cfg.maxStalenessClosed < cfg.maxStalenessOpen || cfg.ethMaxStaleness == 0
                || cfg.quoteMaxStaleness == 0 || cfg.twapWindow < 60 || cfg.fallbackValidity == 0
                || cfg.maxDeviationOpenBps == 0 || cfg.maxDeviationClosedBps < cfg.maxDeviationOpenBps
                || cfg.maxDeviationClosedBps > 5_000
        ) revert InvalidConfig();
        config = cfg;
        emit ConfigUpdated(cfg);
    }

    function _setPool(IUniswapV3Pool pool) internal {
        if (address(pool) != address(0)) {
            address t0 = pool.token0();
            address t1 = pool.token1();
            bool ok = (t0 == address(META) && t1 == QUOTE_TOKEN) || (t1 == address(META) && t0 == QUOTE_TOKEN);
            if (!ok) revert InvalidPool();
        }
        twapPool = pool;
        emit TwapPoolUpdated(address(pool));
    }

    // ================================================================= views

    function metaToken() external view returns (address) {
        return address(META);
    }

    /// @inheritdoc IMetaPriceOracle
    function getPrices() public view returns (Prices memory p) {
        Config memory cfg = config;
        _checkSequencer(cfg);

        (uint256 ethUsd, uint256 ethUpdatedAt) = _readEth(cfg);
        p.ethUsd = ethUsd;

        (bool clOk, uint256 clPrice, uint256 clUpdatedAt) = _readFeed(META_USD_FEED);
        (bool twapOk, uint256 twapPrice) = twapMetaUsd();
        bool issuerPaused = _issuerOraclePaused();

        uint256 age = clOk ? block.timestamp - clUpdatedAt : type(uint256).max;

        if (clOk && !issuerPaused && age <= cfg.maxStalenessClosed) {
            bool open = age <= cfg.maxStalenessOpen;
            p.mode = open ? Mode.Open : Mode.Closed;
            if (twapOk) {
                uint256 dev = _deviationBps(clPrice, twapPrice);
                uint256 maxDev = open ? cfg.maxDeviationOpenBps : cfg.maxDeviationClosedBps;
                if (dev > maxDev) revert PriceDeviation(clPrice, twapPrice, dev);
            } else if (!open || cfg.requireTwapWhenOpen) {
                revert TwapUnavailable();
            }
            p.metaUsd = clPrice;
            p.sourceTimestamp = uint48(clUpdatedAt);
            p.validUntil = uint48(clUpdatedAt + (open ? cfg.maxStalenessOpen : cfg.maxStalenessClosed));
        } else {
            if (!cfg.twapFallbackEnabled || !twapOk) revert NoValidPrice();
            p.mode = Mode.Fallback;
            p.metaUsd = twapPrice;
            p.sourceTimestamp = uint48(block.timestamp);
            p.validUntil = uint48(block.timestamp + cfg.fallbackValidity);
        }

        uint256 ethValidUntil = ethUpdatedAt + cfg.ethMaxStaleness;
        if (ethValidUntil < p.validUntil) p.validUntil = uint48(ethValidUntil);
    }

    /// @inheritdoc IMetaPriceOracle
    function usdValue(address token, uint256 amount) external view returns (uint256) {
        if (token == address(META)) {
            return amount * getPrices().metaUsd / (10 ** META_DECIMALS);
        }
        if (token == QUOTE_TOKEN) {
            (uint256 q,) = _readQuote(config);
            return amount * q / (10 ** QUOTE_DECIMALS);
        }
        revert UnsupportedToken(token);
    }

    /// @notice META/USD from the Uniswap V3 TWAP (18 decimals). Returns ok=false instead of reverting.
    function twapMetaUsd() public view returns (bool ok, uint256 priceUsd) {
        IUniswapV3Pool pool = twapPool;
        if (address(pool) == address(0)) return (false, 0);
        Config memory cfg = config;

        uint32[] memory secondsAgos = new uint32[](2);
        secondsAgos[0] = cfg.twapWindow;
        int56[] memory ticks;
        try pool.observe(secondsAgos) returns (int56[] memory tickCumulatives, uint160[] memory) {
            ticks = tickCumulatives;
        } catch {
            return (false, 0);
        }
        int56 delta = ticks[1] - ticks[0];
        int56 window = int56(uint56(cfg.twapWindow));
        int24 meanTick = int24(delta / window);
        if (delta < 0 && (delta % window != 0)) meanTick--; // round toward -inf, as OracleLibrary.consult

        uint256 quotePerMeta =
            OracleLibrary.getQuoteAtTick(meanTick, uint128(10 ** META_DECIMALS), address(META), QUOTE_TOKEN);

        (uint256 quoteUsd, bool quoteOk) = _readQuoteSoft(cfg);
        if (!quoteOk || quotePerMeta == 0) return (false, 0);
        // quotePerMeta has QUOTE_DECIMALS; quoteUsd has 18 decimals
        priceUsd = quotePerMeta * quoteUsd / (10 ** QUOTE_DECIMALS);
        return (true, priceUsd);
    }

    // ================================================================= internals

    function _checkSequencer(Config memory cfg) internal view {
        IChainlinkAggregator feed = sequencerUptimeFeed;
        if (address(feed) == address(0)) return;
        (, int256 answer, uint256 startedAt,,) = feed.latestRoundData();
        if (answer != 0) revert SequencerDown();
        if (block.timestamp - startedAt <= cfg.sequencerGracePeriod) revert SequencerGracePeriod();
    }

    function _readEth(Config memory cfg) internal view returns (uint256 price, uint256 updatedAt) {
        bool ok;
        (ok, price, updatedAt) = _readFeed(ETH_USD_FEED);
        if (!ok) revert InvalidEthPrice();
        if (block.timestamp - updatedAt > cfg.ethMaxStaleness) revert StaleEthPrice();
    }

    function _readQuote(Config memory cfg) internal view returns (uint256 price, bool ok) {
        (price, ok) = _readQuoteSoft(cfg);
        if (!ok) revert NoValidPrice();
    }

    function _readQuoteSoft(Config memory cfg) internal view returns (uint256 price, bool ok) {
        uint256 updatedAt;
        (ok, price, updatedAt) = _readFeed(QUOTE_USD_FEED);
        if (ok && block.timestamp - updatedAt > cfg.quoteMaxStaleness) ok = false;
    }

    /// @dev Reads a Chainlink feed and scales the answer to 18 decimals. Never reverts.
    function _readFeed(IChainlinkAggregator feed) internal view returns (bool ok, uint256 price, uint256 updatedAt) {
        try feed.latestRoundData() returns (uint80, int256 answer, uint256, uint256 updated, uint80) {
            if (answer <= 0 || updated == 0 || updated > block.timestamp) return (false, 0, 0);
            uint8 dec = feed.decimals();
            price = dec <= 18 ? uint256(answer) * 10 ** (18 - dec) : uint256(answer) / 10 ** (dec - 18);
            return (price != 0, price, updated);
        } catch {
            return (false, 0, 0);
        }
    }

    function _issuerOraclePaused() internal view returns (bool) {
        try META.oraclePaused() returns (bool p) {
            return p;
        } catch {
            return false;
        }
    }

    function _deviationBps(uint256 a, uint256 b) internal pure returns (uint256) {
        uint256 diff = a > b ? a - b : b - a;
        return diff * BPS / a;
    }
}
