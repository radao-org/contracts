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
export LOCALHOST_TEST_ADMIN=m:0x3C44CdDdB6a900fa2b585dd299e03d12FA4293BC
npx hardhat --network ${network:?} deploy-radao --deployer DEPLOYER --admin ADMIN --dry-run false
export LOCALHOST_RADAO=0x5FbDB2315678afecb367f032d93F642f64180aa3
npx hardhat --network ${network:?} deploy --deployer TEST_ADMIN --admin TEST_ADMIN --decimals 0 --name Test --symbol TEST --dry-run false
export LOCALHOST_TEST_SECURITY=0xB7A5bd0345EF1Cc5E66bf61BdeC17D2461fBd968
export LOCALHOST_TEST_DAO=0xeEBe00Ac0756308ac4AaBfD76c05c4F3088B8883
export LOCALHOST_TEST_ART=0x10C6E9530F1C1AF873a391030a1D9E8ed0630D26
npx hardhat --network ${network:?} set-meta --editor TEST_ADMIN --token TEST_SECURITY --dry-run false KEY1=VALUE1 "key 2"="VALUE 2"
npx hardhat --network ${network:?} get-meta --token TEST_SECURITY KEY1 "key 2"
npx hardhat --network ${network:?} mint --minter TEST_ADMIN --token TEST_SECURITY --amount 1000000 --to 0x90F79bf6EB2c4f870365E785982E1f101E93b906 --dry-run false
# TODO ...all Radao and RadaoToken features
```
