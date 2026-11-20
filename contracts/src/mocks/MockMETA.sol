// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";
import {ERC20Permit} from "@openzeppelin/contracts/token/ERC20/extensions/ERC20Permit.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";

/// @title MockMETA
/// @notice TESTNET ONLY. Mimics the Robinhood "Meta Platforms • Robinhood Token" (META) behaviour relevant to
///         META Chain: 18 decimals, EIP-2612 permit, global pause, issuer blocklist, ERC-8056 `uiMultiplier`
///         and the advisory `oraclePaused` flag. Includes a rate-limited faucet for demos.
///         Not affiliated with Meta Platforms, Inc. or Robinhood.
contract MockMETA is ERC20, ERC20Permit, Ownable {
    error TokenPaused();
    error AccountBlocked(address account);
    error FaucetCooldown(uint256 availableAt);

    event UIMultiplierUpdated(uint256 oldMultiplier, uint256 newMultiplier, uint256 effectiveAtTimestamp);

    bool public paused;
    bool public oraclePaused;
    uint256 public uiMultiplier = 1e18;
    mapping(address => bool) public isBlocked;

    uint256 public constant FAUCET_AMOUNT = 10e18;
    uint256 public constant FAUCET_COOLDOWN = 1 days;
    mapping(address => uint256) public lastFaucet;

    constructor(address owner_) ERC20("Mock Meta Platforms Token (testnet)", "META") ERC20Permit("Mock META") Ownable(owner_) {}

    function mint(address to, uint256 amount) external onlyOwner {
        _mint(to, amount);
    }

    function burn(address from, uint256 amount) external onlyOwner {
        _burn(from, amount);
    }

    function faucet() external {
        uint256 next = lastFaucet[msg.sender] + FAUCET_COOLDOWN;
        if (lastFaucet[msg.sender] != 0 && block.timestamp < next) revert FaucetCooldown(next);
        lastFaucet[msg.sender] = block.timestamp;
        _mint(msg.sender, FAUCET_AMOUNT);
    }

    function setPaused(bool p) external onlyOwner {
        paused = p;
    }

    function setOraclePaused(bool p) external onlyOwner {
        oraclePaused = p;
    }

    function setBlocked(address account, bool blocked) external onlyOwner {
        isBlocked[account] = blocked;
    }

    function updateMultiplier(uint256 newMultiplier) external onlyOwner {
        emit UIMultiplierUpdated(uiMultiplier, newMultiplier, block.timestamp);
        uiMultiplier = newMultiplier;
    }

    function balanceOfUI(address account) external view returns (uint256) {
        return balanceOf(account) * uiMultiplier / 1e18;
    }

    function _update(address from, address to, uint256 value) internal override {
        if (paused) revert TokenPaused();
        if (isBlocked[from]) revert AccountBlocked(from);
        if (isBlocked[to]) revert AccountBlocked(to);
        super._update(from, to, value);
    }
}
