// SPDX-License-Identifier: MIT
// Compatible with OpenZeppelin Contracts ^5.0.0
pragma solidity ^0.8.20;

import "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";

abstract contract Meta is AccessControlUpgradeable {
    event SetMeta(string key, string value);
    event DeleteMeta(string key);

    bytes32 public constant META_EDITOR_ROLE = keccak256("META_EDITOR_ROLE");

    mapping(string => string) private meta;

    function getMeta(string[] memory keys) public view returns (string[] memory values) {
        values = new string[](keys.length);
        for (uint i = 0; i < keys.length; i++) {
            values[i] = meta[keys[i]];
        }
        return values;
    }

    function getMeta(string memory key) public view returns (string memory value) {
        return meta[key];
    }

    function setMeta(string[] memory entries) public virtual {
        require(entries.length % 2 == 0, "Meta: entries length must be even ([key1, value1, ...])");
        for (uint i = 0; i < entries.length; i += 2) {
            setMeta(entries[i], entries[i + 1]);
        }
    }

    function setMeta(string memory key, string memory value) public virtual onlyRole(META_EDITOR_ROLE) {
        meta[key] = value;
        emit SetMeta(key, value);
    }

    function deleteMeta(string[] memory keys) public virtual {
        for (uint i = 0; i < keys.length; i++) {
            deleteMeta(keys[i]);
        }
    }

    function deleteMeta(string memory key) public virtual onlyRole(META_EDITOR_ROLE) {
        delete meta[key];
        emit DeleteMeta(key);
    }
}
