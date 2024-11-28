import {HardhatUserConfig} from "hardhat/config"
import "@nomicfoundation/hardhat-toolbox"
import "@nomicfoundation/hardhat-ledger"
import "./hardhat.tasks"
import {getEnv, getEnvOrExit, getNetwork} from "./hardhat.common"

require('dotenv').config()

const scanApi = getEnv('SCAN_API')
const mnemonic = getEnv('MNEMONIC')
const accounts = mnemonic && {
    mnemonic
} || undefined

const config: HardhatUserConfig = {
    solidity: {
        version: "0.8.20",
        settings: {
            optimizer: {
                enabled: true,
            }
        }
    },
    sourcify: {
        enabled: true
    },
    etherscan: {
        apiKey: scanApi && {
            mainnet: scanApi,
            arbitrumOne: scanApi,
            sepolia: scanApi,
            bsc: scanApi,
            bscTestnet: scanApi
        }
    },
    networks: {
        hardhat: {
            accounts
        }
    }
}

const network = getNetwork()
if (config.networks && !config.networks[network]) {
    config.networks[network] = {
        chainId: parseInt(getEnvOrExit('CHAIN_ID')),
        url: getEnvOrExit('WEB3_URL'),
        accounts
    }
}

export default config
