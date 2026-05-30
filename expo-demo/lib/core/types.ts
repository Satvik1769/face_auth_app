/**
 * Shared types for the FaceAuth core.
 * These mirror the TRD §4 data model and §5 native bridge contracts.
 */

/** A face embedding: 128-dimensional float32 vector (TRD §3.3). */
export type Embedding = number[];

export const EMBEDDING_DIM = 128;

/** Outcome of an authentication attempt (TRD §4.1.2 auth_logs.result). */
export type AuthResult = 'success' | 'fail' | 'fallback';

/** Reason an attempt failed (TRD §4.1.2 auth_logs.failure_reason). */
export type FailureReason = 'liveness_fail' | 'low_score' | 'timeout' | 'error' | null;

/** Liveness challenge variants (TRD §3.2). */
export type ChallengeType = 'blink' | 'smile' | 'head_turn';

/** Auth-attempt log entry persisted locally and synced to AWS (TRD §4.1.2). */
export interface AuthLogEntry {
  log_id: string; // UUID v4 — idempotency key
  user_id: string;
  attempted_at: string; // ISO 8601
  result: AuthResult;
  match_score: number | null;
  failure_reason: FailureReason;
  synced_to_aws: 0 | 1;
}

/**
 * Enrollment record (TRD §4.1.1, extended).
 * `templates[0]` is the centroid (the value backed up to AWS for restore); the
 * remaining entries are diverse templates kept on-device to lift match robustness
 * across lighting/angle. A single-template enrollment is just `templates.length === 1`.
 */
export interface EnrollmentRecord {
  user_id: string;
  templates: Embedding[];
  enrolled_at: string; // ISO 8601
  enrollment_version: number;
  synced_to_aws: 0 | 1;
}

/** Result of a similarity comparison (TRD §3.4). */
export interface MatchResult {
  score: number; // cosine similarity in [-1, 1], typically [0, 1] for faces
  isMatch: boolean;
  threshold: number;
}
