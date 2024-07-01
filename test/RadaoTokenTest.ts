import {ethers} from "hardhat"
import {expect} from "chai"
import {loadFixture} from "@nomicfoundation/hardhat-toolbox/network-helpers"

const initFixture = async () => {
    const [deployer, admin, anotherAccount] = await ethers.getSigners()
    const radaoToken = await (await ethers.getContractFactory("RadaoToken")).deploy()
    await radaoToken.waitForDeployment()
    await radaoToken.initialize(6, admin.address, "0x0000000000000000000000000000000000000000", false)
    return {deployer, admin, anotherAccount, radaoToken}
}

describe("RadaoToken", function () {
    it("pause/unpause", async function () {
        const {admin, anotherAccount, radaoToken} = await loadFixture(initFixture)
        await radaoToken.connect(admin).mint(anotherAccount, 1)
        await radaoToken.connect(anotherAccount).transfer(admin, 1)
        await radaoToken.connect(admin).burn(admin, 1)

        await expect(radaoToken.connect(anotherAccount).pause())
            .revertedWithCustomError(radaoToken, "AccessControlUnauthorizedAccount")
            .withArgs(anotherAccount.address, await radaoToken.PAUSER_ROLE())
        await radaoToken.connect(admin).pause()

        await expect(radaoToken.connect(admin).mint(anotherAccount, 1))
            .revertedWithCustomError(radaoToken, "EnforcedPause")
        await expect(radaoToken.connect(anotherAccount).transfer(admin, 1))
            .revertedWithCustomError(radaoToken, "EnforcedPause")
        await expect(radaoToken.connect(admin).burn(admin, 1))
            .revertedWithCustomError(radaoToken, "EnforcedPause")

        await expect(radaoToken.connect(anotherAccount).unpause())
            .revertedWithCustomError(radaoToken, "AccessControlUnauthorizedAccount")
            .withArgs(anotherAccount.address, await radaoToken.PAUSER_ROLE())
        await radaoToken.connect(admin).unpause()

        await radaoToken.connect(admin).mint(anotherAccount, 1)
        await radaoToken.connect(anotherAccount).transfer(admin, 1)
        await radaoToken.connect(admin).burn(admin, 1)
    })

    it("can't re-initialize", async function () {
        const {admin, radaoToken} = await loadFixture(initFixture)
        await expect(radaoToken.initialize(6, admin.address, "0x0000000000000000000000000000000000000000", false))
            .revertedWithCustomError(radaoToken, "InvalidInitialization")
    })

    it("can't set name and symbol", async function () {
        const {admin, anotherAccount, radaoToken} = await loadFixture(initFixture)
        const name = "New name"
        const symbol = "NEW_SYMBOL"
        await expect(radaoToken.connect(anotherAccount).setNameAndSymbol(name, symbol))
            .revertedWith("not Radao")
        await expect(radaoToken.connect(admin).setNameAndSymbol(name, symbol))
            .revertedWith("not Radao")
    })

    it("Should get/set/delete one or multiple meta", async () => {
        const {admin, anotherAccount, radaoToken} = await loadFixture(initFixture)
        const check = async (kv: any) => {
            for (const [key, value] of Object.entries(kv)) {
                expect(await radaoToken["getMeta(string)"](key)).equal(value)
            }
            expect(JSON.stringify(await radaoToken["getMeta(string[])"](Object.keys(kv)))).equal(JSON.stringify(Object.values(kv)))
        }
        const setMeta = async (kv: any, expected: any) => {
            const keys = Object.keys(kv)
            if (keys.length === 1) {
                await radaoToken.connect(admin)["setMeta(string,string)"](keys[0], kv[keys[0]])
            } else {
                // @ts-ignore
                await radaoToken.connect(admin)["setMeta(string[])"](Object.entries(kv).flatMap(o => o))
            }
            await check(expected)
        }
        const deleteMeta = async (keys: any, expected: any) => {
            if (keys.length === 1) {
                await radaoToken.connect(admin)["deleteMeta(string)"](keys[0])
            } else {
                await radaoToken.connect(admin)["deleteMeta(string[])"](keys)
            }
            await check(expected)
        }
        await check({key: "", key1: "", key2: ""})
        await setMeta({key: "value", key1: "value1", key2: "value2"}, {key: "value", key1: "value1", key2: "value2"})
        await setMeta({key1: "other1"}, {key: "value", key1: "other1", key2: "value2"})
        await deleteMeta(["key1"], {key: "value", key1: "", key2: "value2"})
        await setMeta({key1: "value1"}, {key: "value", key1: "value1", key2: "value2"})
        await deleteMeta(["key2", "key1"], {key: "value", key1: "", key2: ""})
        await expect(radaoToken["setMeta(string[])"](["key_without_value"]))
            .revertedWith(`Meta: entries length must be even ([key1, value1, ...])`)
        await expect(radaoToken.connect(anotherAccount)["setMeta(string[])"](["k", "v"]))
            .revertedWithCustomError(radaoToken, "AccessControlUnauthorizedAccount")
            .withArgs(anotherAccount.address, await radaoToken.META_EDITOR_ROLE())
        await expect(radaoToken.connect(anotherAccount)["deleteMeta(string[])"](["k1"]))
            .revertedWithCustomError(radaoToken, "AccessControlUnauthorizedAccount")
            .withArgs(anotherAccount.address, await radaoToken.META_EDITOR_ROLE())
    })

    it("withdraw", async function () {
        const {admin, anotherAccount, radaoToken} = await loadFixture(initFixture)
        const anotherToken = await (await ethers.getContractFactory("RadaoToken", anotherAccount)).deploy()
        await anotherToken.initialize(6, anotherAccount.address, "0x0000000000000000000000000000000000000000", false)
        const value = 42
        await anotherToken.connect(anotherAccount).mint(radaoToken.target, value)
        await expect(radaoToken.connect(anotherAccount).withdraw(anotherToken.target, anotherAccount.address, value))
            .revertedWithCustomError(radaoToken, "AccessControlUnauthorizedAccount")
            .withArgs(anotherAccount.address, await radaoToken.WITHDRAWER_ROLE())
        const response = await radaoToken.connect(admin).withdraw(anotherToken.target, anotherAccount.address, value)
        expect(response).emit(radaoToken, "Withdraw")
            .withArgs(anotherToken, anotherAccount, value)
        expect(response)
            .changeTokenBalances(anotherToken, [
                radaoToken, anotherToken
            ], [
                -1, 1
            ])
    })
})
