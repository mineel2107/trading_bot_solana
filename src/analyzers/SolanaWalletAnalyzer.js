import { Connection, PublicKey, LAMPORTS_PER_SOL } from "@solana/web3.js";
import { WalletMonitor } from "./WalletMonitor.js";
import { TransactionAnalyzer } from "./TransactionAnalyzer.js";
import { getOutputDir } from "../utils/paths.js";
import fs from "fs";
import path from "path";
import dotenv from "dotenv";
dotenv.config();

const WALLET_AGE_LIMIT = 24; // Maximum age of wallet in hours
const TRANSACTION_LIMIT_NEW_WALLET = 10;

class SolanaWalletAnalyzer {
  constructor(socket = null, stats = null) {
    this.rpcUrl = `${process.env.ALCHEMY_NETWORK_URL}/${process.env.ALCHEMY_API_KEY}`;
    this.connection = new Connection(this.rpcUrl, "confirmed");
    this.tokenAddress = process.env.TOKEN_ADDRESS;
    if (!this.tokenAddress) {
      throw new Error("TOKEN_ADDRESS not set in environment variables");
    }
    this.socket = socket;
    this.stats = stats;
    this.tokenPriceInSOL = 0.001;
    this.detailedLogs = [];
    this.isMonitoring = false;
    this.lastProcessedSignature = null;
    this.processedTransactions = 0;
    this.activeMonitors = new Map();
    this.transactionAnalyzer = new TransactionAnalyzer(this.connection);
  }

  emitUpdate(type, data) {
    if (this.socket) {
      this.socket.emit("analysisUpdate", { type, data });
    }

    const timestamp = new Date().toISOString();
    let logEntry;

    switch (type) {
      case "transaction":
        logEntry = `\n${"-".repeat(100)}
[${timestamp}] 🔍 Transaction Analysis:
  Signature: ${data.signature}
  Wallet: ${data.wallet}
  Status: ${data.isApproved ? "✅ Approved" : "❌ Rejected"}

  Wallet Stats:
    • Age: ${data.walletAgeHours.toFixed(2)} hours
    • SOL Balance: ${data.solanaBalance.toFixed(4)} SOL
    • SPL Tokens: ${data.uniqueTokens} different token(s)
    • Target Token Balance: ${data.tokenBalance.toFixed(6)}
    • Total Transactions: ${data.totalTransactions}

  Check Results:
    • Age Check (< 24h): ${data.checkResults.ageCheck ? "✅" : "❌"}
    • Transaction Check (< 10): ${
      data.checkResults.transactionCheck ? "✅" : "❌"
    } (Has: ${data.totalTransactions})
    • Token Check (exactly 1 SPL token): ${
      data.checkResults.tokenCheck ? "✅" : "❌"
    } (Has: ${data.uniqueTokens})
    • Balance Check (≥ 0.1 SOL): ${
      data.checkResults.balanceCheck ? "✅" : "❌"
    } (Has: ${data.solanaBalance.toFixed(4)} SOL)
    • Pattern Check (no other tokens): ${
      data.checkResults.patternCheck ? "✅" : "❌"
    }

  Timeline:
    • First TX: ${data.firstTransaction}
    • Last TX: ${data.lastTransaction}
${"-".repeat(100)}`;
        break;

      case "approved":
        logEntry = `\n[${timestamp}] ✅ Approved Wallet:
  Address: ${data.wallet}
  Monitor Until: ${data.monitorUntil}`;
        break;

      case "error":
        logEntry = `\n[${timestamp}] ❌ Error: ${data}`;
        break;

      default:
        logEntry = `\n[${timestamp}] ${type}: ${
          typeof data === "object" ? JSON.stringify(data, null, 2) : data
        }`;
    }

    this.detailedLogs.push(logEntry);
    console.log(logEntry);
  }

  async initialize() {
    this.emitUpdate("status", "Initializing analyzer...");
    await this.fetchTokenPrice();

    try {
      const signatures = await this.connection.getSignaturesForAddress(
        new PublicKey(this.tokenAddress),
        { limit: 1 }
      );
      if (signatures.length > 0) {
        this.lastProcessedSignature = signatures[0].signature;
        this.emitUpdate(
          "status",
          `Starting from signature: ${this.lastProcessedSignature}`
        );
      }
    } catch (error) {
      this.emitUpdate("error", `Initialization error: ${error.message}`);
    }
  }

  async startMonitoring() {
    if (this.isMonitoring) {
      this.emitUpdate("status", "Already monitoring");
      return;
    }

    this.isMonitoring = true;
    this.processedTransactions = 0;
    this.emitUpdate("status", "Started monitoring");

    while (this.isMonitoring) {
      try {
        await this.processNewTransactions();
        await new Promise((resolve) => setTimeout(resolve, 2000));
      } catch (error) {
        this.emitUpdate("error", `Monitoring error: ${error.message}`);
        await new Promise((resolve) => setTimeout(resolve, 5000));
      }
    }
  }

  async processNewTransactions() {
    try {
      const signatures = await this.connection.getSignaturesForAddress(
        new PublicKey(this.tokenAddress),
        { until: this.lastProcessedSignature }
      );

      if (signatures.length > 0) {
        this.lastProcessedSignature = signatures[0].signature;

        console.log(`\n${"=".repeat(100)}`);
        console.log(
          `📦 Processing Batch: ${signatures.length} new transactions`
        );
        console.log(`First Signature: ${signatures[0].signature}`);
        console.log(
          `Last Signature: ${signatures[signatures.length - 1].signature}`
        );
        console.log(`${"=".repeat(100)}\n`);

        let processed = 0;
        for (const sig of signatures.reverse()) {
          await this.processTransaction(sig);
          processed++;
        }

        if (this.stats) {
          this.stats.incrementStat(
            "totalProcessedTransactions",
            signatures.length
          );
        }
      }
    } catch (error) {
      this.emitUpdate(
        "error",
        `Error processing transactions: ${error.message}`
      );
    }
  }

  async processTransaction(signature) {
    try {
      const tx = await this.connection.getTransaction(signature.signature, {
        maxSupportedTransactionVersion: 0,
      });

      if (!tx?.transaction?.message?.accountKeys?.length) return;

      const walletAddress = tx.transaction.message.accountKeys[0].toString();

      if (this.activeMonitors.has(walletAddress)) {
        return;
      }

      const walletInfo = await this.analyzeWallet(walletAddress);

      if (walletInfo) {
        const transactionInfo = {
          signature: signature.signature,
          wallet: walletAddress,
          ...walletInfo,
          timestamp: new Date().toISOString(),
        };

        this.emitUpdate("transaction", transactionInfo);

        if (walletInfo.isApproved) {
          await this.saveApprovedWallet(walletAddress, walletInfo);
          await this.startWalletMonitoring(walletAddress, walletInfo);

          if (this.stats) {
            this.stats.incrementStat("approvedWallets");
          }
        } else if (this.stats) {
          this.stats.incrementStat("rejectedWallets");
        }
      }
    } catch (error) {
      this.emitUpdate(
        "error",
        `Error processing transaction: ${error.message}`
      );
      if (this.stats) {
        this.stats.incrementStat("errors");
      }
    }
  }

  async analyzeWallet(walletAddress) {
    try {
      const [solBalance, tokenAccounts, history] = await Promise.all([
        this.connection.getBalance(new PublicKey(walletAddress)),
        this.connection.getParsedTokenAccountsByOwner(
          new PublicKey(walletAddress),
          {
            programId: new PublicKey(
              "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
            ),
          }
        ),
        this.connection.getSignaturesForAddress(new PublicKey(walletAddress)),
      ]);

      const walletAge =
        history.length > 0
          ? (Date.now() / 1000 - history[history.length - 1].blockTime) / 3600
          : 0;

      const tokenBalances = tokenAccounts.value.filter(
        (account) => account.account.data.parsed.info.tokenAmount.uiAmount > 0
      );

      const targetTokenAccount = tokenAccounts.value.find(
        (account) => account.account.data.parsed.info.mint === this.tokenAddress
      );

      const solBalanceInSOL = solBalance / LAMPORTS_PER_SOL;

      const hasValidPattern =
        await TransactionAnalyzer.isValidTransactionPattern(
          this.connection,
          walletAddress,
          this.tokenAddress
        );

      const checkResults = {
        ageCheck: walletAge <= WALLET_AGE_LIMIT,
        transactionCheck: history.length <= TRANSACTION_LIMIT_NEW_WALLET,
        tokenCheck: tokenBalances.length <= 1,
        balanceCheck: solBalanceInSOL >= 0.1,
        patternCheck: hasValidPattern,
      };

      const analysis = {
        solanaBalance: solBalanceInSOL,
        walletAgeHours: walletAge,
        totalTransactions: history.length,
        uniqueTokens: tokenBalances.length,
        tokenBalance: targetTokenAccount
          ? targetTokenAccount.account.data.parsed.info.tokenAmount.uiAmount
          : 0,
        isApproved: Object.values(checkResults).every((result) => result),
        checkResults,
        firstTransaction:
          history.length > 0
            ? new Date(
                history[history.length - 1].blockTime * 1000
              ).toISOString()
            : null,
        lastTransaction:
          history.length > 0
            ? new Date(history[0].blockTime * 1000).toISOString()
            : null,
      };

      return analysis;
    } catch (error) {
      this.emitUpdate("error", `Error analyzing wallet: ${error.message}`);
      return null;
    }
  }

  async startWalletMonitoring(walletAddress, initialData) {
    if (this.activeMonitors.has(walletAddress)) return;

    const monitor = new WalletMonitor(
      this.connection,
      walletAddress,
      this.tokenAddress,
      initialData
    );

    this.activeMonitors.set(walletAddress, monitor);

    monitor.start().finally(() => {
      this.activeMonitors.delete(walletAddress);
      if (this.stats) {
        this.stats.incrementStat("completedMonitors");
      }
    });
  }

  async saveApprovedWallet(walletAddress, walletInfo) {
    try {
      const outputDir = getOutputDir();
      const timestamp = new Date().toISOString();
      const data = {
        timestamp,
        walletAddress,
        ...walletInfo,
        monitorUntil: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
      };

      const approvedWalletsPath = path.join(outputDir, "approved_wallets.json");
      let approvedWallets = [];
      if (fs.existsSync(approvedWalletsPath)) {
        approvedWallets = JSON.parse(
          fs.readFileSync(approvedWalletsPath, "utf8")
        );
      }
      approvedWallets.push(data);
      fs.writeFileSync(
        approvedWalletsPath,
        JSON.stringify(approvedWallets, null, 2)
      );

      this.emitUpdate("approved", {
        wallet: walletAddress,
        details: walletInfo,
        monitorUntil: data.monitorUntil,
      });
    } catch (error) {
      this.emitUpdate(
        "error",
        `Error saving approved wallet: ${error.message}`
      );
    }
  }

  async fetchTokenPrice() {
    try {
      this.tokenPriceInSOL = 0.001; // Default price
      this.emitUpdate(
        "status",
        `Using token price: ${this.tokenPriceInSOL} SOL`
      );
    } catch (error) {
      this.emitUpdate("error", `Error setting token price: ${error.message}`);
    }
  }

  getMonitoringStats() {
    return {
      activeMonitors: this.activeMonitors.size,
      processedTransactions: this.processedTransactions,
      isMonitoring: this.isMonitoring,
    };
  }

  async cleanup() {
    this.isMonitoring = false;

    // Stop all active monitors
    const monitors = Array.from(this.activeMonitors.values());
    await Promise.all(
      monitors.map((monitor) => monitor.stop("System shutdown"))
    );

    this.activeMonitors.clear();
    this.saveDetailedLogs();
  }

  saveDetailedLogs() {
    try {
      const outputDir = getOutputDir();
      const timestamp = new Date().toISOString().replace(/[:.]/g, "-");
      const logPath = path.join(outputDir, `analysis_logs_${timestamp}.txt`);
      fs.writeFileSync(logPath, this.detailedLogs.join("\n"));
      console.log(`Detailed logs saved to: ${logPath}`);
    } catch (error) {
      console.error("Error saving logs:", error);
    }
  }
}

export { SolanaWalletAnalyzer };
