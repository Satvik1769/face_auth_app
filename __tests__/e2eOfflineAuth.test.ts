/**
 * End-to-end offline pipeline test: enroll -> authenticate -> log, with NO network.
 * Uses the mock inference engines + in-memory storage, exercising the orchestrator,
 * match engine, and storage together exactly as the on-device app wires them.
 */
import { AuthOrchestrator } from '../src/core/AuthOrchestrator';
import { EnrollmentService } from '../src/core/EnrollmentService';
import { MatchEngine } from '../src/core/MatchEngine';
import { InMemorySecureStorage } from '../src/storage/SecureStorageService';
import { MockEmbedding } from '../src/native/mockInference';

const ISO = '2026-05-29T00:00:00.000Z';
let uuidCounter = 0;
const uuid = () => `uuid-${++uuidCounter}`;

function setup() {
  const storage = new InMemorySecureStorage();
  const embedding = new MockEmbedding();
  const match = new MatchEngine();
  const orch = new AuthOrchestrator({
    embedding,
    storage,
    match,
    userId: 'rizul',
    nowIso: () => ISO,
    uuid,
  });
  return { storage, embedding, match, orch };
}

/** Mock frames encode identity + frame index as "identity#n". */
const frames = (identity: string, n: number) =>
  Array.from({ length: n }, (_, i) => `${identity}#${i}`);

describe('E2E offline auth', () => {
  test('enroll then authenticate the same person -> AUTH_SUCCESS, success log', async () => {
    const { storage, embedding, orch } = setup();
    await new EnrollmentService(embedding, storage, () => ISO).enroll('rizul', frames('rizul', 10));

    orch.dispatch({ type: 'APP_FOREGROUND' });
    orch.dispatch({ type: 'CAMERA_READY' });
    orch.dispatch({ type: 'FACE_DETECTED', confidence: 0.95 });
    const finalState = await orch.completeAuth('rizul#live');

    expect(finalState).toBe('AUTH_SUCCESS');
    const logs = await storage.getPendingSyncLogs();
    expect(logs).toHaveLength(1);
    expect(logs[0].result).toBe('success');
    expect(logs[0].match_score).toBeGreaterThan(0.85);
  });

  test('impostor is rejected -> not AUTH_SUCCESS, fail log with low_score', async () => {
    const storage = new InMemorySecureStorage();
    await new EnrollmentService(new MockEmbedding(), storage, () => ISO).enroll('rizul', frames('rizul', 10));
    const orch = new AuthOrchestrator({
      embedding: new MockEmbedding(),
      storage,
      match: new MatchEngine(),
      userId: 'rizul',
      nowIso: () => ISO,
      uuid,
    });

    orch.dispatch({ type: 'APP_FOREGROUND' });
    orch.dispatch({ type: 'CAMERA_READY' });
    orch.dispatch({ type: 'FACE_DETECTED', confidence: 0.95 });
    const finalState = await orch.completeAuth('impostor#live');

    expect(finalState).not.toBe('AUTH_SUCCESS');
    const logs = await storage.getPendingSyncLogs();
    expect(logs[0].result).toBe('fail');
    expect(logs[0].failure_reason).toBe('low_score');
  });

  test('liveness failure logs liveness_fail and counts a retry', async () => {
    const storage = new InMemorySecureStorage();
    const orch = new AuthOrchestrator({
      embedding: new MockEmbedding(),
      storage,
      match: new MatchEngine(),
      userId: 'rizul',
      nowIso: () => ISO,
      uuid,
    });
    orch.dispatch({ type: 'APP_FOREGROUND' });
    orch.dispatch({ type: 'CAMERA_READY' });
    orch.dispatch({ type: 'FACE_DETECTED', confidence: 0.95 });
    await orch.failLiveness();
    const logs = await storage.getPendingSyncLogs();
    expect(logs[0].failure_reason).toBe('liveness_fail');
    expect(orch.getContext().retryCount).toBe(1);
  });
});
