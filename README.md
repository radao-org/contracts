# Radao contracts

```shell
npm install
npx hardhat compile
REPORT_GAS=true npx hardhat test
```

### .env file

```dotenv
LOCALHOST_MNEMONIC=#(1)
LOCALHOST_CHAIN_ID=31337
LOCALHOST_WEB3_URL=http://127.0.0.1:8545
LOCALHOST_DEPLOYER=#(2)
LOCALHOST_ADMIN=#(2)
```

1. leave empty to use default hardhat mnemonic
2. you can use one of:
    - private key
    - 'm:' prefixed address (mnemonic)
    - 'l:' prefixed address (Ledger hardware)

### Examples

Terminal 1

```shell
npx hardhat node --verbose
```

Terminal 2

```shell
network=localhost
# LOCALHOST_MNEMONIC is not defined to use the default
export LOCALHOST_CHAIN_ID=31337
export LOCALHOST_WEB3_URL=http://127.0.0.1:8545
export LOCALHOST_DEPLOYER=m:0xf39Fd6e51aad88F6F4ce6aB8827279cffFb92266
export LOCALHOST_ADMIN=m:0x70997970C51812dc3A010C7d01b50e0d17dc79C8
export LOCALHOST_FACTORY=`npx hardhat --network ${network:?} deploy-factory --deployer DEPLOYER --dry-run false | jq -r .factory`
export LOCALHOST_TOKEN=`npx hardhat --network ${network:?} deploy --deployer DEPLOYER --admin ADMIN --decimals 0 --symbol TOKEN --dry-run false | jq -r .token`
npx hardhat --network ${network:?} mint --minter ADMIN --token TOKEN --amount 1000000 --to 0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC --dry-run false
npx hardhat --network ${network:?} set-meta --editor ADMIN --token TOKEN --dry-run false KEY1=VALUE1 "key 2"="VALUE 2"
npx hardhat --network ${network:?} get-meta --token TOKEN KEY1 "key 2"
```
