// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IChainlinkAggregator} from "../interfaces/IChainlinkAggregator.sol";

/// @notice TESTNET / TEST ONLY. Chainlink-compatible aggregator whose answer is pushed by an updater.
contract MockAggregator is IChainlinkAggregator, Ownable {
    uint8 public immutable decimals;
    string public description;
    uint80 internal _roundId;
    int256 internal _answer;
    uint256 internal _startedAt;
    uint256 internal _updatedAt;
    mapping(address => bool) public updaters;

    error NotUpdater();

    constructor(address owner_, uint8 decimals_, string memory description_, int256 initialAnswer) Ownable(owner_) {
        decimals = decimals_;
        description = description_;
        updaters[owner_] = true;
        _set(initialAnswer, block.timestamp);
    }

    function setUpdater(address who, bool allowed) external onlyOwner {
        updaters[who] = allowed;
    }

    function setAnswer(int256 answer) external {
        if (!updaters[msg.sender]) revert NotUpdater();
        _set(answer, block.timestamp);
    }

    function setAnswerAt(int256 answer, uint256 updatedAt) external {
        if (!updaters[msg.sender]) revert NotUpdater();
        _set(answer, updatedAt);
    }

    function setStartedAt(uint256 startedAt) external {
        if (!updaters[msg.sender]) revert NotUpdater();
        _startedAt = startedAt;
    }

    function latestRoundData() external view returns (uint80, int256, uint256, uint256, uint80) {
        return (_roundId, _answer, _startedAt, _updatedAt, _roundId);
    }

    function _set(int256 answer, uint256 updatedAt) internal {
        _roundId++;
        _answer = answer;
        _startedAt = updatedAt;
        _updatedAt = updatedAt;
    }
}
