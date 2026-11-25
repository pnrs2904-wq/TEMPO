package com.tempo.focus.security

import android.content.Context
import android.util.Log
import com.google.android.play.core.integrity.IntegrityManagerFactory
import com.google.android.play.core.integrity.IntegrityTokenRequest
import com.google.android.play.core.integrity.IntegrityTokenResponse
import kotlinx.coroutines.tasks.await

/**
 * Interface representing a provider of Google Play Integrity tokens.
 */
interface PlayIntegrityProvider {
    /**
     * Requests a cryptographically bound integrity token for the given [nonce].
     * Returns null if Play Integrity is unavailable (e.g. Google Play Services not present, or network error).
     */
    suspend fun requestToken(nonce: String): String?
}

/**
 * Production implementation of [PlayIntegrityProvider] using Google Play Integrity API.
 *
 * Acquires genuine Play Integrity tokens bound to the request nonce to authenticate the
 * client to the Tempo backend reflection proxy.
 */
class GooglePlayIntegrityProvider(private val context: Context) : PlayIntegrityProvider {

    private val integrityManager by lazy {
        IntegrityManagerFactory.create(context.applicationContext)
    }

    override suspend fun requestToken(nonce: String): String? {
        return try {
            val request = IntegrityTokenRequest.builder()
                .setNonce(nonce)
                .build()

            val response: IntegrityTokenResponse = integrityManager.requestIntegrityToken(request).await()
            val token = response.token()
            if (!token.isNullOrBlank()) {
                token
            } else {
                null
            }
        } catch (e: Exception) {
            Log.w(TAG, "Play Integrity token acquisition unavailable or failed: ${e.message}")
            null
        }
    }

    companion object {
        private const val TAG = "PlayIntegrity"
    }
}
