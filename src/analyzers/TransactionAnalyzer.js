import { PublicKey, LAMPORTS_PER_SOL } from "@solana/web3.js";

class TransactionAnalyzer {
  static async isValidTransactionPattern(
    connection,
    walletAddress,
    tokenAddress
  ) {
    try {
      const history = await connection.getSignaturesForAddress(
        new PublicKey(walletAddress)
      );

      if (history.length >= 10) return false;

      const sortedHistory = history.sort((a, b) => a.blockTime - b.blockTime);

      // Get full transaction details
      const transactions = await Promise.all(
        sortedHistory.map((sig) =>
          connection.getTransaction(sig.signature, {
            maxSupportedTransactionVersion: 0,
          })
        )
      );

      // Filter out null transactions
      const validTransactions = transactions.filter((tx) => tx !== null);

      // Check if any transaction involves other tokens
      for (const tx of validTransactions) {
        const tokenAccounts = tx.meta.postTokenBalances || [];

        // Check if any token other than our target token was involved
        const hasOtherTokens = tokenAccounts.some(
          (account) =>
            account.mint !== tokenAddress && account.uiTokenAmount.uiAmount > 0
        );

        if (hasOtherTokens) {
          return false;
        }
      }

      return true; // Pattern is valid if no other tokens were involved
    } catch (error) {
      console.error("Error analyzing transaction pattern:", error);
      return false;
    }
  }

  static determineTransactionType(transaction, tokenAddress) {
    try {
      if (!transaction?.meta) return "unknown";

      // Check for SOL transfer
      if (TransactionAnalyzer.isSolTransfer(transaction)) {
        return "sol_transfer";
      }

      // Check for token purchase
      if (TransactionAnalyzer.isTokenPurchase(transaction, tokenAddress)) {
        return "token_purchase";
      }

      return "unknown";
    } catch (error) {
      console.error("Error determining transaction type:", error);
      return "unknown";
    }
  }

  static isSolTransfer(transaction) {
    try {
      const instructions = transaction.transaction.message.instructions;
      if (instructions.length !== 1) return false;

      const instruction = instructions[0];

      // Check if it's a system program transfer
      if (
        instruction.programId.toString() !== "11111111111111111111111111111111"
      ) {
        return false;
      }

      // Check pre and post SOL balances
      const preBalances = transaction.meta.preBalances;
      const postBalances = transaction.meta.postBalances;

      // Verify there was a significant SOL transfer (0.1 SOL or more)
      const balanceChanges = preBalances.map(
        (pre, index) => postBalances[index] - pre
      );
      const significantTransfer = balanceChanges.some(
        (change) => Math.abs(change) >= 0.1 * LAMPORTS_PER_SOL
      );

      return significantTransfer;
    } catch (error) {
      console.error("Error checking SOL transfer:", error);
      return false;
    }
  }

  static isTokenPurchase(transaction, tokenAddress) {
    try {
      const preTokenBalances = transaction.meta.preTokenBalances || [];
      const postTokenBalances = transaction.meta.postTokenBalances || [];

      // Find the relevant token account
      const tokenBalance = postTokenBalances.find(
        (balance) => balance.mint === tokenAddress
      );

      if (!tokenBalance) return false;

      // Find the corresponding pre-balance
      const preBalance = preTokenBalances.find(
        (balance) => balance.accountIndex === tokenBalance.accountIndex
      );

      // Check if token balance increased
      const preAmount = preBalance
        ? parseFloat(preBalance.uiTokenAmount.uiAmount)
        : 0;
      const postAmount = parseFloat(tokenBalance.uiTokenAmount.uiAmount);

      return postAmount > preAmount;
    } catch (error) {
      console.error("Error checking token purchase:", error);
      return false;
    }
  }

  static async getTokenBalance(connection, walletAddress, tokenAddress) {
    try {
      const tokenAccounts = await connection.getParsedTokenAccountsByOwner(
        new PublicKey(walletAddress),
        {
          programId: new PublicKey(
            "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
          ),
        }
      );

      const tokenAccount = tokenAccounts.value.find(
        (account) => account.account.data.parsed.info.mint === tokenAddress
      );

      return tokenAccount
        ? parseFloat(tokenAccount.account.data.parsed.info.tokenAmount.uiAmount)
        : 0;
    } catch (error) {
      console.error("Error getting token balance:", error);
      return 0;
    }
  }
}

export { TransactionAnalyzer };
