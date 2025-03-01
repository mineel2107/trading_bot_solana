import { PublicKey } from "@solana/web3.js";
import { TransactionAnalyzer } from "./TransactionAnalyzer.js";

class WalletMonitor {
  constructor(connection, walletAddress, tokenAddress, initialData) {
    this.connection = connection;
    this.walletAddress = walletAddress;
    this.tokenAddress = tokenAddress;
    this.initialData = initialData;
    this.isMonitoring = false;
    this.shouldStop = false;
    this.monitorUntil = Date.now() + 15 * 60 * 1000; // 15 minutes
    this.lastSignature = null;
    this.transactions = [];
  }

  async start() {
    this.isMonitoring = true;
    console.log(
      `[${new Date().toISOString()}] Started monitoring wallet: ${
        this.walletAddress
      }`
    );
    console.log("Tokens Bought");
    console.log("Initial state:", JSON.stringify(this.initialData, null, 2));

    while (
      this.isMonitoring &&
      !this.shouldStop &&
      Date.now() < this.monitorUntil
    ) {
      try {
        await this.checkNewTransactions();
        await new Promise((resolve) => setTimeout(resolve, 1000));
      } catch (error) {
        console.error(`Error monitoring wallet ${this.walletAddress}:`, error);
      }
    }

    this.stop("Monitoring period ended");
  }

  stop(reason) {
    this.shouldStop = true;
    this.isMonitoring = false;
    console.log(
      `[${new Date().toISOString()}] Stopped monitoring wallet ${
        this.walletAddress
      }. Reason: ${reason}`
    );
    this.logMonitoringSummary();
  }

  logMonitoringSummary() {
    console.log(`\nMonitoring Summary for ${this.walletAddress}:`);
    console.log("Total transactions tracked:", this.transactions.length);
    console.log(
      "Monitoring duration:",
      ((Date.now() - (this.monitorUntil - 15 * 60 * 1000)) / 1000).toFixed(2),
      "seconds"
    );
    console.log("Transactions:", JSON.stringify(this.transactions, null, 2));
    console.log("\n");
  }

  async checkNewTransactions() {
    try {
      const signatures = await this.connection.getSignaturesForAddress(
        new PublicKey(this.walletAddress),
        { until: this.lastSignature }
      );

      if (signatures.length === 0) return;

      this.lastSignature = signatures[0].signature;

      for (const sig of signatures.reverse()) {
        const tx = await this.connection.getTransaction(sig.signature, {
          maxSupportedTransactionVersion: 0,
        });

        if (!tx) continue;

        const transactionInfo = await this.analyzeTransaction(
          tx,
          sig.signature
        );

        if (transactionInfo) {
          this.transactions.push(transactionInfo);

          if (transactionInfo.type === "sell") {
            console.log(
              `[${new Date().toISOString()}] Wallet ${
                this.walletAddress
              } sold tokens:`,
              transactionInfo
            );
            this.stop("Token sell detected");
            return;
          }

          if (transactionInfo.type === "buy") {
            console.log(
              `[${new Date().toISOString()}] Wallet ${
                this.walletAddress
              } bought more tokens:`,
              transactionInfo
            );
            console.log("Tokens sold");
          }
        }
      }
    } catch (error) {
      console.error("Error checking new transactions:", error);
    }
  }

  async analyzeTransaction(transaction, signature) {
    try {
      const preTokenBalance = await TransactionAnalyzer.getTokenBalance(
        this.connection,
        this.walletAddress,
        this.tokenAddress
      );

      const { type, amount } = await this.getTransactionType(transaction);

      if (!type) return null;

      const postTokenBalance = await TransactionAnalyzer.getTokenBalance(
        this.connection,
        this.walletAddress,
        this.tokenAddress
      );

      return {
        signature,
        type,
        amount,
        preBalance: preTokenBalance,
        postBalance: postTokenBalance,
        timestamp: new Date().toISOString(),
        blockTime: transaction.blockTime,
      };
    } catch (error) {
      console.error("Error analyzing transaction:", error);
      return null;
    }
  }

  async getTransactionType(transaction) {
    try {
      const preTokenBalances = transaction.meta.preTokenBalances || [];
      const postTokenBalances = transaction.meta.postTokenBalances || [];

      const preBalance = this.getTokenBalance(preTokenBalances);
      const postBalance = this.getTokenBalance(postTokenBalances);

      if (preBalance === null || postBalance === null) {
        return { type: null, amount: 0 };
      }

      const tokenDelta = postBalance - preBalance;

      if (tokenDelta > 0) {
        return { type: "buy", amount: tokenDelta };
      } else if (tokenDelta < 0) {
        return { type: "sell", amount: Math.abs(tokenDelta) };
      }

      return { type: null, amount: 0 };
    } catch (error) {
      console.error("Error getting transaction type:", error);
      return { type: null, amount: 0 };
    }
  }

  getTokenBalance(balances) {
    if (!balances || !balances.length) return null;

    const tokenAccount = balances.find(
      (balance) => balance?.mint === this.tokenAddress
    );

    return tokenAccount
      ? parseFloat(tokenAccount.uiTokenAmount.uiAmount)
      : null;
  }
}

export { WalletMonitor };
