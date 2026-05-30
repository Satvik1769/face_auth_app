import {
  assessFrameQuality,
  LOW_LUMA,
  HIGH_LUMA,
  MIN_SHARPNESS,
  MIN_DETECTION_CONFIDENCE,
} from '../src/liveness/FrameQuality';

describe('assessFrameQuality', () => {
  test('a well-lit, sharp, confident frame passes', () => {
    const r = assessFrameQuality({ meanLuma: 130, sharpness: 200, detectionConfidence: 0.95 });
    expect(r.ok).toBe(true);
    expect(r.level).toBe('ok');
    expect(r.prompt).toBe('');
  });

  test('flags low light', () => {
    const r = assessFrameQuality({ meanLuma: LOW_LUMA - 1 });
    expect(r.level).toBe('low_light');
    expect(r.ok).toBe(false);
    expect(r.prompt).toMatch(/dark/i);
  });

  test('flags over-exposure (harsh sun)', () => {
    const r = assessFrameQuality({ meanLuma: HIGH_LUMA + 1 });
    expect(r.level).toBe('over_exposed');
    expect(r.prompt).toMatch(/bright|sun/i);
  });

  test('flags blur when sharpness is provided and low', () => {
    const r = assessFrameQuality({ meanLuma: 120, sharpness: MIN_SHARPNESS - 1 });
    expect(r.level).toBe('blurry');
  });

  test('flags low detection confidence', () => {
    const r = assessFrameQuality({ meanLuma: 120, sharpness: 200, detectionConfidence: MIN_DETECTION_CONFIDENCE - 0.1 });
    expect(r.level).toBe('no_face_confidence');
  });

  test('lighting issues take priority over a single clear instruction', () => {
    // dark AND blurry -> report the lighting first (most actionable)
    const r = assessFrameQuality({ meanLuma: 10, sharpness: 5 });
    expect(r.level).toBe('low_light');
  });

  test('optional signals are ignored when absent', () => {
    expect(assessFrameQuality({ meanLuma: 120 }).ok).toBe(true);
  });
});
