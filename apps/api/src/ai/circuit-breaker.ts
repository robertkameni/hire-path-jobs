export class CircuitBreaker {
  private threshold: number;
  private cooldownMs: number;
  private state: 'closed' | 'open' | 'half-open' = 'closed';
  private consecutiveFailures = 0;
  private openedAt = 0;

  constructor(threshold = 5, cooldownMs = 30000) {
    this.threshold = threshold;
    this.cooldownMs = cooldownMs;
  }

  isOpen() {
    if (this.state === 'open') {
      if (Date.now() - this.openedAt >= this.cooldownMs) {
        this.state = 'half-open';
        return false;
      }
      return true;
    }
    return false;
  }

  recordSuccess() {
    this.consecutiveFailures = 0;
    this.state = 'closed';
  }

  recordFailure() {
    this.consecutiveFailures++;
    if (
      this.state === 'half-open' ||
      this.consecutiveFailures >= this.threshold
    ) {
      this.state = 'open';
      this.openedAt = Date.now();
    }
  }

  getState() {
    return this.state;
  }

  getConsecutiveFailures() {
    return this.consecutiveFailures;
  }
}
