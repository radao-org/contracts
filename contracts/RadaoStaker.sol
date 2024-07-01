// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/proxy/Clones.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/math/Math.sol";
import "./RadaoToken.sol";
import "./Radao.sol";

contract RadaoStaker is Meta, Withdrawable {
    event Deploy(address token, address stakedToken);
    event Stake(address token, address stakedToken, uint256 tokenValue, uint256 stakedTokenValue, uint256 totalToken, uint256 totalStakedToken);
    event Unstake(address token, address stakedToken, uint256 tokenValue, uint256 stakedTokenValue, uint256 totalToken, uint256 totalStakedToken);
    event AddRewards(address token, address stakedToken, uint256 tokenValue, uint256 totalToken, uint256 totalStakedToken);

    using Math for uint256;
    using SafeERC20 for RadaoToken;

    address public immutable radaoTokenBase;
    mapping(RadaoToken => RadaoToken) private tokens; // TOKEN -> stTOKEN

    constructor(address defaultAdmin, address _radaoTokenBase) {
        _grantRole(META_EDITOR_ROLE, defaultAdmin);
        _grantRole(WITHDRAWER_ROLE, defaultAdmin);
        radaoTokenBase = _radaoTokenBase;
    }

    function getStakedToken(RadaoToken token) private view returns (RadaoToken stakedToken) {
        stakedToken = tokens[token];
        require(address(stakedToken) != address(0), "unknown token");
        require(stakedToken.decimals() == token.decimals(), "decimals mismatch");
    }

    function getTotal(RadaoToken token, RadaoToken stakedToken) private view returns (uint256 totalToken, uint256 totalStakedToken) {
        totalToken = token.balanceOf(address(this));
        totalStakedToken = stakedToken.totalSupply();
    }

    function staking(RadaoToken token) public view returns (RadaoToken stakedToken, uint256 totalToken, uint256 totalStakedToken) {
        stakedToken = getStakedToken(token);
        (totalToken, totalStakedToken) = getTotal(token, stakedToken);
    }

    function convertTokenToStakedToken(RadaoToken token, uint256 tokenValue) public view returns (RadaoToken stakedToken, uint256 stakedTokenValue, uint256 totalToken, uint256 totalStakedToken) {
        (stakedToken, totalToken, totalStakedToken) = staking(token);
        stakedTokenValue = totalToken == 0 ? tokenValue : tokenValue.mulDiv(totalStakedToken, totalToken);
    }

    function convertStakedTokenToToken(RadaoToken token, uint256 stakedTokenValue) public view returns (RadaoToken stakedToken, uint256 tokenValue, uint256 totalToken, uint256 totalStakedToken) {
        (stakedToken, totalToken, totalStakedToken) = staking(token);
        tokenValue = totalStakedToken == 0 ? stakedTokenValue : stakedTokenValue.mulDiv(totalToken, totalStakedToken);
    }

    function deploy(RadaoToken token) public {
        RadaoToken stakedToken = tokens[token];
        require(address(stakedToken) == address(0), "token already deployed");
        stakedToken = RadaoToken(Clones.clone(radaoTokenBase));
        stakedToken.initialize(token.decimals(), address(this), address(this), true);
        stakedToken.setNameAndSymbol(string.concat("Radao Staked: ", token.name()), string.concat("st", token.symbol()));
        tokens[token] = stakedToken;
        emit Deploy(address(token), address(stakedToken));
    }

    function stake(RadaoToken token, uint256 tokenValue) public returns (RadaoToken stakedToken, uint256 stakedTokenValue, uint256 totalToken, uint256 totalStakedToken) {
        (stakedToken, stakedTokenValue,,) = convertTokenToStakedToken(token, tokenValue);
        address holder = msg.sender;
        token.safeTransferFrom(holder, address(this), tokenValue);
        stakedToken.mint(holder, stakedTokenValue);
        (totalToken, totalStakedToken) = getTotal(token, stakedToken);
        emit Stake(address(token), address(stakedToken), tokenValue, stakedTokenValue, totalToken, totalStakedToken);
    }

    function unstake(RadaoToken token, uint256 stakedTokenValue) public returns (RadaoToken stakedToken, uint256 tokenValue, uint256 totalToken, uint256 totalStakedToken) {
        (stakedToken, tokenValue,,) = convertStakedTokenToToken(token, stakedTokenValue);
        address holder = msg.sender;
        stakedToken.burn(holder, stakedTokenValue);
        token.safeTransfer(holder, tokenValue);
        (totalToken, totalStakedToken) = getTotal(token, stakedToken);
        emit Unstake(address(token), address(stakedToken), tokenValue, stakedTokenValue, totalToken, totalStakedToken);
    }

    function addRewards(RadaoToken token, uint256 tokenValue) public returns (RadaoToken stakedToken, uint256 totalToken, uint256 totalStakedToken) {
        stakedToken = getStakedToken(token);
        token.safeTransferFrom(msg.sender, address(this), tokenValue);
        (totalToken, totalStakedToken) = getTotal(token, stakedToken);
        emit AddRewards(address(token), address(stakedToken), tokenValue, token.balanceOf(address(this)), stakedToken.totalSupply());
    }
}
