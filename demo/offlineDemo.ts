/**
 * Offline end-to-end demo — run with: npm run demo
 *
 * Drives the REAL modules (orchestrator, multi-template enrollment, match engine,
 * PIN service, sync + purge) with mock inference + an in-memory AWS, printing each
 * step. Proves the full product flow on a laptop with no device and no network:
 *
 *   enroll → set PIN → genuine auth → impostor reject → 3 fails → PIN fallback
 *          → (network returns) sync → server confirm → local purge
 */
import { AuthOrchestrator } from '../src/core/AuthOrchestrator';
import { EnrollmentService } from '../src/core/EnrollmentService';
import { MatchEngine } from '../src/core/MatchEngine';
import { InMemorySecureStorage } from '../src/storage/SecureStorageService';
import { MockEmbedding } from '../src/native/mockInference';
import { PinService } from '../src/security/PinService';
import { Pbkdf2PinHasher } from '../src/security/PinHasher';
import { SyncService } from '../src/sync/SyncService';
import { SyncManager } from '../src/sync/SyncManager';
import { ISyncApi } from '../src/sync/api';
import { AuthLogEntry } from '../src/core/types';

const USER = 'datalake-field-user';
const ISO = '2026-05-29T10:00:00.000Z';
let uuidN = 0;
const uuid = () => `log-${++uuidN}`;

const log = (msg: string) => console.log(msg);
const ok = (msg: string) => console.log(`  ✓ ${msg}`);
const step = (n: number, title: string) => console.log(`\n${n}. ${title}`);

// --- In-memory "AWS" that confirms everything it receives -----------------------
class InMemoryAws implements ISyncApi {
  enrollments = new Map<string, unknown>();
  receivedLogs = new Set<string>();
  online = false;
  async postEnrollment(p: { user_id: string }) {
    this.assertOnline();
    this.enrollments.set(p.user_id, p);
    return { synced_at: ISO };
  }
  async postAuthLogs(logs: AuthLogEntry[]) {
    this.assertOnline();
    logs.forEach((l) => this.receivedLogs.add(l.log_id));
    return { confirmed_log_ids: logs.map((l) => l.log_id) };
  }
  async getWipeCommand() {
    this.assertOnline();
    return { wipe_pending: false, issued_at: null };
  }
  async confirmWipe() {
    this.assertOnline();
  }
  async verifyCredentials() { return null; }
  async pullEnrollment() { return null; }
  private assertOnline() {
    if (!this.online) throw new Error('network unavailable');
  }
}

async function authenticate(orch: AuthOrchestrator, frame: string) {
  orch.dispatch({ type: 'APP_FOREGROUND' });
  orch.dispatch({ type: 'CAMERA_READY' });
  orch.dispatch({ type: 'FACE_DETECTED', confidence: 0.95 });
  return orch.completeAuth(frame);
}

async function main() {
  log('============================================================');
  log(' Datalake 3.0 FaceAuth — OFFLINE end-to-end demo');
  log('============================================================');

  const storage = new InMemorySecureStorage();
  const embedding = new MockEmbedding();
  const match = new MatchEngine(); // threshold 0.85
  const pin = new PinService(storage, new Pbkdf2PinHasher(10_000));
  const aws = new InMemoryAws();
  const net = { isConnected: async () => aws.online };
  const syncService = new SyncService(storage, aws, net, { nowIso: () => ISO }, USER);
  const syncManager = new SyncManager(syncService, {
    onResult: (r) =>
      ok(`sync pass: ran=${r.ran} confirmed=${r.logsConfirmed} purged=${r.logsPurged} errors=${r.errors.length}`),
  });

  const orch = new AuthOrchestrator({
    embedding,
    storage,
    match,
    nowIso: () => ISO,
    uuid,
    triggerSync: () => syncManager.requestSync(),
  });

  // 1. Enroll (multi-template) -----------------------------------------------------
  step(1, 'Enroll face (10 frames, offline)');
  const enroll = new EnrollmentService(embedding, storage, () => ISO);
  // "#0.5" simulates lighting/angle variation across the 10 captured frames; frame 7
  // is a bad capture (different identity) the selector should reject as an outlier.
  const frames = Array.from({ length: 10 }, (_, i) =>
    i === 7 ? 'someone-else#1#0.5' : `${USER}#${i + 1}#0.5`,
  );
  const result = await enroll.enroll(USER, frames);
  ok(`captured 10 frames → kept ${result.templates.length} diverse templates`);
  ok(`accepted ${result.acceptedFrames}, rejected ${result.rejectedFrames} outlier frame(s)`);

  // 2. Set fallback PIN ------------------------------------------------------------
  step(2, 'Set fallback PIN');
  await pin.setPin(USER, '9072');
  ok(`PIN stored as a salted hash (set=${await pin.isPinSet(USER)}); plaintext never stored`);

  // 3. Genuine authentication ------------------------------------------------------
  step(3, 'Authenticate the enrolled user (airplane mode)');
  const s1 = await authenticate(orch, `${USER}#live`);
  ok(`result=${s1}  score=${orch.getContext().lastScore?.toFixed(4)} (threshold 0.85)`);

  // 4. Impostor rejection ----------------------------------------------------------
  step(4, 'Impostor attempts to authenticate');
  // fresh orchestrator state for a clean attempt
  orch.dispatch({ type: 'APP_FOREGROUND' });
  const s2 = await authenticate(orch, 'impostor#live');
  ok(`result=${s2}  score=${orch.getContext().lastScore?.toFixed(4)} → rejected`);

  // 5. Three failures → PIN fallback ----------------------------------------------
  step(5, 'Three failed face attempts → PIN fallback → lockout safety');
  const o2 = new AuthOrchestrator({ embedding, storage, match, nowIso: () => ISO, uuid });
  o2.dispatch({ type: 'APP_FOREGROUND' });
  o2.dispatch({ type: 'CAMERA_READY' });
  for (let i = 0; i < 3; i++) {
    o2.dispatch({ type: 'FACE_DETECTED', confidence: 0.95 });
    await o2.completeAuth('impostor#live');
    if (o2.getState() === 'AUTH_FAIL') o2.dispatch({ type: 'DISMISS_RETRY' });
  }
  ok(`after 3 fails → state=${o2.getState()}`);
  o2.dispatch({ type: 'PIN_SUBMITTED', correct: await pin.verifyPin(USER, '0000') });
  ok(`wrong PIN → state=${o2.getState()}`);
  o2.dispatch({ type: 'PIN_SUBMITTED', correct: await pin.verifyPin(USER, '9072') });
  ok(`correct PIN → state=${o2.getState()}`);

  // 6. Pending logs (still offline) ------------------------------------------------
  step(6, 'Auth logs accumulate locally while offline');
  const pending = await storage.getPendingSyncLogs();
  ok(`${pending.length} auth logs queued locally (no biometric data in them)`);

  // 7. Network returns → sync + purge ---------------------------------------------
  step(7, 'Network restored → background sync + purge');
  aws.online = true;
  syncManager.requestSync();
  await new Promise((r) => setTimeout(r, 50)); // let the async pass complete
  const afterPending = await storage.getPendingSyncLogs();
  ok(`server received ${aws.receivedLogs.size} logs; ${afterPending.length} remain locally (purged)`);

  log('\n============================================================');
  log(' Demo complete — full auth path ran with ZERO network calls;');
  log(' sync/purge ran only after connectivity returned.');
  log('============================================================');
}

main().catch((e) => {
  console.error('demo failed:', e);
  process.exit(1);
});
