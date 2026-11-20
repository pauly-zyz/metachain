// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Script, console2} from "forge-std/Script.sol";
import {IUniswapV3Pool} from "@uniswap/v3-core/contracts/interfaces/IUniswapV3Pool.sol";
import {FullMath} from "@uniswap/v3-core/contracts/libraries/FullMath.sol";
import {TickMath} from "@uniswap/v3-core/contracts/libraries/TickMath.sol";
import {Math} from "@openzeppelin/contracts/utils/math/Math.sol";
import {IEntryPoint} from "account-abstraction/interfaces/IEntryPoint.sol";

import {MetaPriceOracle} from "../src/oracle/MetaPriceOracle.sol";
import {MetaTokenPaymaster} from "../src/MetaTokenPaymaster.sol";
import {AgentPayments} from "../src/AgentPayments.sol";
import {IMetaPriceOracle} from "../src/interfaces/IMetaPriceOracle.sol";
import {IStockToken} from "../src/interfaces/IStockToken.sol";
import {IChainlinkAggregator} from "../src/interfaces/IChainlinkAggregator.sol";
import {MockMETA} from "../src/mocks/MockMETA.sol";
import {MockStablecoin} from "../src/mocks/MockStablecoin.sol";
import {MockAggregator} from "../src/mocks/MockAggregator.sol";
import {MockUniswapV3Pool} from "../src/mocks/MockUniswapV3Pool.sol";
import {RobinhoodMainnet, RobinhoodShared} from "./RobinhoodAddresses.sol";

/// @notice Shared deployment logic.
abstract contract DeployBase is Script {
    struct Deployed {
        address meta;
        address quoteToken;
        address metaUsdFeed;
        address ethUsdFeed;
        address quoteUsdFeed;
        address twapPool;
        address oracle;
        address paymaster;
        address agentPayments;
    }

    function oracleConfig() internal pure returns (MetaPriceOracle.Config memory) {
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

    function feeConfig() internal pure returns (MetaTokenPaymaster.FeeConfig memory) {
        return MetaTokenPaymaster.FeeConfig({
            markupBps: 500, // 5%
            closedExtraBps: 500, // +5% when market closed
            fallbackExtraBps: 1000, // +10% when TWAP-only
            postOpOverheadGas: 65_000,
            maxUsdPerOpOpen: 5e18, // $5 worst-case per op
            maxUsdPerOpRestricted: 1e18 // $1 when closed / fallback
        });
    }

    function userLimit() internal pure returns (MetaTokenPaymaster.UserLimit memory) {
        return MetaTokenPaymaster.UserLimit({maxUsdPerPeriod: 50e18, period: 1 days}); // $50/day/account
    }

    function deployCore(
        address deployer,
        address owner,
        IStockToken meta,
        address metaUsdFeed,
        address ethUsdFeed,
        address quoteUsdFeed,
        address quoteToken,
        address twapPool,
        uint256 depositWei,
        uint256 stakeWei
    ) internal returns (Deployed memory d) {
        MetaPriceOracle oracle = new MetaPriceOracle(
            owner,
            meta,
            IChainlinkAggregator(metaUsdFeed),
            IChainlinkAggregator(ethUsdFeed),
            IChainlinkAggregator(quoteUsdFeed),
            quoteToken,
            IUniswapV3Pool(twapPool),
            oracleConfig()
        );
        // Deployer stays owner until deposit/stake are configured, then ownership moves (2-step) to `owner`.
        MetaTokenPaymaster paymaster = new MetaTokenPaymaster(
            IEntryPoint(RobinhoodShared.ENTRYPOINT_V07),
            meta,
            IMetaPriceOracle(address(oracle)),
            deployer,
            feeConfig(),
            userLimit()
        );
        if (depositWei > 0) paymaster.deposit{value: depositWei}();
        if (stakeWei > 0) paymaster.addStake{value: stakeWei}(1 days);
        paymaster.updatePrice();
        if (owner != deployer) paymaster.transferOwnership(owner); // owner must call acceptOwnership()

        address[] memory tokens = new address[](2);
        tokens[0] = address(meta);
        tokens[1] = quoteToken;
        AgentPayments agentPayments = new AgentPayments(owner, IMetaPriceOracle(address(oracle)), tokens);

        d = Deployed({
            meta: address(meta),
            quoteToken: quoteToken,
            metaUsdFeed: metaUsdFeed,
            ethUsdFeed: ethUsdFeed,
            quoteUsdFeed: quoteUsdFeed,
            twapPool: twapPool,
            oracle: address(oracle),
            paymaster: address(paymaster),
            agentPayments: address(agentPayments)
        });
    }

    function writeDeployment(string memory name, Deployed memory d) internal {
        string memory k = "deployment";
        vm.serializeUint(k, "chainId", block.chainid);
        vm.serializeAddress(k, "entryPoint", RobinhoodShared.ENTRYPOINT_V07);
        vm.serializeAddress(k, "meta", d.meta);
        vm.serializeAddress(k, "quoteToken", d.quoteToken);
        vm.serializeAddress(k, "metaUsdFeed", d.metaUsdFeed);
        vm.serializeAddress(k, "ethUsdFeed", d.ethUsdFeed);
        vm.serializeAddress(k, "quoteUsdFeed", d.quoteUsdFeed);
        vm.serializeAddress(k, "twapPool", d.twapPool);
        vm.serializeAddress(k, "oracle", d.oracle);
        vm.serializeAddress(k, "paymaster", d.paymaster);
        vm.serializeAddress(k, "kernelFactory", RobinhoodShared.KERNEL_V3_1_FACTORY);
        vm.serializeAddress(k, "kernelEcdsaValidator", RobinhoodShared.KERNEL_ECDSA_VALIDATOR);
        vm.serializeAddress(k, "smartSessions", RobinhoodShared.SMART_SESSIONS);
        vm.serializeUint(k, "deployBlock", block.number);
        string memory json = vm.serializeAddress(k, "agentPayments", d.agentPayments);
        string memory path = string.concat(vm.projectRoot(), "/deployments/", name, ".json");
        vm.writeJson(json, path);
        console2.log("deployment written to", path);
    }
}

/// @notice Robinhood Chain TESTNET (46630): META is not deployed on testnet, so mocks are used for the token,
///         Chainlink feeds and the Uniswap V3 pool. EntryPoint v0.7, Kernel v3.1 and Smart Sessions are real.
/// Usage:
///   forge script script/Deploy.s.sol:DeployTestnet --rpc-url robinhood_testnet --broadcast --verify \
///     --verifier blockscout --verifier-url https://explorer.testnet.chain.robinhood.com/api/
contract DeployTestnet is DeployBase {
    function run() external returns (Deployed memory d) {
        uint256 pk = vm.envUint("PRIVATE_KEY");
        address deployer = vm.addr(pk);
        address owner = vm.envOr("OWNER", deployer);
        require(block.chainid == 46630 || block.chainid == 31337, "DeployTestnet: wrong chain");

        vm.startBroadcast(pk);
        MockMETA meta = new MockMETA(deployer);
        MockStablecoin usdg = new MockStablecoin(deployer);
        MockAggregator metaFeed = new MockAggregator(deployer, 8, "Mock META / USD", 583_50000000);
        MockAggregator ethFeed = new MockAggregator(deployer, 8, "Mock ETH / USD", 1748_27000000);
        MockAggregator usdgFeed = new MockAggregator(deployer, 8, "Mock USDG / USD", 1_00000000);
        MockUniswapV3Pool pool =
            new MockUniswapV3Pool(deployer, address(meta), address(usdg), _tick(address(meta), address(usdg), 583.5e18));

        d = deployCore(
            deployer,
            owner,
            IStockToken(address(meta)),
            address(metaFeed),
            address(ethFeed),
            address(usdgFeed),
            address(usdg),
            address(pool),
            vm.envOr("PAYMASTER_DEPOSIT_WEI", uint256(0.02 ether)),
            vm.envOr("PAYMASTER_STAKE_WEI", uint256(0.005 ether))
        );
        meta.mint(deployer, 1_000e18);
        vm.stopBroadcast();

        writeDeployment(vm.envOr("DEPLOYMENT_NAME", block.chainid == 31337 ? string("local") : string("robinhood-testnet")), d);
    }

    function _tick(address metaToken, address usdg, uint256 usdPerMeta) internal pure returns (int24) {
        uint256 num = usdPerMeta * 1e6;
        uint256 den = 1e36;
        uint256 ratioX192 =
            metaToken < usdg ? FullMath.mulDiv(num, 1 << 192, den) : FullMath.mulDiv(den, 1 << 192, num);
        return TickMath.getTickAtSqrtRatio(uint160(Math.sqrt(ratioX192)));
    }
}

/// @notice Robinhood Chain MAINNET (4663). Uses the real META token, Chainlink feeds and Uniswap V3 pool.
///         Guarded: requires CONFIRM_MAINNET_DEPLOY="I_UNDERSTAND_THIS_IS_MAINNET" and explicit owner approval.
contract DeployMainnet is DeployBase {
    function run() external returns (Deployed memory d) {
        require(block.chainid == RobinhoodMainnet.CHAIN_ID, "DeployMainnet: wrong chain");
        require(
            keccak256(bytes(vm.envOr("CONFIRM_MAINNET_DEPLOY", string("")))) == keccak256("I_UNDERSTAND_THIS_IS_MAINNET"),
            "DeployMainnet: set CONFIRM_MAINNET_DEPLOY (requires explicit owner approval, see docs/pre-mainnet-checklist.md)"
        );
        uint256 pk = vm.envUint("PRIVATE_KEY");
        address owner = vm.envAddress("OWNER"); // should be a multisig
        vm.startBroadcast(pk);
        d = deployCore(
            vm.addr(pk),
            owner,
            IStockToken(RobinhoodMainnet.META),
            RobinhoodMainnet.CL_META_USD,
            RobinhoodMainnet.CL_ETH_USD,
            RobinhoodMainnet.CL_USDG_USD,
            RobinhoodMainnet.USDG,
            RobinhoodMainnet.UNI_V3_META_USDG_3000,
            vm.envUint("PAYMASTER_DEPOSIT_WEI"),
            vm.envUint("PAYMASTER_STAKE_WEI")
        );
        vm.stopBroadcast();
        writeDeployment("robinhood-mainnet", d);
    }
}
