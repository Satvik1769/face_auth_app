package com.datalake.faceauth

import com.facebook.react.bridge.*
import java.util.UUID

/**
 * LivenessModule — wraps MediaPipe Face Mesh (468 landmarks) and applies the
 * EAR / MAR / yaw rules (TRD §3.2, §3.2.1, §5.2). The same metric thresholds as
 * the JS LivenessMetrics module are used so behaviour matches the unit tests.
 *
 * Note: the per-frame decision logic mirrors src/liveness/LivenessSession.ts.
 * Keeping a single source of truth for thresholds (Constants) prevents drift.
 */
class LivenessModule(reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    private val sessions = HashMap<String, LivenessState>()

    override fun getName() = "LivenessModule"

    @ReactMethod
    fun startChallenge(challengeType: String, promise: Promise) {
        val type = if (challengeType == "random")
            arrayOf("blink", "smile", "head_turn").random() else challengeType
        val id = UUID.randomUUID().toString()
        sessions[id] = LivenessState(type)
        val res = Arguments.createMap()
        res.putString("sessionId", id)
        res.putString("challengeType", type)
        promise.resolve(res)
    }

    @ReactMethod
    fun evaluateFrame(sessionId: String, frameDataBase64: String, promise: Promise) {
        val state = sessions[sessionId] ?: run {
            promise.reject("NO_SESSION", "Unknown session $sessionId"); return
        }
        try {
            val landmarks = FaceMesh.infer(reactApplicationContext, frameDataBase64) // 468 pts
            val finished = state.consume(landmarks)
            val res = Arguments.createMap()
            res.putString("sessionId", sessionId)
            res.putDouble("progress", state.progress())
            res.putBoolean("passed", state.passed)
            res.putBoolean("finished", finished)
            promise.resolve(res)
        } catch (e: Exception) {
            promise.reject("LIVENESS_ERROR", e.message, e)
        }
    }

    @ReactMethod
    fun getSessionResult(sessionId: String, promise: Promise) {
        val state = sessions[sessionId] ?: run {
            promise.reject("NO_SESSION", "Unknown session $sessionId"); return
        }
        val res = Arguments.createMap()
        res.putBoolean("passed", state.passed)
        res.putString("challengeType", state.challengeType)
        res.putInt("framesProcessed", state.framesProcessed)
        res.putDouble("elapsedMs", state.elapsedMs().toDouble())
        promise.resolve(res)
    }

    @ReactMethod
    fun cancelSession(sessionId: String, promise: Promise) {
        sessions.remove(sessionId)
        promise.resolve(null)
    }
}
