import {
  eyeAspectRatio,
  mouthAspectRatio,
  estimateYawDegrees,
  isBlinkFrame,
  isSmile,
  isHeadTurned,
  Point2D,
} from '../src/liveness/LivenessMetrics';
import { LivenessSession } from '../src/liveness/LivenessSession';

const p = (x: number, y: number): Point2D => ({ x, y });

describe('LivenessMetrics', () => {
  test('EAR is small for a closed eye, large for an open eye', () => {
    // open eye: tall (p2-p6, p3-p5 large) relative to width (p1-p4)
    const open = eyeAspectRatio([p(0, 0), p(1, 1.5), p(2, 1.5), p(3, 0), p(2, -1.5), p(1, -1.5)]);
    // closed eye: vertical gap near zero
    const closed = eyeAspectRatio([p(0, 0), p(1, 0.05), p(2, 0.05), p(3, 0), p(2, -0.05), p(1, -0.05)]);
    expect(open).toBeGreaterThan(0.25);
    expect(closed).toBeLessThan(0.25);
    expect(isBlinkFrame(closed)).toBe(true);
    expect(isBlinkFrame(open)).toBe(false);
  });

  test('MAR exceeds smile threshold for an open/wide mouth', () => {
    const mar = mouthAspectRatio({
      p1: p(0, 0),
      p7: p(1, 0),
      p2: p(0, 0.1),
      p8: p(1, 0.1),
      p3: p(0.5, 1),
      p9: p(0.5, -1),
    });
    expect(mar).toBeGreaterThan(0.6);
    expect(isSmile(mar)).toBe(true);
  });

  test('yaw estimate sign and head-turn detection', () => {
    const straight = estimateYawDegrees(p(0, 0), p(-1, 0), p(1, 0));
    expect(Math.abs(straight)).toBeLessThan(20);
    expect(isHeadTurned(straight)).toBe(false);

    const turned = estimateYawDegrees(p(0.9, 0), p(-1, 0), p(1, 0));
    expect(isHeadTurned(turned)).toBe(true);
  });

  test('degenerate landmarks throw', () => {
    expect(() => eyeAspectRatio([p(0, 0), p(0, 1), p(0, 1), p(0, 0), p(0, -1), p(0, -1)])).toThrow();
  });
});

describe('LivenessSession', () => {
  test('blink passes after 2 consecutive low-EAR frames', () => {
    const s = new LivenessSession('blink');
    s.evaluateFrame({ ear: 0.4, mar: 0, yawDeg: 0, timestampMs: 0 }); // open
    const r1 = s.evaluateFrame({ ear: 0.1, mar: 0, yawDeg: 0, timestampMs: 33 }); // closed 1
    expect(r1.passed).toBe(false);
    const r2 = s.evaluateFrame({ ear: 0.1, mar: 0, yawDeg: 0, timestampMs: 66 }); // closed 2
    expect(r2.passed).toBe(true);
    expect(s.isFinished()).toBe(true);
  });

  test('non-consecutive blinks do not pass', () => {
    const s = new LivenessSession('blink');
    s.evaluateFrame({ ear: 0.1, mar: 0, yawDeg: 0, timestampMs: 0 });
    s.evaluateFrame({ ear: 0.4, mar: 0, yawDeg: 0, timestampMs: 33 }); // reset
    const r = s.evaluateFrame({ ear: 0.1, mar: 0, yawDeg: 0, timestampMs: 66 });
    expect(r.passed).toBe(false);
  });

  test('challenge times out after the window', () => {
    const s = new LivenessSession('smile', 1000);
    s.evaluateFrame({ ear: 0.4, mar: 0, yawDeg: 0, timestampMs: 0 });
    const r = s.evaluateFrame({ ear: 0.4, mar: 0, yawDeg: 0, timestampMs: 1500 });
    expect(r.passed).toBe(false);
    expect(r.reason).toBe('timeout');
    expect(s.isFinished()).toBe(true);
  });

  test('smile passes on a wide mouth frame', () => {
    const s = new LivenessSession('smile');
    const r = s.evaluateFrame({ ear: 0.4, mar: 0.8, yawDeg: 0, timestampMs: 0 });
    expect(r.passed).toBe(true);
  });

  test('head_turn passes past the yaw threshold', () => {
    const s = new LivenessSession('head_turn');
    const r = s.evaluateFrame({ ear: 0.4, mar: 0, yawDeg: 35, timestampMs: 0 });
    expect(r.passed).toBe(true);
  });
});
