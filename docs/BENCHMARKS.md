# Performance & Benchmarks

## Latency budget (TRD §9.1)

| Stage | Target | Status |
|---|---|---|
| Camera frame extraction | < 5 ms | device |
| BlazeFace detection | < 10 ms | device (TFLite INT8, 200 KB) |
| Face Mesh liveness / frame | < 30 ms | device (3 MB, 192×192) |
| MobileFaceNet embedding | < 80 ms | device (INT8, 112×112) |
| SQLCipher decrypt + read | < 20 ms | device |
| **Cosine match** | **< 5 ms** | **MEASURED here: p95 0.0024 ms** ✅ |
| **End-to-end → decision** | **< 1 s** | budgeted ≈ 150 ms typical; validate on device |
| Cold start → camera ready | < 2 s | device |

`npm run bench` measures the cosine match latency on the exact pure-JS code that runs
on device. Example run (laptop):

```
=== Cosine match latency (MEASURED, pure JS) ===
iterations : 100000
mean       : 0.00081 ms
p95        : 0.00240 ms
p99        : 0.00450 ms
target     : < 5 ms (TRD §9.1)  -> PASS
```

The match stage has ~2000× headroom; the budget is dominated by model inference, which
must be measured **on the device** with the TFLite benchmark tool — it cannot be
honestly produced on a laptop and is not faked here.

## Accuracy methodology (TRD §9.2)

Targets: recognition > 95%, FAR < 1%, FRR < 5%, liveness spoof rejection > 99%.

`npm run bench` includes a **FAR/FRR threshold sweep** that computes, for each candidate
threshold, the impostor-accept and genuine-reject rates over a labelled embedding set.
The harness math is validated on deterministic mock embeddings; for the **submission
numbers** you replace `buildMockSet()` with embeddings exported from the on-device
`EmbeddingModule` over a diverse Indian-demographics test set (≥ 500 genuine + 500
impostor pairs, indoor + harsh-sun + low-light).

```
threshold |   FAR   |   FRR
  0.80    |   ...   |  ...
  0.85    |   ...   |  ...   ← default
  0.90    |   ...   |  ...
```

Pick the threshold that keeps FAR < 1% at the lowest FRR; set it via
`FACEAUTH_MATCH_THRESHOLD`.

## How to measure on device (TRD §11.3)

| Benchmark | Tool | Pass |
|---|---|---|
| BlazeFace p95 | TFLite `BenchmarkModel` or in-app timer | < 10 ms |
| MobileFaceNet p95 | same | < 80 ms |
| End-to-end p95 | app timer: launch → `AUTH_SUCCESS` event | < 1000 ms |
| Cold start p95 | app timer: launch → `DETECTING_FACE` | < 2000 ms |
| FAR / FRR @ 0.85 | offline harness, 500+500 pairs | < 1% / < 5% |
| Liveness spoof reject | 100 photo + 50 screen attacks | > 99% |

Minimum-spec validation device (TRD §9.3): Android 8.0, 3 GB RAM, octa-core 1.8 GHz
Cortex-A53 class, CPU-only, 720p front camera.
