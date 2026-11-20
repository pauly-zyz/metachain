// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Ownable, Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {SafeCast} from "@openzeppelin/contracts/utils/math/SafeCast.sol";

import {IMetaPriceOracle} from "./interfaces/IMetaPriceOracle.sol";

/// @title AgentPayments
/// @notice Agent-to-agent payments in META / USDG with per-period spending limits and on-chain receipts.
/// @dev Designed as the single target an AI agent's session key may call (Rhinestone Smart Sessions action
///      `pay`). Session-key validation cannot read the clock (ERC-7562), so *periodic* limits are enforced
///      here, at execution time:
///        - max token amount per period
///        - max USD value per period (valued with MetaPriceOracle)
///        - max number of payments per period (rate limit)
///      Limits are set by the paying account itself (its owner, via a normal UserOperation).
///      Tokens are pulled with `transferFrom`, so the account must approve this contract.
contract AgentPayments is Ownable2Step, ReentrancyGuard {
    using SafeERC20 for IERC20;

    error TokenNotAllowed(address token);
    error InvalidPayment();
    error LimitNotSet();
    error AmountLimitExceeded(uint256 spent, uint256 limit);
    error UsdLimitExceeded(uint256 spentUsd, uint256 limit);
    error RateLimitExceeded(uint256 count, uint256 limit);
    error InvalidLimit();

    event TokenAllowed(address indexed token, bool allowed);
    event OracleUpdated(address oracle);
    event LimitSet(address indexed payer, address indexed token, Limit limit);
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

    struct Limit {
        uint128 maxAmountPerPeriod; // token units, 0 = no amount cap
        uint128 maxUsdPerPeriod; // 18 decimals, 0 = no USD cap
        uint32 period; // seconds, must be > 0
        uint32 maxTxPerPeriod; // 0 = no rate limit
    }

    struct Usage {
        uint128 spentAmount;
        uint128 spentUsd;
        uint48 periodStart;
        uint32 txCount;
    }

    struct Receipt {
        address payer;
        address payee;
        address token;
        uint96 timestamp;
        uint256 amount;
        uint256 usdValue;
        bytes32 memoHash;
    }

    IMetaPriceOracle public oracle;
    mapping(address token => bool) public allowedTokens;
    mapping(address payer => mapping(address token => Limit)) public limits;
    mapping(address payer => mapping(address token => Usage)) public usage;
    mapping(uint256 id => Receipt) internal _receipts;
    uint256 public paymentCount;

    constructor(address owner_, IMetaPriceOracle oracle_, address[] memory tokens) Ownable(owner_) {
        oracle = oracle_;
        for (uint256 i; i < tokens.length; ++i) {
            allowedTokens[tokens[i]] = true;
            emit TokenAllowed(tokens[i], true);
        }
    }

    // ----------------------------------------------------------------- admin
    function setTokenAllowed(address token, bool allowed) external onlyOwner {
        allowedTokens[token] = allowed;
        emit TokenAllowed(token, allowed);
    }

    function setOracle(IMetaPriceOracle oracle_) external onlyOwner {
        oracle = oracle_;
        emit OracleUpdated(address(oracle_));
    }

    // ----------------------------------------------------------------- payer config
    /// @notice Configure the spending limit applied to payments from msg.sender in `token`.
    function setLimit(address token, Limit calldata limit) external {
        if (!allowedTokens[token]) revert TokenNotAllowed(token);
        if (limit.period == 0) revert InvalidLimit();
        limits[msg.sender][token] = limit;
        delete usage[msg.sender][token];
        emit LimitSet(msg.sender, token, limit);
    }

    // ----------------------------------------------------------------- payments
    /// @notice Pay `amount` of `token` from msg.sender to `payee`, emitting a receipt.
    /// @param memoHash e.g. keccak256 of the inference request/response being paid for
    /// @param memo     short human-readable note (kept in the event only)
    function pay(address token, address payee, uint256 amount, bytes32 memoHash, string calldata memo)
        external
        nonReentrant
        returns (uint256 id)
    {
        if (!allowedTokens[token]) revert TokenNotAllowed(token);
        if (payee == address(0) || payee == msg.sender || amount == 0 || bytes(memo).length > 256) {
            revert InvalidPayment();
        }
        uint256 usdVal = _consume(token, amount);

        id = ++paymentCount;
        _receipts[id] = Receipt({
            payer: msg.sender,
            payee: payee,
            token: token,
            timestamp: uint96(block.timestamp),
            amount: amount,
            usdValue: usdVal,
            memoHash: memoHash
        });

        IERC20(token).safeTransferFrom(msg.sender, payee, amount);
        emit PaymentSent(id, msg.sender, payee, token, amount, usdVal, memoHash, memo);
    }

    // ----------------------------------------------------------------- views
    function getReceipt(uint256 id) external view returns (Receipt memory) {
        return _receipts[id];
    }

    /// @notice Remaining allowance in the current period (amount, usd, tx count). type(uint256).max = unlimited.
    function remaining(address payer, address token)
        external
        view
        returns (uint256 amountLeft, uint256 usdLeft, uint256 txLeft, uint256 periodEndsAt)
    {
        Limit memory lim = limits[payer][token];
        if (lim.period == 0) return (0, 0, 0, 0);
        Usage memory u = usage[payer][token];
        if (u.periodStart == 0 || block.timestamp >= uint256(u.periodStart) + lim.period) {
            u = Usage(0, 0, uint48(block.timestamp), 0);
        }
        amountLeft = lim.maxAmountPerPeriod == 0 ? type(uint256).max : lim.maxAmountPerPeriod - u.spentAmount;
        usdLeft = lim.maxUsdPerPeriod == 0 ? type(uint256).max : lim.maxUsdPerPeriod - u.spentUsd;
        txLeft = lim.maxTxPerPeriod == 0 ? type(uint256).max : lim.maxTxPerPeriod - u.txCount;
        periodEndsAt = uint256(u.periodStart) + lim.period;
    }

    /// @dev Checks and records the payment against the payer's period limits. Returns the USD value.
    function _consume(address token, uint256 amount) internal returns (uint256 usdVal) {
        Limit memory lim = limits[msg.sender][token];
        if (lim.period == 0) revert LimitNotSet();

        Usage memory u = usage[msg.sender][token];
        if (u.periodStart == 0 || block.timestamp >= uint256(u.periodStart) + lim.period) {
            u = Usage({spentAmount: 0, spentUsd: 0, periodStart: uint48(block.timestamp), txCount: 0});
        }

        usdVal = _usdValue(token, amount, lim.maxUsdPerPeriod != 0);

        uint256 newAmount = uint256(u.spentAmount) + amount;
        if (lim.maxAmountPerPeriod != 0 && newAmount > lim.maxAmountPerPeriod) {
            revert AmountLimitExceeded(newAmount, lim.maxAmountPerPeriod);
        }
        uint256 newUsd = uint256(u.spentUsd) + usdVal;
        if (lim.maxUsdPerPeriod != 0 && newUsd > lim.maxUsdPerPeriod) {
            revert UsdLimitExceeded(newUsd, lim.maxUsdPerPeriod);
        }
        uint256 newCount = uint256(u.txCount) + 1;
        if (lim.maxTxPerPeriod != 0 && newCount > lim.maxTxPerPeriod) {
            revert RateLimitExceeded(newCount, lim.maxTxPerPeriod);
        }

        u.spentAmount = SafeCast.toUint128(newAmount);
        u.spentUsd = SafeCast.toUint128(newUsd);
        u.txCount = SafeCast.toUint32(newCount);
        usage[msg.sender][token] = u;
    }

    function _usdValue(address token, uint256 amount, bool required) internal view returns (uint256) {
        IMetaPriceOracle o = oracle;
        if (address(o) == address(0)) {
            if (required) revert InvalidLimit();
            return 0;
        }
        if (required) return o.usdValue(token, amount);
        try o.usdValue(token, amount) returns (uint256 v) {
            return v;
        } catch {
            return 0;
        }
    }
}
