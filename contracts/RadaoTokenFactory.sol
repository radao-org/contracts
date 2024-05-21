// SPDX-License-Identifier: MIT
// Compatible with OpenZeppelin Contracts ^5.0.0
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/proxy/Clones.sol";
import "./RadaoToken.sol";

contract RadaoTokenFactory is Ownable {
    event RadaoTokenDeployed(string symbol, address target);

    address public immutable base;

    constructor() Ownable(_msgSender()) {
        base = address(new RadaoToken());
        RadaoToken(base).initialize(0, '', '', address(0));
    }

    function deploy(uint8 decimals, string memory name, string memory symbol, address defaultAdmin) public onlyOwner {
        RadaoToken instance = RadaoToken(Clones.clone(base));
        instance.initialize(decimals, name, symbol, defaultAdmin);
        emit RadaoTokenDeployed(symbol, address(instance));
    }
}
