// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/proxy/Clones.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "./RadaoToken.sol";

contract Radao is Meta, Withdrawable {
    event Deploy(string symbol, address security, address dao, address art);
    event Undeploy(string symbol, address security, address dao, address art);
    event Lock(string symbol, uint256 value, address daoRecipient, address artRecipient);
    event Unlock(string symbol, uint256 value, address securityRecipient);

    error RadaoInvalidRecipient(address sender);

    using SafeERC20 for RadaoToken;

    struct Contracts {
        RadaoToken security;
        RadaoToken dao;
        RadaoToken art;
    }

    address public immutable radaoTokenBase;
    mapping(string => Contracts) private contracts;

    constructor(address defaultAdmin) {
        _grantRole(META_EDITOR_ROLE, defaultAdmin);
        _grantRole(WITHDRAWER_ROLE, defaultAdmin);
        radaoTokenBase = address(new RadaoToken());
        RadaoToken(radaoTokenBase).initialize(0, address(0), address(0), false);
    }

    function _deploy(string memory name, string memory symbol, RadaoToken security, RadaoToken dao, RadaoToken art) private {
        require(!isExists(symbol), "already deployed");
        if (address(security) != address(0)) {
            security.setNameAndSymbol(string.concat(name, " - Security"), string.concat(symbol, ".S"));
            dao.setNameAndSymbol(string.concat(name, " - Decentralized Autonomous Organization"), string.concat(symbol, ".DAO"));
        }
        art.setNameAndSymbol(string.concat(name, " - Asset Referenced Token"), string.concat(symbol, ".ART"));
        contracts[symbol] = Contracts(security, dao, art);
        emit Deploy(symbol, address(security), address(dao), address(art));
    }

    function _undeploy(string memory symbol) private {
        RadaoToken security;
        RadaoToken dao;
        RadaoToken art;
        (security, dao, art) = getContracts(symbol);
        address admin = msg.sender;
        require((address(security) == address(0) || (security.hasRole(0x00, admin) && dao.hasRole(0x00, admin))) && art.hasRole(0x00, admin), "not admin");
        delete contracts[symbol];
        emit Undeploy(symbol, address(security), address(dao), address(art));
    }

    function isExists(string memory symbol) public view returns (bool) {
        return address(contracts[symbol].art) != address(0);
    }

    function getContracts(string memory symbol) public view returns (RadaoToken security, RadaoToken dao, RadaoToken art) {
        require(isExists(symbol), "unknown symbol");
        security = contracts[symbol].security;
        dao = contracts[symbol].dao;
        art = contracts[symbol].art;
    }

    function setNameAndSymbol(string memory symbol, string memory newName, string memory newSymbol) public {
        RadaoToken security;
        RadaoToken dao;
        RadaoToken art;
        (security, dao, art) = getContracts(symbol);
        _undeploy(symbol);
        _deploy(newName, newSymbol, security, dao, art);
    }

    function deploy(uint8 decimals, string memory name, string memory symbol, address defaultAdmin) public {
        RadaoToken security = RadaoToken(Clones.clone(radaoTokenBase));
        security.initialize(decimals, defaultAdmin, address(this), false);
        RadaoToken dao = RadaoToken(Clones.clone(radaoTokenBase));
        dao.initialize(decimals, defaultAdmin, address(this), true);
        RadaoToken art = RadaoToken(Clones.clone(radaoTokenBase));
        art.initialize(decimals, defaultAdmin, address(this), true);
        _deploy(name, symbol, security, dao, art);
    }

    function deployART(uint8 decimals, string memory name, string memory symbol, address defaultAdmin) public {
        RadaoToken art = RadaoToken(Clones.clone(radaoTokenBase));
        art.initialize(decimals, defaultAdmin, address(this), false);
        _deploy(name, symbol, RadaoToken(address(0)), RadaoToken(address(0)), art);
    }

    function undeploy(string memory symbol) public {
        _undeploy(symbol);
    }

    function lock(string memory symbol, uint256 value, address daoRecipient, address artRecipient) public {
        RadaoToken security;
        RadaoToken dao;
        RadaoToken art;
        (security, dao, art) = getContracts(symbol);
        security.safeTransferFrom(msg.sender, address(this), value);
        dao.mint(daoRecipient, value);
        art.mint(artRecipient, value);
        emit Lock(symbol, value, daoRecipient, artRecipient);
    }

    function unlock(string memory symbol, uint256 value, address securityRecipient) public {
        RadaoToken security;
        RadaoToken dao;
        RadaoToken art;
        (security, dao, art) = getContracts(symbol);
        art.burn(msg.sender, value);
        dao.burn(msg.sender, value);
        security.safeTransfer(securityRecipient, value);
        emit Unlock(symbol, value, securityRecipient);
    }
}
