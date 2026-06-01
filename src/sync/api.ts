/**
 * AWS FaceAuth sync API client contracts (TRD §6).
 * The interface lets SyncService stay transport-agnostic and fully testable;
 * HttpSyncApi is the production implementation over fetch + Cognito JWT.
 */
import { AuthLogEntry, Embedding } from '../core/types';

export interface EnrollmentUpload {
  user_id: string;
  embedding: Embedding;
  enrolled_at: string;
  enrollment_version: number;
}

export interface WipeCommand {
  wipe_pending: boolean;
  issued_at: string | null;
}

export const MAX_LOG_BATCH = 100; // TRD §6.3 batch size cap

export interface CredentialVerifyResult {
  userId: string;
  token: string;
}

export interface ISyncApi {
  /** POST /v1/faceauth/enrollments — upsert by (user_id, enrollment_version). */
  postEnrollment(payload: EnrollmentUpload): Promise<{ synced_at: string }>;
  /** POST /v1/faceauth/auth-logs — returns confirmed log_ids (idempotent by log_id). */
  postAuthLogs(logs: AuthLogEntry[]): Promise<{ confirmed_log_ids: string[] }>;
  /** GET /v1/faceauth/wipe-commands?user_id=... */
  getWipeCommand(userId: string): Promise<WipeCommand>;
  /** POST /v1/faceauth/wipe-confirm */
  confirmWipe(userId: string): Promise<void>;
  /** POST /auth/login — verify credentials against backend, returns userId + short-lived JWT. */
  verifyCredentials(username: string, password: string): Promise<CredentialVerifyResult | null>;
  /** GET /enrollments/:userId — pull stored face templates back to device (restore after reinstall). */
  pullEnrollment(userId: string, token: string): Promise<{ templates: number[][] } | null>;
}

/** Supplies a fresh short-lived Cognito JWT before each sync session (TRD §6.1). */
export type TokenProvider = () => Promise<string>;

export interface HttpSyncApiConfig {
  baseUrl: string;
  getToken: TokenProvider;
  fetchImpl?: typeof fetch;
}

export class SyncApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = 'SyncApiError';
  }
}

export class HttpSyncApi implements ISyncApi {
  private readonly baseUrl: string;
  private readonly getToken: TokenProvider;
  private readonly fetchImpl: typeof fetch;

  constructor(cfg: HttpSyncApiConfig) {
    this.baseUrl = cfg.baseUrl.replace(/\/$/, '');
    this.getToken = cfg.getToken;
    this.fetchImpl = cfg.fetchImpl ?? fetch;
  }

  private async request<T>(path: string, method: string, body?: unknown): Promise<T> {
    const token = await this.getToken();
    const res = await this.fetchImpl(`${this.baseUrl}${path}`, {
      method,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    if (!res.ok) {
      throw new SyncApiError(res.status, `${method} ${path} failed: ${res.status}`);
    }
    // 204/empty responses tolerated
    const text = await res.text();
    return (text ? JSON.parse(text) : {}) as T;
  }

  postEnrollment(payload: EnrollmentUpload): Promise<{ synced_at: string }> {
    return this.request('/enrollments', 'POST', payload);
  }

  async postAuthLogs(logs: AuthLogEntry[]): Promise<{ confirmed_log_ids: string[] }> {
    if (logs.length > MAX_LOG_BATCH) {
      throw new SyncApiError(413, `Batch of ${logs.length} exceeds ${MAX_LOG_BATCH}`);
    }
    return this.request('/auth-logs', 'POST', {
      logs: logs.map((l) => ({
        log_id: l.log_id,
        user_id: l.user_id,
        attempted_at: l.attempted_at,
        result: l.result,
        match_score: l.match_score,
        failure_reason: l.failure_reason,
      })),
    });
  }

  getWipeCommand(userId: string): Promise<WipeCommand> {
    return this.request(`/wipe-commands?user_id=${encodeURIComponent(userId)}`, 'GET');
  }

  async confirmWipe(userId: string): Promise<void> {
    await this.request('/wipe-confirm', 'POST', { user_id: userId });
  }

  async verifyCredentials(username: string, password: string): Promise<CredentialVerifyResult | null> {
    try {
      const res = await this.fetchImpl(`${this.baseUrl}/auth/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });
      if (!res.ok) return null;
      return await res.json();
    } catch {
      return null;
    }
  }

  async pullEnrollment(userId: string, token: string): Promise<{ templates: number[][] } | null> {
    try {
      const res = await this.fetchImpl(
        `${this.baseUrl}/enrollments/${encodeURIComponent(userId)}`,
        {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
        },
      );
      if (!res.ok) return null;
      const text = await res.text();
      return text ? JSON.parse(text) : null;
    } catch {
      return null;
    }
  }
}
