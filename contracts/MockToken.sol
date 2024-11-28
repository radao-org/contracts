// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract MockToken is ERC20 {
    uint8 private _decimals = 6;

    constructor()ERC20("Mock", "MOCK") {}

    function decimals() public view override returns (uint8) {
        return _decimals;
    }

    function decimals(uint8 _decimals_) public {
        _decimals = _decimals_;
    }
}
