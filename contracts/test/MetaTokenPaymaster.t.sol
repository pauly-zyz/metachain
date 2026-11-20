// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Vm} from "forge-std/Vm.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IEntryPoint} from "account-abstraction/interfaces/IEntryPoint.sol";
import {PackedUserOperation} from "account-abstraction/interfaces/PackedUserOperation.sol";
import {SimpleAccount} from "account-abstraction/samples/SimpleAccount.sol";

import {BaseTest, Blocker} from "./utils/BaseTest.sol";
import {MetaTokenPaymaster} from "../src/MetaTokenPaymaster.sol";
import {IMetaPriceOracle} from "../src/interfaces/IMetaPriceOracle.sol";
import {IStockToken} from "../src/interfaces/IStockToken.sol";
import {MetaPriceOracle} from "../src/oracle/MetaPriceOracle.sol";

contract MetaTokenPaymasterTest is BaseTest {
    bytes32 internal constant GAS_PAID_SIG =
        keccak256("MetaGasPaid(address,bytes32,uint256,uint256,uint256,uint256,uint256,uint8)");

    function setUp() public override {
        super.setUp();
        paymaster.updatePrice();
    }

    function _expectedMeta(uint256 gasCostWei, uint256 markupBps) internal pure returns (uint256) {
        uint256 usd = Math.mulDiv(gasCostWei, ETH_PRICE, 1e18, Math.Rounding.Ceil);
        return Math.mulDiv(usd * (10_000 + markupBps), 1e18, META_PRICE * 10_000, Math.Rounding.Ceil);
    }

    function _gasPaidEvent(Vm.Log[] memory logs)
        internal
        pure
        returns (uint256 charged, uint256 gasCostWei, uint8 mode)
    {
        for (uint256 i; i < logs.length; ++i) {
            if (logs[i].topics[0] == GAS_PAID_SIG) {
                (charged, gasCostWei,,,, mode) =
                    abi.decode(logs[i].data, (uint256, uint256, uint256, uint256, uint256, uint8));
                return (charged, gasCostWei, mode);
            }
        }
        revert("no MetaGasPaid");
    }

    // ------------------------------------------------------------------ happy path

    function test_PaysGasInMeta_WithRefund() public {
        PackedUserOperation memory op = sign(buildOp(account, noopCall(), ""), ownerKey);
        uint256 userBefore = meta.balanceOf(address(account));
        uint256 pmBefore = meta.balanceOf(address(paymaster));
        uint256 depositBefore = paymaster.getDeposit();

        vm.recordLogs();
        handle(op);
        (uint256 charged, uint256 gasCostWei, uint8 mode) = _gasPaidEvent(vm.getRecordedLogs());

        uint256 userPaid = userBefore - meta.balanceOf(address(account));
        assertEq(userPaid, charged, "user paid == charged");
        assertEq(meta.balanceOf(address(paymaster)) - pmBefore, charged, "paymaster received == charged");
        assertGt(charged, 0);
        assertEq(mode, uint8(IMetaPriceOracle.Mode.Open));
        assertEq(charged, _expectedMeta(gasCostWei, 500), "charged == usd-pegged formula");
        // charged must be well below the worst-case pre-charge
        assertLt(charged, _expectedMeta(maxCostOf(op), 500));
        // ETH deposit decreased (paymaster paid the bundler)
        assertLt(paymaster.getDeposit(), depositBefore);
        assertEq(paymaster.totalOps(), 1);
        assertEq(paymaster.totalMetaCollected(), charged);
    }

    function test_ChargeCoversRealGasCost() public {
        PackedUserOperation memory op = sign(buildOp(account, noopCall(), ""), ownerKey);
        uint256 depositBefore = paymaster.getDeposit();
        vm.recordLogs();
        handle(op);
        (uint256 charged, uint256 gasCostWei,) = _gasPaidEvent(vm.getRecordedLogs());
        uint256 ethSpent = depositBefore - paymaster.getDeposit();
        // the overhead estimate must cover what the EntryPoint actually debited
        assertGe(gasCostWei, ethSpent, "postOpOverheadGas too low");
        // and USD value of META charged >= USD value of ETH spent
        assertGe(charged * META_PRICE / 1e18, ethSpent * ETH_PRICE / 1e18);
    }

    function test_ClosedMode_AppliesExtraMarkup() public {
        vm.warp(block.timestamp + 2 hours);
        ethFeed.setAnswerAt(ethAnswer(), block.timestamp);
        usdgFeed.setAnswerAt(1e8, block.timestamp);
        paymaster.updatePrice();
        (,,,, IMetaPriceOracle.Mode m) = paymaster.priceCache();
        assertEq(uint8(m), uint8(IMetaPriceOracle.Mode.Closed));

        PackedUserOperation memory op = sign(buildOp(account, noopCall(), ""), ownerKey);
        vm.recordLogs();
        handle(op);
        (uint256 charged, uint256 gasCostWei, uint8 mode) = _gasPaidEvent(vm.getRecordedLogs());
        assertEq(mode, uint8(IMetaPriceOracle.Mode.Closed));
        assertEq(charged, _expectedMeta(gasCostWei, 1000));
    }

    function test_MaxMetaCostGuard_Accepts() public {
        PackedUserOperation memory op = buildOp(account, noopCall(), abi.encode(uint256(1e18)));
        handle(sign(op, ownerKey));
        assertEq(paymaster.totalOps(), 1);
    }

    function test_MaxMetaCostGuard_Rejects() public {
        PackedUserOperation memory op = buildOp(account, noopCall(), abi.encode(uint256(1)));
        op = sign(op, ownerKey);
        uint256 required = _expectedMeta(maxCostOf(op), 500);
        vm.expectRevert(
            abi.encodeWithSelector(
                IEntryPoint.FailedOpWithRevert.selector,
                0,
                "AA33 reverted",
                abi.encodeWithSelector(MetaTokenPaymaster.MaxMetaCostExceeded.selector, required, 1)
            )
        );
        handle(op);
    }

    function test_RejectsMalformedPaymasterData() public {
        PackedUserOperation memory op = sign(buildOp(account, noopCall(), hex"01"), ownerKey);
        vm.expectPartialRevert(IEntryPoint.FailedOpWithRevert.selector);
        handle(op);
    }

    // ------------------------------------------------------------------ failure modes

    function test_RevertsWhenPriceNotInitialized() public {
        MetaTokenPaymaster fresh = new MetaTokenPaymaster(
            IEntryPoint(address(entryPoint)),
            IStockToken(address(meta)),
            IMetaPriceOracle(address(oracle)),
            admin,
            defaultFees(),
            MetaTokenPaymaster.UserLimit(0, 0)
        );
        vm.deal(address(this), 1 ether);
        fresh.deposit{value: 0.5 ether}();
        vm.prank(accountOwner);
        account.execute(address(meta), 0, abi.encodeCall(meta.approve, (address(fresh), type(uint256).max)));
        PackedUserOperation memory op = buildOp(account, noopCall(), "");
        op.paymasterAndData = abi.encodePacked(address(fresh), uint128(120_000), uint128(120_000));
        op = sign(op, ownerKey);
        vm.expectPartialRevert(IEntryPoint.FailedOpWithRevert.selector);
        handle(op);
    }

    function test_RejectsExpiredPrice() public {
        vm.warp(block.timestamp + 1 hours + 1); // cached Open-mode price expired
        PackedUserOperation memory op = sign(buildOp(account, noopCall(), ""), ownerKey);
        vm.expectRevert(
            abi.encodeWithSelector(IEntryPoint.FailedOp.selector, 0, "AA32 paymaster expired or not due")
        );
        handle(op);
    }

    function test_UpdatePriceRevertsWhenNoSafePrice() public {
        vm.warp(block.timestamp + 81 hours);
        ethFeed.setAnswerAt(ethAnswer(), block.timestamp);
        usdgFeed.setAnswerAt(1e8, block.timestamp);
        pool.setMaxAge(1); // TWAP unavailable too
        vm.expectRevert(MetaPriceOracle.NoValidPrice.selector);
        paymaster.updatePrice();
    }

    function test_RejectsWhenPaused() public {
        vm.prank(admin);
        paymaster.pause();
        PackedUserOperation memory op = sign(buildOp(account, noopCall(), ""), ownerKey);
        vm.expectPartialRevert(IEntryPoint.FailedOpWithRevert.selector);
        handle(op);
        vm.prank(admin);
        paymaster.unpause();
        handle(op);
    }

    function test_RejectsWithoutAllowance() public {
        vm.prank(accountOwner);
        account.execute(address(meta), 0, abi.encodeCall(meta.approve, (address(paymaster), 0)));
        PackedUserOperation memory op = sign(buildOp(account, noopCall(), ""), ownerKey);
        vm.expectPartialRevert(IEntryPoint.FailedOpWithRevert.selector);
        handle(op);
    }

    function test_RejectsWhenTokenPaused() public {
        meta.setPaused(true);
        PackedUserOperation memory op = sign(buildOp(account, noopCall(), ""), ownerKey);
        vm.expectPartialRevert(IEntryPoint.FailedOpWithRevert.selector);
        handle(op);
    }

    function test_RejectsOpTooExpensive() public {
        PackedUserOperation memory op = buildOp(account, noopCall(), "");
        op.gasFees = bytes32((uint256(1 gwei) << 128) | uint256(100 gwei)); // ~ $25+ worst case
        op = sign(op, ownerKey);
        vm.expectPartialRevert(IEntryPoint.FailedOpWithRevert.selector);
        handle(op);
    }

    function test_RevertedCallStillCharged() public {
        bytes memory failing = abi.encodeCall(
            SimpleAccount.execute, (address(meta), 0, abi.encodeCall(meta.transfer, (address(1), 1_000e18)))
        );
        PackedUserOperation memory op = sign(buildOp(account, failing, ""), ownerKey);
        uint256 before = meta.balanceOf(address(account));
        handle(op);
        assertGt(before - meta.balanceOf(address(account)), 0);
        assertEq(paymaster.totalOps(), 1);
    }

    // ------------------------------------------------------------------ refunds owed

    function test_RefundDeferredWhenAccountBlockedMidOp_ThenClaimed() public {
        meta.transferOwnership(address(blocker));
        bytes memory callData = abi.encodeCall(SimpleAccount.execute, (address(blocker), 0, abi.encodeCall(Blocker.blockMe, ())));
        PackedUserOperation memory op = sign(buildOp(account, callData, ""), ownerKey);
        handle(op);

        uint256 owed = paymaster.owedRefunds(address(account));
        assertGt(owed, 0, "refund deferred");
        assertEq(paymaster.totalOwed(), owed);

        // owner cannot withdraw owed funds
        uint256 bal = meta.balanceOf(address(paymaster));
        vm.prank(admin);
        vm.expectRevert(
            abi.encodeWithSelector(MetaTokenPaymaster.InsufficientFreeBalance.selector, bal, bal - owed)
        );
        paymaster.withdrawTokens(IERC20(address(meta)), admin, bal);

        // account claims to another address
        address rescue = makeAddr("rescue");
        vm.prank(address(account));
        paymaster.claimRefund(rescue);
        assertEq(meta.balanceOf(rescue), owed);
        assertEq(paymaster.totalOwed(), 0);

        vm.prank(address(account));
        vm.expectRevert(MetaTokenPaymaster.NothingToClaim.selector);
        paymaster.claimRefund(rescue);
    }

    // ------------------------------------------------------------------ user limits

    function test_UserPeriodLimit_DelaysUntilNextPeriod() public {
        // limit = slightly above one op's worst-case charge
        PackedUserOperation memory probe = buildOp(account, noopCall(), "");
        uint256 worstUsd = _expectedMeta(maxCostOf(probe), 500) * META_PRICE / 1e18;
        vm.prank(admin);
        paymaster.setUserLimit(MetaTokenPaymaster.UserLimit(uint128(worstUsd * 3 / 2), 1 days));

        handle(sign(buildOp(account, noopCall(), ""), ownerKey));
        // spent ~ actual (small) → second op fits? actual << worst, so craft a third/fourth to exceed
        (uint128 spent,) = paymaster.userState(address(account));
        assertGt(spent, 0);

        // Fill the period: set spent close to the limit by doing ops until validation would exceed
        uint256 ops = 1;
        while (true) {
            PackedUserOperation memory op = sign(buildOp(account, noopCall(), ""), ownerKey);
            (uint128 s,) = paymaster.userState(address(account));
            if (uint256(s) + worstUsd > worstUsd * 3 / 2) {
                vm.expectRevert(
                    abi.encodeWithSelector(IEntryPoint.FailedOp.selector, 0, "AA32 paymaster expired or not due")
                );
                handle(op);
                break;
            }
            handle(op);
            ops++;
            require(ops < 200, "loop");
        }
        // next period: allowed again (refresh price first, it expired with the warp)
        vm.warp(block.timestamp + 1 days);
        refreshFeeds();
        paymaster.updatePrice();
        handle(sign(buildOp(account, noopCall(), ""), ownerKey));
        (uint128 spentAfter, uint48 start) = paymaster.userState(address(account));
        assertEq(start, block.timestamp);
        assertLt(spentAfter, worstUsd);
    }

    function test_UserLimit_SingleOpAboveLimitRejected() public {
        vm.prank(admin);
        paymaster.setUserLimit(MetaTokenPaymaster.UserLimit(1, 1 days));
        PackedUserOperation memory op = sign(buildOp(account, noopCall(), ""), ownerKey);
        vm.expectPartialRevert(IEntryPoint.FailedOpWithRevert.selector);
        handle(op);
    }

    // ------------------------------------------------------------------ admin

    function test_Ownable2Step() public {
        address newOwner = makeAddr("newOwner");
        vm.prank(admin);
        paymaster.transferOwnership(newOwner);
        assertEq(paymaster.owner(), admin);
        assertEq(paymaster.pendingOwner(), newOwner);
        vm.prank(newOwner);
        paymaster.acceptOwnership();
        assertEq(paymaster.owner(), newOwner);
    }

    function test_RenounceDisabled() public {
        vm.prank(admin);
        vm.expectRevert(MetaTokenPaymaster.InvalidConfig.selector);
        paymaster.renounceOwnership();
    }

    function test_AdminFunctionsOnlyOwner() public {
        vm.startPrank(makeAddr("eve"));
        vm.expectRevert();
        paymaster.pause();
        vm.expectRevert();
        paymaster.setFeeConfig(defaultFees());
        vm.expectRevert();
        paymaster.setUserLimit(MetaTokenPaymaster.UserLimit(0, 0));
        vm.expectRevert();
        paymaster.setOracle(IMetaPriceOracle(address(oracle)));
        vm.expectRevert();
        paymaster.withdrawTokens(IERC20(address(meta)), address(1), 1);
        vm.expectRevert();
        paymaster.withdrawTo(payable(address(1)), 1);
        vm.expectRevert();
        paymaster.unlockStake();
        vm.stopPrank();
    }

    function test_OwnerWithdrawsCollectedMeta() public {
        handle(sign(buildOp(account, noopCall(), ""), ownerKey));
        uint256 bal = meta.balanceOf(address(paymaster));
        vm.prank(admin);
        paymaster.withdrawTokens(IERC20(address(meta)), admin, bal);
        assertEq(meta.balanceOf(admin), bal);
    }

    function test_FeeConfigBounds() public {
        MetaTokenPaymaster.FeeConfig memory f = defaultFees();
        f.markupBps = 4_000;
        f.fallbackExtraBps = 2_000; // 60% total > 50% cap
        vm.prank(admin);
        vm.expectRevert(MetaTokenPaymaster.InvalidConfig.selector);
        paymaster.setFeeConfig(f);
    }

    function test_SetOracleClearsCache() public {
        vm.prank(admin);
        paymaster.setOracle(IMetaPriceOracle(address(oracle)));
        (,, uint48 validUntil,,) = paymaster.priceCache();
        assertEq(validUntil, 0);
    }

    function test_QuoteMatchesCharge() public {
        (uint256 q,) = paymaster.quote(1e12);
        assertEq(q, _expectedMeta(1e12, 500));
    }

    function test_ConstructorRejectsOracleForOtherToken() public {
        vm.expectRevert(MetaTokenPaymaster.InvalidConfig.selector);
        new MetaTokenPaymaster(
            IEntryPoint(address(entryPoint)),
            IStockToken(address(usdg)),
            IMetaPriceOracle(address(oracle)),
            admin,
            defaultFees(),
            MetaTokenPaymaster.UserLimit(0, 0)
        );
    }

    // ------------------------------------------------------------------ fuzz

    /// forge-config: default.fuzz.runs = 256
    /// @notice Conservation & bounds across prices and gas prices: user pays exactly what the paymaster
    ///         receives, the charge never exceeds the worst case, and always covers the ETH spent.
    function testFuzz_ChargeConservationAndCoverage(uint256 metaPrice, uint256 ethPrice, uint256 maxFee) public {
        metaPrice = bound(metaPrice, 50e18, 5_000e18);
        ethPrice = bound(ethPrice, 500e18, 20_000e18);
        maxFee = bound(maxFee, 0.001 gwei, 0.15 gwei);
        metaFeed.setAnswer(int256(metaPrice / 1e10));
        ethFeed.setAnswer(int256(ethPrice / 1e10));
        pool.setTick(tickForPrice(metaPrice / 1e10 * 1e10));
        vm.warp(block.timestamp + 31 minutes);
        refreshFeeds();
        paymaster.updatePrice();
        vm.fee(maxFee / 2);
        meta.mint(address(account), 1_000e18);

        PackedUserOperation memory op = buildOp(account, noopCall(), "");
        op.gasFees = bytes32((uint256(maxFee / 2) << 128) | maxFee);
        op = sign(op, ownerKey);

        uint256 userBefore = meta.balanceOf(address(account));
        uint256 pmBefore = meta.balanceOf(address(paymaster));
        uint256 depBefore = paymaster.getDeposit();
        vm.recordLogs();
        handle(op);
        (uint256 charged,,) = _gasPaidEvent(vm.getRecordedLogs());

        assertEq(userBefore - meta.balanceOf(address(account)), charged);
        assertEq(meta.balanceOf(address(paymaster)) - pmBefore, charged);
        uint256 metaUsd = uint256(metaPrice / 1e10 * 1e10);
        uint256 ethUsd = uint256(ethPrice / 1e10 * 1e10);
        uint256 worst = Math.mulDiv(
            Math.mulDiv(maxCostOf(op), ethUsd, 1e18, Math.Rounding.Ceil) * 10_500, 1e18, metaUsd * 10_000, Math.Rounding.Ceil
        );
        assertLe(charged, worst);
        uint256 ethSpent = depBefore - paymaster.getDeposit();
        assertGe(Math.mulDiv(charged, metaUsd, 1e18) + 1, Math.mulDiv(ethSpent, ethUsd, 1e18));
    }

    /// @notice Pure math: markup always increases the charge monotonically and rounds up.
    function testFuzz_QuoteMonotonic(uint256 gasCost, uint16 markupA, uint16 markupB) public {
        gasCost = bound(gasCost, 1, 1e18);
        markupA = uint16(bound(markupA, 0, 2_000));
        markupB = uint16(bound(markupB, markupA, 2_500));
        MetaTokenPaymaster.FeeConfig memory f = defaultFees();
        f.markupBps = markupA;
        vm.prank(admin);
        paymaster.setFeeConfig(f);
        (uint256 qa,) = paymaster.quote(gasCost);
        f.markupBps = markupB;
        vm.prank(admin);
        paymaster.setFeeConfig(f);
        (uint256 qb,) = paymaster.quote(gasCost);
        assertGe(qb, qa);
        assertGt(qa, 0);
    }
}
