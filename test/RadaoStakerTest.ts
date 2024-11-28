import {loadFixture} from "@nomicfoundation/hardhat-toolbox/network-helpers"
import {expect} from "chai"
import {ContractTransactionResponse, EventLog} from "ethers"
import {ethers} from "hardhat"
import {RadaoStaker, RadaoToken} from "../typechain-types"

const initFixture = async () => {
    let [
        radaoDeployer,
        deployer,
        admin,
        account1, account2, account3, account4
    ] = await ethers.getSigners()
    const radaoToken = await (await ethers.getContractFactory("RadaoToken")).deploy()
    await radaoToken.waitForDeployment()
    await radaoToken.initialize(6, admin.address, "0x0000000000000000000000000000000000000000", false)
    const radao = await (await ethers.getContractFactory("Radao", radaoDeployer)).deploy(radaoDeployer)
    await radao.waitForDeployment()
    const radaoStaker = await (await ethers.getContractFactory("RadaoStaker", radaoDeployer)).deploy(radaoDeployer, await radao.radaoTokenBase())
    await radaoStaker.waitForDeployment()
    const decimals = 18
    const name = "Token"
    const symbol = "TOKEN"
    await radao.connect(deployer).deploy(decimals, name, symbol, admin.address)
    const contracts = await radao.getContracts(symbol)
    const security = await ethers.getContractAt("RadaoToken", contracts.security)
    const art = await ethers.getContractAt("RadaoToken", contracts.art)
    const dao = await ethers.getContractAt("RadaoToken", contracts.dao)
    const stArt = await checkEventDeploy(await radaoStaker.connect(deployer).deploy(art), radaoStaker, art)
    return {
        radaoDeployer, deployer, admin,
        account1, account2, account3, account4,
        radao, radaoStaker,
        decimals, name, symbol,
        security, art, dao, stArt
    }
}

async function checkEventDeploy(response: ContractTransactionResponse, radaoStaker: RadaoStaker, art: RadaoToken) {
    const receipt = await (response).wait(1)
    const log = receipt?.logs.filter(log => log instanceof EventLog && log.fragment?.name === "Deploy")[0]
        // @ts-ignore
        .args
    expect(log[0]).equal(art.target)
    const stArt = (await ethers.getContractAt("RadaoToken", log[1]))
    expect(await stArt.decimals()).equal(await art.decimals())
    expect(await stArt.name()).equal("Radao Staked Token: " + await art.name())
    expect(await stArt.symbol()).equal("st" + await art.symbol())
    await expect(response).emit(radaoStaker, "Deploy")
        .withArgs(art.target, stArt.target)
    return stArt
}

async function checkStaking(radaoStaker: RadaoStaker, art: RadaoToken, expectedStArt: RadaoToken, expectedTotalToken: number, expectedTotalStakedToken: number) {
    const {stakedToken, totalToken, totalStakedToken} = await radaoStaker.staking(art)
    expect(stakedToken).equal(expectedStArt.target)
    expect(totalToken).equal(expectedTotalToken)
    expect(totalStakedToken).equal(expectedTotalStakedToken)
}

describe("RadaoStaker", function () {
    it("revert on decimals mismatch", async function () {
        let [deployer] = await ethers.getSigners()
        const mockToken = await (await ethers.getContractFactory("MockToken", deployer)).deploy()
        await mockToken.waitForDeployment()
        const radao = await (await ethers.getContractFactory("Radao", deployer)).deploy(deployer)
        const radaoStaker = await (await ethers.getContractFactory("RadaoStaker", deployer)).deploy(deployer, await radao.radaoTokenBase())
        await radaoStaker.deploy(mockToken)
        await mockToken["decimals(uint8)"](1)
        await expect(radaoStaker.staking(mockToken)).revertedWith("decimals mismatch")
    })

    it("MVP", async function () {
        const {
            deployer, admin,
            account1, account2,
            radao, radaoStaker,
            symbol,
            security, art, stArt
        } = await loadFixture(initFixture)

        const mockToken = await (await ethers.getContractFactory("MockToken", deployer)).deploy()
        await mockToken.waitForDeployment()

        await expect(radaoStaker.staking(mockToken)).revertedWith("unknown token")
        await expect(radaoStaker.convertTokenToStakedToken(mockToken, 1)).revertedWith("unknown token")
        await expect(radaoStaker.convertStakedTokenToToken(mockToken, 1)).revertedWith("unknown token")
        await expect(radaoStaker.stake(mockToken, 1, "0x0000000000000000000000000000000000000000")).revertedWith("unknown token")
        await expect(radaoStaker.unstake(mockToken, 1, "0x0000000000000000000000000000000000000000")).revertedWith("unknown token")
        await expect(radaoStaker.reward(mockToken, 1)).revertedWith("unknown token")

        await checkStaking(radaoStaker, art, stArt, 0, 0)
        await expect(radaoStaker.deploy(art)).revertedWith("token already deployed")
        await security.connect(admin).mint(admin.address, 2)
        expect((await radaoStaker.convertStakedTokenToToken(art, 42)).tokenValue).equal(42)

        await radao.connect(admin).lock(symbol, 1, admin.address, account1.address)
        await art.connect(account1).approve(radaoStaker.target, 1)
        await expect(radaoStaker.connect(account1).stake(art, 1, "0x0000000000000000000000000000000000000000"))
            .revertedWithCustomError(mockToken, "ERC20InvalidReceiver")
            .withArgs("0x0000000000000000000000000000000000000000")
        let response = await radaoStaker.connect(account1).stake(art, 1, account2.address)
        await expect(response).emit(radaoStaker, "Stake")
            .withArgs(art.target, stArt.target, 1, 1, 1, 1, account2.address)
        await expect(response).changeTokenBalances(art, [
            admin, account1, account2, radaoStaker
        ], [
            0, -1, 0, 1
        ])
        expect(await art.totalSupply()).equal(1)
        await expect(response).changeTokenBalances(stArt, [
            admin, account1, account2, radaoStaker
        ], [
            0, 0, 1, 0
        ])
        expect(await stArt.totalSupply()).equal(1)
        expect((await radaoStaker.convertTokenToStakedToken(art, 42)).stakedTokenValue).equal(42)
        expect((await radaoStaker.convertStakedTokenToToken(art, 42)).tokenValue).equal(42)

        await radao.connect(admin).lock(symbol, 1, admin.address, admin.address)
        await art.connect(admin).approve(radaoStaker.target, 1)
        response = await radaoStaker.connect(admin).reward(art, 1)
        await expect(response).emit(radaoStaker, "Reward")
            .withArgs(art.target, stArt.target, 1, 2, 1)
        await expect(response).changeTokenBalances(art, [
            admin, account1, account2, radaoStaker
        ], [
            -1, 0, 0, 1
        ])
        expect(await art.totalSupply()).equal(2)
        await expect(response).changeTokenBalances(stArt, [
            admin, account1, account2, radaoStaker
        ], [
            0, 0, 0, 0
        ])
        expect(await stArt.totalSupply()).equal(1)
        expect((await radaoStaker.convertTokenToStakedToken(art, 42)).stakedTokenValue).equal(21)
        expect((await radaoStaker.convertStakedTokenToToken(art, 42)).tokenValue).equal(84)

        await expect(radaoStaker.connect(account2).unstake(art, 1, "0x0000000000000000000000000000000000000000"))
            .revertedWithCustomError(mockToken, "ERC20InvalidReceiver")
            .withArgs("0x0000000000000000000000000000000000000000")
        response = await radaoStaker.connect(account2).unstake(art, 1, account1.address)
        await expect(response).emit(radaoStaker, "Unstake")
            .withArgs(art.target, stArt.target, 2, 0, 0, 1, account1.address)
        await expect(response).changeTokenBalances(art, [
            admin, account1, account2, radaoStaker
        ], [
            0, 2, 0, -2
        ])
        expect(await art.totalSupply()).equal(2)
        await expect(response).changeTokenBalances(stArt, [
            admin, account1, account2, radaoStaker
        ], [
            0, 0, -1, 0
        ])
        expect(await stArt.totalSupply()).equal(0)
        expect((await radaoStaker.convertTokenToStakedToken(art, 42)).stakedTokenValue).equal(42)
        expect((await radaoStaker.convertStakedTokenToToken(art, 42)).tokenValue).equal(42)
    })

    it("Scenario", async function () {
        const {
            admin,
            account1, account2, account3, account4,
            radao, radaoStaker,
            symbol,
            security, art, stArt
        } = await loadFixture(initFixture)
        const reward = async (value: bigint) => {
            await security.connect(admin).mint(admin.address, value)
            await radao.connect(admin).lock(symbol, value, admin.address, admin.address)
            await radaoStaker.connect(admin).reward(art, value)
        }
        await art.connect(admin).approve(radaoStaker.target, ethers.MaxUint256)
        await art.connect(account1).approve(radaoStaker.target, ethers.MaxUint256)
        await art.connect(account2).approve(radaoStaker.target, ethers.MaxUint256)
        await art.connect(account3).approve(radaoStaker.target, ethers.MaxUint256)
        await security.connect(admin).mint(admin.address, ethers.parseEther("300"))
        await radao.connect(admin).lock(symbol, ethers.parseEther("100"), admin.address, account1.address)
        await radao.connect(admin).lock(symbol, ethers.parseEther("200"), admin.address, account2.address)
        await radaoStaker.connect(account1).stake(art, ethers.parseEther("100"), account1.address)
        await radaoStaker.connect(account2).stake(art, ethers.parseEther("200"), account2.address)
        await reward(ethers.parseEther("10"))
        await radaoStaker.connect(account2).unstake(art, ethers.parseEther("100"), account2.address)
        await art.connect(account2).transfer(account1.address, await art.balanceOf(account2.address))
        await radaoStaker.connect(account1).stake(art, await art.balanceOf(account1.address), account3.address)
        await reward(ethers.parseEther("10"))
        await radaoStaker.connect(account1).unstake(art, await stArt.balanceOf(account1.address), account1.address)
        await radaoStaker.connect(account2).unstake(art, await stArt.balanceOf(account2.address), account2.address)
        await radaoStaker.connect(account3).unstake(art, await stArt.balanceOf(account3.address), account4.address)
        expect(await stArt.totalSupply()).equal(0)
        expect(await art.totalSupply()).equal(ethers.parseEther("320"))
        expect(await art.balanceOf(account1.address)).equal(ethers.parseEther("106.666666666666666667"))
        expect(await art.balanceOf(account2.address)).equal(ethers.parseEther("106.666666666666666667"))
        expect(await art.balanceOf(account4.address)).equal(ethers.parseEther("106.666666666666666666"))
        expect(await art.totalSupply()).equal(
            await art.balanceOf(account1.address) +
            await art.balanceOf(account2.address) +
            await art.balanceOf(account4.address)
        )
    })
})
