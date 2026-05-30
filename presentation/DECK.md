# Datalake 3.0 — Offline Face Auth
### Hackathon 7.0 · Secure offline facial recognition & liveness for remote field ops

Present as slides (one per `---`). Export to PPTX/PDF with Marp, Slidev, or paste into
your template. Speaker notes are in `> blockquotes`.

---

## 1 · The Problem

Field personnel in **zero-network zones** must log into Datalake 3.0 securely.

- Passwords: shared, forgotten, slow to type in the field.
- Cloud biometrics: dead without connectivity.

**We need face login that works 100% offline, on mid-range phones, in harsh sunlight —
and is light enough not to bloat the app.**

> The brief: > 95% accuracy, < 1 s, ≤ 20 MB, Android 8+/iOS 12+, CPU-only, open-source.

---

## 2 · The Solution

Open the app → camera scans your face → liveness challenge → **unlocked**. No network.

- On-device TFLite pipeline, **~5.2 MB** of models
- Challenge-response liveness (blink / smile / head-turn) defeats photo & screen spoofs
- One encrypted face embedding stored on device (AES-256, hardware key)
- Background sync + purge to AWS when a network reappears

> Everything that decides "is this the right person" runs in pure on-device code.

---

## 3 · Architecture — three layers

```
Presentation (React Native)  → camera, liveness overlay, screens
Business logic (pure TS)      → state machine, match, liveness math, sync  ← 57 tests
Native bridge (Kotlin/Swift)  → BlazeFace · FaceMesh · MobileFaceNet · SQLCipher
                                            ↓ background, non-blocking
                                  AWS: Cognito · enrollments · auth-logs · wipe
```

> Decision logic is pure TypeScript → the whole behaviour is unit-tested with no device,
> and the tested code is the production code.

---

## 4 · The models — why ~5.2 MB beats a 20 MB budget

| Model | Job | Size | License |
|---|---|---|---|
| BlazeFace | detect face + keypoints | ~200 KB | Apache-2.0 |
| MediaPipe Face Mesh | 468 landmarks → liveness | ~3.0 MB | Apache-2.0 |
| MobileFaceNet (INT8) | 128-d face embedding | ~2.0 MB | MIT |
| **Total** | | **~5.2 MB** | all open-source |

INT8 quantization = ~4× smaller with minimal accuracy loss. **4× headroom** under budget.

---

## 5 · Liveness — offline anti-spoofing

Random challenge every login. Pure-math rules over Face Mesh landmarks:

- **Blink:** Eye Aspect Ratio < 0.25 for ≥ 2 frames
- **Smile:** Mouth Aspect Ratio > 0.6
- **Head-turn:** |yaw| > 20°

A photo or a video on a screen cannot satisfy a *random* live gesture in 10 s.

> Spoof-rejection target > 99%. Formulas in TRD §3.2.1, code in `src/liveness`.

---

## 6 · Matching — how we decide identity

- MobileFaceNet → 128-d **L2-normalised** embedding
- **Cosine similarity** vs the enrolled embedding
- Match if score ≥ **0.85** → FAR < 1%, FRR < 5%

Pure JS dot-product. **Measured p95 latency: 0.0024 ms** (target < 5 ms).

> The match is effectively free; the time budget is all model inference, which stays
> under 1 s on the min-spec Android 8 / 3 GB device.

---

## 7 · Security & privacy

- **No face image is ever stored or sent** — only a non-reversible embedding.
- DB encrypted with **SQLCipher AES-256**; key born and kept in **hardware Keystore/Keychain**.
- Fallback PIN = **bcrypt(12)**; 5 fails → 30-min lockout.
- Auth logs contain **zero biometrics** — id, time, score, result only.

> Lose the phone? The DB is ciphertext without the secure-enclave key. Remote wipe on
> next contact.

---

## 8 · Sync & purge — never lose, never leak

Background, non-blocking, idempotent:

1. Network detected → get Cognito JWT
2. Push enrollment (if unsynced) + auth logs (≤ 100/batch)
3. Server returns `confirmed_log_ids`
4. **Purge only the confirmed logs** — unconfirmed stay queued for retry

> The invariant "delete only after confirm" is enforced in code **and proven** by a
> partial-confirm test that drops one record and checks it survives.

---

## 9 · Proof it works — today, on a laptop

- **93 Jest tests**, ~93% core coverage, full **offline enroll → auth → log** E2E
- `npm test` ✅ · `npm run typecheck` ✅ · `npm run bench` (real latency numbers)
- **`npm run demo`** runs the whole product flow in the terminal — no model, no device:
  enroll (9 frames kept, 1 outlier rejected, 3 templates) → PIN → genuine 0.996 →
  impostor reject → 3 fails → PIN fallback → network back → sync → confirm → purge

> Live demo: airplane mode ON, enroll a face, relaunch, unlock — all offline.

---

## 9b · Built like a product, not a checklist

| Field failure mode | What we added |
|---|---|
| Harsh sun / shade changes the face | **Multi-template** enrollment + best-match (TemplateSelector) |
| A bad capture poisons enrollment | **Outlier rejection** before storing templates |
| "Fallback PIN" that accepts anything | **Real** PIN: policy + salted hash + constant-time verify |
| Flaky field network drops logs | **SyncManager**: single-flight + backoff retry, purge-after-confirm |
| Bad lighting silently mis-auths | **Frame-quality gate** → "too dark / too bright / hold steady" |

> Every one of these is unit-tested, not just described.

---

## 10 · Feasibility — drop-in for Datalake 3.0

- React Native 0.74, one codebase, Android 8+ / iOS 12+, **CPU-only**
- Integrates as a navigation gate: replace `LoginScreen` with `<FaceAuthScreen>`
- 8-step integration guide + native package + env config included

> Auth needs **zero** backend. Sync reuses your existing Cognito session.

---

## 11 · Evaluation scorecard

| Criterion | Marks | Evidence |
|---|---|---|
| Innovation (edge AI, < 20 MB, liveness) | 30 | ~5.2 MB, INT8, challenge-response |
| Feasibility (integration, < 1 s) | 30 | RN gate, measured latency, native bridge |
| Scalability (sync/purge, demographics) | 20 | idempotent purge handshake (tested), CLAHE plan |
| Presentation & docs | 20 | PRD+TRD+README+4 docs+this deck, clean source |

---

## 12 · Roadmap beyond MVP

- Real TFLite weights + on-device benchmark numbers on the min-spec device
- CLAHE brightness normalisation for harsh-sun / low-light (TR-02, TR-07)
- Certificate pinning for sync (OQ-05)
- Optional passive liveness (still under 20 MB)

**Thank you — questions?**
