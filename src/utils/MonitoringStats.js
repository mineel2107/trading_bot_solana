class MonitoringStats {
  constructor() {
    this.stats = {
      totalProcessedTransactions: 0,
      activeMonitors: 0,
      approvedWallets: 0,
      rejectedWallets: 0,
      completedMonitors: 0,
      errors: 0,
      lastUpdateTime: new Date().toISOString(),
    };
  }

  incrementStat(key, value = 1) {
    if (key in this.stats) {
      this.stats[key] += value;
      this.stats.lastUpdateTime = new Date().toISOString();
    }
  }

  decrementStat(key, value = 1) {
    if (key in this.stats && typeof this.stats[key] === "number") {
      this.stats[key] = Math.max(0, this.stats[key] - value);
      this.stats.lastUpdateTime = new Date().toISOString();
    }
  }

  setStat(key, value) {
    if (key in this.stats) {
      this.stats[key] = value;
      this.stats.lastUpdateTime = new Date().toISOString();
    }
  }

  getStats() {
    return {
      ...this.stats,
      currentTime: new Date().toISOString(),
    };
  }

  reset() {
    Object.keys(this.stats).forEach((key) => {
      if (typeof this.stats[key] === "number") {
        this.stats[key] = 0;
      }
    });
    this.stats.lastUpdateTime = new Date().toISOString();
  }

  getFormattedStats() {
    const stats = this.getStats();
    return Object.entries(stats)
      .map(([key, value]) => `${key}: ${value}`)
      .join("\n");
  }

  logStats() {
    console.log("\n=== Monitoring Statistics ===");
    console.log(this.getFormattedStats());
    console.log("===========================\n");
  }
}

export { MonitoringStats };
