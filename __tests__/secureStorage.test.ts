import { InMemorySecureStorage } from '../src/storage/SecureStorageService';
import {
  embeddingToBytes,
  bytesToEmbedding,
  templatesToBytes,
  bytesToTemplates,
} from '../src/storage/schema';
import { mockEmbeddingFor } from '../src/native/mockInference';

const ISO = '2026-05-29T00:00:00.000Z';

describe('schema byte helpers', () => {
  test('embedding -> bytes -> embedding round-trips', () => {
    const e = mockEmbeddingFor('rizul');
    const back = bytesToEmbedding(embeddingToBytes(e));
    expect(back.length).toBe(128);
    for (let i = 0; i < e.length; i++) expect(back[i]).toBeCloseTo(e[i], 5);
  });

  test('N templates -> bytes -> templates round-trips', () => {
    const templates = [mockEmbeddingFor('rizul', 1), mockEmbeddingFor('rizul', 2), mockEmbeddingFor('rizul', 3)];
    const back = bytesToTemplates(templatesToBytes(templates));
    expect(back).toHaveLength(3);
    for (let t = 0; t < templates.length; t++) {
      for (let i = 0; i < 128; i++) expect(back[t][i]).toBeCloseTo(templates[t][i], 5);
    }
  });
});

describe('InMemorySecureStorage — enrollments', () => {
  test('save then get returns templates and version 1', async () => {
    const s = new InMemorySecureStorage();
    await s.saveEnrollment('rizul', [mockEmbeddingFor('rizul')], ISO);
    const rec = await s.getEnrollment('rizul');
    expect(rec).not.toBeNull();
    expect(rec!.templates).toHaveLength(1);
    expect(rec!.enrollment_version).toBe(1);
    expect(rec!.synced_to_aws).toBe(0);
  });

  test('stores multiple templates', async () => {
    const s = new InMemorySecureStorage();
    await s.saveEnrollment('rizul', [mockEmbeddingFor('rizul', 1), mockEmbeddingFor('rizul', 2)], ISO);
    const rec = await s.getEnrollment('rizul');
    expect(rec!.templates).toHaveLength(2);
  });

  test('re-enrollment increments version', async () => {
    const s = new InMemorySecureStorage();
    await s.saveEnrollment('rizul', [mockEmbeddingFor('rizul')], ISO);
    await s.saveEnrollment('rizul', [mockEmbeddingFor('rizul', 0.01)], ISO);
    const rec = await s.getEnrollment('rizul');
    expect(rec!.enrollment_version).toBe(2);
  });

  test('delete wipes the enrollment', async () => {
    const s = new InMemorySecureStorage();
    await s.saveEnrollment('rizul', [mockEmbeddingFor('rizul')], ISO);
    await s.deleteEnrollment('rizul');
    expect(await s.getEnrollment('rizul')).toBeNull();
  });

  test('refuses invalid templates', async () => {
    const s = new InMemorySecureStorage();
    await expect(s.saveEnrollment('x', [[1, 2, 3]], ISO)).rejects.toThrow();
    await expect(s.saveEnrollment('x', [], ISO)).rejects.toThrow();
  });
});

describe('InMemorySecureStorage — auth logs + purge safety', () => {
  const mkLog = (id: string) => ({
    log_id: id,
    user_id: 'rizul',
    attempted_at: ISO,
    result: 'success' as const,
    match_score: 0.9,
    failure_reason: null,
  });

  test('writeAuthLog rejects duplicate log_id (idempotency key)', async () => {
    const s = new InMemorySecureStorage();
    await s.writeAuthLog(mkLog('a'));
    await expect(s.writeAuthLog(mkLog('a'))).rejects.toThrow(/duplicate/i);
  });

  test('getPendingSyncLogs returns only unsynced', async () => {
    const s = new InMemorySecureStorage();
    await s.writeAuthLog(mkLog('a'));
    await s.writeAuthLog(mkLog('b'));
    await s.markLogSynced('a');
    const pending = await s.getPendingSyncLogs();
    expect(pending.map((l) => l.log_id)).toEqual(['b']);
  });

  test('purgeSyncedLogs deletes only confirmed records', async () => {
    const s = new InMemorySecureStorage();
    await s.writeAuthLog(mkLog('a'));
    await s.writeAuthLog(mkLog('b'));
    await s.writeAuthLog(mkLog('c'));
    await s.markLogSynced('a');
    await s.markLogSynced('b');
    const purged = await s.purgeSyncedLogs();
    expect(purged).toBe(2);
    expect(s._logCount()).toBe(1);
    expect((await s.getPendingSyncLogs()).map((l) => l.log_id)).toEqual(['c']);
  });
});
