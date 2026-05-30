import {
  l2Norm,
  l2Normalize,
  dot,
  cosineSimilarity,
  averageEmbeddings,
  isValidEmbedding,
} from '../src/core/embeddingMath';
import { EMBEDDING_DIM } from '../src/core/types';

const vec = (fill: number) => new Array(EMBEDDING_DIM).fill(fill);

describe('embeddingMath', () => {
  test('l2Norm of a known vector', () => {
    expect(l2Norm([3, 4])).toBeCloseTo(5, 10);
  });

  test('l2Normalize yields unit length', () => {
    const n = l2Normalize([3, 4]);
    expect(l2Norm(n)).toBeCloseTo(1, 10);
    expect(n).toEqual([0.6, 0.8]);
  });

  test('l2Normalize rejects zero vector', () => {
    expect(() => l2Normalize([0, 0, 0])).toThrow();
  });

  test('dot rejects dimension mismatch', () => {
    expect(() => dot([1, 2], [1, 2, 3])).toThrow(/mismatch/i);
  });

  test('cosine of identical vectors is 1, opposite is -1, orthogonal is 0', () => {
    expect(cosineSimilarity([1, 2, 3], [1, 2, 3])).toBeCloseTo(1, 10);
    expect(cosineSimilarity([1, 0], [-1, 0])).toBeCloseTo(-1, 10);
    expect(cosineSimilarity([1, 0], [0, 1])).toBeCloseTo(0, 10);
  });

  test('averageEmbeddings averages then re-normalises', () => {
    const a = l2Normalize(vec(1));
    const b = l2Normalize(vec(1));
    const avg = averageEmbeddings([a, b]);
    expect(l2Norm(avg)).toBeCloseTo(1, 10);
  });

  test('averageEmbeddings rejects empty input and ragged dims', () => {
    expect(() => averageEmbeddings([])).toThrow();
    expect(() => averageEmbeddings([[1, 2], [1, 2, 3]])).toThrow();
  });

  test('isValidEmbedding enforces 128-dim finite vectors', () => {
    expect(isValidEmbedding(vec(0.1))).toBe(true);
    expect(isValidEmbedding(vec(NaN))).toBe(false);
    expect(isValidEmbedding([1, 2, 3])).toBe(false);
    expect(isValidEmbedding('nope')).toBe(false);
  });
});
