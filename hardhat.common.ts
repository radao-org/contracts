import {HardhatRuntimeEnvironment} from "hardhat/types";
import {Signer} from "ethers";

require('dotenv').config()

function getNetwork() {
    const index = process.argv.indexOf('--network')
    if (index > -1) {
        return process.argv[index + 1]
    }
    return 'hardhat'
}

function getEnv(key: string, defaultValue: string | undefined = undefined, exitIfUndefined: boolean = false) {
    const network = getNetwork()
    key = `${network ? `${network.toUpperCase()}_` : ''}${key}`
    const value = process.env[key]
    if (value === undefined && exitIfUndefined) {
        console.error(`${key} env is not defined`)
        process.exit(1)
    }
    return value
}

function getEnvOrExit(key: string): string {
    // @ts-ignore
    return getEnv(key, undefined, true)
}

async function getSigners({ethers, config}: HardhatRuntimeEnvironment, ...accounts: string[]): Promise<Signer[]> {
    const isPK = (account: string) => account.match(/^0x[0-9a-fA-F]{64}$/);
    const isPrefixedAddress = (account: string) => account.match(/^[ml]:0x[0-9a-fA-F]{40}$/);
    const conf = config.networks[getNetwork()]
    const parsedAccounts = []
    for (let account of accounts) {
        if (!isPK(account) && !isPrefixedAddress(account)) {
            account = getEnvOrExit(account) || ''
        }
        parsedAccounts.push(account)
        if (account.startsWith('l:')) {
            conf.ledgerAccounts.push(account.substring(2))
        }
    }
    const signers: Signer[] = []
    for (let account of parsedAccounts) {
        if (isPK(account)) {
            signers.push(new ethers.Wallet(account).connect(ethers.provider))
        } else if (isPrefixedAddress(account)) {
            signers.push(await ethers.getSigner(account.substring(2)))
        } else {
            console.error(`signer ${account} must be one of:
            - private key
            - 'm:' prefixed address (mnemonic)
            - 'l:' prefixed address (Ledger hardware)`)
            process.exit(1)
        }
    }
    return signers
}

export {
    getNetwork,
    getEnv,
    getEnvOrExit,
    getSigners
}
