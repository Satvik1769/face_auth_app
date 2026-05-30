/**
 * Deterministic mock inference (no models, no native code).
 *
 * Purpose: let the entire JS auth pipeline + UI run end-to-end in a simulator,
 * CI, or laptop demo before the real .tflite weights are wired in. Embeddings
 * are derived deterministically from a seed string so the same "person" always
 * produces a matching vector and a different "person" does not — letting the
 * MatchEngine, state machine, and storage be demonstrated truthfully.
 *
 * This is NOT used on a real device build: the native modules take precedence.
 */
import { ChallengeType, Embedding, EMBEDDING_DIM } from '../core/types';
import { l2Normalize, averageEmbeddings as avgEmbeddings } from '../core/embeddingMath';
import {
  FaceDetectionResult,
  IEmbedding,
  IFaceDetector,
  ILiveness,
  LivenessChallengeSession,
  LivenessFrameResult,
  LivenessSessionResult,
} from './bridgeTypes';

/** Stable string hash (FNV-1a) — seeds the pseudo-embedding generator. */
function hashSeed(s: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  return h >>> 0;
}

/** Mulberry32 PRNG — deterministic given a seed (no Math.random). */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Fixed, small per-frame noise magnitude — keeps same-identity cosine well above 0.85. */
const MOCK_JITTER_MAGNITUDE = 0.06;

/**
 * Produce a deterministic 128-dim L2-normalised embedding for an identity seed.
 * `frameSeed` varies the noise *pattern* (different per frame); `spread` is the noise
 * magnitude — its default models tiny frame-to-frame jitter, while a larger value
 * simulates real lighting/angle variation across enrollment frames (used by the demo
 * to exercise multi-template selection). The same identity stays well above the 0.85
 * match threshold either way.
 */
export function mockEmbeddingFor(identity: string, frameSeed = 0, spread = MOCK_JITTER_MAGNITUDE): Embedding {
  const rand = mulberry32(hashSeed(identity));
  const v: number[] = new Array(EMBEDDING_DIM);
  for (let i = 0; i < EMBEDDING_DIM; i++) {
    const base = rand() * 2 - 1;
    const noise =
      frameSeed === 0
        ? 0
        : (mulberry32(hashSeed(identity + ':' + i + ':' + frameSeed))() - 0.5) * spread;
    v[i] = base + noise;
  }
  return l2Normalize(v);
}

export class MockFaceDetector implements IFaceDetector {
  private threshold = 0.75;
  async detectFace(_frameData: string): Promise<FaceDetectionResult> {
    const confidence = 0.97;
    return {
      detected: confidence >= this.threshold,
      boundingBox: { x: 0.3, y: 0.25, w: 0.4, h: 0.5 },
      landmarks: Array.from({ length: 6 }, (_, i) => ({ x: 0.3 + i * 0.02, y: 0.3 + i * 0.02 })),
      confidence,
    };
  }
  async setConfidenceThreshold(value: number): Promise<void> {
    this.threshold = value;
  }
}

export class MockLiveness implements ILiveness {
  private sessions = new Map<string, { type: ChallengeType; frames: number }>();
  private counter = 0;

  async startChallenge(challengeType: ChallengeType | 'random'): Promise<LivenessChallengeSession> {
    const order: ChallengeType[] = ['blink', 'smile', 'head_turn'];
    const type = challengeType === 'random' ? order[this.counter % order.length] : challengeType;
    const sessionId = `mock-sess-${++this.counter}`;
    this.sessions.set(sessionId, { type, frames: 0 });
    return { sessionId, challengeType: type };
  }

  async evaluateFrame(sessionId: string, _frameData: string): Promise<LivenessFrameResult> {
    const s = this.sessions.get(sessionId);
    if (!s) throw new Error(`Unknown session ${sessionId}`);
    s.frames++;
    const finished = s.frames >= 3; // mock: gesture confirmed after 3 frames
    return { sessionId, progress: Math.min(1, s.frames / 3), passed: finished, finished };
  }

  async getSessionResult(sessionId: string): Promise<LivenessSessionResult> {
    const s = this.sessions.get(sessionId);
    if (!s) throw new Error(`Unknown session ${sessionId}`);
    return { passed: s.frames >= 3, challengeType: s.type, framesProcessed: s.frames, elapsedMs: s.frames * 33 };
  }

  async cancelSession(sessionId: string): Promise<void> {
    this.sessions.delete(sessionId);
  }
}

export class MockEmbedding implements IEmbedding {
  /**
   * Identity is encoded into frameData by the demo/test harness as
   * "identity[#frameSeed[#spread]]". The optional spread token lets the demo simulate
   * lighting/angle variation so multi-template selection has something to work with.
   */
  async generateEmbedding(frameData: string): Promise<EmbeddingResultLite> {
    const [identity, frame, spread] = frameData.split('#');
    const frameSeed = frame ? Number(frame) || 0 : 0;
    const spreadVal = spread ? Number(spread) : undefined;
    const embedding = mockEmbeddingFor(identity || 'demo-user', frameSeed, spreadVal);
    return { embedding, inferenceMs: 40 };
  }
  async averageEmbeddings(embeddings: Embedding[]): Promise<Embedding> {
    return avgEmbeddings(embeddings);
  }
}

type EmbeddingResultLite = { embedding: Embedding; inferenceMs: number };
