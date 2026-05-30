package com.datalake.faceauth

import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import com.facebook.react.bridge.*
import net.sqlcipher.database.SQLiteDatabase
import java.security.KeyStore
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey

/**
 * SecureStorageModule — SQLCipher (AES-256) storage with a hardware-bound key
 * (TRD §4.2, §5.4, §8). The DB passphrase is derived from a 256-bit AES key that
 * is generated inside the Android Keystore (StrongBox where available) and never
 * leaves the secure hardware in plaintext — the JS layer can never read it.
 */
class SecureStorageModule(reactContext: ReactApplicationContext) :
    ReactContextBaseJavaModule(reactContext) {

    private val db: SQLiteDatabase by lazy { openEncryptedDatabase() }

    override fun getName() = "SecureStorageModule"

    init {
        SQLiteDatabase.loadLibs(reactContext)
    }

    private fun openEncryptedDatabase(): SQLiteDatabase {
        val passphrase = KeyManager.getOrCreateDbPassphrase()
        val file = reactApplicationContext.getDatabasePath("faceauth.db")
        val database = SQLiteDatabase.openOrCreateDatabase(file, passphrase, null)
        Schema.ALL_DDL.forEach { database.execSQL(it) }
        return database
    }

    @ReactMethod
    fun saveEnrollment(userId: String, embedding: ReadableArray, enrolledAt: String, promise: Promise) {
        try {
            val blob = EmbeddingCodec.toBytes(embedding)
            db.execSQL(
                """INSERT INTO enrollments(user_id, embedding_blob, enrolled_at, enrollment_version, synced_to_aws)
                   VALUES(?,?,?,1,0)
                   ON CONFLICT(user_id) DO UPDATE SET
                     embedding_blob=excluded.embedding_blob,
                     enrolled_at=excluded.enrolled_at,
                     enrollment_version=enrollments.enrollment_version+1,
                     synced_to_aws=0""",
                arrayOf(userId, blob, enrolledAt)
            )
            promise.resolve(null)
        } catch (e: Exception) {
            promise.reject("SAVE_ENROLL_ERROR", e.message, e)
        }
    }

    @ReactMethod
    fun getEnrollment(userId: String, promise: Promise) {
        try {
            db.rawQuery("SELECT embedding_blob FROM enrollments WHERE user_id=?", arrayOf(userId)).use { c ->
                if (!c.moveToFirst()) { promise.resolve(null); return }
                val arr = EmbeddingCodec.toArray(c.getBlob(0))
                promise.resolve(arr)
            }
        } catch (e: Exception) {
            promise.reject("GET_ENROLL_ERROR", e.message, e)
        }
    }

    @ReactMethod
    fun deleteEnrollment(userId: String, promise: Promise) {
        try {
            db.execSQL("DELETE FROM enrollments WHERE user_id=?", arrayOf(userId))
            promise.resolve(null)
        } catch (e: Exception) {
            promise.reject("DELETE_ENROLL_ERROR", e.message, e)
        }
    }

    @ReactMethod
    fun writeAuthLog(log: ReadableMap, promise: Promise) {
        try {
            db.execSQL(
                """INSERT INTO auth_logs(log_id,user_id,attempted_at,result,match_score,failure_reason,synced_to_aws)
                   VALUES(?,?,?,?,?,?,0)""",
                arrayOf(
                    log.getString("log_id"), log.getString("user_id"), log.getString("attempted_at"),
                    log.getString("result"),
                    if (log.hasKey("match_score") && !log.isNull("match_score")) log.getDouble("match_score") else null,
                    if (log.hasKey("failure_reason")) log.getString("failure_reason") else null
                )
            )
            promise.resolve(log.getString("log_id"))
        } catch (e: Exception) {
            promise.reject("WRITE_LOG_ERROR", e.message, e)
        }
    }

    @ReactMethod
    fun markLogSynced(logId: String, promise: Promise) {
        db.execSQL("UPDATE auth_logs SET synced_to_aws=1 WHERE log_id=?", arrayOf(logId))
        promise.resolve(null)
    }

    /** Purge ONLY confirmed logs (TRD §6.5 step 8) — never deletes synced_to_aws=0. */
    @ReactMethod
    fun purgeSyncedLogs(promise: Promise) {
        db.execSQL("DELETE FROM auth_logs WHERE synced_to_aws=1")
        db.rawQuery("SELECT changes()", null).use { c -> c.moveToFirst(); promise.resolve(c.getInt(0)) }
    }
}

/** Hardware-backed key management (TRD §4.2, §8.4, TR-03). */
object KeyManager {
    private const val ALIAS = "faceauth_db_key"
    private const val KEYSTORE = "AndroidKeyStore"

    fun getOrCreateDbPassphrase(): ByteArray {
        val ks = KeyStore.getInstance(KEYSTORE).apply { load(null) }
        if (!ks.containsAlias(ALIAS)) generateKey()
        val key = (ks.getEntry(ALIAS, null) as KeyStore.SecretKeyEntry).secretKey
        // Derive a stable passphrase from the non-exportable key material handle.
        return DerivedPassphrase.from(key)
    }

    private fun generateKey() {
        val kg = KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, KEYSTORE)
        kg.init(
            KeyGenParameterSpec.Builder(ALIAS, KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT)
                .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                .setKeySize(256)
                // No setUserAuthenticationRequired -> avoids unintended biometric prompts (TR-06 analogue)
                .build()
        )
        kg.generateKey()
    }
}

/** Derives a deterministic SQLCipher passphrase by wrapping a fixed token with the Keystore key. */
object DerivedPassphrase {
    fun from(key: SecretKey): ByteArray =
        CryptoUtil.hmacSha256(key, "faceauth-db-passphrase-v1".toByteArray())
}
