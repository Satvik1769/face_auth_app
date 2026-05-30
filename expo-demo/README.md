# FaceAuth — runnable phone demo (Expo)

A visual, on-phone version of the Datalake 3.0 FaceAuth flow. It reuses the **exact
tested engine** from the main repo (copied into `lib/`) — multi-template enrollment,
the auth state machine, cosine matching, the real PIN service — with a **live front
camera** and **mock recognition** (clearly labelled). No Android Studio, no models.

> Recognition is simulated (same logic as `npm run demo` in the root). The camera,
> the full flow, the matching threshold, retry/lockout, and the PIN policy are all real.

---

## Run it on your Android phone (5 minutes)

**On your phone (once):** install **Expo Go** from the Play Store.

**On your laptop:**

```powershell
cd "c:\Users\Admin\OneDrive\Desktop\face auth\expo-demo"
npm install
npx expo start
```

A QR code appears in the terminal. **Open Expo Go → "Scan QR code" → scan it.**
The app loads on your phone. (Laptop and phone must be on the **same Wi-Fi**.)

If the QR/LAN doesn't connect (common on locked-down or guest Wi-Fi), use a tunnel:

```powershell
npx expo start --tunnel
```

---

## What to try (the 60-second walkthrough)

1. **Allow camera** when prompted.
2. **Enroll** — tap *Capture my face*. Watch it keep ~3 diverse templates and **reject 1
   outlier** frame (a deliberate bad capture) — that's the lighting-robustness feature.
3. **Set a PIN** — try a weak one (`1111` or `1234`) first to see the **policy reject it**,
   then set a real one (e.g. `5823`).
4. **Authenticate** — do the on-screen gesture, tap *Scan*. You unlock (score ~0.99).
5. **Impostor** — tap *Try as a different person*. It’s rejected (low score). Do it **3×**
   → the app drops to the **PIN screen**. Wrong PIN 5× → **30-min lockout**.
6. Enter the correct PIN → unlocked. All of this with **Wi-Fi/data off** if you like —
   authentication never touches the network.

---

## Troubleshooting

| Problem | Fix |
|---|---|
| Expo Go says "this project requires a different SDK" | `npx expo install expo@latest --fix` then `npm install` and `npx expo start -c` |
| QR scan won't connect | `npx expo start --tunnel` (works across networks) |
| "Unable to resolve module …" | `npx expo start -c` (clears the Metro cache) |
| Dependency version warnings | `npm run fix` (runs `expo install --fix` to align versions) |
| Camera is black on first open | background the app once and reopen, or toggle the camera permission in phone Settings |

---

## How this maps to production

| Demo (here) | Production (device build) |
|---|---|
| Mock embeddings (`lib/native/mockInference`) | MobileFaceNet TFLite via native module |
| `expo-camera` preview, user-confirmed gesture | Vision Camera frame processor + MediaPipe liveness |
| `ExpoPinHasher` (salted SHA-256) | bcrypt(12) in the native SecureStorage module |
| `InMemorySecureStorage` | SQLCipher (AES-256) + hardware Keystore |

The decision logic — the part that determines *who gets in* — is identical to the
repo's 93-test core. See the main `README.md` and `docs/` for the full architecture.
