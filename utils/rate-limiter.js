// Rate limiter для Worksection API (1 req/sec)

class RateLimiter {
  constructor(delayMs = 1000) {
    this.delayMs = delayMs;
    this.lastRequest = 0;
  }

  async wait() {
    const now = Date.now();
    const elapsed = now - this.lastRequest;

    if (elapsed < this.delayMs) {
      await this.sleep(this.delayMs - elapsed);
    }

    this.lastRequest = Date.now();
  }

  sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

module.exports = RateLimiter;
