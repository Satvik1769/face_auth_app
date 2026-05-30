# Integration Guide — plugging FaceAuth into Datalake 3.0

The module integrates as a **navigation-level gate**: it replaces the existing login
screen and emits an unlock event the host app navigates on.

## 1. Install native dependencies

```bash
yarn add react-native-vision-camera @react-native-community/netinfo \
         @react-native-async-storage/async-storage
# native libs (device build):
#   Android: TensorFlow Lite, SQLCipher (net.zetetic:android-database-sqlcipher)
#   iOS:     TensorFlowLiteSwift, SQLCipher (pods)
```

## 2. Link the native modules

- **Android:** in `MainApplication.kt`, add `packages.add(FaceAuthPackage())`.
  Add to `android/app/build.gradle`:
  ```gradle
  implementation 'org.tensorflow:tensorflow-lite:2.14.0'
  implementation 'net.zetetic:android-database-sqlcipher:4.5.4'
  ```
- **iOS:** add `EmbeddingModule.swift` / `.m` (and the sibling modules) to the target,
  and to the `Podfile`:
  ```ruby
  pod 'TensorFlowLiteSwift'
  pod 'SQLCipher'
  ```

## 3. Bundle the models

Copy `BlazeFace.tflite`, `FaceMesh.tflite`, `MobileFaceNet.tflite` into
`android/app/src/main/assets/` and the iOS resources bundle. See
`android/app/src/main/assets/README_MODELS.md` for sources/licenses/checksums.

## 4. Wrap the root navigator

```tsx
import { FaceAuthProvider } from 'datalake-faceauth/src/providers/FaceAuthProvider';
import { NativeSecureStorage } from 'datalake-faceauth/src/native/secureStorageBridge'; // device

<FaceAuthProvider userId={session.userId} storage={NativeSecureStorage}
                  triggerSync={() => SyncQueue.kick()}>
  <RootNavigator />
</FaceAuthProvider>
```

## 5. Replace the login screen

In the root stack, swap `LoginScreen` for:

```tsx
<FaceAuthScreen onUnlock={() => navigation.replace('Home')} />
```

The screen handles enrollment-needed, liveness, retry, and PIN fallback internally.

## 6. Configure AWS endpoints (sync only — not needed for auth)

Set the env vars in your secrets manager (TRD §10.2):

```
FACEAUTH_API_BASE_URL=https://api.datalake.example.com/v1/faceauth
COGNITO_USER_POOL_ID=ap-south-1_XXXXXXXXX
COGNITO_CLIENT_ID=XXXXXXXXXXXXXXXXXXXXXXXXXX
FACEAUTH_MATCH_THRESHOLD=0.85        # optional
FACEAUTH_LIVENESS_TIMEOUT_MS=10000   # optional
```

Wire `SyncService` to your NetInfo listener:

```ts
NetInfo.addEventListener(s => { if (s.isConnected) syncService.sync(); });
```

## 7. Handle auth events

`useFaceAuth()` exposes `{ state, context }`. Navigate on `state === 'AUTH_SUCCESS'`;
show your dashboard. Nothing else is required.

## 8. Verify offline mode (demo requirement)

Enable airplane mode, cold-start the app, and confirm enroll + auth complete with no
network error. The auth path has no reachable network call, so this passes by design.

---

### Threshold calibration (OQ-02)

`FACEAUTH_MATCH_THRESHOLD` defaults to `0.85`. Calibrate against your demographic test
set with `npm run bench` pointed at real embeddings (see docs/BENCHMARKS.md). Lower →
fewer false rejects but higher false accepts; the harness prints FAR/FRR per threshold.
