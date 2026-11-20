// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {IUniswapV3Pool} from "@uniswap/v3-core/contracts/interfaces/IUniswapV3Pool.sol";
import {BaseTest} from "./utils/BaseTest.sol";
import {MetaPriceOracle} from "../src/oracle/MetaPriceOracle.sol";
import {IMetaPriceOracle} from "../src/interfaces/IMetaPriceOracle.sol";
import {IChainlinkAggregator} from "../src/interfaces/IChainlinkAggregator.sol";
import {MockAggregator} from "../src/mocks/MockAggregator.sol";
import {MockUniswapV3Pool} from "../src/mocks/MockUniswapV3Pool.sol";
import {IStockToken} from "../src/interfaces/IStockToken.sol";

contract MetaPriceOracleTest is BaseTest {
    function _absDiffBps(uint256 a, uint256 b) internal pure returns (uint256) {
        return (a > b ? a - b : b - a) * 10_000 / b;
    }

    // ------------------------------------------------------------------ modes

    function test_OpenMode_UsesChainlink() public view {
        IMetaPriceOracle.Prices memory p = oracle.getPrices();
        assertEq(uint8(p.mode), uint8(IMetaPriceOracle.Mode.Open));
        assertEq(p.metaUsd, META_PRICE);
        assertEq(p.ethUsd, ETH_PRICE);
        assertEq(p.validUntil, block.timestamp + 1 hours);
        assertEq(p.sourceTimestamp, block.timestamp);
    }

    function test_ClosedMode_WhenChainlinkOlderThanOpenWindow() public {
        uint256 updated = block.timestamp;
        vm.warp(block.timestamp + 2 hours);
        ethFeed.setAnswerAt(ethAnswer(), block.timestamp);
        usdgFeed.setAnswerAt(1e8, block.timestamp);
        IMetaPriceOracle.Prices memory p = oracle.getPrices();
        assertEq(uint8(p.mode), uint8(IMetaPriceOracle.Mode.Closed));
        assertEq(p.metaUsd, META_PRICE);
        // bounded by META updatedAt + 80h, but also by ETH updatedAt + 25h
        assertEq(p.validUntil, block.timestamp + 25 hours);
        assertLt(p.validUntil, updated + 80 hours);
    }

    function test_ClosedMode_WeekendGap() public {
        // Friday close → Sunday reopen ~ 48h without Chainlink updates
        vm.warp(block.timestamp + 48 hours);
        ethFeed.setAnswerAt(ethAnswer(), block.timestamp);
        usdgFeed.setAnswerAt(1e8, block.timestamp);
        IMetaPriceOracle.Prices memory p = oracle.getPrices();
        assertEq(uint8(p.mode), uint8(IMetaPriceOracle.Mode.Closed));
    }

    function test_ClosedMode_RequiresTwap() public {
        vm.prank(admin);
        oracle.setTwapPool(IUniswapV3Pool(address(0)));
        vm.warp(block.timestamp + 2 hours);
        ethFeed.setAnswerAt(ethAnswer(), block.timestamp);
        vm.expectRevert(MetaPriceOracle.TwapUnavailable.selector);
        oracle.getPrices();
    }

    function test_OpenMode_WithoutTwap_AllowedByDefault() public {
        vm.prank(admin);
        oracle.setTwapPool(IUniswapV3Pool(address(0)));
        IMetaPriceOracle.Prices memory p = oracle.getPrices();
        assertEq(uint8(p.mode), uint8(IMetaPriceOracle.Mode.Open));
    }

    function test_OpenMode_WithoutTwap_RejectedWhenRequired() public {
        MetaPriceOracle.Config memory c = defaultOracleConfig();
        c.requireTwapWhenOpen = true;
        vm.startPrank(admin);
        oracle.setConfig(c);
        oracle.setTwapPool(IUniswapV3Pool(address(0)));
        vm.stopPrank();
        vm.expectRevert(MetaPriceOracle.TwapUnavailable.selector);
        oracle.getPrices();
    }

    function test_Fallback_WhenChainlinkTooStale() public {
        vm.warp(block.timestamp + 81 hours);
        ethFeed.setAnswerAt(ethAnswer(), block.timestamp);
        usdgFeed.setAnswerAt(1e8, block.timestamp);
        IMetaPriceOracle.Prices memory p = oracle.getPrices();
        assertEq(uint8(p.mode), uint8(IMetaPriceOracle.Mode.Fallback));
        assertLt(_absDiffBps(p.metaUsd, META_PRICE), 2); // tick granularity = 1bp
        assertEq(p.validUntil, block.timestamp + 5 minutes);
    }

    function test_Fallback_DisabledReverts() public {
        MetaPriceOracle.Config memory c = defaultOracleConfig();
        c.twapFallbackEnabled = false;
        vm.prank(admin);
        oracle.setConfig(c);
        vm.warp(block.timestamp + 81 hours);
        ethFeed.setAnswerAt(ethAnswer(), block.timestamp);
        usdgFeed.setAnswerAt(1e8, block.timestamp);
        vm.expectRevert(MetaPriceOracle.NoValidPrice.selector);
        oracle.getPrices();
    }

    function test_Fallback_WhenIssuerOraclePaused() public {
        meta.setOraclePaused(true);
        IMetaPriceOracle.Prices memory p = oracle.getPrices();
        assertEq(uint8(p.mode), uint8(IMetaPriceOracle.Mode.Fallback));
    }

    function test_Fallback_InvalidChainlinkAnswer() public {
        metaFeed.setAnswer(0);
        assertEq(uint8(oracle.getPrices().mode), uint8(IMetaPriceOracle.Mode.Fallback));
        metaFeed.setAnswer(-1);
        assertEq(uint8(oracle.getPrices().mode), uint8(IMetaPriceOracle.Mode.Fallback));
    }

    function test_Fallback_FutureTimestampTreatedInvalid() public {
        metaFeed.setAnswerAt(int256(META_PRICE / 1e10), block.timestamp + 1);
        assertEq(uint8(oracle.getPrices().mode), uint8(IMetaPriceOracle.Mode.Fallback));
    }

    function test_NoPrice_WhenChainlinkStaleAndTwapUnavailable() public {
        pool.setMaxAge(10 minutes); // observe(1800) reverts "OLD"
        vm.warp(block.timestamp + 81 hours);
        ethFeed.setAnswerAt(ethAnswer(), block.timestamp);
        usdgFeed.setAnswerAt(1e8, block.timestamp);
        vm.expectRevert(MetaPriceOracle.NoValidPrice.selector);
        oracle.getPrices();
    }

    function test_TwapUnavailable_WhenQuoteFeedStale() public {
        vm.warp(block.timestamp + 26 hours);
        ethFeed.setAnswerAt(ethAnswer(), block.timestamp);
        metaFeed.setAnswerAt(metaAnswer(), block.timestamp);
        (bool ok,) = oracle.twapMetaUsd();
        assertFalse(ok);
        // Open mode still works (TWAP optional when open)
        assertEq(uint8(oracle.getPrices().mode), uint8(IMetaPriceOracle.Mode.Open));
    }

    // ------------------------------------------------------------------ circuit breaker

    function test_CircuitBreaker_OpenDeviationAbove3pct() public {
        setTwapPrice(META_PRICE * 104 / 100);
        vm.expectRevert();
        oracle.getPrices();
    }

    function test_CircuitBreaker_OpenDeviationBelow3pctPasses() public {
        setTwapPrice(META_PRICE * 102 / 100);
        assertEq(oracle.getPrices().metaUsd, META_PRICE);
    }

    function test_CircuitBreaker_ClosedAllowsUpTo8pct() public {
        setTwapPrice(META_PRICE * 105 / 100);
        vm.warp(block.timestamp + 2 hours); // chainlink becomes "closed"
        ethFeed.setAnswerAt(ethAnswer(), block.timestamp);
        usdgFeed.setAnswerAt(1e8, block.timestamp);
        IMetaPriceOracle.Prices memory p = oracle.getPrices();
        assertEq(uint8(p.mode), uint8(IMetaPriceOracle.Mode.Closed));
        assertEq(p.metaUsd, META_PRICE);
    }

    function test_CircuitBreaker_ClosedRejectsAbove8pct() public {
        setTwapPrice(META_PRICE * 110 / 100);
        vm.warp(block.timestamp + 2 hours);
        ethFeed.setAnswerAt(ethAnswer(), block.timestamp);
        usdgFeed.setAnswerAt(1e8, block.timestamp);
        vm.expectRevert();
        oracle.getPrices();
    }

    /// @notice A short spot manipulation barely moves a 30-min TWAP: pushing the pool +50% for 60 seconds
    ///         moves the TWAP ~ +1.4%, which stays within bounds and the Chainlink price is used.
    function test_Manipulation_ShortSpikeDampenedByTwap() public {
        vm.warp(block.timestamp + 30 minutes);
        refreshFeeds();
        pool.setTick(tickForPrice(META_PRICE * 150 / 100));
        vm.warp(block.timestamp + 60);
        refreshFeeds();
        (bool ok, uint256 twap) = oracle.twapMetaUsd();
        assertTrue(ok);
        assertLt(_absDiffBps(twap, META_PRICE), 300);
        assertEq(oracle.getPrices().metaUsd, META_PRICE);
    }

    /// @notice A sustained manipulation (or a real dislocation) trips the breaker instead of being priced.
    function test_Manipulation_SustainedTripsBreaker() public {
        pool.setTick(tickForPrice(META_PRICE / 2));
        vm.warp(block.timestamp + 20 minutes);
        refreshFeeds();
        vm.expectRevert();
        oracle.getPrices();
    }

    // ------------------------------------------------------------------ eth / sequencer

    function test_StaleEthReverts() public {
        ethFeed.setAnswerAt(ethAnswer(), block.timestamp - 26 hours);
        vm.expectRevert(MetaPriceOracle.StaleEthPrice.selector);
        oracle.getPrices();
    }

    function test_InvalidEthReverts() public {
        ethFeed.setAnswer(0);
        vm.expectRevert(MetaPriceOracle.InvalidEthPrice.selector);
        oracle.getPrices();
    }

    function test_ValidUntilBoundedByEthStaleness() public {
        ethFeed.setAnswerAt(ethAnswer(), block.timestamp - 24.5 hours);
        IMetaPriceOracle.Prices memory p = oracle.getPrices();
        assertEq(p.validUntil, block.timestamp + 30 minutes);
    }

    function test_SequencerDown() public {
        MockAggregator seq = new MockAggregator(address(this), 0, "seq", 1);
        vm.prank(admin);
        oracle.setSequencerUptimeFeed(IChainlinkAggregator(address(seq)));
        vm.expectRevert(MetaPriceOracle.SequencerDown.selector);
        oracle.getPrices();
    }

    function test_SequencerGracePeriod() public {
        MockAggregator seq = new MockAggregator(address(this), 0, "seq", 0);
        vm.prank(admin);
        oracle.setSequencerUptimeFeed(IChainlinkAggregator(address(seq)));
        vm.expectRevert(MetaPriceOracle.SequencerGracePeriod.selector);
        oracle.getPrices();
        seq.setStartedAt(block.timestamp - 2 hours);
        assertEq(oracle.getPrices().metaUsd, META_PRICE);
    }

    // ------------------------------------------------------------------ admin / config

    function test_OnlyOwnerAdmin() public {
        vm.expectRevert();
        oracle.setConfig(defaultOracleConfig());
        vm.expectRevert();
        oracle.setTwapPool(IUniswapV3Pool(address(0)));
        vm.expectRevert();
        oracle.setSequencerUptimeFeed(IChainlinkAggregator(address(0)));
    }

    function test_RejectsBadConfig() public {
        MetaPriceOracle.Config memory c = defaultOracleConfig();
        c.maxStalenessClosed = 10 minutes; // < open
        vm.prank(admin);
        vm.expectRevert(MetaPriceOracle.InvalidConfig.selector);
        oracle.setConfig(c);
    }

    function test_RejectsPoolWithWrongTokens() public {
        MockUniswapV3Pool bad = new MockUniswapV3Pool(address(this), address(meta), address(0xBEEF), 0);
        vm.prank(admin);
        vm.expectRevert(MetaPriceOracle.InvalidPool.selector);
        oracle.setTwapPool(IUniswapV3Pool(address(bad)));
    }

    function test_UsdValue() public view {
        assertEq(oracle.usdValue(address(meta), 2e18), 2 * META_PRICE);
        assertEq(oracle.usdValue(address(usdg), 5e6), 5e18);
    }

    function test_UsdValue_UnsupportedToken() public {
        vm.expectRevert(abi.encodeWithSelector(MetaPriceOracle.UnsupportedToken.selector, address(0xBEEF)));
        oracle.usdValue(address(0xBEEF), 1);
    }

    // ------------------------------------------------------------------ fuzz

    /// @notice TWAP → USD conversion matches the pool price within tick granularity for any realistic price.
    function testFuzz_TwapConversionAccuracy(uint256 price) public {
        price = bound(price, 1e16, 100_000e18); // $0.01 .. $100k
        pool.setTick(tickForPrice(price));
        vm.warp(block.timestamp + 31 minutes);
        refreshFeeds();
        (bool ok, uint256 twap) = oracle.twapMetaUsd();
        assertTrue(ok);
        assertLe(_absDiffBps(twap, price), 2);
    }

    /// @notice Breaker decision is exactly "deviation > bound" in open mode.
    function testFuzz_OpenBreakerBoundary(uint256 bps) public {
        bps = bound(bps, 0, 1_000);
        uint256 twapPrice = META_PRICE * (10_000 + bps) / 10_000;
        setTwapPrice(twapPrice);
        (, uint256 twap) = oracle.twapMetaUsd();
        uint256 actualDev = (twap > META_PRICE ? twap - META_PRICE : META_PRICE - twap) * 10_000 / META_PRICE;
        if (actualDev > 300) {
            vm.expectRevert();
            oracle.getPrices();
        } else {
            assertEq(oracle.getPrices().metaUsd, META_PRICE);
        }
    }

    function testFuzz_FeedDecimalsScaling(uint8 dec, uint64 rawAnswer) public {
        dec = uint8(bound(dec, 0, 24));
        vm.assume(rawAnswer > 0);
        MockAggregator f = new MockAggregator(address(this), dec, "x", int256(uint256(rawAnswer)));
        MetaPriceOracle o = new MetaPriceOracle(
            admin,
            IStockToken(address(meta)),
            IChainlinkAggregator(address(f)),
            IChainlinkAggregator(address(ethFeed)),
            IChainlinkAggregator(address(usdgFeed)),
            address(usdg),
            IUniswapV3Pool(address(0)),
            defaultOracleConfig()
        );
        uint256 expected = dec <= 18 ? uint256(rawAnswer) * 10 ** (18 - dec) : uint256(rawAnswer) / 10 ** (dec - 18);
        if (expected == 0) {
            vm.expectRevert(MetaPriceOracle.NoValidPrice.selector);
            o.getPrices();
        } else {
            assertEq(o.getPrices().metaUsd, expected);
        }
    }
}
