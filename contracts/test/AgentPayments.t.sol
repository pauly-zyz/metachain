// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {BaseTest} from "./utils/BaseTest.sol";
import {AgentPayments} from "../src/AgentPayments.sol";
import {IMetaPriceOracle} from "../src/interfaces/IMetaPriceOracle.sol";

contract AgentPaymentsTest is BaseTest {
    AgentPayments internal payments;
    address internal payer = makeAddr("payerAccount");
    address internal payee = makeAddr("payeeAgent");

    event PaymentSent(
        uint256 indexed id,
        address indexed payer,
        address indexed payee,
        address token,
        uint256 amount,
        uint256 usdValue,
        bytes32 memoHash,
        string memo
    );

    function setUp() public override {
        super.setUp();
        address[] memory tokens = new address[](2);
        tokens[0] = address(meta);
        tokens[1] = address(usdg);
        payments = new AgentPayments(admin, IMetaPriceOracle(address(oracle)), tokens);
        meta.mint(payer, 100e18);
        vm.prank(admin);
        usdg.mint(payer, 10_000e6);
        vm.startPrank(payer);
        meta.approve(address(payments), type(uint256).max);
        usdg.approve(address(payments), type(uint256).max);
        vm.stopPrank();
    }

    function _limit(uint128 amount, uint128 usd, uint32 period, uint32 maxTx)
        internal
        pure
        returns (AgentPayments.Limit memory)
    {
        return AgentPayments.Limit(amount, usd, period, maxTx);
    }

    function test_PayEmitsReceipt() public {
        vm.prank(payer);
        payments.setLimit(address(meta), _limit(5e18, 0, 1 days, 0));
        bytes32 memoHash = keccak256("inference#42");
        vm.expectEmit(true, true, true, true);
        emit PaymentSent(1, payer, payee, address(meta), 1e18, META_PRICE, memoHash, "gpt call");
        vm.prank(payer);
        uint256 id = payments.pay(address(meta), payee, 1e18, memoHash, "gpt call");
        assertEq(id, 1);
        assertEq(meta.balanceOf(payee), 1e18);
        AgentPayments.Receipt memory r = payments.getReceipt(id);
        assertEq(r.payer, payer);
        assertEq(r.payee, payee);
        assertEq(r.amount, 1e18);
        assertEq(r.usdValue, META_PRICE);
        assertEq(r.memoHash, memoHash);
        assertEq(r.timestamp, block.timestamp);
    }

    function test_RequiresLimit() public {
        vm.prank(payer);
        vm.expectRevert(AgentPayments.LimitNotSet.selector);
        payments.pay(address(meta), payee, 1, bytes32(0), "");
    }

    function test_AmountLimitPerPeriod_AndRollover() public {
        vm.startPrank(payer);
        payments.setLimit(address(meta), _limit(2e18, 0, 1 days, 0));
        payments.pay(address(meta), payee, 1.5e18, bytes32(0), "");
        vm.expectRevert(abi.encodeWithSelector(AgentPayments.AmountLimitExceeded.selector, 2.5e18, 2e18));
        payments.pay(address(meta), payee, 1e18, bytes32(0), "");
        vm.warp(block.timestamp + 1 days);
        payments.pay(address(meta), payee, 2e18, bytes32(0), "");
        vm.stopPrank();
        assertEq(meta.balanceOf(payee), 3.5e18);
    }

    function test_UsdLimitPerPeriod() public {
        vm.startPrank(payer);
        payments.setLimit(address(meta), _limit(0, 1_000e18, 1 days, 0)); // $1000/day
        payments.pay(address(meta), payee, 1e18, bytes32(0), ""); // $583.5
        vm.expectRevert(
            abi.encodeWithSelector(AgentPayments.UsdLimitExceeded.selector, 2 * META_PRICE, 1_000e18)
        );
        payments.pay(address(meta), payee, 1e18, bytes32(0), "");
        vm.stopPrank();
    }

    function test_UsdLimitWithStablecoin() public {
        vm.startPrank(payer);
        payments.setLimit(address(usdg), _limit(0, 50e18, 1 hours, 0));
        payments.pay(address(usdg), payee, 30e6, bytes32(0), "");
        vm.expectRevert(abi.encodeWithSelector(AgentPayments.UsdLimitExceeded.selector, 60e18, 50e18));
        payments.pay(address(usdg), payee, 30e6, bytes32(0), "");
        vm.stopPrank();
    }

    function test_UsdLimitRevertsWhenOracleCannotPrice() public {
        vm.prank(payer);
        payments.setLimit(address(meta), _limit(0, 1_000e18, 1 days, 0));
        ethFeed.setAnswer(0); // oracle reverts
        vm.prank(payer);
        vm.expectRevert();
        payments.pay(address(meta), payee, 1e18, bytes32(0), "");
    }

    function test_AmountOnlyLimitWorksWhenOracleDown() public {
        vm.prank(payer);
        payments.setLimit(address(meta), _limit(5e18, 0, 1 days, 0));
        ethFeed.setAnswer(0);
        vm.prank(payer);
        uint256 id = payments.pay(address(meta), payee, 1e18, bytes32(0), "");
        assertEq(payments.getReceipt(id).usdValue, 0);
    }

    function test_RateLimit() public {
        vm.startPrank(payer);
        payments.setLimit(address(meta), _limit(0, 0, 1 hours, 2));
        payments.pay(address(meta), payee, 1, bytes32(0), "");
        payments.pay(address(meta), payee, 1, bytes32(0), "");
        vm.expectRevert(abi.encodeWithSelector(AgentPayments.RateLimitExceeded.selector, 3, 2));
        payments.pay(address(meta), payee, 1, bytes32(0), "");
        vm.warp(block.timestamp + 1 hours);
        payments.pay(address(meta), payee, 1, bytes32(0), "");
        vm.stopPrank();
    }

    function test_Remaining() public {
        vm.startPrank(payer);
        payments.setLimit(address(meta), _limit(3e18, 0, 1 days, 5));
        payments.pay(address(meta), payee, 1e18, bytes32(0), "");
        vm.stopPrank();
        (uint256 amountLeft, uint256 usdLeft, uint256 txLeft, uint256 endsAt) =
            payments.remaining(payer, address(meta));
        assertEq(amountLeft, 2e18);
        assertEq(usdLeft, type(uint256).max);
        assertEq(txLeft, 4);
        assertEq(endsAt, block.timestamp + 1 days);
    }

    function test_InvalidPayments() public {
        vm.startPrank(payer);
        payments.setLimit(address(meta), _limit(0, 0, 1 days, 0));
        vm.expectRevert(AgentPayments.InvalidPayment.selector);
        payments.pay(address(meta), address(0), 1, bytes32(0), "");
        vm.expectRevert(AgentPayments.InvalidPayment.selector);
        payments.pay(address(meta), payer, 1, bytes32(0), "");
        vm.expectRevert(AgentPayments.InvalidPayment.selector);
        payments.pay(address(meta), payee, 0, bytes32(0), "");
        vm.expectRevert(abi.encodeWithSelector(AgentPayments.TokenNotAllowed.selector, address(0xBEEF)));
        payments.pay(address(0xBEEF), payee, 1, bytes32(0), "");
        vm.expectRevert(AgentPayments.InvalidLimit.selector);
        payments.setLimit(address(meta), _limit(0, 0, 0, 0));
        vm.stopPrank();
    }

    function test_BlockedPayeeReverts() public {
        vm.prank(payer);
        payments.setLimit(address(meta), _limit(0, 0, 1 days, 0));
        meta.setBlocked(payee, true);
        vm.prank(payer);
        vm.expectRevert();
        payments.pay(address(meta), payee, 1, bytes32(0), "");
    }

    function test_AdminOnly() public {
        vm.expectRevert();
        payments.setTokenAllowed(address(1), true);
        vm.expectRevert();
        payments.setOracle(IMetaPriceOracle(address(0)));
    }

    function testFuzz_NeverExceedsAmountLimit(uint128 limitAmount, uint256[5] memory amounts) public {
        limitAmount = uint128(bound(limitAmount, 1, 50e18));
        vm.prank(payer);
        payments.setLimit(address(meta), _limit(limitAmount, 0, 1 days, 0));
        uint256 paid;
        for (uint256 i; i < amounts.length; ++i) {
            uint256 a = bound(amounts[i], 1, 20e18);
            vm.prank(payer);
            try payments.pay(address(meta), payee, a, bytes32(0), "") {
                paid += a;
            } catch {}
        }
        assertLe(paid, limitAmount);
        assertEq(meta.balanceOf(payee), paid);
    }
}
