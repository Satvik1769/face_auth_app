/**
 * SyncService — background sync & purge (TRD §6.5).
 *
 * Implements the strict 9-step sequence that guarantees no log is purged before
 * the server confirms it. All side-effecting collaborators (network status,
 * storage, API) are injected, so the full protocol — including partial-confirm
 * and failure paths — is exercised in unit tests with no network.
 *
 * Invariants enforced here:
 *   - A log is deleted ONLY after the server returns its log_id in confirmed_log_ids.
 *   - Sync never throws to the caller; failures leave the queue intact for retry.
 *   - Batch size is capped at 100 (TRD §6.3); larger queues sync across passes.
 */
import { ISecureStorage } from '../storage/SecureStorageService';
import { ISyncApi, MAX_LOG_BATCH } from './api';

export interface NetworkMonitor {
  isConnected(): Promise<boolean>;
}

export interface Clock {
  nowIso(): string;
}

export interface SyncResult {
  ran: boolean; // false if skipped (offline)
  enrollmentSynced: boolean;
  logsConfirmed: number;
  logsPurged: number;
  wiped: boolean;
  errors: string[];
}

export const SYNC_META_LAST_SYNC = 'last_sync_at';
export const SYNC_META_PENDING_WIPE = 'pending_wipe';

export class SyncService {
  constructor(
    private readonly storage: ISecureStorage,
    private readonly api: ISyncApi,
    private readonly net: NetworkMonitor,
    private readonly clock: Clock,
    private readonly userId: string,
  ) {}

  /**
   * Run one full sync session. Safe to call repeatedly; idempotent on the server
   * side via user_id / log_id keys.
   */
  async sync(): Promise<SyncResult> {
    const result: SyncResult = {
      ran: false,
      enrollmentSynced: false,
      logsConfirmed: 0,
      logsPurged: 0,
      wiped: false,
      errors: [],
    };

    // Step 1 — connectivity gate.
    if (!(await this.net.isConnected())) {
      return result;
    }
    result.ran = true;

    // Step 3 — remote wipe check (before pushing anything).
    try {
      const wipe = await this.api.getWipeCommand(this.userId);
      if (wipe.wipe_pending) {
        await this.storage.deleteEnrollment(this.userId);
        await this.storage.setMeta(SYNC_META_PENDING_WIPE, 'done', this.clock.nowIso());
        await this.api.confirmWipe(this.userId);
        result.wiped = true;
      }
    } catch (e) {
      result.errors.push(`wipe-check: ${errMsg(e)}`);
    }

    // Step 4 — push enrollment if not yet confirmed.
    try {
      const enrollment = await this.storage.getEnrollment(this.userId);
      if (enrollment && enrollment.synced_to_aws === 0) {
        await this.api.postEnrollment({
          user_id: enrollment.user_id,
          // Only the centroid template leaves the device (restore support);
          // the diverse local templates stay on-device (data minimisation).
          embedding: enrollment.templates[0],
          enrolled_at: enrollment.enrolled_at,
          enrollment_version: enrollment.enrollment_version,
        });
        result.enrollmentSynced = true;
        // NOTE: marking the enrollment confirmed is the native storage layer's
        // job (UPDATE enrollments SET synced_to_aws=1). The in-memory ref impl
        // leaves it for the storage to handle; surfaced via result for the caller.
      }
    } catch (e) {
      result.errors.push(`enrollment: ${errMsg(e)}`);
    }

    // Steps 5-8 — push auth logs in <=100 batches, confirm, then purge.
    try {
      const pending = await this.storage.getPendingSyncLogs();
      for (let i = 0; i < pending.length; i += MAX_LOG_BATCH) {
        const batch = pending.slice(i, i + MAX_LOG_BATCH);
        try {
          const { confirmed_log_ids } = await this.api.postAuthLogs(batch);
          const confirmedSet = new Set(confirmed_log_ids);
          for (const log of batch) {
            if (confirmedSet.has(log.log_id)) {
              await this.storage.markLogSynced(log.log_id); // Step 7
              result.logsConfirmed++;
            }
            // Unconfirmed logs remain synced_to_aws=0 -> retried next session.
          }
        } catch (e) {
          // Step 5 failure behaviour: mark failed batch for retry, continue.
          result.errors.push(`logs batch @${i}: ${errMsg(e)}`);
        }
      }
      // Step 8 — purge only confirmed records. Safe by construction.
      result.logsPurged = await this.storage.purgeSyncedLogs();
    } catch (e) {
      result.errors.push(`logs: ${errMsg(e)}`);
    }

    // Step 9 — record last sync time (non-critical).
    try {
      await this.storage.setMeta(SYNC_META_LAST_SYNC, this.clock.nowIso(), this.clock.nowIso());
    } catch (e) {
      result.errors.push(`meta: ${errMsg(e)}`);
    }

    return result;
  }
}

function errMsg(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}
