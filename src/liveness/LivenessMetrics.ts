/**
 * Liveness metric math (TRD §3.2.1).
 * Pure functions over facial landmarks — fully unit-testable without the model.
 * The MediaPipe Face Mesh native module supplies the landmark points; this
 * module turns points into blink / smile / head-turn decisions.
 */

export interface Point2D {
  x: number;
  y: number;
}

/** Euclidean distance between two 2D points. */
export function distance(a: Point2D, b: Point2D): number {
  const dx = a.x - b.x;
  const dy = a.y - b.y;
  return Math.sqrt(dx * dx + dy * dy);
}

/** Blink threshold (TRD §3.2): EAR < 0.25 for >= 2 consecutive frames. */
export const EAR_THRESHOLD = 0.25;
export const EAR_CONSEC_FRAMES = 2;

/** Smile threshold (TRD §3.2): MAR > 0.6. */
export const MAR_THRESHOLD = 0.6;

/** Head-turn threshold (TRD §3.2): |yaw| > 20 degrees. */
export const YAW_THRESHOLD_DEG = 20;

/**
 * Eye Aspect Ratio (TRD §3.2.1):
 *   EAR = (||p2-p6|| + ||p3-p5||) / (2 * ||p1-p4||)
 * p1..p6 are the six eye landmarks (1-indexed in the formula, 0-indexed array here).
 */
export function eyeAspectRatio(eye: [Point2D, Point2D, Point2D, Point2D, Point2D, Point2D]): number {
  const [p1, p2, p3, p4, p5, p6] = eye;
  const horizontal = distance(p1, p4);
  if (horizontal === 0) {
    throw new Error('Degenerate eye landmarks: zero horizontal distance');
  }
  return (distance(p2, p6) + distance(p3, p5)) / (2 * horizontal);
}

/**
 * Mouth Aspect Ratio (TRD §3.2.1):
 *   MAR = ||p3-p9|| / ((||p1-p7|| + ||p2-p8||) / 2)
 * Indices follow the TRD's 1-indexed mouth landmark naming.
 */
export function mouthAspectRatio(mouth: {
  p1: Point2D;
  p2: Point2D;
  p3: Point2D;
  p7: Point2D;
  p8: Point2D;
  p9: Point2D;
}): number {
  const width = (distance(mouth.p1, mouth.p7) + distance(mouth.p2, mouth.p8)) / 2;
  if (width === 0) {
    throw new Error('Degenerate mouth landmarks: zero width');
  }
  return distance(mouth.p3, mouth.p9) / width;
}

/**
 * Estimate head yaw (degrees) from nose tip and the two ear reference points.
 * Sign is informative (negative = turned one way); detection uses |yaw|.
 * Approximation: ratio of nose offset from the ear midpoint to the inter-ear span,
 * mapped onto a +/-90 degree range.
 */
export function estimateYawDegrees(noseTip: Point2D, leftEar: Point2D, rightEar: Point2D): number {
  const midX = (leftEar.x + rightEar.x) / 2;
  const span = Math.abs(rightEar.x - leftEar.x);
  if (span === 0) {
    return 0;
  }
  const offsetRatio = (noseTip.x - midX) / (span / 2); // ~[-1, 1] when facing within frame
  const clamped = Math.max(-1, Math.min(1, offsetRatio));
  return clamped * 90;
}

export function isBlinkFrame(ear: number): boolean {
  return ear < EAR_THRESHOLD;
}

export function isSmile(mar: number): boolean {
  return mar > MAR_THRESHOLD;
}

export function isHeadTurned(yawDeg: number): boolean {
  return Math.abs(yawDeg) > YAW_THRESHOLD_DEG;
}
