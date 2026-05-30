/**
 * Native bridge contracts (TRD §5). The JS layer depends only on these
 * interfaces; concrete implementations are either the real RN NativeModules
 * (on device) or the deterministic mock (Node/test/demo-without-models).
 */
import { ChallengeType, Embedding } from '../core/types';

export interface FaceDetectionResult {
  detected: boolean;
  boundingBox: { x: number; y: number; w: number; h: number };
  landmarks: Array<{ x: number; y: number }>; // 6 BlazeFace keypoints
  confidence: number;
}

export interface IFaceDetector {
  detectFace(frameData: string): Promise<FaceDetectionResult>;
  setConfidenceThreshold(value: number): Promise<void>;
}

export interface LivenessChallengeSession {
  sessionId: string;
  challengeType: ChallengeType;
}

export interface LivenessFrameResult {
  sessionId: string;
  progress: number; // 0..1
  passed: boolean;
  finished: boolean;
}

export interface LivenessSessionResult {
  passed: boolean;
  challengeType: ChallengeType;
  framesProcessed: number;
  elapsedMs: number;
}

export interface ILiveness {
  startChallenge(challengeType: ChallengeType | 'random'): Promise<LivenessChallengeSession>;
  evaluateFrame(sessionId: string, frameData: string): Promise<LivenessFrameResult>;
  getSessionResult(sessionId: string): Promise<LivenessSessionResult>;
  cancelSession(sessionId: string): Promise<void>;
}

export interface EmbeddingResult {
  embedding: Embedding; // 128-dim L2-normalised
  inferenceMs: number;
}

export interface IEmbedding {
  generateEmbedding(frameData: string): Promise<EmbeddingResult>;
  averageEmbeddings(embeddings: Embedding[]): Promise<Embedding>;
}
