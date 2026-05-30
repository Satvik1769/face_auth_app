# Model assets

Place the three open-source `.tflite` models here (Android) and in the iOS project
resources bundle. These are intentionally **not** committed (binary, fetched at build).

| File                  | Source / License            | Size     | Input        | Notes                  |
|-----------------------|-----------------------------|----------|--------------|------------------------|
| `BlazeFace.tflite`    | MediaPipe — Apache 2.0      | ~200 KB  | 128×128 RGB  | INT8 quantized         |
| `FaceMesh.tflite`     | MediaPipe — Apache 2.0      | ~3.0 MB  | 192×192 RGB  | 468 landmarks          |
| `MobileFaceNet.tflite`| Chen et al. — MIT           | ~2.0 MB  | 112×112 RGB  | INT8, 128-dim output   |

Total ≈ **5.2 MB** — well under the 20 MB budget (TRD §3.5).

## Fetching / quantizing
- BlazeFace & FaceMesh: export from MediaPipe Model Maker or download the published
  `.tflite` assets, then run `tflite_convert` with `--quantize` for INT8.
- MobileFaceNet: train/convert from the MIT reference implementation
  (pretrained on MS-Celeb-1M / MS1MV2), then post-training INT8 quantization with a
  representative Indian-demographics calibration set (TR-02 mitigation).

A `scripts/fetch_models.sh` hook + checksum manifest is the recommended way to keep
binaries out of git while guaranteeing the exact model bytes at build time.
