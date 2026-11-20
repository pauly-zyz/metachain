// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test} from "forge-std/Test.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";
import {MessageHashUtils} from "@openzeppelin/contracts/utils/cryptography/MessageHashUtils.sol";
import {FullMath} from "@uniswap/v3-core/contracts/libraries/FullMath.sol";
import {TickMath} from "@uniswap/v3-core/contracts/libraries/TickMath.sol";
import {IUniswapV3Pool} from "@uniswap/v3-core/contracts/interfaces/IUniswapV3Pool.sol";

import {EntryPoint} from "account-abstraction/core/EntryPoint.sol";
import {IEntryPoint} from "account-abstraction/interfaces/IEntryPoint.sol";
import {PackedUserOperation} from "account-abstraction/interfaces/PackedUserOperation.sol";
import {SimpleAccount} from "account-abstraction/samples/SimpleAccount.sol";
import {SimpleAccountFactory} from "account-abstraction/samples/SimpleAccountFactory.sol";

import {MetaPriceOracle} from "../../src/oracle/MetaPriceOracle.sol";
import {MetaTokenPaymaster} from "../../src/MetaTokenPaymaster.sol";
import {IMetaPriceOracle} from "../../src/interfaces/IMetaPriceOracle.sol";
import {IStockToken} from "../../src/interfaces/IStockToken.sol";
import {IChainlinkAggregator} from "../../src/interfaces/IChainlinkAggregator.sol";
import {MockMETA} from "../../src/mocks/MockMETA.sol";
import {MockStablecoin} from "../../src/mocks/MockStablecoin.sol";
import {MockAggregator} from "../../src/mocks/MockAggregator.sol";
import {MockUniswapV3Pool} from "../../src/mocks/MockUniswapV3Pool.sol";

/// @dev Helper for blocking an account from inside a UserOperation (simulates issuer blocklisting mid-op).
contract Blocker {
    MockMETA internal immutable meta;

    constructor(MockMETA m) {
        meta = m;
    }

    function blockMe() external {
        meta.setBlocked(msg.sender, true);
    }
}

abstract contract BaseTest is Test {
    uint256 internal constant META_PRICE = 583.5e18; // USD per META
    uint256 internal constant ETH_PRICE = 1748.27e18; // USD per ETH

    address internal admin = makeAddr("admin");
    address internal bundler = makeAddr("bundler");
    address payable internal beneficiary = payable(makeAddr("beneficiary"));

    EntryPoint internal entryPoint;
    SimpleAccountFactory internal factory;
    MockMETA internal meta;
    MockStablecoin internal usdg;
    MockAggregator internal metaFeed;
    MockAggregator internal ethFeed;
    MockAggregator internal usdgFeed;
    MockUniswapV3Pool internal pool;
    MetaPriceOracle internal oracle;
    MetaTokenPaymaster internal paymaster;
    Blocker internal blocker;

    uint256 internal ownerKey;
    address internal accountOwner;
    SimpleAccount internal account;

    function setUp() public virtual {
        vm.warp(1_800_000_000);
        vm.fee(0.01 gwei);

        entryPoint = new EntryPoint();
        factory = new SimpleAccountFactory(IEntryPoint(address(entryPoint)));

        meta = new MockMETA(address(this));
        blocker = new Blocker(meta);
        usdg = new MockStablecoin(admin);

        metaFeed = new MockAggregator(address(this), 8, "Robinhood META / USD", int256(META_PRICE / 1e10));
        ethFeed = new MockAggregator(address(this), 8, "ETH / USD", int256(ETH_PRICE / 1e10));
        usdgFeed = new MockAggregator(address(this), 8, "USDG / USD", 1e8);
        pool = new MockUniswapV3Pool(address(this), address(meta), address(usdg), tickForPrice(META_PRICE));

        oracle = new MetaPriceOracle(
            admin,
            IStockToken(address(meta)),
            IChainlinkAggregator(address(metaFeed)),
            IChainlinkAggregator(address(ethFeed)),
            IChainlinkAggregator(address(usdgFeed)),
            address(usdg),
            IUniswapV3Pool(address(pool)),
            defaultOracleConfig()
        );

        paymaster = new MetaTokenPaymaster(
            IEntryPoint(address(entryPoint)),
            IStockToken(address(meta)),
            IMetaPriceOracle(address(oracle)),
            admin,
            defaultFees(),
            MetaTokenPaymaster.UserLimit({maxUsdPerPeriod: 0, period: 0})
        );
        vm.deal(admin, 10 ether);
        vm.startPrank(admin);
        paymaster.deposit{value: 1 ether}();
        paymaster.addStake{value: 0.1 ether}(1 days);
        vm.stopPrank();

        (accountOwner, ownerKey) = makeAddrAndKey("accountOwner");
        account = factory.createAccount(accountOwner, 0);
        meta.mint(address(account), 10e18);
        vm.prank(accountOwner);
        account.execute(address(meta), 0, abi.encodeCall(meta.approve, (address(paymaster), type(uint256).max)));
    }

    // ------------------------------------------------------------------ config helpers

    function defaultOracleConfig() internal pure returns (MetaPriceOracle.Config memory) {
        return MetaPriceOracle.Config({
            maxStalenessOpen: 1 hours,
            maxStalenessClosed: 80 hours,
            ethMaxStaleness: 25 hours,
            quoteMaxStaleness: 25 hours,
            twapWindow: 30 minutes,
            fallbackValidity: 5 minutes,
            sequencerGracePeriod: 1 hours,
            maxDeviationOpenBps: 300,
            maxDeviationClosedBps: 800,
            twapFallbackEnabled: true,
            requireTwapWhenOpen: false
        });
    }

    function defaultFees() internal pure returns (MetaTokenPaymaster.FeeConfig memory) {
        return MetaTokenPaymaster.FeeConfig({
            markupBps: 500,
            closedExtraBps: 500,
            fallbackExtraBps: 1000,
            postOpOverheadGas: 65_000,
            maxUsdPerOpOpen: 5e18,
            maxUsdPerOpRestricted: 1e18
        });
    }

    // ------------------------------------------------------------------ price helpers

    /// @dev Tick of the META/USDG pool for a given USD price (assuming USDG = $1).
    function tickForPrice(uint256 usdPerMeta) internal view returns (int24) {
        // raw USDG units per raw META unit = usdPerMeta * 1e6 / 1e36
        uint256 num = usdPerMeta * 1e6;
        uint256 den = 1e36;
        bool metaIsToken0 = address(meta) < address(usdg);
        uint256 ratioX192 = metaIsToken0 ? FullMath.mulDiv(num, 1 << 192, den) : FullMath.mulDiv(den, 1 << 192, num);
        uint160 sqrtP = uint160(Math.sqrt(ratioX192));
        return TickMath.getTickAtSqrtRatio(sqrtP);
    }

    function setMetaPrice(uint256 usdPerMeta) internal {
        metaFeed.setAnswer(int256(usdPerMeta / 1e10));
    }

    function setTwapPrice(uint256 usdPerMeta) internal {
        pool.setTick(tickForPrice(usdPerMeta));
        vm.warp(block.timestamp + 31 minutes); // let the TWAP window fully absorb the new tick
        // keep chainlink feeds fresh relative to the warp
        metaFeed.setAnswerAt(metaAnswer(), block.timestamp);
        ethFeed.setAnswerAt(ethAnswer(), block.timestamp);
        usdgFeed.setAnswerAt(1e8, block.timestamp);
    }

    function metaAnswer() internal view returns (int256 a) {
        (, a,,,) = metaFeed.latestRoundData();
    }

    function ethAnswer() internal view returns (int256 a) {
        (, a,,,) = ethFeed.latestRoundData();
    }

    function refreshFeeds() internal {
        metaFeed.setAnswerAt(metaAnswer(), block.timestamp);
        ethFeed.setAnswerAt(ethAnswer(), block.timestamp);
        usdgFeed.setAnswerAt(1e8, block.timestamp);
    }

    // ------------------------------------------------------------------ userop helpers

    function buildOp(SimpleAccount acct, bytes memory callData, bytes memory pmData)
        internal
        view
        returns (PackedUserOperation memory op)
    {
        op.sender = address(acct);
        op.nonce = entryPoint.getNonce(address(acct), 0);
        op.initCode = "";
        op.callData = callData;
        op.accountGasLimits = bytes32((uint256(150_000) << 128) | uint256(100_000));
        op.preVerificationGas = 50_000;
        op.gasFees = bytes32((uint256(0.001 gwei) << 128) | uint256(0.02 gwei));
        op.paymasterAndData =
            abi.encodePacked(address(paymaster), uint128(120_000), uint128(120_000), pmData);
    }

    function sign(PackedUserOperation memory op, uint256 key) internal view returns (PackedUserOperation memory) {
        bytes32 h = MessageHashUtils.toEthSignedMessageHash(entryPoint.getUserOpHash(op));
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(key, h);
        op.signature = abi.encodePacked(r, s, v);
        return op;
    }

    function handle(PackedUserOperation memory op) internal {
        PackedUserOperation[] memory ops = new PackedUserOperation[](1);
        ops[0] = op;
        vm.prank(bundler, bundler);
        entryPoint.handleOps(ops, beneficiary);
    }

    function noopCall() internal pure returns (bytes memory) {
        return abi.encodeCall(SimpleAccount.execute, (address(0xdead), 0, ""));
    }

    /// @dev Worst-case cost in wei of `op` as computed by EntryPoint v0.7 (requiredPrefund).
    function maxCostOf(PackedUserOperation memory op) internal pure returns (uint256) {
        uint256 verificationGas = uint256(op.accountGasLimits) >> 128;
        uint256 callGas = uint128(uint256(op.accountGasLimits));
        uint256 pmVer = uint128(bytes16(_slice(op.paymasterAndData, 20, 16)));
        uint256 pmPost = uint128(bytes16(_slice(op.paymasterAndData, 36, 16)));
        uint256 maxFee = uint128(uint256(op.gasFees));
        return (verificationGas + callGas + pmVer + pmPost + op.preVerificationGas) * maxFee;
    }

    function _slice(bytes memory b, uint256 start, uint256 len) internal pure returns (bytes memory out) {
        out = new bytes(len);
        for (uint256 i; i < len; ++i) {
            out[i] = b[start + i];
        }
    }
}
