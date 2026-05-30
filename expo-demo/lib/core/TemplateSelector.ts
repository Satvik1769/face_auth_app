/**
 * TemplateSelector — turns N raw enrollment-frame embeddings into a small set of
 * robust, *diverse* templates (product upgrade over a single averaged embedding).
 *
 * Why: a single averaged embedding is fragile across the lighting/angle variance the
 * brief demands (harsh sun, shade, low light). Real face-auth keeps a few templates
 * spanning that variance and matches the best. This module:
 *   1. computes the centroid and rejects outlier frames (bad capture, motion blur),
 *   2. keeps the centroid plus the most *distinct* inliers (up to K), so the stored
 *      set covers appearance variation instead of collapsing to one point.
 *
 * Pure math — fully unit-tested, no device.
 */
import { Embedding } from './types';
import { cosineSimilarity, l2Normalize, isValidEmbedding } from './embeddingMath';

export const DEFAULT_MAX_TEMPLATES = 3;
/** A frame is an outlier if its similarity to the centroid is below this. */
export const OUTLIER_SIMILARITY_FLOOR = 0.6;
/** Candidates this close to an existing template add no diversity — don't store them. */
export const TEMPLATE_DEDUP_CEILING = 0.98;

export interface TemplateSelection {
  templates: Embedding[]; // templates[0] is always the centroid
  acceptedFrames: number;
  rejectedFrames: number;
}

/** Element-wise mean of embeddings, re-normalised (the centroid of the cluster). */
export function centroid(embeddings: Embedding[]): Embedding {
  const dim = embeddings[0].length;
  const acc = new Array<number>(dim).fill(0);
  for (const e of embeddings) for (let i = 0; i < dim; i++) acc[i] += e[i];
  for (let i = 0; i < dim; i++) acc[i] /= embeddings.length;
  return l2Normalize(acc);
}

/**
 * @param frames embeddings from captured enrollment frames (already L2-normalised)
 * @param maxTemplates cap on stored templates (default 3)
 */
export function selectTemplates(
  frames: Embedding[],
  maxTemplates: number = DEFAULT_MAX_TEMPLATES,
): TemplateSelection {
  if (frames.length === 0) {
    throw new Error('selectTemplates requires at least one frame embedding');
  }
  for (const f of frames) {
    if (!isValidEmbedding(f)) throw new Error('All enrollment frames must be valid 128-d embeddings');
  }

  // 1. Reject outliers relative to the provisional centroid.
  const provisional = centroid(frames);
  const inliers = frames.filter((f) => cosineSimilarity(f, provisional) >= OUTLIER_SIMILARITY_FLOOR);
  // Never let outlier rejection wipe everything (degenerate capture) — fall back to all.
  const usable = inliers.length > 0 ? inliers : frames;

  // 2. Recompute the centroid from inliers only — it is template #0 (best general match).
  const c = centroid(usable);
  const templates: Embedding[] = [c];

  // 3. Greedily add the most *distinct* inliers (farthest-point sampling) up to the cap,
  //    so the set spans appearance variation rather than clustering near the centroid.
  const candidates = [...usable];
  while (templates.length < maxTemplates && candidates.length > 0) {
    let bestIdx = -1;
    let bestMinSim = Infinity; // pick the candidate whose closest existing template is farthest away
    for (let i = 0; i < candidates.length; i++) {
      const minSim = Math.min(...templates.map((t) => cosineSimilarity(candidates[i], t)));
      if (minSim < bestMinSim) {
        bestMinSim = minSim;
        bestIdx = i;
      }
    }
    // Stop once the most-distinct remaining candidate is still a near-duplicate of
    // what we already hold — adding it would only bloat storage without coverage.
    if (bestIdx < 0 || bestMinSim >= TEMPLATE_DEDUP_CEILING) break;
    templates.push(candidates[bestIdx]);
    candidates.splice(bestIdx, 1);
  }

  return {
    templates,
    acceptedFrames: usable.length,
    rejectedFrames: frames.length - usable.length,
  };
}
