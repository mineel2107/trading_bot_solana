class ThreadManager {
  constructor() {
    this.activeThreads = new Map();
    this.maxConcurrentThreads = 10; // Adjust based on system capabilities
  }

  async startThread(id, task) {
    if (this.activeThreads.size >= this.maxConcurrentThreads) {
      console.log("Max thread limit reached, waiting...");
      await this.waitForAvailableThread();
    }

    const threadPromise = task().finally(() => {
      this.activeThreads.delete(id);
    });

    this.activeThreads.set(id, threadPromise);
    return threadPromise;
  }

  async waitForAvailableThread() {
    while (this.activeThreads.size >= this.maxConcurrentThreads) {
      await Promise.race([...this.activeThreads.values()]);
    }
  }

  async stopAll() {
    await Promise.all([...this.activeThreads.values()]);
    this.activeThreads.clear();
  }

  getActiveThreadCount() {
    return this.activeThreads.size;
  }

  isThreadActive(id) {
    return this.activeThreads.has(id);
  }

  async waitForThread(id) {
    const thread = this.activeThreads.get(id);
    if (thread) {
      await thread;
    }
  }
}

export { ThreadManager };
