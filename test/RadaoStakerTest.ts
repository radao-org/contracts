import {loadFixture} from "@nomicfoundation/hardhat-toolbox/network-helpers"
import {expect} from "chai"
import {EventLog} from "ethers"
import {ContractTransactionReceipt} from "ethers/lib.commonjs/contract/wrappers"
import {ethers} from "hardhat"
import {RadaoStaker, RadaoToken} from "../typechain-types"

const initFixture = async () => {
    let [
        radaoDeployer,
        deployer,
        admin,
        account1,
        account2,
        account3,
        account4,
        account5,
        account6
    ] = await ethers.getSigners()
    const radaoToken = await (await ethers.getContractFactory("RadaoToken")).deploy()
    await radaoToken.waitForDeployment()
    await radaoToken.initialize(6, await admin.getAddress(), "0x0000000000000000000000000000000000000000", false)
    const radao = await (await ethers.getContractFactory("Radao", radaoDeployer)).deploy(radaoDeployer)
    await radao.waitForDeployment()
    const radaoStaker = await (await ethers.getContractFactory("RadaoStaker", radaoDeployer)).deploy(radaoDeployer, await radao.radaoTokenBase())
    await radaoStaker.waitForDeployment()
    const decimals = 18
    const name = "Token"
    const symbol = "TOKEN"
    await radao.connect(deployer).deploy(decimals, name, symbol, await admin.getAddress())
    const contracts = await radao.getContracts(symbol)
    const security = await ethers.getContractAt("RadaoToken", contracts.security)
    const art = await ethers.getContractAt("RadaoToken", contracts.art)
    const dao = await ethers.getContractAt("RadaoToken", contracts.dao)
    let receipt = await (await radaoStaker.connect(deployer).deploy(art)).wait(1)
    let stArt = await checkEventDeploy(receipt, art)
    return {
        radaoDeployer, deployer, admin,
        account1, account2, account3, account4, account5, account6,
        radao, radaoStaker,
        decimals, name, symbol,
        security, art, dao, stArt
    }
}

async function checkEventDeploy(receipt: ContractTransactionReceipt | null, art: RadaoToken) {
    let log = receipt?.logs.filter(log => log instanceof EventLog && log.fragment?.name === "Deploy")[0]
        // @ts-ignore
        .args
    expect(log[0]).equal(await art.getAddress())
    const stArt = (await ethers.getContractAt("RadaoToken", log[1]))
    expect(await stArt.decimals()).equal(await art.decimals())
    expect(await stArt.name()).equal("Radao Staked: " + await art.name())
    expect(await stArt.symbol()).equal("st" + await art.symbol())
    return stArt
}

async function checkStaking(radaoStaker: RadaoStaker, art: RadaoToken, expectedStArt: RadaoToken, expectedTotalToken: number, expectedTotalStakedToken: number) {
    const {stakedToken, totalToken, totalStakedToken} = await radaoStaker.staking(art)
    expect(stakedToken).equal(await expectedStArt.getAddress())
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
            account1,
            radao, radaoStaker,
            symbol,
            security, art, stArt
        } = await loadFixture(initFixture)

        const mockToken = await (await ethers.getContractFactory("MockToken", deployer)).deploy()
        await mockToken.waitForDeployment()

        await expect(radaoStaker.staking(mockToken)).revertedWith("unknown token")
        await expect(radaoStaker.convertTokenToStakedToken(mockToken, 1)).revertedWith("unknown token")
        await expect(radaoStaker.convertStakedTokenToToken(mockToken, 1)).revertedWith("unknown token")
        await expect(radaoStaker.stake(mockToken, 1)).revertedWith("unknown token")
        await expect(radaoStaker.unstake(mockToken, 1)).revertedWith("unknown token")
        await expect(radaoStaker.addRewards(mockToken, 1)).revertedWith("unknown token")

        await checkStaking(radaoStaker, art, stArt, 0, 0)
        await expect(radaoStaker.deploy(art)).revertedWith("token already deployed")
        await security.connect(admin).mint(await admin.getAddress(), 2)
        expect((await radaoStaker.convertStakedTokenToToken(art, 42)).tokenValue).equal(42)

        await radao.connect(admin).lock(symbol, 1, await admin.getAddress(), await account1.getAddress())
        await art.connect(account1).approve(await radaoStaker.getAddress(), 1)
        let response = await radaoStaker.connect(account1).stake(art, 1)
        await expect(response).emit(radaoStaker, "Stake")
            .withArgs(await art.getAddress(), await stArt.getAddress(), 1, 1, 1, 1)
        await expect(response).changeTokenBalances(art, [
            account1, radaoStaker
        ], [
            -1, 1
        ])
        expect(await art.totalSupply()).equal(1)
        await expect(response).changeTokenBalances(stArt, [
            admin, account1, radaoStaker
        ], [
            0, 1, 0
        ])
        expect(await stArt.totalSupply()).equal(1)
        expect((await radaoStaker.convertTokenToStakedToken(art, 42)).stakedTokenValue).equal(42)
        expect((await radaoStaker.convertStakedTokenToToken(art, 42)).tokenValue).equal(42)

        await radao.connect(admin).lock(symbol, 1, await admin.getAddress(), await admin.getAddress())
        await art.connect(admin).approve(await radaoStaker.getAddress(), 1)
        response = await radaoStaker.connect(admin).addRewards(art, 1)
        await expect(response).emit(radaoStaker, "AddRewards")
            .withArgs(await art.getAddress(), await stArt.getAddress(), 1, 2, 1)
        await expect(response).changeTokenBalances(art, [
            admin, account1, radaoStaker
        ], [
            -1, 0, 1
        ])
        expect(await art.totalSupply()).equal(2)
        await expect(response).changeTokenBalances(stArt, [
            admin, account1, radaoStaker
        ], [
            0, 0, 0
        ])
        expect(await stArt.totalSupply()).equal(1)
        expect((await radaoStaker.convertTokenToStakedToken(art, 42)).stakedTokenValue).equal(21)
        expect((await radaoStaker.convertStakedTokenToToken(art, 42)).tokenValue).equal(84)

        response = await radaoStaker.connect(account1).unstake(art, 1)
        await expect(response).emit(radaoStaker, "Unstake")
            .withArgs(await art.getAddress(), await stArt.getAddress(), 2, 1, 0, 0)
        await expect(response).changeTokenBalances(art, [
            admin, account1, radaoStaker
        ], [
            0, 2, -2
        ])
        expect(await art.totalSupply()).equal(2)
        await expect(response).changeTokenBalances(stArt, [
            admin, account1, radaoStaker
        ], [
            0, -1, 0
        ])
        expect(await stArt.totalSupply()).equal(0)
        expect((await radaoStaker.convertTokenToStakedToken(art, 42)).stakedTokenValue).equal(42)
        expect((await radaoStaker.convertStakedTokenToToken(art, 42)).tokenValue).equal(42)
    })

    it("Scenario", async function () {
        const {
            admin,
            account1, account2, account3, account4, account5, account6,
            radao, radaoStaker,
            symbol,
            security, art, stArt
        } = await loadFixture(initFixture)
        await security.connect(admin).mint(await admin.getAddress(), ethers.parseEther('10000'))
        await radao.connect(admin).lock(symbol, ethers.parseEther('100'), await admin.getAddress(), await account1.getAddress())
        await radao.connect(admin).lock(symbol, ethers.parseEther('200'), await admin.getAddress(), await account2.getAddress())
        await radao.connect(admin).lock(symbol, ethers.parseEther('1000'), await admin.getAddress(), await account3.getAddress())
        await radao.connect(admin).lock(symbol, ethers.parseEther('10'), await admin.getAddress(), await account4.getAddress())
        await radao.connect(admin).lock(symbol, ethers.parseEther('600'), await admin.getAddress(), await account5.getAddress())
        await radao.connect(admin).lock(symbol, ethers.parseEther('750'), await admin.getAddress(), await account6.getAddress())
        await art.connect(account1).approve(await radaoStaker.getAddress(), ethers.parseEther('1000000'))
        await art.connect(account2).approve(await radaoStaker.getAddress(), ethers.parseEther('1000000'))
        await art.connect(account3).approve(await radaoStaker.getAddress(), ethers.parseEther('1000000'))
        await art.connect(account4).approve(await radaoStaker.getAddress(), ethers.parseEther('1000000'))
        await art.connect(account5).approve(await radaoStaker.getAddress(), ethers.parseEther('1000000'))
        await art.connect(account6).approve(await radaoStaker.getAddress(), ethers.parseEther('1000000'))
        await art.connect(admin).approve(await radaoStaker.getAddress(), ethers.parseEther('1000000'))
        await stArt.connect(account1).approve(await radaoStaker.getAddress(), ethers.parseEther('1000000'))
        await stArt.connect(account2).approve(await radaoStaker.getAddress(), ethers.parseEther('1000000'))
        await stArt.connect(account3).approve(await radaoStaker.getAddress(), ethers.parseEther('1000000'))
        await stArt.connect(account4).approve(await radaoStaker.getAddress(), ethers.parseEther('1000000'))
        await stArt.connect(account5).approve(await radaoStaker.getAddress(), ethers.parseEther('1000000'))
        await stArt.connect(account6).approve(await radaoStaker.getAddress(), ethers.parseEther('1000000'))
        await radaoStaker.connect(account1).stake(art, ethers.parseEther('20'))
        await radaoStaker.connect(account2).stake(art, ethers.parseEther('190'))
        await radaoStaker.connect(account3).stake(art, ethers.parseEther('500'))
        await radaoStaker.connect(account4).stake(art, ethers.parseEther('0'))
        await radaoStaker.connect(account5).stake(art, ethers.parseEther('13'))
        await radaoStaker.connect(account6).stake(art, ethers.parseEther('14.6'))
        await radao.connect(admin).lock(symbol, ethers.parseEther('45'), await admin.getAddress(), await admin.getAddress())
        await radaoStaker.connect(admin).addRewards(art, ethers.parseEther('45'))
        await radaoStaker.connect(account1).unstake(art, ethers.parseEther('5'))
        await radaoStaker.connect(account2).unstake(art, ethers.parseEther('0'))
        await radaoStaker.connect(account3).unstake(art, ethers.parseEther('100'))
        await radaoStaker.connect(account4).unstake(art, ethers.parseEther('0'))
        await radaoStaker.connect(account5).unstake(art, ethers.parseEther('3'))
        await radaoStaker.connect(account6).unstake(art, ethers.parseEther('6.6'))
        await radao.connect(admin).lock(symbol, ethers.parseEther('86.4'), await admin.getAddress(), await admin.getAddress())
        await radaoStaker.connect(admin).addRewards(art, ethers.parseEther('86.4'))
        console.log('account1', ethers.formatEther(await art.balanceOf(await account1.getAddress())))
        console.log('account2', ethers.formatEther(await art.balanceOf(await account2.getAddress())))
        console.log('account3', ethers.formatEther(await art.balanceOf(await account3.getAddress())))
        console.log('account4', ethers.formatEther(await art.balanceOf(await account4.getAddress())))
        console.log('account5', ethers.formatEther(await art.balanceOf(await account5.getAddress())))
        console.log('account6', ethers.formatEther(await art.balanceOf(await account6.getAddress())))
        console.log('admin', ethers.formatEther(await art.balanceOf(await admin.getAddress())))
        console.log('radaoStaker', ethers.formatEther(await art.balanceOf(await radaoStaker.getAddress())))
        console.log('account1', ethers.formatEther(await stArt.balanceOf(await account1.getAddress())))
        console.log('account2', ethers.formatEther(await stArt.balanceOf(await account2.getAddress())))
        console.log('account3', ethers.formatEther(await stArt.balanceOf(await account3.getAddress())))
        console.log('account4', ethers.formatEther(await stArt.balanceOf(await account4.getAddress())))
        console.log('account5', ethers.formatEther(await stArt.balanceOf(await account5.getAddress())))
        console.log('account6', ethers.formatEther(await stArt.balanceOf(await account6.getAddress())))
    })
})
