import {expect} from "chai"
import {ethers} from "hardhat"
import {loadFixture} from "@nomicfoundation/hardhat-toolbox/network-helpers"

const initFixture = async () => {
    const [deployer, admin, anotherAccount] = await ethers.getSigners()
    const instance = await (await ethers.getContractFactory("RadaoTokenFactory")).deploy()
    await instance.waitForDeployment()
    return {deployer, admin, anotherAccount, instance}
}

describe("RadaoTokenFactory", function () {
    it("only owner is allowed to deploy", async function () {
        const {admin, instance, anotherAccount} = await loadFixture(initFixture)
        await expect(instance.connect(anotherAccount).deploy(0, '', '', admin.address))
            .revertedWithCustomError(instance, "OwnableUnauthorizedAccount")
    })
})
