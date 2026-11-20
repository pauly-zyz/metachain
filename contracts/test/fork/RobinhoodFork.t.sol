// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Test, console2} from "forge-std/Test.sol";
import {MessageHashUtils} from "@openzeppelin/contracts/utils/cryptography/MessageHashUtils.sol";
import {IUniswapV3Pool} from "@uniswap/v3-core/contracts/interfaces/IUniswapV3Pool.sol";
import {IEntryPoint} from "account-abstraction/interfaces/IEntryPoint.sol";
import {PackedUserOperation} from "account-abstraction/interfaces/PackedUserOperation.sol";
import {SimpleAccount} from "account-abstraction/samples/SimpleAccount.sol";
import {SimpleAccountFactory} from "account-abstraction/samples/SimpleAccountFactory.sol";

import {MetaPriceOracle} from "../../src/oracle/MetaPriceOracle.sol";
import {MetaTokenPaymaster} from "../../src/MetaTokenPaymaster.sol";
import {IMetaPriceOracle} from "../../src/interfaces/IMetaPriceOracle.sol";
import {IStockToken} from "../../src/interfaces/IStockToken.sol";
import {IChainlinkAggregator} from "../../src/interfaces/IChainlinkAggregator.sol";
import {RobinhoodMainnet as RH, RobinhoodShared} from "../../script/RobinhoodAddresses.sol";

/// @notice Read-only fork tests against Robinhood Chain mainnet. Nothing is broadcast.
///         Run: ROBINHOOD_RPC_URL=https://rpc.mainnet.chain.robinhood.com forge test --match-path test/fork/*
contract RobinhoodForkTest is Test {
    IStockToken internal meta = IStockToken(RH.META);
    IEntryPoint internal entryPoint = IEntryPoint(RH.ENTRYPOINT_V07);
    MetaPriceOracle internal oracle;
    MetaTokenPaymaster internal paymaster;
    address internal admin = makeAddr("admin");
    bool internal forked;

    function setUp() public {
        string memory rpc = vm.envOr("ROBINHOOD_RPC_URL", string(""));
        if (bytes(rpc).length == 0) return;
        uint256 forkBlock = vm.envOr("ROBINHOOD_FORK_BLOCK", uint256(0));
        if (forkBlock == 0) vm.createSelectFork(rpc);
        else vm.createSelectFork(rpc, forkBlock);
        forked = true;

        oracle = new MetaPriceOracle(
            admin,
            meta,
            IChainlinkAggregator(RH.CL_META_USD),
            IChainlinkAggregator(RH.CL_ETH_USD),
            IChainlinkAggregator(RH.CL_USDG_USD),
            RH.USDG,
            IUniswapV3Pool(RH.UNI_V3_META_USDG_3000),
            MetaPriceOracle.Config({
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
            })
        );
        paymaster = new MetaTokenPaymaster(
            entryPoint,
            meta,
            IMetaPriceOracle(address(oracle)),
            admin,
            MetaTokenPaymaster.FeeConfig({
                markupBps: 500,
                closedExtraBps: 500,
                fallbackExtraBps: 1000,
                postOpOverheadGas: 65_000,
                maxUsdPerOpOpen: 5e18,
                maxUsdPerOpRestricted: 1e18
            }),
            MetaTokenPaymaster.UserLimit(0, 0)
        );
        vm.deal(admin, 1 ether);
        vm.startPrank(admin);
        paymaster.deposit{value: 0.1 ether}();
        paymaster.addStake{value: 0.01 ether}(1 days);
        vm.stopPrank();
    }

    modifier onlyFork() {
        if (!forked) {
            vm.skip(true);
            return;
        }
        _;
    }

    function test_Fork_VerifiedContractsHaveCode() public onlyFork {
        assertEq(block.chainid, RH.CHAIN_ID);
        address[9] memory addrs = [
            RH.META,
            RH.USDG,
            RH.CL_META_USD,
            RH.CL_ETH_USD,
            RH.CL_USDG_USD,
            RH.UNI_V3_META_USDG_3000,
            RH.ENTRYPOINT_V07,
            RobinhoodShared.KERNEL_V3_1_FACTORY,
            RobinhoodShared.SMART_SESSIONS
        ];
        for (uint256 i; i < addrs.length; ++i) {
            assertGt(addrs[i].code.length, 0);
        }
        assertEq(meta.decimals(), 18);
        assertEq(IChainlinkAggregator(RH.CL_META_USD).decimals(), 8);
    }

    function test_Fork_OraclePricesAreSane() public onlyFork {
        IMetaPriceOracle.Prices memory p = oracle.getPrices();
        (, int256 clAnswer,,,) = IChainlinkAggregator(RH.CL_META_USD).latestRoundData();
        (bool twapOk, uint256 twap) = oracle.twapMetaUsd();
        console2.log("mode", uint8(p.mode));
        console2.log("META/USD (1e18)", p.metaUsd);
        console2.log("ETH/USD  (1e18)", p.ethUsd);
        console2.log("TWAP ok", twapOk);
        console2.log("TWAP META/USD (1e18)", twap);
        console2.log("validUntil", p.validUntil);
        if (p.mode != IMetaPriceOracle.Mode.Fallback) assertEq(p.metaUsd, uint256(clAnswer) * 1e10);
        assertTrue(twapOk, "V3 TWAP must be readable (cardinality 3601)");
        assertGt(p.ethUsd, 100e18);
        assertGt(p.validUntil, block.timestamp);
    }

    /// @notice Confirms the real META token is not fee-on-transfer and can be moved to/from contracts.
    function test_Fork_MetaTransfersToContractsExactly() public onlyFork {
        address holder = RH.UNI_V3_META_USDG_3000; // pool contract holding META
        SimpleAccountFactory factory = new SimpleAccountFactory(entryPoint);
        SimpleAccount acct = factory.createAccount(makeAddr("o"), 1);

        uint256 hb = meta.balanceOf(holder);
        vm.prank(holder);
        meta.transfer(address(acct), 1e18);
        assertEq(meta.balanceOf(address(acct)), 1e18, "received exact amount");
        assertEq(hb - meta.balanceOf(holder), 1e18, "sent exact amount");
        assertEq(meta.totalSupply(), meta.totalSupply());

        // contract → paymaster via transferFrom (the paymaster pre-charge path)
        vm.prank(address(acct));
        meta.approve(address(this), 0.4e18);
        meta.transferFrom(address(acct), address(paymaster), 0.4e18);
        assertEq(meta.balanceOf(address(paymaster)), 0.4e18);
        assertEq(meta.balanceOf(address(acct)), 0.6e18);
    }

    /// @notice Full ERC-4337 flow on the real EntryPoint v0.7 with real META, Chainlink and Uniswap V3 TWAP.
    function test_Fork_EndToEndUserOpPaidInMeta() public onlyFork {
        (address owner, uint256 key) = makeAddrAndKey("forkOwner");
        SimpleAccountFactory factory = new SimpleAccountFactory(entryPoint);
        SimpleAccount acct = factory.createAccount(owner, 7);
        vm.prank(RH.UNI_V3_META_USDG_3000);
        meta.transfer(address(acct), 0.5e18);
        vm.prank(owner);
        acct.execute(RH.META, 0, abi.encodeCall(meta.approve, (address(paymaster), type(uint256).max)));

        paymaster.updatePrice();

        uint256 basefee = block.basefee == 0 ? 0.01 gwei : block.basefee;
        PackedUserOperation memory op;
        op.sender = address(acct);
        op.nonce = entryPoint.getNonce(address(acct), 0);
        op.callData = abi.encodeCall(SimpleAccount.execute, (address(0xdead), 0, ""));
        op.accountGasLimits = bytes32((uint256(150_000) << 128) | uint256(60_000));
        op.preVerificationGas = 60_000;
        op.gasFees = bytes32((uint256(0) << 128) | uint256(basefee * 2));
        op.paymasterAndData = abi.encodePacked(address(paymaster), uint128(150_000), uint128(120_000));
        bytes32 h = MessageHashUtils.toEthSignedMessageHash(entryPoint.getUserOpHash(op));
        (uint8 v, bytes32 r, bytes32 s) = vm.sign(key, h);
        op.signature = abi.encodePacked(r, s, v);

        PackedUserOperation[] memory ops = new PackedUserOperation[](1);
        ops[0] = op;
        uint256 before = meta.balanceOf(address(acct));
        vm.fee(basefee);
        vm.prank(makeAddr("bundler"), makeAddr("bundler"));
        entryPoint.handleOps(ops, payable(makeAddr("beneficiary")));

        uint256 paid = before - meta.balanceOf(address(acct));
        console2.log("META paid for gas (wei units)", paid);
        assertGt(paid, 0);
        assertEq(meta.balanceOf(address(paymaster)), paid);
        assertEq(paymaster.totalOps(), 1);
        // Gas on Robinhood Chain is cents: the META charged must be worth < $1
        (uint128 metaUsd,,,,) = paymaster.priceCache();
        assertLt(paid * metaUsd / 1e18, 1e18);
    }
}
