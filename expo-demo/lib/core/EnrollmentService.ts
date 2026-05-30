/**
 * EnrollmentService — first-time and re-enrollment flow (TRD §2.1, PRD §2.1).
 * Captures N frames, generates one embedding per frame, averages + re-normalises,
 * and persists encrypted. Offline-first (OQ-01 Option B): no network required.
 */
import { IEmbedding } from '../native/bridgeTypes';
import { ISecureStorage } from '../storage/SecureStorageService';
import { Embedding } from './types';
import { selectTemplates, DEFAULT_MAX_TEMPLATES, TemplateSelection } from './TemplateSelector';

export const ENROLLMENT_FRAME_COUNT = 10; // TRD §3.3

export interface EnrollmentResult extends TemplateSelection {
  enrollmentVersion: number;
}

export class EnrollmentService {
  constructor(
    private readonly embedding: IEmbedding,
    private readonly storage: ISecureStorage,
    private readonly nowIso: () => string,
    private readonly maxTemplates: number = DEFAULT_MAX_TEMPLATES,
  ) {}

  /**
   * @param frames base64 112×112 face crops (expects ENROLLMENT_FRAME_COUNT).
   * Fewer frames are allowed (degraded capture) but at least one is required.
   *
   * Generates one embedding per frame, rejects outlier frames, and stores a small
   * set of diverse templates (centroid + most-distinct inliers) for robust matching
   * across lighting/angle. Returns capture quality stats for the UI.
   */
  async enroll(userId: string, frames: string[]): Promise<EnrollmentResult> {
    if (frames.length === 0) {
      throw new Error('Enrollment requires at least one captured frame');
    }
    const embeddings: Embedding[] = [];
    for (const f of frames) {
      const { embedding } = await this.embedding.generateEmbedding(f);
      embeddings.push(embedding);
    }
    const selection = selectTemplates(embeddings, this.maxTemplates);
    await this.storage.saveEnrollment(userId, selection.templates, this.nowIso());
    const rec = await this.storage.getEnrollment(userId);
    return { ...selection, enrollmentVersion: rec?.enrollment_version ?? 1 };
  }
}
