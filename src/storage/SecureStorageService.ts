/**
 * SecureStorageService — storage interface + an in-memory reference implementation.
 *
 * The interface mirrors the native SecureStorageModule (TRD §5.4). The in-memory
 * implementation exercises the exact purge/sync semantics (TRD §6.5) so the
 * business rules are tested independently of SQLCipher. The on-device build
 * swaps in NativeSecureStorage (src/native) which talks to the encrypted DB.
 */
import { AuthLogEntry, EnrollmentRecord, Embedding } from '../core/types';
import { isValidEmbedding } from '../core/embeddingMath';

export interface ISecureStorage {
  saveEnrollment(userId: string, templates: Embedding[], nowIso: string): Promise<void>;
  getEnrollment(userId: string): Promise<EnrollmentRecord | null>;
  deleteEnrollment(userId: string): Promise<void>;

  writeAuthLog(log: Omit<AuthLogEntry, 'synced_to_aws'>): Promise<string>;
  getPendingSyncLogs(): Promise<AuthLogEntry[]>;
  markLogSynced(logId: string): Promise<void>;
  purgeSyncedLogs(): Promise<number>;

  getMeta(key: string): Promise<string | null>;
  setMeta(key: string, value: string, nowIso: string): Promise<void>;

  savePINHash(userId: string, hash: string): Promise<void>;
  getPINHash(userId: string): Promise<string | null>;
}

export class InMemorySecureStorage implements ISecureStorage {
  private enrollments = new Map<string, EnrollmentRecord>();
  private logs = new Map<string, AuthLogEntry>();
  private meta = new Map<string, { value: string; updated_at: string }>();
  private pinHashes = new Map<string, string>();

  async saveEnrollment(userId: string, templates: Embedding[], nowIso: string): Promise<void> {
    if (templates.length === 0 || !templates.every(isValidEmbedding)) {
      throw new Error('Refusing to persist invalid enrollment templates');
    }
    const prev = this.enrollments.get(userId);
    const version = prev ? prev.enrollment_version + 1 : 1;
    this.enrollments.set(userId, {
      user_id: userId,
      templates: templates.map((t) => [...t]),
      enrolled_at: nowIso,
      enrollment_version: version,
      synced_to_aws: 0,
    });
  }

  async getEnrollment(userId: string): Promise<EnrollmentRecord | null> {
    const rec = this.enrollments.get(userId);
    return rec ? { ...rec, templates: rec.templates.map((t) => [...t]) } : null;
  }

  async deleteEnrollment(userId: string): Promise<void> {
    this.enrollments.delete(userId);
  }

  async writeAuthLog(log: Omit<AuthLogEntry, 'synced_to_aws'>): Promise<string> {
    if (this.logs.has(log.log_id)) {
      throw new Error(`Duplicate log_id: ${log.log_id}`);
    }
    this.logs.set(log.log_id, { ...log, synced_to_aws: 0 });
    return log.log_id;
  }

  async getPendingSyncLogs(): Promise<AuthLogEntry[]> {
    return [...this.logs.values()].filter((l) => l.synced_to_aws === 0);
  }

  async markLogSynced(logId: string): Promise<void> {
    const log = this.logs.get(logId);
    if (log) {
      log.synced_to_aws = 1;
    }
  }

  async purgeSyncedLogs(): Promise<number> {
    let deleted = 0;
    for (const [id, log] of this.logs) {
      if (log.synced_to_aws === 1) {
        this.logs.delete(id);
        deleted++;
      }
    }
    return deleted;
  }

  async getMeta(key: string): Promise<string | null> {
    return this.meta.get(key)?.value ?? null;
  }

  async setMeta(key: string, value: string, nowIso: string): Promise<void> {
    this.meta.set(key, { value, updated_at: nowIso });
  }

  async savePINHash(userId: string, hash: string): Promise<void> {
    this.pinHashes.set(userId, hash);
  }

  async getPINHash(userId: string): Promise<string | null> {
    return this.pinHashes.get(userId) ?? null;
  }

  /** Test helper — total stored logs regardless of sync state. */
  _logCount(): number {
    return this.logs.size;
  }
}
