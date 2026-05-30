/**
 * SQLCipher schema (TRD §4.1). Applied by the native SecureStorage module on first
 * launch against an AES-256 encrypted database. Kept here as the single source of
 * truth so the native layer and the JS layer agree on column names.
 */

export const SCHEMA_VERSION = 1;

export const CREATE_ENROLLMENTS = `
CREATE TABLE IF NOT EXISTS enrollments (
  id                 INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id            TEXT    NOT NULL UNIQUE,
  embedding_blob     BLOB    NOT NULL,            -- 128 * 4 bytes float32
  enrolled_at        TEXT    NOT NULL,            -- ISO 8601
  enrollment_version INTEGER NOT NULL DEFAULT 1,
  synced_to_aws      INTEGER NOT NULL DEFAULT 0
);`;

export const CREATE_AUTH_LOGS = `
CREATE TABLE IF NOT EXISTS auth_logs (
  log_id         TEXT PRIMARY KEY,               -- UUID v4, idempotency key
  user_id        TEXT NOT NULL,
  attempted_at   TEXT NOT NULL,                  -- ISO 8601
  result         TEXT NOT NULL CHECK(result IN ('success','fail','fallback')),
  match_score    REAL,                           -- NULL if liveness failed pre-comparison
  failure_reason TEXT,                           -- 'liveness_fail'|'low_score'|'timeout'|'error'|NULL
  synced_to_aws  INTEGER NOT NULL DEFAULT 0      -- purge only when 1
);`;

export const CREATE_SYNC_META = `
CREATE TABLE IF NOT EXISTS sync_meta (
  key        TEXT PRIMARY KEY,
  value      TEXT NOT NULL,
  updated_at TEXT NOT NULL
);`;

export const CREATE_INDEXES = `
CREATE INDEX IF NOT EXISTS idx_auth_logs_pending ON auth_logs (synced_to_aws);
`;

export const ALL_DDL = [CREATE_ENROLLMENTS, CREATE_AUTH_LOGS, CREATE_SYNC_META, CREATE_INDEXES];

/** float32 embedding <-> bytes helpers shared by native and JS layers. */
export function embeddingToBytes(embedding: number[]): Uint8Array {
  const buf = new Float32Array(embedding);
  return new Uint8Array(buf.buffer);
}

export function bytesToEmbedding(bytes: Uint8Array): number[] {
  const f32 = new Float32Array(bytes.buffer, bytes.byteOffset, bytes.byteLength / 4);
  return Array.from(f32);
}

/**
 * Encode N×128 templates into one BLOB: a 4-byte little-endian count header followed
 * by the concatenated float32 vectors. Backward compatible at the column level — the
 * `embedding_blob` column simply holds more than one vector now.
 */
export function templatesToBytes(templates: number[][]): Uint8Array {
  const dim = templates[0]?.length ?? 0;
  const out = new Uint8Array(4 + templates.length * dim * 4);
  new DataView(out.buffer).setUint32(0, templates.length, true);
  for (let t = 0; t < templates.length; t++) {
    out.set(embeddingToBytes(templates[t]), 4 + t * dim * 4);
  }
  return out;
}

export function bytesToTemplates(bytes: Uint8Array, dim = 128): number[][] {
  const count = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength).getUint32(0, true);
  const templates: number[][] = [];
  for (let t = 0; t < count; t++) {
    const start = bytes.byteOffset + 4 + t * dim * 4;
    templates.push(Array.from(new Float32Array(bytes.buffer.slice(start, start + dim * 4))));
  }
  return templates;
}
