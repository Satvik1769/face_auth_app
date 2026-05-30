/**
 * Benchmark harness (TRD §9, §11.3).
 *
 * Two kinds of numbers:
 *  1) GENUINELY MEASURED HERE — cosine-similarity matching latency. This is the
 *     same pure-JS code that runs on device, so the JS-side latency is real.
 *  2) METHODOLOGY + SMOKE TEST — FAR/FRR threshold sweep. Run on deterministic
 *     mock embeddings here (proves the harness math); point it at a real labelled
 *     embedding set (exported from the device EmbeddingModule) for submission
 *     numbers. Model inference latency (BlazeFace/MobileFaceNet) must be measured
 *     ON THE DEVICE with the TFLite benchmark tool — it cannot be faked on a laptop.
 *
 * Run: npm run bench
 */
import { MatchEngine } from '../src/core/MatchEngine';
import { cosineSimilarity } from '../src/core/embeddingMath';
import { mockEmbeddingFor } from '../src/native/mockInference';
import { Embedding } from '../src/core/types';

function percentile(sorted: number[], p: number): number {
  const idx = Math.min(sorted.length - 1, Math.floor((p / 100) * sorted.length));
  return sorted[idx];
}

function benchMatchLatency(iterations = 100_000): void {
  const engine = new MatchEngine();
  const a = mockEmbeddingFor('person-a');
  const b = mockEmbeddingFor('person-b');
  // warm up
  for (let i = 0; i < 1000; i++) engine.compare(a, b);

  const samples: number[] = [];
  for (let i = 0; i < iterations; i++) {
    const t0 = process.hrtime.bigint();
    engine.compare(a, b);
    const t1 = process.hrtime.bigint();
    samples.push(Number(t1 - t0) / 1e6); // ms
  }
  samples.sort((x, y) => x - y);
  const mean = samples.reduce((s, x) => s + x, 0) / samples.length;
  console.log('\n=== Cosine match latency (MEASURED, pure JS) ===');
  console.log(`iterations : ${iterations}`);
  console.log(`mean       : ${mean.toFixed(5)} ms`);
  console.log(`p50        : ${percentile(samples, 50).toFixed(5)} ms`);
  console.log(`p95        : ${percentile(samples, 95).toFixed(5)} ms`);
  console.log(`p99        : ${percentile(samples, 99).toFixed(5)} ms`);
  console.log(`target     : < 5 ms (TRD §9.1)  -> ${percentile(samples, 95) < 5 ? 'PASS' : 'FAIL'}`);
}

/** A labelled embedding set: genuine pairs share identity; impostor pairs differ. */
interface LabeledSet {
  genuinePairs: Array<[Embedding, Embedding]>;
  impostorPairs: Array<[Embedding, Embedding]>;
}

/** Build a mock labelled set (smoke test for the sweep math, NOT a real accuracy claim). */
function buildMockSet(nPeople = 100): LabeledSet {
  const genuinePairs: Array<[Embedding, Embedding]> = [];
  const impostorPairs: Array<[Embedding, Embedding]> = [];
  for (let i = 0; i < nPeople; i++) {
    const id = `id-${i}`;
    genuinePairs.push([mockEmbeddingFor(id, 1), mockEmbeddingFor(id, 2)]);
    impostorPairs.push([mockEmbeddingFor(id, 1), mockEmbeddingFor(`id-${(i + 1) % nPeople}`, 1)]);
  }
  return { genuinePairs, impostorPairs };
}

function sweepFarFrr(set: LabeledSet, thresholds = [0.8, 0.85, 0.9]): void {
  console.log('\n=== FAR / FRR threshold sweep (harness math; mock data) ===');
  console.log('threshold |   FAR   |   FRR   | (target FAR<1%, FRR<5%)');
  for (const t of thresholds) {
    const impostorsAccepted = set.impostorPairs.filter(([a, b]) => cosineSimilarity(a, b) >= t).length;
    const genuinesRejected = set.genuinePairs.filter(([a, b]) => cosineSimilarity(a, b) < t).length;
    const far = (impostorsAccepted / set.impostorPairs.length) * 100;
    const frr = (genuinesRejected / set.genuinePairs.length) * 100;
    console.log(`  ${t.toFixed(2)}    | ${far.toFixed(2).padStart(5)}% | ${frr.toFixed(2).padStart(5)}% |`);
  }
  console.log(
    '\nNOTE: numbers above use deterministic MOCK embeddings — they validate the\n' +
      'sweep math only. Replace buildMockSet() with real embeddings exported from the\n' +
      'on-device EmbeddingModule over a diverse Indian-demographics test set for the\n' +
      'accuracy figures reported in the submission (TRD §9.2).',
  );
}

benchMatchLatency();
sweepFarFrr(buildMockSet());
