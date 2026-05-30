# Native layer — build notes

The native modules (Android Kotlin under `android/`, iOS Swift under `ios/`) wrap the
TFLite runtimes, SQLCipher, and the hardware Keystore/Keychain. They are **device code**:
they compile and run inside a React Native app with Android Studio / Xcode, not on this
repo's CI box. The pure-JS core (`src/core`, `src/liveness`, `src/sync`, `src/storage`)
is what the Jest suite exercises.

## What ships vs. what you implement
The committed `.kt` / `.swift` files show the full module surface and the security-
critical paths (SQLCipher open, Keystore key generation, purge-only-confirmed SQL).
A few small, mechanical helpers are referenced by name and left for the integrating
team to drop in (each is < 50 lines):

| Helper                    | Responsibility                                              |
|---------------------------|-------------------------------------------------------------|
| `ModelAssets`             | mmap a `.tflite` from app assets into a `MappedByteBuffer`   |
| `ImagePreprocessor`       | base64 JPEG → resized, normalised float tensor               |
| `BlazeFacePostProcessor`  | anchor decode + NMS over BlazeFace raw output                |
| `FaceMesh`                | MediaPipe Face Mesh inference → 468 landmarks                |
| `LivenessState`           | per-session EAR/MAR/yaw rules (mirror of LivenessSession.ts) |
| `Schema` / `EmbeddingCodec` | DDL strings + float32↔bytes (mirror src/storage/schema.ts) |
| `CryptoUtil` / `MathUtil` | HMAC-SHA256, L2 normalise                                    |

Keeping the metric thresholds and DDL identical to the TS sources (single source of
truth) is what lets the JS unit tests stand in for native behaviour.

## Wiring
- **Android:** add `packages.add(FaceAuthPackage())` in `MainApplication`, add the
  `tflite` and `sqlcipher` Gradle deps, and copy the models into
  `android/app/src/main/assets/`.
- **iOS:** add the `TensorFlowLiteSwift` and `SQLCipher` pods, add the `.swift`/`.m`
  bridge files to the target, and add the models to the resources bundle.

See `docs/INTEGRATION.md` for the full step list.
