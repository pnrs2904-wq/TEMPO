package com.tempo.focus.data.auth

import android.content.Context
import org.json.JSONObject

data class StoredAuthSession(
    val accessToken: String,
    val refreshToken: String,
    val userId: String,
    val email: String,
    val expiresAtMillis: Long
) {
    fun isExpired(nowMillis: Long = System.currentTimeMillis()): Boolean =
        nowMillis >= (expiresAtMillis - 60_000L)
}

/**
 * Persists Supabase access & refresh tokens encrypted at rest using [KeystoreCrypto].
 * Excluded from Android Auto Backup and Device Transfer in backup_rules.xml / data_extraction_rules.xml.
 */
class AuthTokenStore(context: Context) {

    private val prefs = context.applicationContext.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)

    fun saveSession(session: StoredAuthSession) {
        val json = JSONObject().apply {
            put("accessToken", session.accessToken)
            put("refreshToken", session.refreshToken)
            put("userId", session.userId)
            put("email", session.email)
            put("expiresAtMillis", session.expiresAtMillis)
        }.toString()
        val encrypted = KeystoreCrypto.encrypt(json)
        prefs.edit().putString(KEY_SESSION_BLOB, encrypted).apply()
    }

    fun loadSession(): StoredAuthSession? {
        val blob = prefs.getString(KEY_SESSION_BLOB, null) ?: return null
        val decrypted = KeystoreCrypto.decrypt(blob) ?: return null
        return try {
            val obj = JSONObject(decrypted)
            StoredAuthSession(
                accessToken = obj.getString("accessToken"),
                refreshToken = obj.getString("refreshToken"),
                userId = obj.getString("userId"),
                email = obj.getString("email"),
                expiresAtMillis = obj.getLong("expiresAtMillis")
            )
        } catch (_: Throwable) {
            null
        }
    }

    fun clear() {
        prefs.edit().remove(KEY_SESSION_BLOB).apply()
    }

    companion object {
        const val PREFS_NAME = "tempo_auth_keystore_prefs"
        private const val KEY_SESSION_BLOB = "enc_supabase_session_v1"
    }
}
