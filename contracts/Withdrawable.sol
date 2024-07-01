// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

abstract contract Withdrawable is AccessControlUpgradeable {
    event Withdraw(address indexed token, address indexed to, uint256 amount);

    using SafeERC20 for IERC20;

    bytes32 public constant WITHDRAWER_ROLE = keccak256("WITHDRAWER_ROLE");

    function withdraw(IERC20 token, address to, uint256 value) public virtual onlyRole(WITHDRAWER_ROLE) {
        token.safeTransfer(to, value);
        emit Withdraw(address(token), to, value);
    }
}
