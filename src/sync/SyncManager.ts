/**
 * SyncManager — production scheduling around SyncService (TRD §4.5, §6.5).
 *
 * SyncService runs one pass; SyncManager decides *when* and *how often*:
 *   - single-flight: never two sync passes at once,
 *   - coalescing: triggers fired during a pass collapse into one follow-up pass,
 *   - exponential backoff retry when a pass has errors (network flaky), capped,
 *   - offline is not a failure: it resets backoff and waits for the next trigger
 *     (the NetInfo listener calls requestSync() when connectivity returns).
 *
 * The retry *queue* itself persists in the encrypted DB (auth_logs stay until the
 * server confirms them — TRD §6.5), so pending work survives app restarts; this
 * class only owns the in-memory scheduling of attempts.
 *
 * The timer is injected (`schedule`) so backoff is tested deterministically.
 */
import { SyncResult } from './SyncService';

export interface SyncRunner {
  sync(): Promise<SyncResult>;
}

/** Schedule `fn` after `ms`; returns a cancel function. Defaults to global timers. */
export type Scheduler = (fn: () => void, ms: number) => () => void;

export interface SyncManagerOptions {
  schedule?: Scheduler;
  baseDelayMs?: number;
  maxDelayMs?: number;
  maxAttempts?: number;
  onResult?: (result: SyncResult, attempt: number) => void;
}

const defaultSchedule: Scheduler = (fn, ms) => {
  const id = setTimeout(fn, ms);
  return () => clearTimeout(id);
};

export class SyncManager {
  private readonly schedule: Scheduler;
  private readonly baseDelayMs: number;
  private readonly maxDelayMs: number;
  private readonly maxAttempts: number;
  private readonly onResult?: (result: SyncResult, attempt: number) => void;

  private inFlight = false;
  private pendingRerun = false;
  private attempt = 0; // consecutive failed passes
  private cancelTimer: (() => void) | null = null;
  private stopped = false;

  constructor(private readonly runner: SyncRunner, opts: SyncManagerOptions = {}) {
    this.schedule = opts.schedule ?? defaultSchedule;
    this.baseDelayMs = opts.baseDelayMs ?? 2_000;
    this.maxDelayMs = opts.maxDelayMs ?? 5 * 60_000;
    this.maxAttempts = opts.maxAttempts ?? 8;
    this.onResult = opts.onResult;
  }

  /** Ask for a sync now (e.g. from a NetInfo "connected" event or after an auth). */
  requestSync(): void {
    if (this.stopped) return;
    this.clearTimer(); // a fresh request supersedes any scheduled retry
    void this.run();
  }

  /** Stop scheduling; cancels any pending retry. Safe to call multiple times. */
  stop(): void {
    this.stopped = true;
    this.clearTimer();
  }

  isInFlight(): boolean {
    return this.inFlight;
  }
  currentAttempt(): number {
    return this.attempt;
  }

  /** The delay that would be used for the given attempt index (exposed for tests/UI). */
  backoffFor(attempt: number): number {
    return Math.min(this.maxDelayMs, this.baseDelayMs * 2 ** attempt);
  }

  private async run(): Promise<void> {
    if (this.inFlight) {
      this.pendingRerun = true; // coalesce
      return;
    }
    this.inFlight = true;
    try {
      const result = await this.runner.sync();
      this.onResult?.(result, this.attempt);
      if (!result.ran) {
        this.attempt = 0; // offline — not a failure; wait for next trigger
      } else if (result.errors.length > 0) {
        this.scheduleRetry();
      } else {
        this.attempt = 0; // clean pass
      }
    } catch {
      this.scheduleRetry();
    } finally {
      this.inFlight = false;
      if (this.pendingRerun && !this.stopped) {
        this.pendingRerun = false;
        void this.run();
      }
    }
  }

  private scheduleRetry(): void {
    if (this.stopped || this.attempt >= this.maxAttempts) {
      // Give up active retrying; pending work persists and the next external
      // trigger (network change / next launch) will pick it up.
      return;
    }
    const delay = this.backoffFor(this.attempt);
    this.attempt += 1;
    this.cancelTimer = this.schedule(() => {
      this.cancelTimer = null;
      void this.run();
    }, delay);
  }

  private clearTimer(): void {
    if (this.cancelTimer) {
      this.cancelTimer();
      this.cancelTimer = null;
    }
  }
}
