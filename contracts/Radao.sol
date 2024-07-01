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

    function _hasAdminRole(string memory symbol) private view {
        RadaoToken security;
        RadaoToken dao;
        RadaoToken art;
        (security, dao, art) = getContracts(symbol);
        address admin = msg.sender;
        require(security.hasRole(0x00, admin) && dao.hasRole(0x00, admin) && art.hasRole(0x00, admin), "not admin");
    }

    function _deploy(string memory name, string memory symbol, RadaoToken security, RadaoToken dao, RadaoToken art) private {
        _setNameAndSymbol(security, dao, art, name, symbol);
        contracts[symbol] = Contracts(security, dao, art);
        emit Deploy(symbol, address(security), address(dao), address(art));
    }

    function _undeploy(string memory symbol) private {
        RadaoToken security;
        RadaoToken dao;
        RadaoToken art;
        (security, dao, art) = getContracts(symbol);
        delete contracts[symbol];
        emit Undeploy(symbol, address(security), address(dao), address(art));
    }

    function _setNameAndSymbol(RadaoToken security, RadaoToken dao, RadaoToken art, string memory name, string memory symbol) private {
        security.setNameAndSymbol(string.concat(name, " - Security"), string.concat(symbol, ".S"));
        dao.setNameAndSymbol(string.concat(name, " - Decentralized Autonomous Organization"), string.concat(symbol, ".DAO"));
        art.setNameAndSymbol(string.concat(name, " - Asset Referenced Token"), string.concat(symbol, ".ART"));
    }

    function getContracts(string memory symbol) public view returns (RadaoToken security, RadaoToken dao, RadaoToken art) {
        require(address(contracts[symbol].security) != address(0), "unknown symbol");
        security = contracts[symbol].security;
        dao = contracts[symbol].dao;
        art = contracts[symbol].art;
    }

    function setNameAndSymbol(string memory symbol, string memory newName, string memory newSymbol) public {
        _hasAdminRole(symbol);
        RadaoToken security;
        RadaoToken dao;
        RadaoToken art;
        (security, dao, art) = getContracts(symbol);
        undeploy(symbol);
        _deploy(newName, newSymbol, security, dao, art);
    }

    function deploy(uint8 decimals, string memory name, string memory symbol, address defaultAdmin) public {
        if (address(contracts[symbol].security) != address(0)) {
            _hasAdminRole(symbol);
            _undeploy(symbol);
        }
        RadaoToken security = RadaoToken(Clones.clone(radaoTokenBase));
        security.initialize(decimals, defaultAdmin, address(this), false);
        RadaoToken dao = RadaoToken(Clones.clone(radaoTokenBase));
        dao.initialize(decimals, defaultAdmin, address(this), true);
        RadaoToken art = RadaoToken(Clones.clone(radaoTokenBase));
        art.initialize(decimals, defaultAdmin, address(this), true);
        _setNameAndSymbol(security, dao, art, name, symbol);
        _deploy(name, symbol, security, dao, art);
    }

    function undeploy(string memory symbol) public {
        _hasAdminRole(symbol);
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
