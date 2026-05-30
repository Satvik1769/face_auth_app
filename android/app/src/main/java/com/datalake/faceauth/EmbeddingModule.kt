package com.datalake.faceauth

import com.facebook.react.bridge.Arguments
import com.facebook.react.bridge.Promise
import com.facebook.react.bridge.ReactApplicationContext
import com.facebook.react.bridge.ReactContextBaseJavaModule
import com.facebook.react.bridge.ReactMethod
import com.facebook.react.bridge.ReadableArray
import org.tensorflow.lite.Interpreter
import java.nio.ByteBuffer
import java.nio.ByteOrder
import kotlin.math.sqrt

/**
 * EmbeddingModule — wraps the MobileFaceNet INT8 TFLite model (TRD §3.3, §5.3).
 *
 * Input : 112x112 RGB, normalised to [-1, 1]
 * Output: 128-dim float32, L2-normalised before returning.
 * Target: < 80 ms on the min-spec device (CPU, 4 threads).
 *
 * The model is loaded once and reused; XNNPACK is enabled for CPU acceleration.
 */
class EmbeddingModule(reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    private val interpreter: Interpreter by lazy {
        val options = Interpreter.Options().apply {
            numThreads = 4
            setUseXNNPACK(true)
        }
        Interpreter(ModelAssets.loadMappedFile(reactApplicationContext, "MobileFaceNet.tflite"), options)
    }

    override fun getName() = "EmbeddingModule"

    @ReactMethod
    fun generateEmbedding(frameDataBase64: String, promise: Promise) {
        try {
            val started = System.nanoTime()
            // 112x112x3 float32 input tensor, normalised to [-1, 1].
            val input = ImagePreprocessor.toNormalizedTensor(frameDataBase64, 112, 112, scale = 2f, bias = -1f)
            val output = Array(1) { FloatArray(EMBEDDING_DIM) }
            interpreter.run(input, output)
            val embedding = l2Normalize(output[0])
            val inferenceMs = (System.nanoTime() - started) / 1_000_000.0

            val result = Arguments.createMap()
            val arr = Arguments.createArray()
            embedding.forEach { arr.pushDouble(it.toDouble()) }
            result.putArray("embedding", arr)
            result.putDouble("inferenceMs", inferenceMs)
            promise.resolve(result)
        } catch (e: Exception) {
            promise.reject("EMBEDDING_ERROR", e.message, e)
        }
    }

    @ReactMethod
    fun averageEmbeddings(embeddings: ReadableArray, promise: Promise) {
        try {
            val acc = FloatArray(EMBEDDING_DIM)
            for (i in 0 until embeddings.size()) {
                val v = embeddings.getArray(i)!!
                for (j in 0 until EMBEDDING_DIM) acc[j] += v.getDouble(j).toFloat()
            }
            for (j in 0 until EMBEDDING_DIM) acc[j] /= embeddings.size()
            val normalised = l2Normalize(acc)
            val arr = Arguments.createArray()
            normalised.forEach { arr.pushDouble(it.toDouble()) }
            promise.resolve(arr)
        } catch (e: Exception) {
            promise.reject("AVERAGE_ERROR", e.message, e)
        }
    }

    private fun l2Normalize(v: FloatArray): FloatArray {
        var sum = 0f
        for (x in v) sum += x * x
        val norm = sqrt(sum)
        require(norm > 0f) { "Cannot normalise a zero embedding" }
        return FloatArray(v.size) { v[it] / norm }
    }

    companion object {
        const val EMBEDDING_DIM = 128
    }
}
