/**
 * LivenessSession — stateful challenge-response evaluator (TRD §3.2, §5.2).
 * Consumes per-frame landmark metrics and decides pass/fail for a single
 * randomised challenge. Pure logic; the clock is injected so tests are
 * deterministic (no reliance on Date.now()).
 */
import { ChallengeType } from '../core/types';
import {
  EAR_CONSEC_FRAMES,
  EAR_THRESHOLD,
  MAR_THRESHOLD,
  YAW_THRESHOLD_DEG,
  isBlinkFrame,
  isSmile,
  isHeadTurned,
} from './LivenessMetrics';

export const DEFAULT_LIVENESS_TIMEOUT_MS = 10_000; // TRD §3.2 challenge timeout

/** Metrics extracted from one frame by the native MediaPipe bridge. */
export interface FrameMetrics {
  ear: number; // eye aspect ratio (min of both eyes)
  mar: number; // mouth aspect ratio
  yawDeg: number; // head yaw in degrees
  timestampMs: number; // monotonic frame time
}

export interface LivenessResult {
  passed: boolean;
  challengeType: ChallengeType;
  framesProcessed: number;
  elapsedMs: number;
  reason?: 'timeout' | 'completed' | 'pending';
}

export class LivenessSession {
  readonly challengeType: ChallengeType;
  private readonly timeoutMs: number;
  private startMs: number | null = null;
  private framesProcessed = 0;
  private consecutiveBlinkFrames = 0;
  private passed = false;
  private finished = false;

  constructor(challengeType: ChallengeType, timeoutMs: number = DEFAULT_LIVENESS_TIMEOUT_MS) {
    this.challengeType = challengeType;
    this.timeoutMs = timeoutMs;
  }

  /**
   * Process one frame. Returns the running result.
   * The first frame's timestamp anchors the timeout window.
   */
  evaluateFrame(m: FrameMetrics): LivenessResult {
    if (this.finished) {
      return this.result(m.timestampMs);
    }
    if (this.startMs === null) {
      this.startMs = m.timestampMs;
    }
    this.framesProcessed++;

    if (m.timestampMs - this.startMs > this.timeoutMs) {
      this.finished = true;
      return this.result(m.timestampMs, 'timeout');
    }

    switch (this.challengeType) {
      case 'blink':
        if (isBlinkFrame(m.ear)) {
          this.consecutiveBlinkFrames++;
        } else {
          this.consecutiveBlinkFrames = 0;
        }
        if (this.consecutiveBlinkFrames >= EAR_CONSEC_FRAMES) {
          this.passed = true;
          this.finished = true;
        }
        break;
      case 'smile':
        if (isSmile(m.mar)) {
          this.passed = true;
          this.finished = true;
        }
        break;
      case 'head_turn':
        if (isHeadTurned(m.yawDeg)) {
          this.passed = true;
          this.finished = true;
        }
        break;
    }

    return this.result(m.timestampMs, this.finished ? 'completed' : 'pending');
  }

  isFinished(): boolean {
    return this.finished;
  }

  private result(nowMs: number, reason?: LivenessResult['reason']): LivenessResult {
    return {
      passed: this.passed,
      challengeType: this.challengeType,
      framesProcessed: this.framesProcessed,
      elapsedMs: this.startMs === null ? 0 : nowMs - this.startMs,
      reason,
    };
  }
}

/** Thresholds re-exported for UI display / config (avoids deep imports). */
export const LIVENESS_THRESHOLDS = {
  EAR_THRESHOLD,
  EAR_CONSEC_FRAMES,
  MAR_THRESHOLD,
  YAW_THRESHOLD_DEG,
};
