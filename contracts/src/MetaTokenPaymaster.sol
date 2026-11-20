// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Ownable, Ownable2Step} from "@openzeppelin/contracts/access/Ownable2Step.sol";
import {Pausable} from "@openzeppelin/contracts/utils/Pausable.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";
import {SafeCast} from "@openzeppelin/contracts/utils/math/SafeCast.sol";

import {BasePaymaster} from "account-abstraction/core/BasePaymaster.sol";
import {IEntryPoint} from "account-abstraction/interfaces/IEntryPoint.sol";
import {PackedUserOperation} from "account-abstraction/interfaces/PackedUserOperation.sol";
import {_packValidationData} from "account-abstraction/core/Helpers.sol";
import {UserOperationLib} from "account-abstraction/core/UserOperationLib.sol";

import {IMetaPriceOracle} from "./interfaces/IMetaPriceOracle.sol";
import {IStockToken} from "./interfaces/IStockToken.sol";

/// @title MetaTokenPaymaster
/// @notice ERC-4337 (EntryPoint v0.7) paymaster that lets smart accounts pay gas in META Stock Token.
///         Fees are pegged in USD: gas (ETH) → USD (Chainlink ETH/USD) → META (hybrid META/USD oracle) + markup.
///
/// Flow
///  1. Anyone (keeper) calls {updatePrice} outside of validation. The full oracle logic (staleness,
///     TWAP cross-check, circuit breaker) runs there and the result is cached with a `validUntil`.
///  2. {validatePaymasterUserOp} reads only this contract's storage (no TIMESTAMP opcode, ERC-7562
///     compliant) and pre-charges the worst-case META cost with `transferFrom`. It returns
///     `validUntil` so the EntryPoint itself rejects operations priced with an expired cache.
///  3. {postOp} computes the real cost and refunds the difference. It never reverts: a failed refund
///     (e.g. token paused / account blocked by issuer) is recorded and claimable via {claimRefund}.
///
/// paymasterAndData = paymaster(20) | pmVerificationGasLimit(16) | pmPostOpGasLimit(16) | [maxMetaCost(32)]
///   `maxMetaCost` (optional) is a user-signed ceiling on the pre-charge (slippage protection).
///
/// @dev The paymaster reads oracle-independent storage only during validation, but it calls META.transferFrom,
///      which touches token storage not associated with the sender → the paymaster MUST be staked in the
///      EntryPoint (see {BasePaymaster.addStake}).
contract MetaTokenPaymaster is BasePaymaster, Ownable2Step, Pausable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    // ----------------------------------------------------------------- errors
    error InvalidConfig();
    error InvalidPaymasterData();
    error PriceNotAvailable();
    error OpTooExpensive(uint256 usdCost, uint256 maxUsd);
    error MaxMetaCostExceeded(uint256 required, uint256 maxMetaCost);
    error UserLimitExceeded(uint256 usdCharge, uint256 limit);
    error InvalidPrice();
    error InsufficientFreeBalance(uint256 requested, uint256 available);
    error NothingToClaim();

    // ----------------------------------------------------------------- events
    event PriceUpdated(uint256 metaUsd, uint256 ethUsd, IMetaPriceOracle.Mode mode, uint48 validUntil);
    event MetaGasPaid(
        address indexed sender,
        bytes32 indexed userOpHash,
        uint256 metaCharged,
        uint256 gasCostWei,
        uint256 usdCharged,
        uint256 metaUsd,
        uint256 ethUsd,
        IMetaPriceOracle.Mode mode
    );
    event RefundDeferred(address indexed sender, uint256 amount);
    event RefundClaimed(address indexed sender, address indexed to, uint256 amount);
    event OracleUpdated(address indexed oracle);
    event FeeConfigUpdated(FeeConfig config);
    event UserLimitUpdated(UserLimit limit);
    event TokensWithdrawn(address indexed token, address indexed to, uint256 amount);

    // ----------------------------------------------------------------- types
    struct PriceCache {
        uint128 metaUsd; // 18 decimals
        uint128 ethUsd; // 18 decimals
        uint48 validUntil;
        uint48 updatedAt;
        IMetaPriceOracle.Mode mode;
    }

    struct FeeConfig {
        uint16 markupBps; // base markup, e.g. 500 = 5%
        uint16 closedExtraBps; // extra when market closed, e.g. 500
        uint16 fallbackExtraBps; // extra when TWAP-only, e.g. 1000
        uint32 postOpOverheadGas; // gas not covered by actualGasCost (postOp itself)
        uint128 maxUsdPerOpOpen; // 18 decimals, max worst-case gas USD per op in Open mode
        uint128 maxUsdPerOpRestricted; // 18 decimals, in Closed / Fallback mode
    }

    /// @dev Data carried from validation to postOp.
    struct OpContext {
        address sender;
        bytes32 userOpHash;
        uint256 preCharge;
        uint256 metaUsd;
        uint256 ethUsd;
        uint256 markupBps;
        IMetaPriceOracle.Mode mode;
        uint256 executionGasLimit;
    }

    struct UserLimit {
        uint128 maxUsdPerPeriod; // 18 decimals, 0 = unlimited
        uint32 period; // seconds
    }

    struct UserState {
        uint128 spentUsd;
        uint48 periodStart;
    }

    uint256 internal constant BPS = 10_000;
    uint256 internal constant MAX_TOTAL_MARKUP_BPS = 5_000; // 50% hard cap
    uint256 internal constant UNUSED_GAS_PENALTY_PERCENT = 10; // EntryPoint v0.7 PENALTY_PERCENT

    // ----------------------------------------------------------------- state
    IERC20 public immutable token;
    uint256 internal immutable TOKEN_UNIT; // 10**decimals

    IMetaPriceOracle public oracle;
    PriceCache public priceCache;
    FeeConfig public feeConfig;
    UserLimit public userLimit;

    mapping(address => UserState) public userState;
    mapping(address => uint256) public owedRefunds;
    uint256 public totalOwed;

    // public dashboard counters (packed: 2 storage slots)
    struct Stats {
        uint64 ops;
        uint192 metaCollected;
        uint128 gasCostWei;
        uint128 usdCharged;
    }

    Stats public stats;

    constructor(
        IEntryPoint entryPoint_,
        IStockToken token_,
        IMetaPriceOracle oracle_,
        address owner_,
        FeeConfig memory fees,
        UserLimit memory limit
    ) BasePaymaster(entryPoint_) {
        if (address(token_) == address(0) || owner_ == address(0)) revert InvalidConfig();
        if (oracle_.metaToken() != address(token_)) revert InvalidConfig();
        token = token_;
        TOKEN_UNIT = 10 ** token_.decimals();
        oracle = oracle_;
        _setFeeConfig(fees);
        _setUserLimit(limit);
        if (owner_ != msg.sender) _transferOwnership(owner_);
    }

    // ================================================================= price cache

    /// @notice Refresh the cached price from the oracle. Permissionless (keeper / anyone / SDK).
    function updatePrice() public returns (PriceCache memory pc) {
        IMetaPriceOracle.Prices memory p = oracle.getPrices();
        if (p.metaUsd == 0 || p.ethUsd == 0 || p.metaUsd > type(uint128).max || p.ethUsd > type(uint128).max) {
            revert InvalidPrice();
        }
        if (p.validUntil <= block.timestamp) revert PriceNotAvailable();
        pc = PriceCache({
            metaUsd: uint128(p.metaUsd),
            ethUsd: uint128(p.ethUsd),
            validUntil: p.validUntil,
            updatedAt: uint48(block.timestamp),
            mode: p.mode
        });
        priceCache = pc;
        emit PriceUpdated(p.metaUsd, p.ethUsd, p.mode, p.validUntil);
    }

    // ================================================================= quoting (views for SDK/UI)

    /// @notice Effective markup and per-op USD cap for a price mode.
    function modeParams(IMetaPriceOracle.Mode mode) public view returns (uint256 markupBps, uint256 maxUsdPerOp) {
        FeeConfig memory f = feeConfig;
        markupBps = f.markupBps;
        maxUsdPerOp = f.maxUsdPerOpOpen;
        if (mode == IMetaPriceOracle.Mode.Closed) {
            markupBps += f.closedExtraBps;
            maxUsdPerOp = f.maxUsdPerOpRestricted;
        } else if (mode == IMetaPriceOracle.Mode.Fallback) {
            markupBps += f.fallbackExtraBps;
            maxUsdPerOp = f.maxUsdPerOpRestricted;
        }
    }

    /// @notice Quote the META charged for `gasCostWei` using the cached price.
    /// @return metaAmount META (token units) incl. markup, usdCost gas cost in USD (18 dec, excl. markup)
    function quote(uint256 gasCostWei) external view returns (uint256 metaAmount, uint256 usdCost) {
        PriceCache memory pc = priceCache;
        if (pc.metaUsd == 0) revert PriceNotAvailable();
        (uint256 markupBps,) = modeParams(pc.mode);
        usdCost = _weiToUsd(gasCostWei, pc.ethUsd);
        metaAmount = _usdToMetaWithMarkup(usdCost, pc.metaUsd, markupBps);
    }

    // ================================================================= ERC-4337

    function _validatePaymasterUserOp(PackedUserOperation calldata userOp, bytes32 userOpHash, uint256 maxCost)
        internal
        override
        whenNotPaused
        returns (bytes memory context, uint256 validationData)
    {
        uint256 maxMetaCost = _parseMaxMetaCost(userOp.paymasterAndData);

        PriceCache memory pc = priceCache;
        if (pc.validUntil == 0) revert PriceNotAvailable();

        OpContext memory ctx;
        ctx.sender = userOp.sender;
        ctx.userOpHash = userOpHash;
        ctx.metaUsd = pc.metaUsd;
        ctx.ethUsd = pc.ethUsd;
        ctx.mode = pc.mode;
        uint256 maxUsdPerOp;
        (ctx.markupBps, maxUsdPerOp) = modeParams(pc.mode);

        uint256 usdCost = _weiToUsd(maxCost, pc.ethUsd);
        if (usdCost > maxUsdPerOp) revert OpTooExpensive(usdCost, maxUsdPerOp);

        ctx.preCharge = _usdToMetaWithMarkup(usdCost, pc.metaUsd, ctx.markupBps);
        if (maxMetaCost != 0 && ctx.preCharge > maxMetaCost) {
            revert MaxMetaCostExceeded(ctx.preCharge, maxMetaCost);
        }

        uint48 validAfter = _checkUserLimit(ctx.sender, _metaToUsd(ctx.preCharge, pc.metaUsd));
        ctx.executionGasLimit =
            UserOperationLib.unpackCallGasLimit(userOp) + UserOperationLib.unpackPostOpGasLimit(userOp);

        token.safeTransferFrom(ctx.sender, address(this), ctx.preCharge);

        context = abi.encode(ctx);
        validationData = _packValidationData(false, pc.validUntil, validAfter);
    }

    function _parseMaxMetaCost(bytes calldata paymasterAndData) internal pure returns (uint256 maxMetaCost) {
        bytes calldata pmData = paymasterAndData[PAYMASTER_DATA_OFFSET:];
        if (pmData.length == 32) maxMetaCost = uint256(bytes32(pmData[0:32]));
        else if (pmData.length != 0) revert InvalidPaymasterData();
    }

    /// @dev Per-user per-period USD limit without reading block.timestamp (forbidden in validation):
    ///      if the stored period is exhausted, the op is made valid only from the end of that period
    ///      (`validAfter`); the period itself is rolled over in postOp.
    function _checkUserLimit(address sender, uint256 usdCharge) internal view returns (uint48 validAfter) {
        UserLimit memory lim = userLimit;
        if (lim.maxUsdPerPeriod == 0) return 0;
        if (usdCharge > lim.maxUsdPerPeriod) revert UserLimitExceeded(usdCharge, lim.maxUsdPerPeriod);
        UserState memory s = userState[sender];
        if (s.periodStart != 0 && uint256(s.spentUsd) + usdCharge > lim.maxUsdPerPeriod) {
            validAfter = uint48(uint256(s.periodStart) + lim.period);
        }
    }

    function _postOp(PostOpMode, bytes calldata context, uint256 actualGasCost, uint256 actualUserOpFeePerGas)
        internal
        override
    {
        OpContext memory ctx = abi.decode(context, (OpContext));

        uint256 gasCostWei = actualGasCost + _extraGas(ctx.executionGasLimit) * actualUserOpFeePerGas;
        uint256 usdCost = _weiToUsd(gasCostWei, ctx.ethUsd);
        uint256 charged = Math.min(_usdToMetaWithMarkup(usdCost, ctx.metaUsd, ctx.markupBps), ctx.preCharge);
        uint256 refund = ctx.preCharge - charged;
        uint256 usdCharged = _metaToUsd(charged, ctx.metaUsd);

        // effects before the (trusted-token) external call
        _accountUser(ctx.sender, usdCharged);
        Stats memory st = stats;
        st.ops += 1;
        st.metaCollected += SafeCast.toUint192(charged);
        st.gasCostWei += SafeCast.toUint128(gasCostWei);
        st.usdCharged += SafeCast.toUint128(usdCharged);
        stats = st;

        // External call to the trusted META token last; the deferred-refund bookkeeping must follow it.
        // Reentrancy is not possible: postOp is only callable by the (nonReentrant) EntryPoint.
        if (refund != 0 && !_tryTransfer(ctx.sender, refund)) {
            owedRefunds[ctx.sender] += refund;
            totalOwed += refund;
            emit RefundDeferred(ctx.sender, refund);
        }

        emit MetaGasPaid(
            ctx.sender, ctx.userOpHash, charged, gasCostWei, usdCharged, ctx.metaUsd, ctx.ethUsd, ctx.mode
        );
    }

    /// @dev Gas the EntryPoint charges after `actualGasCost` was computed: this postOp (estimated by
    ///      `postOpOverheadGas`) plus an upper bound of the v0.7 unused-execution-gas penalty
    ///      (10% of callGasLimit + postOpGasLimit not used). The bound ignores gas used by the call itself,
    ///      so it can overcharge by at most 10% of that — never undercharge.
    function _extraGas(uint256 executionGasLimit) internal view returns (uint256) {
        uint256 overhead = feeConfig.postOpOverheadGas;
        uint256 unusedBound = executionGasLimit > overhead ? executionGasLimit - overhead : 0;
        return overhead + unusedBound * UNUSED_GAS_PENALTY_PERCENT / 100;
    }

    function _accountUser(address sender, uint256 usdCharged) internal {
        UserLimit memory lim = userLimit;
        if (lim.maxUsdPerPeriod == 0) return;
        UserState memory s = userState[sender];
        if (s.periodStart == 0 || block.timestamp >= uint256(s.periodStart) + lim.period) {
            s.periodStart = uint48(block.timestamp);
            s.spentUsd = 0;
        }
        s.spentUsd = SafeCast.toUint128(uint256(s.spentUsd) + usdCharged);
        userState[sender] = s;
    }

    function totalOps() external view returns (uint256) {
        return stats.ops;
    }

    function totalMetaCollected() external view returns (uint256) {
        return stats.metaCollected;
    }

    // ================================================================= refunds

    /// @notice Claim refunds that could not be sent in postOp.
    function claimRefund(address to) external nonReentrant {
        uint256 amount = owedRefunds[msg.sender];
        if (amount == 0) revert NothingToClaim();
        owedRefunds[msg.sender] = 0;
        totalOwed -= amount;
        token.safeTransfer(to, amount);
        emit RefundClaimed(msg.sender, to, amount);
    }

    // ================================================================= admin

    function setOracle(IMetaPriceOracle oracle_) external onlyOwner {
        if (oracle_.metaToken() != address(token)) revert InvalidConfig();
        oracle = oracle_;
        delete priceCache; // force a fresh update from the new oracle
        emit OracleUpdated(address(oracle_));
    }

    function setFeeConfig(FeeConfig calldata fees) external onlyOwner {
        _setFeeConfig(fees);
    }

    function setUserLimit(UserLimit calldata limit) external onlyOwner {
        _setUserLimit(limit);
    }

    function pause() external onlyOwner {
        _pause();
    }

    function unpause() external onlyOwner {
        _unpause();
    }

    /// @notice Withdraw collected META (cannot touch refunds owed to users) or any other token.
    function withdrawTokens(IERC20 asset, address to, uint256 amount) external onlyOwner nonReentrant {
        if (to == address(0)) revert InvalidConfig();
        if (address(asset) == address(token)) {
            uint256 free = token.balanceOf(address(this)) - totalOwed;
            if (amount > free) revert InsufficientFreeBalance(amount, free);
        }
        asset.safeTransfer(to, amount);
        emit TokensWithdrawn(address(asset), to, amount);
    }

    function _setFeeConfig(FeeConfig memory f) internal {
        uint256 worst = uint256(f.markupBps) + Math.max(f.closedExtraBps, f.fallbackExtraBps);
        if (worst > MAX_TOTAL_MARKUP_BPS || f.maxUsdPerOpOpen == 0 || f.maxUsdPerOpRestricted == 0) {
            revert InvalidConfig();
        }
        feeConfig = f;
        emit FeeConfigUpdated(f);
    }

    function _setUserLimit(UserLimit memory l) internal {
        if (l.maxUsdPerPeriod != 0 && l.period == 0) revert InvalidConfig();
        userLimit = l;
        emit UserLimitUpdated(l);
    }

    // ================================================================= ownable2step plumbing

    function transferOwnership(address newOwner) public override(Ownable, Ownable2Step) onlyOwner {
        Ownable2Step.transferOwnership(newOwner);
    }

    function _transferOwnership(address newOwner) internal override(Ownable, Ownable2Step) {
        Ownable2Step._transferOwnership(newOwner);
    }

    /// @dev Disabled: renouncing would brick deposit/stake management.
    function renounceOwnership() public view override onlyOwner {
        revert InvalidConfig();
    }

    // ================================================================= math

    function _weiToUsd(uint256 weiAmount, uint256 ethUsd) internal pure returns (uint256) {
        return Math.mulDiv(weiAmount, ethUsd, 1e18, Math.Rounding.Ceil);
    }

    function _usdToMetaWithMarkup(uint256 usd, uint256 metaUsd, uint256 markupBps) internal view returns (uint256) {
        return Math.mulDiv(usd * (BPS + markupBps), TOKEN_UNIT, metaUsd * BPS, Math.Rounding.Ceil);
    }

    function _metaToUsd(uint256 metaAmount, uint256 metaUsd) internal view returns (uint256) {
        return Math.mulDiv(metaAmount, metaUsd, TOKEN_UNIT);
    }

    function _tryTransfer(address to, uint256 amount) internal returns (bool) {
        (bool ok, bytes memory ret) = address(token).call(abi.encodeCall(IERC20.transfer, (to, amount)));
        return ok && (ret.length == 0 || abi.decode(ret, (bool)));
    }
}
