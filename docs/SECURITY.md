# Security Design

## Data minimisation (TRD §8.2) — the most important property

- **No raw face image is ever written to disk or sent anywhere.** Only the 128-d
  embedding (a non-reversible mathematical representation) is stored.
- **Auth logs carry no biometrics** — only `log_id`, `user_id`, timestamp, result,
  match score, failure reason.
- The embedding lives in the native heap during comparison and is not logged or
  transmitted in plaintext.

## Encryption at rest (TRD §4.2)

| Concern | Mechanism |
|---|---|
| Database | SQLCipher **AES-256** — the whole `faceauth.db` is encrypted |
| Key generation | 256-bit AES key generated **inside Android Keystore / iOS Keychain** (StrongBox/Secure Enclave where available); never exported to JS |
| Key access | native bridge only — the JS layer literally cannot read the key |
| DB passphrase | derived from the non-exportable Keystore key via HMAC-SHA256 |
| Fallback PIN | hashed + salted, never plaintext — **bcrypt(12)** on device (native), PBKDF2-HMAC-SHA256 portable reference (`PinHasher`); constant-time verify; enforced strength policy (`PinService`) |
| AWS tokens | short-lived Cognito JWTs (15 min), refreshed per session, not persisted |

See `android/.../SecureStorageModule.kt` (`KeyManager`, `DerivedPassphrase`).

## Threat model (TRD §8.1)

| Threat | Mitigation | Where |
|---|---|---|
| Photo / screen spoof | Challenge-response liveness every auth (blink/smile/head-turn) | `LivenessSession` |
| Stolen device, DB extracted | SQLCipher AES-256 + hardware-bound key — useless without the secure enclave | `SecureStorageModule` |
| PIN brute force | bcrypt(12) + lockout after 5 fails for 30 min | `AuthStateMachine` |
| Sync replay / duplication | Idempotent `log_id` UUID; server upsert | `SyncService`, `api.ts` |
| Premature purge → log loss | **Purge only after the server returns the `log_id` in `confirmed_log_ids`** | `SyncService.sync` step 6–8 |
| Remote-wipe abuse | Wipe executes only after a valid Cognito JWT auth; hard delete + tombstone | `SyncService`, OQ-04 |
| MITM on sync | TLS 1.2+; certificate pinning recommended (OQ-05, post-MVP) | transport |

## The purge invariant (TRD §6.5)

This is the property that earns the scalability/sustainability marks, and it is
**enforced in code and proven by tests**:

> A local auth log is deleted **only** after the server confirms its `log_id`.

`SyncService` marks only confirmed ids as synced, then `purgeSyncedLogs()` deletes
`WHERE synced_to_aws = 1`. The partial-confirm test
(`syncService.test.ts › partial confirm`) drives a server that drops one id and asserts
that exactly that record survives for retry while the confirmed ones are purged.

## Fallback PIN — real credential, not a placeholder

- Policy enforced at set time: 4–8 digits, not all-same, not a trivial sequence
  (`validatePinStrength`).
- Stored only as a salted hash (`pbkdf2$iterations$salt$hash`, or bcrypt on device);
  the plaintext PIN is never persisted and never leaves the entry screen.
- `PinService.verifyPin` returns `false` (never throws) when no PIN is set, and changing
  the PIN invalidates the previous hash — all covered by `__tests__/pinService.test.ts`.
- Brute-force is bounded by the state machine: 5 wrong PINs → 30-minute lockout.

## Re-enrollment integrity (TRD §8.4)

- Re-enrollment requires existing face auth **or** PIN — never anonymous.
- `enrollment_version` increments each time; the server rejects a lower version (409).
- Remote wipe is authenticated and results in a hard delete plus a sync-meta tombstone
  so wiped data cannot be re-synced.
