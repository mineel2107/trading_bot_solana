import { SolanaWalletAnalyzer } from "./analyzers/SolanaWalletAnalyzer.js";
import { MonitoringStats } from "./utils/MonitoringStats.js";
import dotenv from "dotenv";

// Load environment variables
dotenv.config();

class Application {
  constructor() {
    this.stats = new MonitoringStats();
    this.analyzer = new SolanaWalletAnalyzer(null, this.stats);
    this.statsInterval = null;
  }

  async start() {
    try {
      console.log("Initializing wallet analyzer...");
      await this.analyzer.initialize();

      // Print stats every 30 seconds
      this.statsInterval = setInterval(() => {
        this.printStats();
      }, 30000);

      // Set up graceful shutdown
      this.setupShutdownHandlers();

      // Start the monitoring process
      console.log("Starting wallet monitoring...");
      await this.analyzer.startMonitoring();
    } catch (error) {
      console.error("Fatal error:", error);
      await this.shutdown(1);
    }
  }

  printStats() {
    const stats = this.analyzer.getMonitoringStats();
    console.log("\n=== Monitoring Statistics ===");
    console.log(`Active Monitors: ${stats.activeMonitors}`);
    console.log(`Active Threads: ${stats.activeThreads}`);
    console.log(`Processed Transactions: ${stats.processedTransactions}`);
    console.log(
      `Memory Usage: ${(process.memoryUsage().heapUsed / 1024 / 1024).toFixed(
        2
      )} MB`
    );
    console.log("===========================\n");
  }

  setupShutdownHandlers() {
    // Handle graceful shutdown
    process.on("SIGINT", async () => {
      console.log("\nReceived SIGINT. Starting graceful shutdown...");
      await this.shutdown(0);
    });

    process.on("SIGTERM", async () => {
      console.log("\nReceived SIGTERM. Starting graceful shutdown...");
      await this.shutdown(0);
    });

    // Handle uncaught errors
    process.on("uncaughtException", async (error) => {
      console.error("Uncaught Exception:", error);
      await this.shutdown(1);
    });

    process.on("unhandledRejection", async (reason, promise) => {
      console.error("Unhandled Rejection at:", promise, "reason:", reason);
      await this.shutdown(1);
    });
  }

  async shutdown(code = 0) {
    console.log("Shutting down...");

    // Clear the stats interval
    if (this.statsInterval) {
      clearInterval(this.statsInterval);
    }

    try {
      // Stop the analyzer and clean up resources
      await this.analyzer.cleanup();

      // Print final statistics
      this.printStats();

      console.log("Shutdown complete");
    } catch (error) {
      console.error("Error during shutdown:", error);
      code = 1;
    } finally {
      process.exit(code);
    }
  }
}

// Start the application
const app = new Application();
app.start().catch(async (error) => {
  console.error("Error starting application:", error);
  await app.shutdown(1);
});
