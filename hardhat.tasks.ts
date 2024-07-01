import {EventLog, Signer} from "ethers";
import {task} from "hardhat/config"
import {getEnvOrExit, getNetwork, getSigners} from "./hardhat.common"
import {HardhatRuntimeEnvironment} from "hardhat/types";

require('dotenv').config()

const ACCOUNT = `a private key, an address prefixed by 'm:' (mnemonic), an address prefixed by 'l:' (Ledger hardware) or an environment variable name defining one of them`

const formatUnits = ({ethers}: HardhatRuntimeEnvironment, value: bigint, decimals: number) => ethers.formatUnits(value, decimals).replace(/\.0*$/, '');

task('transfer', 'transfer an amount (or balance) of native (or token) from an account to an address (or account)')
    .addParam('from', `from account: ${ACCOUNT}`)
    .addParam('to', `to address (or account)`)
    .addOptionalParam('amount', 'human readable amount (you set 1.1 and 1100000000000000000 is transferred, or the whole balance if not set)')
    .addOptionalParam('token', 'ERC20 token address (transfer ETH if empty)')
    .addOptionalParam('dryRun', 'set it to \'false\' to really execute')
    .setAction(async (args, hre) => {
        const dryRun = args.dryRun !== 'false'
        const {ethers} = hre
        const {from, to} = await (async (): Promise<{ from: Signer, to: string }> => {
            if (args.to.startsWith('0x')) {
                return {
                    from: (await getSigners(hre, args.from))[0],
                    to: args.to
                }
            }
            const signers = await getSigners(hre, args.from, args.to)
            return {
                from: signers[0],
                to: await signers[1].getAddress()
            }
        })();
        let gas
        let gasPrice
        let token
        let amount
        let decimals
        if (args.token) {
            token = await ethers.getContractAt('ERC20Upgradeable', args.token)
            decimals = Number((await token.decimals()).toString())
            if (args.amount) {
                amount = ethers.parseUnits(args.amount, decimals)
            } else {
                amount = await token.balanceOf(from.getAddress())
            }
        } else {
            decimals = 18
            if (args.amount) {
                amount = ethers.parseEther(args.amount)
            } else {
                gas = BigInt(21000)
                gasPrice = (await ethers.provider.getFeeData()).gasPrice || BigInt(0)
                const balance = await ethers.provider.getBalance(from.getAddress())
                amount = balance - gas * gasPrice
            }
        }
        const output: any = {
            network: getNetwork(),
            from: await from.getAddress(),
            to,
            amount: {
                raw: amount.toString(),
                human: formatUnits(hre, amount, decimals)
            },
            gas: gas && gas.toString(),
            gasPrice: gasPrice && gasPrice.toString(),
            token: token && {
                address: token.target,
                name: await token.name(),
                symbol: await token.symbol(),
                decimals,
            }
        }
        console.error(JSON.stringify(output, null, 2))
        if (!dryRun) {
            let tx
            if (token) {
                tx = await token.connect(from).transfer(to, amount)
            } else {
                tx = await from.sendTransaction({
                    gasPrice, gasLimit: gas, to: to, value: amount
                })
            }
            output.tx = (await tx.wait(1))?.hash
            console.log(JSON.stringify(output, null, 2))
        }
    });

task('deploy-radao', 'deploy Radao')
    .addParam('deployer', `deployer account: ${ACCOUNT}`)
    .addParam('admin', `admin address (or account)`)
    .addOptionalParam('dryRun', 'set it to \'false\' to really execute')
    .setAction(async (args, hre) => {
        const dryRun = args.dryRun !== 'false'
        const {ethers} = hre
        const {deployer, admin} = await (async (): Promise<{ deployer: Signer, admin: string }> => {
            if (args.admin.startsWith('0x')) {
                return {
                    deployer: (await getSigners(hre, args.deployer))[0],
                    admin: args.admin
                }
            }
            const signers = await getSigners(hre, args.deployer, args.admin)
            return {
                deployer: signers[0],
                admin: await signers[1].getAddress()
            }
        })();
        const output: any = {
            network: getNetwork(),
            deployer: await deployer.getAddress(),
            admin
        }
        console.error(JSON.stringify(output, null, 2))
        if (!dryRun) {
            const radao = await (await ethers.getContractFactory("Radao", deployer)).deploy(admin)
            await radao.deploymentTransaction()?.wait(1)
            output.radao = radao.target
            output.tx = radao.deploymentTransaction()?.hash
            console.log(JSON.stringify(output, null, 2))
            console.error('verifying sources...')
            try {
                await hre.run("verify:verify", {
                    address: radao.target,
                    constructorArguments: [admin]
                })
            } catch {
                console.error(`-> npx hardhat verify --network ${getNetwork()} ${radao.target}`)
            }
            try {
                await hre.run("verify:verify", {
                    address: await radao.radaoTokenBase(),
                    constructorArguments: []
                })
            } catch {
                console.error(`-> npx hardhat verify --network ${getNetwork()} ${await radao.radaoTokenBase()}`)
            }
        }
    })

task('deploy', 'deploy 3 RadaoToken (.S .DAO and .ARTS)')
    .addParam('deployer', `deployer account: ${ACCOUNT}`)
    .addParam('admin', `admin address (or account)`)
    .addParam('decimals')
    .addParam('symbol')
    .addOptionalParam('name')
    .addOptionalParam('dryRun', 'set it to \'false\' to really execute')
    .setAction(async (args, hre) => {
        const dryRun = args.dryRun !== 'false'
        const {symbol} = args
        const decimals = Number(args.decimals)
        const name = args.name || symbol
        const {ethers} = hre
        const {deployer, admin} = await (async (): Promise<{ deployer: Signer, admin: string }> => {
            if (args.admin.startsWith('0x')) {
                return {
                    deployer: (await getSigners(hre, args.deployer))[0],
                    admin: args.admin
                }
            }
            const signers = await getSigners(hre, args.deployer, args.admin)
            return {
                deployer: signers[0],
                admin: await signers[1].getAddress()
            }
        })();
        const radao = await ethers.getContractAt('Radao', getEnvOrExit('RADAO'), deployer)
        const output: any = {
            network: getNetwork(),
            radao: radao.target,
            deployer: await deployer.getAddress(),
            admin,
            name,
            symbol,
            decimals
        }
        console.error(JSON.stringify(output, null, 2))
        if (!dryRun) {
            const tx = await (await radao.deploy(decimals, name, symbol, admin)).wait(1)
            // @ts-ignore
            const log = tx?.logs.filter(log => log instanceof EventLog && log.fragment?.name === 'Deploy')[0].args
            const security = await ethers.getContractAt('RadaoToken', log[1])
            const dao = await ethers.getContractAt('RadaoToken', log[2])
            const arts = await ethers.getContractAt('RadaoToken', log[3])
            output.tx = tx?.hash
            output.security = {
                address: log[1],
                name: await security.name(),
                symbol: await security.symbol(),
                decimals: Number((await security.decimals()).toString())
            }
            output.dao = {
                address: log[2],
                name: await dao.name(),
                symbol: await dao.symbol(),
                decimals: Number((await dao.decimals()).toString())
            }
            output.arts = {
                address: log[3],
                name: await arts.name(),
                symbol: await arts.symbol(),
                decimals: Number((await arts.decimals()).toString())
            }
            output.tx = tx?.hash
            console.log(JSON.stringify(output, null, 2))
        }
    })

task('mint', 'mint an amount of tokens to an address')
    .addParam('minter', `minter account: ${ACCOUNT}`)
    .addParam('token', `token contract address`)
    .addParam('amount', 'human readable amount (you set 1.1 and 1100000 is mint if token a 6 decimals')
    .addOptionalParam('to', `to address (or account)`)
    .addOptionalParam('dryRun', 'set it to \'false\' to really execute')
    .setAction(async (args, hre) => {
        const dryRun = args.dryRun !== 'false'
        const {ethers} = hre
        const {minter, to} = await (async (): Promise<{ minter: Signer, to: string }> => {
            if (!args.to) {
                const [minter] = await getSigners(hre, args.minter)
                return {
                    minter,
                    to: await minter.getAddress()
                }
            }
            if (args.to.startsWith('0x')) {
                return {
                    minter: (await getSigners(hre, args.minter))[0],
                    to: args.to
                }
            }
            const to = getEnvOrExit(args.to)
            if (to.startsWith('0x')) {
                return {
                    minter: (await getSigners(hre, args.minter))[0],
                    to
                }
            }
            const signers = await getSigners(hre, args.minter, args.to)
            return {
                minter: signers[0],
                to: await signers[1].getAddress()
            }
        })();
        const token = await ethers.getContractAt('RadaoToken', args.token.startsWith('0x') ? args.token : getEnvOrExit(args.token))
        const decimals = Number((await token.decimals()).toString())
        const amount = ethers.parseUnits(args.amount, decimals)
        const output: any = {
            network: getNetwork(),
            minter: await minter.getAddress(),
            token: {
                address: token.target,
                name: await token.name(),
                symbol: await token.symbol(),
                decimals
            },
            amount: {
                raw: amount.toString(),
                human: formatUnits(hre, amount, decimals)
            },
            to: {
                address: to
            }
        }
        console.error(JSON.stringify(output, null, 2))
        if (!dryRun) {
            const tx = await (await token.connect(minter).mint(to, amount)).wait(1)
            const totalSupply = await token.totalSupply()
            output.token.totalSupply = {
                raw: totalSupply.toString(),
                human: formatUnits(hre, totalSupply, decimals)
            }
            const balance = await token.balanceOf(to)
            output.to.balance = {
                raw: balance.toString(),
                human: formatUnits(hre, balance, decimals)
            }
            output.tx = tx?.hash
            console.log(JSON.stringify(output, null, 2))
        }
    })

task('set-meta', 'set RadaoToken meta')
    .addParam('editor', `token contract address`)
    .addParam('token', `token contract address`)
    .addVariadicPositionalParam('meta', 'key1=value1 "key 2"="value 2" ...')
    .addOptionalParam('dryRun', `set it to 'false' to really execute`)
    .setAction(async (args, hre) => {
        const dryRun = args.dryRun !== 'false'
        const {ethers} = hre
        const [editor] = await getSigners(hre, args.editor)
        const token = (await ethers.getContractAt('RadaoToken', args.token.startsWith('0x') ? args.token : getEnvOrExit(args.token)))
        const symbol = await token.symbol()
        const meta = args.meta.reduce((meta: any, kv: string) => {
            const index = kv.indexOf("=")
            if (index < 1 || index === kv.length - 1) {
                console.error(`unexpected meta format '${kv}', it must be 'key=value'`)
                process.exit(1)
            }
            meta[kv.substring(0, index)] = kv.substring(index + 1, kv.length)
            return meta
        }, {})
        const output: any = {
            network: getNetwork(),
            editor: await editor.getAddress(),
            token: {
                address: token.target,
                symbol
            },
            meta
        }
        console.error(JSON.stringify(output, null, 2))
        if (!dryRun) {
            // @ts-ignore
            const tx = await (await token.connect(editor)['setMeta(string[])'](Object.entries(meta).flatMap(value => value))).wait(1)
            output.tx = tx?.hash
            console.log(JSON.stringify(output, null, 2))
        }
    })

task('get-meta', 'get RadaoToken meta')
    .addParam('token', `token contract address`)
    .addVariadicPositionalParam('meta', 'key1 "key 2" ...')
    .setAction(async (args, hre) => {
        const {ethers} = hre
        const token = (await ethers.getContractAt('RadaoToken', args.token.startsWith('0x') ? args.token : getEnvOrExit(args.token)))
        const values = await token["getMeta(string[])"](args.meta)
        const res: any = {}
        for (let i = 0; i < args.meta.length; i++) {
            res[args.meta[i]] = values[i]
        }
        console.log(JSON.stringify(res, null, 2))
    })
