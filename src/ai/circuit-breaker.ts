export type CircuitState = 'closed' | 'open' | 'half-open';

/**
 * Simple 3-state circuit breaker.
 *
 *   CLOSED ──(threshold failures)──► OPEN
 *   OPEN   ──(cooldown elapsed)────► HALF-OPEN
 *   HALF-OPEN ──(success)──────────► CLOSED
 *   HALF-OPEN ──(failure)──────────► OPEN  (reset cooldown)
 *
 * Thread-safe for single-threaded Node.js event loop.
 */
export class CircuitBreaker {
  private state: CircuitState = 'closed';
  private consecutiveFailures = 0;
  private openedAt = 0;

  constructor(
    /** Number of consecutive failures before the circuit opens. */
    private readonly threshold = 5,
    /** Milliseconds to stay open before allowing a probe request. */
    private readonly cooldownMs = 30_000,
  ) {}

  /**
   * Returns true when the circuit should block the call.
   * Automatically transitions OPEN → HALF-OPEN after cooldown.
   */
  isOpen(): boolean {
    if (this.state === 'open') {
      if (Date.now() - this.openedAt >= this.cooldownMs) {
        this.state = 'half-open';
        return false; // let one probe through
      }
      return true;
    }
    return false;
  }

  /** Call after a successful operation. Resets the breaker to CLOSED. */
  recordSuccess(): void {
    this.consecutiveFailures = 0;
    this.state = 'closed';
  }

  /** Call after a final failure (after all retries are exhausted). */
  recordFailure(): void {
    this.consecutiveFailures++;
    if (
      this.state === 'half-open' ||
      this.consecutiveFailures >= this.threshold
    ) {
      this.state = 'open';
      this.openedAt = Date.now();
    }
  }

  getState(): CircuitState {
    return this.state;
  }

  getConsecutiveFailures(): number {
    return this.consecutiveFailures;
  }
}
