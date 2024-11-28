import {expect} from "chai"
import {ethers} from "hardhat"
import {ContractTransactionResponse, EventLog} from "ethers"
import {Radao} from "../typechain-types"

const NULL_ADDRESS = "0x0000000000000000000000000000000000000000"

async function checkTokens(radao: Radao, symbol: string, security: any, dao: any, art: any) {
    const contracts = await radao.getContracts(symbol)
    expect(contracts.security).equal(security)
    expect(contracts.dao).equal(dao || '')
    expect(contracts.art).equal(art)
}

async function checkEventDeploy(response: ContractTransactionResponse, decimals: number, name: string, symbol: string, radao: Radao, artOnly = false) {
    const receipt = await (response).wait(1)
    const log = receipt?.logs.filter(log => log instanceof EventLog && log.fragment?.name === "Deploy")[0]
        // @ts-ignore
        .args
    expect(log[0]).equal(symbol)
    let security, dao
    if (!artOnly) {
        security = (await ethers.getContractAt("RadaoToken", log[1]))
        expect(await security.decimals()).equal(decimals)
        expect(await security.name()).equal(`${name} - Security`)
        expect(await security.symbol()).equal(`${symbol}.S`)
        dao = (await ethers.getContractAt("RadaoToken", log[2]))
        expect(await dao.decimals()).equal(decimals)
        expect(await dao.name()).equal(`${name} - Decentralized Autonomous Organization`)
        expect(await dao.symbol()).equal(`${symbol}.DAO`)
    }
    const art = (await ethers.getContractAt("RadaoToken", log[3]))
    expect(await art.decimals()).equal(decimals)
    expect(await art.name()).equal(`${name} - Asset Referenced Token`)
    expect(await art.symbol()).equal(`${symbol}.ART`)
    await checkTokens(radao, symbol, security && security.target || NULL_ADDRESS, dao && dao.target || NULL_ADDRESS, art.target)
    await expect(response).emit(radao, "Deploy")
        .withArgs(symbol, security && security.target || NULL_ADDRESS, dao && dao.target || NULL_ADDRESS, art.target)
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
        let {
            security,
            dao,
            art
        } = await checkEventDeploy(await radao.connect(deployer).deploy(decimals, name, symbol, admin.address), decimals, name, symbol, radao)

        // anotherAccount can't undeploy unknown token
        await expect(radao.connect(anotherAccount).undeploy("iop"))
            .revertedWith("unknown symbol")
        // or undeploy/deploy same symbol
        await expect(radao.connect(anotherAccount).deployART(decimals, name, symbol, anotherAccount.address))
            .revertedWith("already deployed")
        await expect(radao.connect(anotherAccount).deploy(decimals, name, symbol, anotherAccount.address))
            .revertedWith("already deployed")
        await expect(radao.connect(anotherAccount).undeploy(symbol))
            .revertedWith("not admin")
        await security.connect(admin).grantRole(await security.DEFAULT_ADMIN_ROLE(), anotherAccount)
        await expect(radao.connect(anotherAccount).deploy(decimals, name, symbol, anotherAccount.address))
            .revertedWith("already deployed")
        await expect(radao.connect(anotherAccount).undeploy(symbol))
            .revertedWith("not admin")
        await dao.connect(admin).grantRole(await dao.DEFAULT_ADMIN_ROLE(), anotherAccount)
        await expect(radao.connect(anotherAccount).deploy(decimals, name, symbol, anotherAccount.address))
            .revertedWith("already deployed")
        await expect(radao.connect(anotherAccount).undeploy(symbol))
            .revertedWith("not admin")
        await art.connect(admin).grantRole(await art.DEFAULT_ADMIN_ROLE(), anotherAccount)
        await expect(radao.connect(anotherAccount).deploy(decimals, name, symbol, anotherAccount.address))
            .revertedWith("already deployed")
        // but if he is the new admin of the 3 tokens, he can undeploy and redeploy
        admin = anotherAccount
        await expect(radao.connect(admin).undeploy(symbol)).emit(radao, "Undeploy")
            .withArgs(symbol, security.target, dao.target, art.target)
        await expect(radao.getContracts(symbol))
            .revertedWith("unknown symbol")
        ;({security, dao, art} = await checkEventDeploy(await radao.connect(admin)
            .deploy(decimals, name, symbol, admin.address), decimals, name, symbol, radao))
        // and again with some changes
        await expect(radao.connect(admin).undeploy(symbol)).emit(radao, "Undeploy")
            .withArgs(symbol, security.target, dao.target, art.target)
        await expect(radao.getContracts(symbol))
            .revertedWith("unknown symbol")
        decimals = 6
        name = "Token 2"
        ;({security, dao, art} = await checkEventDeploy(await radao.connect(admin)
            .deploy(decimals, name, symbol, admin.address), decimals, name, symbol, radao))

        // anotherAccount2 can't mint
        await expect(security.connect(anotherAccount2).mint(anotherAccount2.address, 1))
            .revertedWithCustomError(security, "AccessControlUnauthorizedAccount")
            .withArgs(anotherAccount2.address, await security.SUPPLY_ROLE())

        // admin can mint to anotherAccount2
        await expect(security.connect(admin).mint(anotherAccount2.address, 2))
            .changeTokenBalance(security, anotherAccount2, 2)
        expect(await security.totalSupply()).equal(2)

        // anotherAccount2 can't burn
        await expect(security.connect(anotherAccount2).burn(anotherAccount2.address, 1))
            .revertedWithCustomError(security, "AccessControlUnauthorizedAccount")
            .withArgs(anotherAccount2.address, await security.SUPPLY_ROLE())

        // admin can't burn from anotherAccount2
        await expect(security.connect(admin).burn(anotherAccount2.address, 1))
            .revertedWithCustomError(security, "ERC20InsufficientAllowance")
            .withArgs(admin.address, 0, 1)
        await security.connect(anotherAccount2).approve(admin.address, 1)
        // but after an approval, he can
        await expect(security.connect(admin).burn(anotherAccount2.address, 1))
            .changeTokenBalance(security, anotherAccount2, -1)
        expect(await security.totalSupply()).equal(1)

        // admin can't mint .DAO or .ART
        await expect(dao.connect(admin).mint(admin.address, 1))
            .revertedWithCustomError(dao, "AccessControlUnauthorizedAccount")
            .withArgs(admin.address, await art.SUPPLY_ROLE())
        await expect(art.connect(admin).mint(admin.address, 1))
            .revertedWithCustomError(art, "AccessControlUnauthorizedAccount")
            .withArgs(admin.address, await art.SUPPLY_ROLE())

        // anotherAccount3 can't lock
        await expect(radao.connect(anotherAccount3).lock("iop", 1, daoRecipient, daoRecipient))
            .revertedWith("unknown symbol")
        await expect(radao.connect(anotherAccount3).lock(symbol, 1, daoRecipient, daoRecipient))
            .revertedWithCustomError(security, "ERC20InsufficientBalance")
            .withArgs(anotherAccount3.address, 0, 1)
        await security.connect(anotherAccount2).transfer(anotherAccount3.address, 1)
        // but with 1 .S, he can lock 1
        await expect(radao.connect(anotherAccount3).lock(symbol, 1, NULL_ADDRESS, artRecipient.address))
            .revertedWithCustomError(art, "ERC20InvalidReceiver").withArgs(NULL_ADDRESS)
        await expect(radao.connect(anotherAccount3).lock(symbol, 1, daoRecipient.address, NULL_ADDRESS))
            .revertedWithCustomError(art, "ERC20InvalidReceiver").withArgs(NULL_ADDRESS)
        let response = await radao.connect(anotherAccount3).lock(symbol, 1, daoRecipient.address, artRecipient.address)
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
        await expect(radao.connect(anotherAccount4).unlock("iop", 1, securityRecipient.address))
            .revertedWith("unknown symbol")
        await expect(radao.connect(anotherAccount4).unlock(symbol, 1, securityRecipient.address))
            .revertedWithCustomError(art, "ERC20InsufficientBalance")
            .withArgs(anotherAccount4.address, 0, 1)
        await dao.connect(daoRecipient).transfer(anotherAccount4.address, 1)
        await expect(radao.connect(anotherAccount4).unlock(symbol, 1, securityRecipient.address))
            .revertedWithCustomError(dao, "ERC20InsufficientBalance")
            .withArgs(anotherAccount4.address, 0, 1)
        await art.connect(artRecipient).transfer(anotherAccount4.address, 1)
        // but with 1 .DAO and 1.ART he can unlock 1 .S
        await expect(radao.connect(anotherAccount4).unlock(symbol, 1, NULL_ADDRESS))
            .revertedWithCustomError(art, "ERC20InvalidReceiver").withArgs(NULL_ADDRESS)
        response = await radao.connect(anotherAccount4).unlock(symbol, 1, securityRecipient.address)
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

        // TODO check permit generating 2, playing the first (1/2)

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
        response = await radao.connect(admin).setNameAndSymbol(symbol, newName, newSymbol)
        await expect(response).emit(radao, "Undeploy")
            .withArgs(symbol, security.target, dao.target, art.target)
        name = newName
        symbol = newSymbol
        await checkEventDeploy(response, decimals, name, symbol, radao)

        // TODO check permit playing the second (2/2)
    })

    it("MVP .ART only", async function () {
        let [
            radaoDeployer,
            deployer,
            admin,
            anotherAccount,
            anotherAccount2
        ] = await ethers.getSigners()
        const radao = await (await ethers.getContractFactory("Radao", radaoDeployer)).deploy(radaoDeployer)
        await radao.waitForDeployment()
        let decimals = 18
        let name = "Token"
        let symbol = "TOKEN"
        let {art} = await checkEventDeploy(await radao.connect(deployer)
            .deployART(decimals, name, symbol, admin.address), decimals, name, symbol, radao, true)

        // anotherAccount can't undeploy unknown token
        await expect(radao.connect(anotherAccount).undeploy("iop"))
            .revertedWith("unknown symbol")
        // or undeploy/deploy same symbol
        await expect(radao.connect(anotherAccount).deploy(decimals, name, symbol, anotherAccount.address))
            .revertedWith("already deployed")
        await expect(radao.connect(anotherAccount).deployART(decimals, name, symbol, anotherAccount.address))
            .revertedWith("already deployed")
        await expect(radao.connect(anotherAccount).undeploy(symbol))
            .revertedWith("not admin")
        await art.connect(admin).grantRole(await art.DEFAULT_ADMIN_ROLE(), anotherAccount)
        await expect(radao.connect(anotherAccount).deploy(decimals, name, symbol, anotherAccount.address))
            .revertedWith("already deployed")
        await expect(radao.connect(anotherAccount).deployART(decimals, name, symbol, anotherAccount.address))
            .revertedWith("already deployed")
        // but if he is the new admin of the 3 tokens, he can undeploy and redeploy
        admin = anotherAccount
        await expect(radao.connect(admin).undeploy(symbol)).emit(radao, "Undeploy")
            .withArgs(symbol, NULL_ADDRESS, NULL_ADDRESS, art.target)
        await expect(radao.getContracts(symbol))
            .revertedWith("unknown symbol")
        ;({art} = await checkEventDeploy(await radao.connect(admin)
            .deployART(decimals, name, symbol, admin.address), decimals, name, symbol, radao, true))
        // and again with some changes
        await expect(radao.connect(admin).undeploy(symbol)).emit(radao, "Undeploy")
            .withArgs(symbol, NULL_ADDRESS, NULL_ADDRESS, art.target)
        await expect(radao.getContracts(symbol))
            .revertedWith("unknown symbol")
        decimals = 6
        name = "Token 2"
        ;({art} = await checkEventDeploy(await radao.connect(admin)
            .deployART(decimals, name, symbol, admin.address), decimals, name, symbol, radao, true))

        // anotherAccount2 can't mint
        await expect(art.connect(anotherAccount2).mint(anotherAccount2.address, 1))
            .revertedWithCustomError(art, "AccessControlUnauthorizedAccount")
            .withArgs(anotherAccount2.address, await art.SUPPLY_ROLE())

        // admin can mint to anotherAccount2
        await expect(art.connect(admin).mint(anotherAccount2.address, 2))
            .changeTokenBalance(art, anotherAccount2, 2)
        expect(await art.totalSupply()).equal(2)

        // anotherAccount2 can't burn
        await expect(art.connect(anotherAccount2).burn(anotherAccount2.address, 1))
            .revertedWithCustomError(art, "AccessControlUnauthorizedAccount")
            .withArgs(anotherAccount2.address, await art.SUPPLY_ROLE())

        // admin can't burn from anotherAccount2
        await expect(art.connect(admin).burn(anotherAccount2.address, 1))
            .revertedWithCustomError(art, "ERC20InsufficientAllowance")
            .withArgs(admin.address, 0, 1)
        await art.connect(anotherAccount2).approve(admin.address, 1)
        // but after an approval, he can
        await expect(art.connect(admin).burn(anotherAccount2.address, 1))
            .changeTokenBalance(art, anotherAccount2, -1)
        expect(await art.totalSupply()).equal(1)

        // TODO check permit generating 2, playing the first (1/2)

        // anotherAccount2 can't set name and symbol
        const newName = "Token 3"
        const newSymbol = "TOKEN_3"
        await expect(radao.connect(anotherAccount2).setNameAndSymbol("iop", newName, newSymbol))
            .revertedWith("unknown symbol")
        await expect(radao.connect(anotherAccount2).setNameAndSymbol(symbol, newName, newSymbol))
            .revertedWith("not admin")
        await art.connect(admin).grantRole(await art.DEFAULT_ADMIN_ROLE(), anotherAccount2)
        // but he can if he is the new admin of the 3 tokens
        admin = anotherAccount2
        let response = await radao.connect(admin).setNameAndSymbol(symbol, newName, newSymbol)
        await expect(response).emit(radao, "Undeploy")
            .withArgs(symbol, NULL_ADDRESS, NULL_ADDRESS, art.target)
        name = newName
        symbol = newSymbol
        await checkEventDeploy(response, decimals, name, symbol, radao, true)

        // TODO check permit playing the second (2/2)
    })
})
