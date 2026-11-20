// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/// @notice TESTNET / TEST ONLY. Implements the subset of IUniswapV3Pool used by MetaPriceOracle (`observe`,
///         `token0`, `token1`). The pool keeps a piecewise-constant tick history; observations older than
///         `maxAge` revert with "OLD" like a real pool with limited cardinality.
contract MockUniswapV3Pool is Ownable {
    address public immutable token0;
    address public immutable token1;
    struct Checkpoint {
        uint32 timestamp;
        int24 tick; // tick in effect from `timestamp`
        int56 cumulative; // tickCumulative at `timestamp`
    }

    Checkpoint[] internal _checkpoints;
    uint32 public maxAge = type(uint32).max;
    mapping(address => bool) public updaters;

    error NotUpdater();

    constructor(address owner_, address tokenA, address tokenB, int24 initialTick) Ownable(owner_) {
        (token0, token1) = tokenA < tokenB ? (tokenA, tokenB) : (tokenB, tokenA);
        updaters[owner_] = true;
        _checkpoints.push(Checkpoint(uint32(block.timestamp), initialTick, 0));
    }

    function tick() external view returns (int24) {
        return _checkpoints[_checkpoints.length - 1].tick;
    }

    function setUpdater(address who, bool allowed) external onlyOwner {
        updaters[who] = allowed;
    }

    function setMaxAge(uint32 age) external onlyOwner {
        maxAge = age;
    }

    /// @notice Change the tick from now on (keeps cumulative continuity, like a swap moving the price).
    function setTick(int24 newTick) external {
        if (!updaters[msg.sender]) revert NotUpdater();
        Checkpoint memory last = _checkpoints[_checkpoints.length - 1];
        if (last.timestamp == block.timestamp) {
            _checkpoints[_checkpoints.length - 1].tick = newTick;
        } else {
            _checkpoints.push(Checkpoint(uint32(block.timestamp), newTick, _cumulative(block.timestamp)));
        }
    }

    function observe(uint32[] calldata secondsAgos)
        external
        view
        returns (int56[] memory tickCumulatives, uint160[] memory secondsPerLiquidityCumulativeX128s)
    {
        tickCumulatives = new int56[](secondsAgos.length);
        secondsPerLiquidityCumulativeX128s = new uint160[](secondsAgos.length);
        for (uint256 i; i < secondsAgos.length; ++i) {
            require(secondsAgos[i] <= maxAge, "OLD");
            tickCumulatives[i] = _cumulative(block.timestamp - secondsAgos[i]);
            secondsPerLiquidityCumulativeX128s[i] = uint160(block.timestamp - secondsAgos[i]);
        }
    }

    /// @dev Piecewise-constant tick history; before the first checkpoint the initial tick is extrapolated.
    function _cumulative(uint256 t) internal view returns (int56) {
        uint256 i = _checkpoints.length;
        while (i > 1 && _checkpoints[i - 1].timestamp > t) --i;
        Checkpoint memory c = _checkpoints[i - 1];
        return c.cumulative + int56(c.tick) * (int56(uint56(t)) - int56(uint56(c.timestamp)));
    }
}
