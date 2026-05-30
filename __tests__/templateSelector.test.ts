import { selectTemplates, centroid, OUTLIER_SIMILARITY_FLOOR } from '../src/core/TemplateSelector';
import { cosineSimilarity, l2Norm } from '../src/core/embeddingMath';
import { mockEmbeddingFor } from '../src/native/mockInference';

describe('TemplateSelector', () => {
  test('centroid is unit length', () => {
    const c = centroid([mockEmbeddingFor('a', 1), mockEmbeddingFor('a', 2)]);
    expect(l2Norm(c)).toBeCloseTo(1, 6);
  });

  test('keeps at most maxTemplates and template[0] is the centroid', () => {
    const frames = Array.from({ length: 10 }, (_, i) => mockEmbeddingFor('rizul', i + 1));
    const sel = selectTemplates(frames, 3);
    expect(sel.templates.length).toBeLessThanOrEqual(3);
    // centroid should be highly similar to the mean of inliers
    const c = centroid(frames);
    expect(cosineSimilarity(sel.templates[0], c)).toBeGreaterThan(0.99);
  });

  test('rejects an outlier frame (different identity slipped into capture)', () => {
    const good = Array.from({ length: 8 }, (_, i) => mockEmbeddingFor('rizul', i + 1));
    const outlier = mockEmbeddingFor('totally-different-person');
    const sel = selectTemplates([...good, outlier], 3);
    expect(sel.rejectedFrames).toBeGreaterThanOrEqual(1);
    // none of the stored templates should resemble the outlier
    for (const t of sel.templates) {
      expect(cosineSimilarity(t, outlier)).toBeLessThan(OUTLIER_SIMILARITY_FLOOR);
    }
  });

  test('selected templates are diverse (not all identical to the centroid)', () => {
    const frames = Array.from({ length: 10 }, (_, i) => mockEmbeddingFor('rizul', i + 1));
    const sel = selectTemplates(frames, 3);
    if (sel.templates.length >= 2) {
      // at least one non-centroid template is meaningfully distinct
      const sims = sel.templates.slice(1).map((t) => cosineSimilarity(t, sel.templates[0]));
      expect(Math.min(...sims)).toBeLessThan(1);
    }
  });

  test('single frame yields a single template', () => {
    const sel = selectTemplates([mockEmbeddingFor('rizul')], 3);
    expect(sel.templates).toHaveLength(1);
    expect(sel.acceptedFrames).toBe(1);
  });

  test('empty input throws', () => {
    expect(() => selectTemplates([], 3)).toThrow();
  });

  test('does not wipe everything if all frames look like outliers of a tiny set', () => {
    // two very different frames: centroid sits between; both may fall below floor.
    const a = mockEmbeddingFor('a');
    const b = mockEmbeddingFor('b');
    const sel = selectTemplates([a, b], 3);
    expect(sel.templates.length).toBeGreaterThanOrEqual(1); // graceful fallback
  });
});
