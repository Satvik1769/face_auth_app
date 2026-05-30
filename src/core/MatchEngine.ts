/**
 * MatchEngine — pure-JS cosine similarity matching (TRD §2.2, §3.4).
 * No external library; single dot product of two 128-element arrays.
 * Target latency < 5 ms (TRD §9.1).
 */
import { Embedding, EnrollmentRecord, MatchResult } from './types';
import { cosineSimilarity, isValidEmbedding } from './embeddingMath';

/** Default match threshold (TRD §3.4 / OQ-02): 0.85 balances FAR < 1% and FRR < 5%. */
export const DEFAULT_MATCH_THRESHOLD = 0.85;

export class MatchEngine {
  private threshold: number = DEFAULT_MATCH_THRESHOLD;

  constructor(threshold: number = DEFAULT_MATCH_THRESHOLD) {
    this.setThreshold(threshold);
  }

  setThreshold(value: number): void {
    if (!(value >= -1 && value <= 1)) {
      throw new Error(`Threshold must be within [-1, 1], got ${value}`);
    }
    this.threshold = value;
  }

  getThreshold(): number {
    return this.threshold;
  }

  /**
   * Compare a live embedding against a single enrolled embedding.
   * Returns the cosine score and the accept/reject decision.
   */
  compare(live: Embedding, enrolled: Embedding): MatchResult {
    if (!isValidEmbedding(live) || !isValidEmbedding(enrolled)) {
      throw new Error('Both embeddings must be valid 128-dim finite vectors');
    }
    const score = cosineSimilarity(live, enrolled);
    return {
      score,
      isMatch: score >= this.threshold,
      threshold: this.threshold,
    };
  }

  /**
   * Compare a live embedding against several enrolled templates and accept on the
   * BEST score (TemplateSelector keeps a diverse set spanning lighting/angle, so the
   * closest template is the right basis for the decision). This is what lifts FRR in
   * varied outdoor conditions versus matching one averaged embedding.
   */
  compareBest(live: Embedding, templates: Embedding[]): MatchResult {
    if (templates.length === 0) {
      throw new Error('compareBest requires at least one template');
    }
    let best = -Infinity;
    for (const t of templates) {
      const { score } = this.compare(live, t);
      if (score > best) best = score;
    }
    return { score: best, isMatch: best >= this.threshold, threshold: this.threshold };
  }

  /**
   * Scan all enrolled users and return the best-matching one above threshold.
   * Returns null if no enrollment exists or none clears the threshold.
   */
  identifyBest(live: Embedding, enrollments: EnrollmentRecord[]): (MatchResult & { userId: string }) | null {
    let bestUserId: string | null = null;
    let bestScore = -Infinity;
    for (const rec of enrollments) {
      const { score } = this.compareBest(live, rec.templates);
      if (score > bestScore) {
        bestScore = score;
        bestUserId = rec.user_id;
      }
    }
    if (bestUserId === null || bestScore < this.threshold) return null;
    return { userId: bestUserId, score: bestScore, isMatch: true, threshold: this.threshold };
  }
}
