import { SyncManager, SyncRunner } from '../src/sync/SyncManager';
import { SyncResult } from '../src/sync/SyncService';

const ok = (over: Partial<SyncResult> = {}): SyncResult => ({
  ran: true,
  enrollmentSynced: false,
  logsConfirmed: 0,
  logsPurged: 0,
  wiped: false,
  errors: [],
  ...over,
});

/** Manual scheduler: capture scheduled callbacks so the test advances time. */
function manualScheduler() {
  const queue: Array<{ fn: () => void; ms: number; cancelled: boolean }> = [];
  const schedule = (fn: () => void, ms: number) => {
    const entry = { fn, ms, cancelled: false };
    queue.push(entry);
    return () => {
      entry.cancelled = true;
    };
  };
  /** Fire the most recently scheduled, not-cancelled timer. */
  const fireNext = async () => {
    const entry = [...queue].reverse().find((e) => !e.cancelled);
    if (!entry) throw new Error('no timer scheduled');
    entry.cancelled = true;
    entry.fn();
    await Promise.resolve();
    await Promise.resolve();
  };
  const pending = () => queue.filter((e) => !e.cancelled);
  return { schedule, fireNext, pending };
}

/** A runner whose results are scripted per call. */
class ScriptedRunner implements SyncRunner {
  calls = 0;
  constructor(private results: Array<SyncResult | Error>) {}
  async sync(): Promise<SyncResult> {
    const r = this.results[Math.min(this.calls, this.results.length - 1)];
    this.calls++;
    if (r instanceof Error) throw r;
    return r;
  }
}

describe('SyncManager', () => {
  test('a clean pass does not schedule a retry', async () => {
    const sch = manualScheduler();
    const runner = new ScriptedRunner([ok()]);
    const m = new SyncManager(runner, { schedule: sch.schedule });
    m.requestSync();
    await Promise.resolve();
    await Promise.resolve();
    expect(runner.calls).toBe(1);
    expect(sch.pending()).toHaveLength(0);
    expect(m.currentAttempt()).toBe(0);
  });

  test('errors trigger exponential-backoff retries until clean', async () => {
    const sch = manualScheduler();
    const runner = new ScriptedRunner([ok({ errors: ['net'] }), ok({ errors: ['net'] }), ok()]);
    const m = new SyncManager(runner, { schedule: sch.schedule, baseDelayMs: 1000 });

    m.requestSync();
    await Promise.resolve();
    await Promise.resolve();
    expect(runner.calls).toBe(1);
    expect(sch.pending()).toHaveLength(1); // retry scheduled

    await sch.fireNext(); // 2nd pass (still errors)
    expect(runner.calls).toBe(2);
    await sch.fireNext(); // 3rd pass (clean)
    expect(runner.calls).toBe(3);
    expect(m.currentAttempt()).toBe(0); // reset after success
  });

  test('backoff doubles and is capped', () => {
    const m = new SyncManager(new ScriptedRunner([ok()]), { baseDelayMs: 1000, maxDelayMs: 8000 });
    expect(m.backoffFor(0)).toBe(1000);
    expect(m.backoffFor(1)).toBe(2000);
    expect(m.backoffFor(2)).toBe(4000);
    expect(m.backoffFor(3)).toBe(8000);
    expect(m.backoffFor(10)).toBe(8000); // capped
  });

  test('offline pass (ran=false) does not consume retries', async () => {
    const sch = manualScheduler();
    const runner = new ScriptedRunner([ok({ ran: false })]);
    const m = new SyncManager(runner, { schedule: sch.schedule });
    m.requestSync();
    await Promise.resolve();
    await Promise.resolve();
    expect(sch.pending()).toHaveLength(0);
    expect(m.currentAttempt()).toBe(0);
  });

  test('single-flight: a request during a pass coalesces into exactly one rerun', async () => {
    let resolveFirst: (r: SyncResult) => void = () => {};
    const runner: SyncRunner = {
      calls: 0,
      async sync() {
        // @ts-expect-error augmenting for the test
        this.calls++;
        // @ts-expect-error
        if (this.calls === 1) return new Promise<SyncResult>((res) => (resolveFirst = res));
        return ok();
      },
    } as unknown as SyncRunner & { calls: number };

    const m = new SyncManager(runner);
    m.requestSync(); // starts pass 1 (pending promise)
    m.requestSync(); // in-flight -> coalesced
    m.requestSync(); // still in-flight -> coalesced (no extra rerun)
    resolveFirst(ok());
    await Promise.resolve();
    await Promise.resolve();
    await Promise.resolve();
    // exactly one rerun after the first completes => 2 total
    expect((runner as unknown as { calls: number }).calls).toBe(2);
  });

  test('thrown sync schedules a retry; stop() cancels it', async () => {
    const sch = manualScheduler();
    const runner = new ScriptedRunner([new Error('boom'), ok()]);
    const m = new SyncManager(runner, { schedule: sch.schedule });
    m.requestSync();
    await Promise.resolve();
    await Promise.resolve();
    expect(sch.pending()).toHaveLength(1);
    m.stop();
    expect(sch.pending()).toHaveLength(0); // cancelled
  });

  test('gives up after maxAttempts', async () => {
    const sch = manualScheduler();
    const runner = new ScriptedRunner([ok({ errors: ['e'] })]); // always errors
    const m = new SyncManager(runner, { schedule: sch.schedule, maxAttempts: 3 });
    m.requestSync();
    await Promise.resolve();
    await Promise.resolve();
    for (let i = 0; i < 3; i++) await sch.fireNext();
    // attempt counter stopped climbing past the cap
    expect(m.currentAttempt()).toBe(3);
    expect(sch.pending()).toHaveLength(0); // no further retry scheduled
  });
});
