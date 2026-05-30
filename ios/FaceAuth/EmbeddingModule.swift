import Foundation
import TensorFlowLite

/**
 EmbeddingModule (iOS) — MobileFaceNet INT8 via TensorFlowLiteSwift (TRD §3.3, §5.3).
 Input  : 112x112 RGB normalised to [-1, 1]
 Output : 128-dim float32, L2-normalised.
 Mirrors the Android EmbeddingModule so JS sees one contract on both platforms.
 */
@objc(EmbeddingModule)
class EmbeddingModule: NSObject {

  private lazy var interpreter: Interpreter = {
    let path = Bundle.main.path(forResource: "MobileFaceNet", ofType: "tflite")!
    var options = Interpreter.Options()
    options.threadCount = 4
    let interp = try! Interpreter(modelPath: path, options: options)
    try! interp.allocateTensors()
    return interp
  }()

  @objc(generateEmbedding:resolver:rejecter:)
  func generateEmbedding(_ frameBase64: String,
                         resolver resolve: @escaping RCTPromiseResolveBlock,
                         rejecter reject: @escaping RCTPromiseRejectBlock) {
    do {
      let start = DispatchTime.now()
      let input = try ImagePreprocessor.normalizedTensor(frameBase64, size: 112, scale: 2.0, bias: -1.0)
      try interpreter.copy(input, toInputAt: 0)
      try interpreter.invoke()
      let out = try interpreter.output(at: 0)
      let raw = out.data.toFloatArray()
      let embedding = MathUtil.l2Normalize(raw)
      let ms = Double(DispatchTime.now().uptimeNanoseconds - start.uptimeNanoseconds) / 1_000_000.0
      resolve(["embedding": embedding, "inferenceMs": ms])
    } catch {
      reject("EMBEDDING_ERROR", error.localizedDescription, error)
    }
  }

  @objc static func requiresMainQueueSetup() -> Bool { return false }
}
