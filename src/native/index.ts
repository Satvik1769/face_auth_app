/**
 * Native module resolver. On a real device the RN NativeModules are present and
 * used; otherwise (simulator without models, CI, laptop demo) the deterministic
 * mock implementations stand in. The rest of the app codes against the
 * interfaces only and never knows which is active.
 */
import { IEmbedding, IFaceDetector, ILiveness } from './bridgeTypes';
import { MockEmbedding, MockFaceDetector, MockLiveness } from './mockInference';

let useMock = true;
let nativeFaceDetector: IFaceDetector | null = null;
let nativeLiveness: ILiveness | null = null;
let nativeEmbedding: IEmbedding | null = null;

try {
  // Lazy require so Node/test environments without react-native don't crash.
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const RN = require('react-native');
  const nm = RN?.NativeModules ?? {};
  if (nm.FaceDetectorModule && nm.LivenessModule && nm.EmbeddingModule) {
    nativeFaceDetector = nm.FaceDetectorModule as IFaceDetector;
    nativeLiveness = nm.LivenessModule as ILiveness;
    nativeEmbedding = nm.EmbeddingModule as IEmbedding;
    useMock = false;
  }
} catch {
  useMock = true;
}

export const isUsingMockInference = (): boolean => useMock;

export const FaceDetector: IFaceDetector = nativeFaceDetector ?? new MockFaceDetector();
export const Liveness: ILiveness = nativeLiveness ?? new MockLiveness();
export const Embedding: IEmbedding = nativeEmbedding ?? new MockEmbedding();

export * from './bridgeTypes';
