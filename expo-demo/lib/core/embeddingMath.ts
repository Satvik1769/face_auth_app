/**
 * Pure vector math for face embeddings.
 * No dependencies — runs identically in JS test env and on-device (TRD §3.4).
 */
import { Embedding, EMBEDDING_DIM } from './types';

/** L2 norm (Euclidean length) of a vector. */
export function l2Norm(v: Embedding): number {
  let sum = 0;
  for (let i = 0; i < v.length; i++) sum += v[i] * v[i];
  return Math.sqrt(sum);
}

/**
 * Return a unit-length copy of the vector.
 * MobileFaceNet output is L2-normalised before storage and comparison (TRD §3.3).
 */
export function l2Normalize(v: Embedding): Embedding {
  const norm = l2Norm(v);
  if (norm === 0) {
    throw new Error('Cannot L2-normalise a zero vector');
  }
  const out = new Array<number>(v.length);
  for (let i = 0; i < v.length; i++) out[i] = v[i] / norm;
  return out;
}

/** Dot product of two equal-length vectors. */
export function dot(a: Embedding, b: Embedding): number {
  if (a.length !== b.length) {
    throw new Error(`Dimension mismatch: ${a.length} vs ${b.length}`);
  }
  let sum = 0;
  for (let i = 0; i < a.length; i++) sum += a[i] * b[i];
  return sum;
}

/**
 * Cosine similarity = dot(A,B) / (|A| |B|), range [-1, 1] (TRD §3.4).
 * Robust form — does not assume inputs are pre-normalised.
 */
export function cosineSimilarity(a: Embedding, b: Embedding): number {
  const denom = l2Norm(a) * l2Norm(b);
  if (denom === 0) {
    throw new Error('Cannot compute cosine similarity with a zero vector');
  }
  return dot(a, b) / denom;
}

/**
 * Average N embeddings element-wise and re-normalise (TRD §3.3, §5.3 averageEmbeddings).
 * Used during enrollment to fuse 10 captured frames into one stable embedding.
 */
export function averageEmbeddings(embeddings: Embedding[]): Embedding {
  if (embeddings.length === 0) {
    throw new Error('averageEmbeddings requires at least one embedding');
  }
  const dim = embeddings[0].length;
  const acc = new Array<number>(dim).fill(0);
  for (const e of embeddings) {
    if (e.length !== dim) {
      throw new Error(`All embeddings must share dimension ${dim}, got ${e.length}`);
    }
    for (let i = 0; i < dim; i++) acc[i] += e[i];
  }
  for (let i = 0; i < dim; i++) acc[i] /= embeddings.length;
  return l2Normalize(acc);
}

/** Validate an embedding's shape and finiteness before persisting (TRD §6.2 400 guard). */
export function isValidEmbedding(v: unknown): v is Embedding {
  return (
    Array.isArray(v) &&
    v.length === EMBEDDING_DIM &&
    v.every((x) => typeof x === 'number' && Number.isFinite(x))
  );
}
