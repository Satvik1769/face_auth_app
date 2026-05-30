# Architecture

## Three decoupled layers (TRD §2.1)

```
┌─────────────────────────────────────────────────────────────┐
│ PRESENTATION (React Native / TS)                              │
│   FaceAuthScreen · EnrollmentScreen · PinFallbackScreen ·     │
│   SettingsScreen · LivenessOverlay · FaceAuthProvider         │
└───────────────▲───────────────────────────┬──────────────────┘
                │ state/events               │ frames
┌───────────────┴───────────────────────────▼──────────────────┐
│ BUSINESS LOGIC (pure TS — fully unit-tested)                  │
│   AuthOrchestrator → AuthStateMachine (reducer)               │
│   MatchEngine (cosine) · EnrollmentService · embeddingMath    │
│   LivenessSession (EAR/MAR/yaw) · SyncService (purge protocol)│
└───────────────▲───────────────────────────┬──────────────────┘
                │ Promises (bridge API)      │
┌───────────────┴───────────────────────────▼──────────────────┐
│ NATIVE BRIDGE (Kotlin / Swift)                                │
│   FaceDetector(BlazeFace) · Liveness(FaceMesh) ·              │
│   Embedding(MobileFaceNet) · SecureStorage(SQLCipher+Keystore)│
└───────────────────────────────────────────────────────────────┘
                                │ background, non-blocking
                                ▼
                    AWS (Cognito · /enrollments · /auth-logs · /wipe)
```

The key architectural decision: **all decision logic lives in pure TypeScript** and the
native layer only does I/O-bound work (model inference, encrypted disk, hardware keys).
That is why 57 unit tests can cover the entire behaviour — matching, the state machine,
liveness rules, the sync/purge handshake — without a device, and why the same code path
is what runs in production.

## Authentication data flow (TRD §2.3)

1. App foregrounds → `FaceAuthProvider` dispatches `APP_FOREGROUND` → camera starts.
2. `FaceDetector` (BlazeFace) finds a face with confidence ≥ 0.75.
3. `Liveness` (FaceMesh) issues a random challenge; `LivenessSession` applies EAR/MAR/yaw.
4. On pass, `Embedding` (MobileFaceNet) produces a 128-d L2-normalised vector.
5. `SecureStorage` returns the enrolled embedding (decrypted in native heap).
6. `MatchEngine` computes cosine similarity; ≥ 0.85 ⇒ success.
7. `AuthOrchestrator` writes an `auth_log` and fires background sync (never blocks unlock).

## State machine (TRD §7)

`AuthStateMachine` is a **pure reducer** `transition(state, context, event) → {state, context}`.
States: `IDLE → CAMERA_STARTING → DETECTING_FACE → LIVENESS_CHALLENGE → EMBEDDING →
MATCHING → AUTH_SUCCESS`, with `AUTH_FAIL` (retry < 3), `FALLBACK_PIN` (3 face fails),
`LOCKED_OUT` (5 PIN fails, 30 min), `ENROLLING`, and `ERROR → FALLBACK_PIN`.

Every transition and guard in TRD §7.2 has a corresponding test in
`__tests__/authStateMachine.test.ts`.

## Why these models (TRD §3.5)

| Model | Role | Size | Why |
|---|---|---|---|
| BlazeFace | face detect + 6 keypoints | ~200 KB | sub-10 ms on CPU, designed for mobile |
| MediaPipe Face Mesh | 468 landmarks for liveness | ~3 MB | rich enough for EAR/MAR/yaw, no GPU |
| MobileFaceNet | 128-d embedding | ~2 MB | INT8, accuracy/size sweet spot vs ArcFace/FaceNet |

Total ~5.2 MB — a 4× headroom under the 20 MB budget, leaving room for an optional
passive-liveness model post-MVP without breaching the limit.

## Robustness modules (product hardening)

| Module | Role | Why it matters |
|---|---|---|
| `TemplateSelector` | reject outlier enrollment frames; keep a diverse template set | one averaged embedding is fragile across sun/shade/angle — a diverse set lifts FRR |
| `MatchEngine.compareBest` | accept on the closest of N templates | the right decision basis when templates span appearance variation |
| `FrameQuality` (FR-15) | gate frames on luma/sharpness/confidence → user prompt | don't run recognition on a frame that will mis-auth; tell the user what to fix |
| `PinService` / `PinHasher` | policy + salted-hash + constant-time verify | the fallback is a real credential, not a length check |
| `SyncManager` | single-flight, coalescing, backoff retry around `SyncService` | flaky field connectivity without hammering the radio or losing logs |

## Offline guarantee

The authentication path (`AuthOrchestrator.completeAuth`) calls only the embedding
engine, local storage, and the in-process match — **no network primitives are reachable
from it**. `SyncService` is the only network caller and runs on a background trigger
that is fire-and-forget; a sync failure can never reject an unlock.
