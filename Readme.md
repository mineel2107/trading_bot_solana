# Solana Trading Bot

A sophisticated bot for monitoring and analyzing Solana wallet transactions.

# Setup Instructions

1. Clone the repository:

   ```bash
   git clone <repository-url>
   cd <repository-directory>
   ```

2. Install dependencies:

   ```bash
   npm install
   ```

3. Start the application:
   ```bash
   npm start
   ```

## Architecture

```ascii
Main Thread
│
├─── Process New Transactions (Main Loop)
│    │
│    ├─── Check Transaction 1
│    ├─── Check Transaction 2
│    └─── Check Transaction 3
│
├─── Wallet Monitor 1 (15 min loop)
│    │
│    ├─── Check for sells/buys
│    └─── Log activities
│
├─── Wallet Monitor 2 (15 min loop)
│    │
│    ├─── Check for sells/buys
│    └─── Log activities
│
└─── Wallet Monitor N (15 min loop)
     │
     ├─── Check for sells/buys
     └─── Log activities
```

## Features

- 🔍 Real-time transaction monitoring
- 👛 Intelligent wallet analysis
- ⏱️ 15-minute detailed wallet tracking
- 📊 Comprehensive transaction logging
- 🔄 Concurrent wallet monitoring

### Parallel Execution of New Transactions and Wallet Monitoring

This section explains how the parallel execution of new transactions and wallet monitoring takes place.

#### Wallet Selection Criteria

The wallet to be monitored from our selected transactions is chosen based on specific conditions that identify a wallet likely to make future purchases. The conditions are as follows:

- The wallet should be new, created less than 24 hours ago.
- It should have a low number of transactions.
- It should have never held any token other than our selected token.
- It should contain only one type of token.
- The SOL balance should meet a minimum expected threshold.

If a wallet meets these criteria, we proceed to buy some tokens.

#### Monitoring Process

The selected wallet is monitored for 15 minutes in parallel with the monitoring of live transactions for any interesting wallets. During this period:

- If a token sell occurs before the 15 minutes are up, we release the wallet from monitoring.
- If a token buy occurs within the 15 minutes, we sell the tokens we have acquired.

This approach ensures that we maximize our chances of profitable transactions while efficiently managing our resources.
