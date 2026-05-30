package com.datalake.faceauth

import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import org.tensorflow.lite.Interpreter

/**
 * FaceDetectorModule — wraps the BlazeFace INT8 TFLite model (TRD §3.1, §5.1).
 *
 * Input : 128x128 RGB, normalised to [-1, 1]
 * Output: bounding box + 6 keypoints + confidence.
 * Frames below the confidence threshold (default 0.75) are reported undetected.
 * Target: < 10 ms per frame on the min-spec device.
 */
class FaceDetectorModule(reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    @Volatile private var confidenceThreshold = 0.75f

    private val interpreter: Interpreter by lazy {
        val options = Interpreter.Options().apply { numThreads = 2; setUseXNNPACK(true) }
        Interpreter(ModelAssets.loadMappedFile(reactApplicationContext, "BlazeFace.tflite"), options)
    }

    override fun getName() = "FaceDetectorModule"

    @ReactMethod
    fun setConfidenceThreshold(value: Double, promise: Promise) {
        confidenceThreshold = value.toFloat()
        promise.resolve(null)
    }

    @ReactMethod
    fun detectFace(frameDataBase64: String, promise: Promise) {
        try {
            val input = ImagePreprocessor.toNormalizedTensor(frameDataBase64, 128, 128, scale = 2f, bias = -1f)
            // BlazeFace post-processing (anchors -> NMS) lives in BlazeFacePostProcessor.
            val detection = BlazeFacePostProcessor.run(interpreter, input, confidenceThreshold)

            val result = Arguments.createMap()
            result.putBoolean("detected", detection != null)
            result.putDouble("confidence", detection?.confidence?.toDouble() ?: 0.0)
            val box = Arguments.createMap()
            box.putDouble("x", detection?.x?.toDouble() ?: 0.0)
            box.putDouble("y", detection?.y?.toDouble() ?: 0.0)
            box.putDouble("w", detection?.w?.toDouble() ?: 0.0)
            box.putDouble("h", detection?.h?.toDouble() ?: 0.0)
            result.putMap("boundingBox", box)
            val landmarks = Arguments.createArray()
            detection?.landmarks?.forEach { (lx, ly) ->
                val lm = Arguments.createMap(); lm.putDouble("x", lx.toDouble()); lm.putDouble("y", ly.toDouble())
                landmarks.pushMap(lm)
            }
            result.putArray("landmarks", landmarks)
            promise.resolve(result)
        } catch (e: Exception) {
            promise.reject("DETECT_ERROR", e.message, e)
        }
    }
}
