/**
 * FrameQuality — pre-inference image quality gate (FR-15, TRD §9.2, TR-02/TR-07).
 *
 * Harsh sun and low light are the brief's headline failure modes. Rather than feed a
 * bad frame to the model and silently mis-auth, we assess cheap per-frame signals the
 * native camera layer already computes (mean luma, a sharpness proxy, and optionally
 * the detector confidence) and surface an actionable user prompt. The pipeline only
 * runs recognition on frames that pass — and pre-processing (CLAHE) is recommended for
 * borderline frames before giving up.
 *
 * Pure function over scalar signals — fully unit-testable, no pixels needed here.
 */

export type QualityLevel = 'ok' | 'low_light' | 'over_exposed' | 'blurry' | 'no_face_confidence';

export interface FrameSignals {
  /** Mean luma of the face region, 0–255 (native computes from the Y plane). */
  meanLuma: number;
  /** Sharpness proxy — variance of Laplacian; higher is sharper. Optional. */
  sharpness?: number;
  /** BlazeFace detection confidence for this frame, 0–1. Optional. */
  detectionConfidence?: number;
}

export interface QualityAssessment {
  ok: boolean;
  level: QualityLevel;
  /** Friendly, actionable message (PRD §4.4) — empty when ok. */
  prompt: string;
}

// Thresholds tuned for an 8-bit luma face crop. Exposed for calibration/override.
export const LOW_LUMA = 50; // below → too dark (TRD low-light < 50 lux analogue)
export const HIGH_LUMA = 235; // above → blown highlights / harsh backlight
export const MIN_SHARPNESS = 60; // below → motion blur / out of focus
export const MIN_DETECTION_CONFIDENCE = 0.6; // TRD §9.2 warning threshold

const PROMPTS: Record<QualityLevel, string> = {
  ok: '',
  low_light: 'Too dark — move to better light or face a light source.',
  over_exposed: 'Too bright — step out of direct sunlight or shade your face.',
  blurry: 'Hold steady — keep the phone still and your face in frame.',
  no_face_confidence: 'Center your face in the oval and hold still.',
};

/**
 * Assess one frame. Checks are ordered by how actionable the guidance is; the first
 * failing check wins so the user gets one clear instruction, not a pile of them.
 */
export function assessFrameQuality(s: FrameSignals): QualityAssessment {
  let level: QualityLevel = 'ok';

  if (s.meanLuma < LOW_LUMA) {
    level = 'low_light';
  } else if (s.meanLuma > HIGH_LUMA) {
    level = 'over_exposed';
  } else if (s.sharpness !== undefined && s.sharpness < MIN_SHARPNESS) {
    level = 'blurry';
  } else if (s.detectionConfidence !== undefined && s.detectionConfidence < MIN_DETECTION_CONFIDENCE) {
    level = 'no_face_confidence';
  }

  return { ok: level === 'ok', level, prompt: PROMPTS[level] };
}
