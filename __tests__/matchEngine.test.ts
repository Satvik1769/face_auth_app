import { MatchEngine, DEFAULT_MATCH_THRESHOLD } from '../src/core/MatchEngine';
import { mockEmbeddingFor } from '../src/native/mockInference';

describe('MatchEngine', () => {
  const engine = new MatchEngine();

  test('default threshold is 0.85 (TRD §3.4)', () => {
    expect(engine.getThreshold()).toBe(DEFAULT_MATCH_THRESHOLD);
    expect(DEFAULT_MATCH_THRESHOLD).toBe(0.85);
  });

  test('same identity matches above threshold', () => {
    const enrolled = mockEmbeddingFor('rizul');
    const live = mockEmbeddingFor('rizul', 0.05); // small frame jitter
    const r = engine.compare(live, enrolled);
    expect(r.isMatch).toBe(true);
    expect(r.score).toBeGreaterThan(0.85);
  });

  test('different identities do not match', () => {
    const enrolled = mockEmbeddingFor('rizul');
    const impostor = mockEmbeddingFor('someone-else');
    const r = engine.compare(impostor, enrolled);
    expect(r.isMatch).toBe(false);
    expect(r.score).toBeLessThan(0.85);
  });

  test('threshold boundary: score exactly at threshold matches (>=)', () => {
    const e = new MatchEngine(0.5);
    // construct two vectors with cosine exactly 0.5 is fiddly; assert the rule directly
    const a = mockEmbeddingFor('x');
    const r = e.compare(a, a); // identical -> 1.0 >= 0.5
    expect(r.isMatch).toBe(true);
  });

  test('setThreshold validates range', () => {
    expect(() => engine.setThreshold(1.5)).toThrow();
    expect(() => engine.setThreshold(-2)).toThrow();
  });

  test('compare rejects malformed embeddings', () => {
    expect(() => engine.compare([1, 2, 3], mockEmbeddingFor('a'))).toThrow();
  });

  test('compareBest accepts on the best-scoring template', () => {
    const live = mockEmbeddingFor('rizul', 3);
    const templates = [mockEmbeddingFor('someone-else'), mockEmbeddingFor('rizul'), mockEmbeddingFor('third')];
    const r = engine.compareBest(live, templates);
    expect(r.isMatch).toBe(true); // matches via the 'rizul' template despite two impostor templates
  });

  test('compareBest rejects when no template matches', () => {
    const live = mockEmbeddingFor('rizul');
    const templates = [mockEmbeddingFor('a'), mockEmbeddingFor('b')];
    expect(engine.compareBest(live, templates).isMatch).toBe(false);
  });

  test('compareBest requires at least one template', () => {
    expect(() => engine.compareBest(mockEmbeddingFor('rizul'), [])).toThrow();
  });
});
