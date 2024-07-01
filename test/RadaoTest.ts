import {expect} from "chai"
import {ethers} from "hardhat"
import {EventLog} from "ethers"
import {ContractTransactionReceipt} from "ethers/lib.commonjs/contract/wrappers"
import {Radao} from "../typechain-types"

async function checkTokens(radao: Radao, symbol: string, security: string, dao: string, art: string) {
    const contracts = await radao.getContracts(symbol)
    expect(contracts.security).equal(security)
    expect(contracts.dao).equal(dao)
    expect(contracts.art).equal(art)
}

async function checkEventDeploy(receipt: ContractTransactionReceipt | null, decimals: number, name: string, symbol: string, radao: Radao) {
    let log = receipt?.logs.filter(log => log instanceof EventLog && log.fragment?.name === "Deploy")[0]
        // @ts-ignore
        .args
    expect(log[0]).equal(symbol)
    const security = (await ethers.getContractAt("RadaoToken", log[1]))
    expect(await security.decimals()).equal(decimals)
    expect(await security.name()).equal(`${name} - Security`)
    expect(await security.symbol()).equal(`${symbol}.S`)
    const dao = (await ethers.getContractAt("RadaoToken", log[2]))
    expect(await dao.decimals()).equal(decimals)
    expect(await dao.name()).equal(`${name} - Decentralized Autonomous Organization`)
    expect(await dao.symbol()).equal(`${symbol}.DAO`)
    const art = (await ethers.getContractAt("RadaoToken", log[3]))
    expect(await art.decimals()).equal(decimals)
    expect(await art.name()).equal(`${name} - Asset Referenced Token`)
    expect(await art.symbol()).equal(`${symbol}.ART`)
    await checkTokens(radao, symbol, await security.getAddress(), await dao.getAddress(), await art.getAddress())
    return {security, dao, art}
}

describe("Radao", function () {

    it("MVP", async function () {
        let [
            radaoDeployer,
            deployer,
            admin,
            anotherAccount,
            anotherAccount2,
            anotherAccount3,
            anotherAccount4,
            daoRecipient,
            artRecipient,
            securityRecipient
        ] = await ethers.getSigners()
        const radao = await (await ethers.getContractFactory("Radao", radaoDeployer)).deploy(radaoDeployer)
        await radao.waitForDeployment()
        let decimals = 18
        let name = "Token"
        let symbol = "TOKEN"
        let receipt = await (await radao.connect(deployer).deploy(decimals, name, symbol, await admin.getAddress())).wait(1)
        let tokens = await checkEventDeploy(receipt, decimals, name, symbol, radao)

        // anotherAccount can't redeploy same symbol
        await expect(radao.connect(anotherAccount).deploy(decimals, name, symbol, await anotherAccount.getAddress()))
            .revertedWith("not admin")
        await tokens.security.connect(admin).grantRole(await tokens.security.DEFAULT_ADMIN_ROLE(), anotherAccount)
        await expect(radao.connect(anotherAccount).deploy(decimals, name, symbol, await anotherAccount.getAddress()))
            .revertedWith("not admin")
        await tokens.dao.connect(admin).grantRole(await tokens.dao.DEFAULT_ADMIN_ROLE(), anotherAccount)
        await expect(radao.connect(anotherAccount).deploy(decimals, name, symbol, await anotherAccount.getAddress()))
            .revertedWith("not admin")
        await tokens.art.connect(admin).grantRole(await tokens.art.DEFAULT_ADMIN_ROLE(), anotherAccount)
        // but he can if he is the new admin of the 3 tokens
        admin = anotherAccount
        receipt = await (await radao.connect(admin).deploy(decimals, name, symbol, await admin.getAddress())).wait(1)
        await checkEventDeploy(receipt, decimals, name, symbol, radao)
        // and again with some changes
        decimals = 6
        name = "Token 2"
        receipt = await (await radao.connect(admin).deploy(decimals, name, symbol, await admin.getAddress())).wait(1)
        let {security, dao, art} = await checkEventDeploy(receipt, decimals, name, symbol, radao)

        // anotherAccount2 can't mint
        await expect(security.connect(anotherAccount2).mint(await anotherAccount2.getAddress(), 1))
            .revertedWithCustomError(security, "AccessControlUnauthorizedAccount")
            .withArgs(await anotherAccount2.getAddress(), await security.SUPPLY_ROLE())

        // admin can mint to anotherAccount2
        await expect(security.connect(admin).mint(await anotherAccount2.getAddress(), 2))
            .changeTokenBalance(security, anotherAccount2, 2)
        expect(await security.totalSupply()).equal(2)

        // anotherAccount2 can't burn
        await expect(security.connect(anotherAccount2).burn(await anotherAccount2.getAddress(), 1))
            .revertedWithCustomError(security, "AccessControlUnauthorizedAccount")
            .withArgs(await anotherAccount2.getAddress(), await security.SUPPLY_ROLE())

        // admin can't burn from anotherAccount2
        await expect(security.connect(admin).burn(await anotherAccount2.getAddress(), 1))
            .revertedWithCustomError(security, "ERC20InsufficientAllowance")
            .withArgs(await admin.getAddress(), 0, 1)
        await security.connect(anotherAccount2).approve(await admin.getAddress(), 1)
        // but after an approval, he can
        await expect(security.connect(admin).burn(await anotherAccount2.getAddress(), 1))
            .changeTokenBalance(security, anotherAccount2, -1)
        expect(await security.totalSupply()).equal(1)

        // admin can't mint .DAO or .ART
        await expect(dao.connect(admin).mint(await admin.getAddress(), 1))
            .revertedWithCustomError(dao, "AccessControlUnauthorizedAccount")
            .withArgs(await admin.getAddress(), await art.SUPPLY_ROLE())
        await expect(art.connect(admin).mint(await admin.getAddress(), 1))
            .revertedWithCustomError(art, "AccessControlUnauthorizedAccount")
            .withArgs(await admin.getAddress(), await art.SUPPLY_ROLE())

        // anotherAccount3 can't lock
        await expect(radao.connect(anotherAccount3).lock("iop", 1, daoRecipient, daoRecipient))
            .revertedWith("unknown symbol")
        await expect(radao.connect(anotherAccount3).lock(symbol, 1, daoRecipient, daoRecipient))
            .revertedWithCustomError(security, "ERC20InsufficientBalance")
            .withArgs(await anotherAccount3.getAddress(), 0, 1)
        await security.connect(anotherAccount2).transfer(await anotherAccount3.getAddress(), 1)
        // but with 1 .S, he can lock 1
        let response = radao.connect(anotherAccount3).lock(symbol, 1, await daoRecipient.getAddress(), await artRecipient.getAddress())
        await expect(response).changeTokenBalances(security, [
            anotherAccount3, radao
        ], [
            -1, 1
        ])
        await expect(response).changeTokenBalance(dao, daoRecipient, 1)
        await expect(response).changeTokenBalance(art, artRecipient, 1)
        expect(await security.totalSupply()).equal(1)
        expect(await dao.totalSupply()).equal(1)
        expect(await art.totalSupply()).equal(1)

        // anotherAccount4 can't unlock
        await expect(radao.connect(anotherAccount4).unlock("iop", 1, await securityRecipient.getAddress()))
            .revertedWith("unknown symbol")
        await expect(radao.connect(anotherAccount4).unlock(symbol, 1, await securityRecipient.getAddress()))
            .revertedWithCustomError(art, "ERC20InsufficientBalance")
            .withArgs(await anotherAccount4.getAddress(), 0, 1)
        await dao.connect(daoRecipient).transfer(await anotherAccount4.getAddress(), 1)
        await expect(radao.connect(anotherAccount4).unlock(symbol, 1, await securityRecipient.getAddress()))
            .revertedWithCustomError(dao, "ERC20InsufficientBalance")
            .withArgs(await anotherAccount4.getAddress(), 0, 1)
        await art.connect(artRecipient).transfer(await anotherAccount4.getAddress(), 1)
        // but with 1 .DAO and 1.ART he can unlock 1 .S
        response = radao.connect(anotherAccount4).unlock(symbol, 1, await securityRecipient.getAddress())
        await expect(response).changeTokenBalances(security, [
            radao, securityRecipient
        ], [
            -1, 1
        ])
        await expect(response).changeTokenBalance(dao, anotherAccount4, -1)
        await expect(response).changeTokenBalance(art, anotherAccount4, -1)
        expect(await security.totalSupply()).equal(1)
        expect(await dao.totalSupply()).equal(0)
        expect(await art.totalSupply()).equal(0)

        // TODO check permit generating 2, playing the first

        // anotherAccount2 can't set name and symbol
        const newName = "Token 3"
        const newSymbol = "TOKEN_3"
        await expect(radao.connect(anotherAccount2).setNameAndSymbol("iop", newName, newSymbol))
            .revertedWith("unknown symbol")
        await expect(radao.connect(anotherAccount2).setNameAndSymbol(symbol, newName, newSymbol))
            .revertedWith("not admin")
        await security.connect(admin).grantRole(await security.DEFAULT_ADMIN_ROLE(), anotherAccount2)
        await expect(radao.connect(anotherAccount2).setNameAndSymbol(symbol, newName, newSymbol))
            .revertedWith("not admin")
        await dao.connect(admin).grantRole(await dao.DEFAULT_ADMIN_ROLE(), anotherAccount2)
        await expect(radao.connect(anotherAccount2).setNameAndSymbol(symbol, newName, newSymbol))
            .revertedWith("not admin")
        await art.connect(admin).grantRole(await art.DEFAULT_ADMIN_ROLE(), anotherAccount2)
        // but he can if he is the new admin of the 3 tokens
        admin = anotherAccount2
        receipt = await (await radao.connect(admin).setNameAndSymbol(symbol, newName, newSymbol)).wait(1)
        name = newName
        symbol = newSymbol
        // TODO check undeploy log
        await checkEventDeploy(receipt, decimals, name, symbol, radao)

        // TODO check permit playing the second

        // anotherAccount3 can't undeploy
        await expect(radao.connect(anotherAccount3).undeploy("iop")).revertedWith("unknown symbol")
        await expect(radao.connect(anotherAccount3).undeploy(symbol)).revertedWith("not admin")
        await security.connect(admin).grantRole(await security.DEFAULT_ADMIN_ROLE(), anotherAccount3)
        // await expect(radao.connect(anotherAccount3).undeploy(symbol))
        //     .revertedWith("not admin")
        await dao.connect(admin).grantRole(await dao.DEFAULT_ADMIN_ROLE(), anotherAccount3)
        // await expect(radao.connect(anotherAccount3).undeploy(symbol))
        //     .revertedWith("not admin")
        await art.connect(admin).grantRole(await art.DEFAULT_ADMIN_ROLE(), anotherAccount3)
        // but he can if he is the new admin of the 3 tokens
        admin = anotherAccount3
        let log = (await (await radao.connect(admin).undeploy(symbol)).wait(1))?.logs
            .filter(log => log instanceof EventLog && log.fragment?.name === "Undeploy")[0]
            // @ts-ignore
            .args
        expect(log[0]).equal(symbol)
        expect(log[1]).equal(await security.getAddress())
        expect(log[2]).equal(await dao.getAddress())
        expect(log[3]).equal(await art.getAddress())
        await expect(radao.getContracts(symbol)).revertedWith("unknown symbol")
    })
})
