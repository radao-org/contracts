import {ethers} from "hardhat"
import {loadFixture} from "@nomicfoundation/hardhat-toolbox/network-helpers"
import {EventLog} from "ethers"
import {expect} from "chai";

const DECIMALS = 6
const NAME = "ANY_NAME"
const SYMBOL = "ANY_SYMBOL"

const initFixture = async () => {
    const [deployer, admin, anotherAccount] = await ethers.getSigners()
    const factory = await (await ethers.getContractFactory("RadaoTokenFactory")).deploy()
    await factory.waitForDeployment()
    const receipt = await (await factory.deploy(DECIMALS, NAME, SYMBOL, admin.address)).wait(1)
    // @ts-ignore
    const address = receipt?.logs.filter(log => log instanceof EventLog && log.fragment?.name === 'RadaoTokenDeployed')[0].args[1]
    const instance = (await ethers.getContractAt('RadaoToken', address))
    return {deployer, admin, anotherAccount, instance}
}

describe("RadaoToken", function () {
    it("direct deployment cost", async function () {
        const [, admin, anotherAccount] = await ethers.getSigners()
        const instance = await (await ethers.getContractFactory("RadaoToken")).deploy()
        await instance.waitForDeployment()
        await (await instance.initialize(DECIMALS, NAME, SYMBOL, admin.address)).wait(1);
    });

    it("must deploy token", async function () {
        const {instance} = await loadFixture(initFixture)
        expect(await instance.decimals()).to.equal(DECIMALS)
        expect(await instance.name()).to.equal(NAME)
        expect(await instance.symbol()).to.equal(SYMBOL)
    });
});
