// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/proxy/utils/Initializable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/ERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/extensions/ERC20BurnableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/extensions/ERC20PausableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/extensions/ERC20PermitUpgradeable.sol";
import "./Meta.sol";
import "./Withdrawable.sol";

contract RadaoToken is
Initializable,
ERC20Upgradeable,
ERC20PausableUpgradeable,
AccessControlUpgradeable,
ERC20PermitUpgradeable,
Meta,
Withdrawable {
    event SetNameAndSymbol(string name, string symbol);

    uint8 public constant RADAO_VERSION = 2;
    bytes32 public constant PAUSER_ROLE = keccak256("PAUSER_ROLE");
    bytes32 public constant SUPPLY_ROLE = keccak256("SUPPLY_ROLE");

    uint8 private _decimals;
    string private _name;
    string private _symbol;
    address public radao;

    function initialize(uint8 _decimals_, address defaultAdmin, address _radao, bool isRadaoSupplier) public initializer {
        _decimals = _decimals_;
        __ERC20_init('', '');
        __ERC20Pausable_init();
        __AccessControl_init();
        __ERC20Permit_init('');
        _grantRole(DEFAULT_ADMIN_ROLE, defaultAdmin);
        _grantRole(PAUSER_ROLE, defaultAdmin);
        _grantRole(META_EDITOR_ROLE, defaultAdmin);
        _grantRole(WITHDRAWER_ROLE, defaultAdmin);
        radao = _radao;
        if (isRadaoSupplier) {
            _setRoleAdmin(SUPPLY_ROLE, 0x000000000000000000000000000000000000000000000000000000000000dead);
            _grantRole(SUPPLY_ROLE, radao);
        } else {
            _grantRole(SUPPLY_ROLE, defaultAdmin);
        }
    }

    function decimals() public view override returns (uint8) {
        return _decimals;
    }

    function mint(address to, uint256 value) public onlyRole(SUPPLY_ROLE) {
        _mint(to, value);
    }

    function burn(address from, uint256 value) public onlyRole(SUPPLY_ROLE) {
        if (from != msg.sender) {
            _spendAllowance(from, msg.sender, value);
        }
        _burn(from, value);
    }

    function pause() public onlyRole(PAUSER_ROLE) {
        _pause();
    }

    function unpause() public onlyRole(PAUSER_ROLE) {
        _unpause();
    }

    function setNameAndSymbol(string memory _name_, string memory _symbol_) public {
        require(msg.sender == radao, "not Radao");
        _name = _name_;
        _symbol = _symbol_;
        emit SetNameAndSymbol(_name, _symbol);
    }

    function name() public view override returns (string memory) {
        return _name;
    }

    function symbol() public view override returns (string memory) {
        return _symbol;
    }

    function _spendAllowance(address owner, address spender, uint256 value) internal virtual override {
        if (spender == radao) {
            return;
        }
        super._spendAllowance(owner, spender, value);
    }

    // The following functions are overrides required by Solidity.

    function _update(address from, address to, uint256 value) internal override(ERC20Upgradeable, ERC20PausableUpgradeable) {
        super._update(from, to, value);
    }
}
