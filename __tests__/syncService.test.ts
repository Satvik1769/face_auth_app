import { InMemorySecureStorage } from '../src/storage/SecureStorageService';
import { SyncService } from '../src/sync/SyncService';
import { ISyncApi, MAX_LOG_BATCH } from '../src/sync/api';
import { AuthLogEntry } from '../src/core/types';
import { mockEmbeddingFor } from '../src/native/mockInference';

const ISO = '2026-05-29T00:00:00.000Z';
const clock = { nowIso: () => ISO };

/** Configurable fake API to drive confirm/partial/failure paths. */
class FakeApi implements ISyncApi {
  postedEnrollments = 0;
  postedLogBatches: AuthLogEntry[][] = [];
  wipePending = false;
  confirmedWipe = false;
  /** if set, only these log_ids are confirmed */
  confirmOnly: Set<string> | null = null;
  failLogs = false;

  async postEnrollment() {
    this.postedEnrollments++;
    return { synced_at: ISO };
  }
  async postAuthLogs(logs: AuthLogEntry[]) {
    if (this.failLogs) throw new Error('network down');
    if (logs.length > MAX_LOG_BATCH) throw new Error('413');
    this.postedLogBatches.push(logs);
    const confirmed = logs
      .map((l) => l.log_id)
      .filter((id) => (this.confirmOnly ? this.confirmOnly.has(id) : true));
    return { confirmed_log_ids: confirmed };
  }
  async getWipeCommand() {
    return { wipe_pending: this.wipePending, issued_at: this.wipePending ? ISO : null };
  }
  async confirmWipe() {
    this.confirmedWipe = true;
  }
  async verifyCredentials() { return null; }
  async pullEnrollment() { return null; }
}

const onlineNet = { isConnected: async () => true };
const offlineNet = { isConnected: async () => false };

const mkLog = (id: string): Omit<AuthLogEntry, 'synced_to_aws'> => ({
  log_id: id,
  user_id: 'rizul',
  attempted_at: ISO,
  result: 'success',
  match_score: 0.9,
  failure_reason: null,
});

describe('SyncService', () => {
  test('skips entirely when offline', async () => {
    const storage = new InMemorySecureStorage();
    await storage.writeAuthLog(mkLog('a'));
    const svc = new SyncService(storage, new FakeApi(), offlineNet, clock, 'rizul');
    const r = await svc.sync();
    expect(r.ran).toBe(false);
    expect((await storage.getPendingSyncLogs()).length).toBe(1); // untouched
  });

  test('confirms and purges all logs when server confirms everything', async () => {
    const storage = new InMemorySecureStorage();
    await storage.writeAuthLog(mkLog('a'));
    await storage.writeAuthLog(mkLog('b'));
    const api = new FakeApi();
    const svc = new SyncService(storage, api, onlineNet, clock, 'rizul');
    const r = await svc.sync();
    expect(r.ran).toBe(true);
    expect(r.logsConfirmed).toBe(2);
    expect(r.logsPurged).toBe(2);
    expect(storage._logCount()).toBe(0);
  });

  test('partial confirm: only confirmed logs are purged, rest retained for retry', async () => {
    const storage = new InMemorySecureStorage();
    await storage.writeAuthLog(mkLog('a'));
    await storage.writeAuthLog(mkLog('b'));
    await storage.writeAuthLog(mkLog('c'));
    const api = new FakeApi();
    api.confirmOnly = new Set(['a', 'b']); // server drops 'c'
    const svc = new SyncService(storage, api, onlineNet, clock, 'rizul');
    const r = await svc.sync();
    expect(r.logsConfirmed).toBe(2);
    expect(r.logsPurged).toBe(2);
    const pending = await storage.getPendingSyncLogs();
    expect(pending.map((l) => l.log_id)).toEqual(['c']); // safe — never purged unconfirmed
  });

  test('log POST failure leaves the whole queue intact', async () => {
    const storage = new InMemorySecureStorage();
    await storage.writeAuthLog(mkLog('a'));
    const api = new FakeApi();
    api.failLogs = true;
    const svc = new SyncService(storage, api, onlineNet, clock, 'rizul');
    const r = await svc.sync();
    expect(r.errors.length).toBeGreaterThan(0);
    expect(r.logsPurged).toBe(0);
    expect((await storage.getPendingSyncLogs()).length).toBe(1);
  });

  test('uploads a pending enrollment', async () => {
    const storage = new InMemorySecureStorage();
    await storage.saveEnrollment('rizul', [mockEmbeddingFor('rizul')], ISO);
    const api = new FakeApi();
    const svc = new SyncService(storage, api, onlineNet, clock, 'rizul');
    const r = await svc.sync();
    expect(api.postedEnrollments).toBe(1);
    expect(r.enrollmentSynced).toBe(true);
  });

  test('remote wipe deletes enrollment locally and confirms', async () => {
    const storage = new InMemorySecureStorage();
    await storage.saveEnrollment('rizul', [mockEmbeddingFor('rizul')], ISO);
    const api = new FakeApi();
    api.wipePending = true;
    const svc = new SyncService(storage, api, onlineNet, clock, 'rizul');
    const r = await svc.sync();
    expect(r.wiped).toBe(true);
    expect(api.confirmedWipe).toBe(true);
    expect(await storage.getEnrollment('rizul')).toBeNull();
  });

  test('batches logs in groups of <=100', async () => {
    const storage = new InMemorySecureStorage();
    for (let i = 0; i < 250; i++) await storage.writeAuthLog(mkLog(`log-${i}`));
    const api = new FakeApi();
    const svc = new SyncService(storage, api, onlineNet, clock, 'rizul');
    const r = await svc.sync();
    expect(api.postedLogBatches.length).toBe(3); // 100 + 100 + 50
    expect(api.postedLogBatches.every((b) => b.length <= 100)).toBe(true);
    expect(r.logsConfirmed).toBe(250);
    expect(storage._logCount()).toBe(0);
  });
});
