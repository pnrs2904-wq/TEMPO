package com.tempo.focus.domain

import com.tempo.focus.BuildConfig
import com.tempo.focus.data.db.SessionEntity
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.withContext
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONArray
import org.json.JSONObject
import java.io.IOException
import java.util.concurrent.TimeUnit
import java.util.regex.Pattern

object InsightGenerator {

    const val FALLBACK_MESSAGE = "Log a few session notes to unlock personalized insights."

    // Client-side regex to scrub any accidentally typed credentials or emails (best-effort data minimization)
    private val SENSITIVE_PATTERN = Pattern.compile(
        "(?i)(AIza[0-9A-Za-z-_]{30,45}|sk-[a-zA-Z0-9]{20,}|password[\\s=:]+[^\\s]+|api[_-]?key[\\s=:]+[^\\s]+|bearer[\\s=:]+[^\\s]+|[a-zA-Z0-9_.+-]+@[a-zA-Z0-9-]+\\.[a-zA-Z0-9-.]+)"
    )

    // Cooldown tracker to prevent rapid request looping (client-side rate limiting)
    @Volatile
    private var lastRequestTimestamp: Long = 0L
    private const val MIN_REQUEST_INTERVAL_MS = 30_000L // 30 seconds cooldown

    private val httpClient by lazy {
        OkHttpClient.Builder()
            .connectTimeout(15, TimeUnit.SECONDS)
            .readTimeout(15, TimeUnit.SECONDS)
            .writeTimeout(15, TimeUnit.SECONDS)
            .build()
    }

    /**
     * Backward-compatible alias for [generateRecentFocusReflection].
     */
    suspend fun generateWeeklyInsight(
        sessions: List<SessionEntity>,
        backendUrl: String = BuildConfig.TEMPO_BACKEND_URL,
        installationId: String = "",
        playIntegrityToken: String? = null,
        integrityProvider: com.tempo.focus.security.PlayIntegrityProvider? = null
    ): Result<String> {
        return generateRecentFocusReflection(sessions, backendUrl, installationId, playIntegrityToken, integrityProvider)
    }

    /**
     * Generates a reflection on recent focus sessions.
     *
     * Preferred Production Architecture:
     * Tempo Android App -> HTTPS -> Tempo Backend Proxy -> Gemini API
     *
     * - The Android app never bundles Gemini API keys.
     * - If [backendUrl] is configured, requests are sent via TLS with an anonymous installation
     *   identifier (for rate limiting/abuse control, not authentication), a cryptographic nonce for
     *   replay protection, and genuine Google Play Integrity attestation.
     * - If [backendUrl] is not configured (or the device is offline), Tempo safely runs an on-device
     *   habit reflection heuristic with zero data transmission.
     */
    suspend fun generateRecentFocusReflection(
        sessions: List<SessionEntity>,
        backendUrl: String = BuildConfig.TEMPO_BACKEND_URL,
        installationId: String = "",
        playIntegrityToken: String? = null,
        integrityProvider: com.tempo.focus.security.PlayIntegrityProvider? = null
    ): Result<String> = withContext(Dispatchers.IO) {
        try {
            // Data Minimization: Select at most 5 most recent sessions with non-blank notes
            val sessionsWithNotes = sessions
                .filter { !it.notes.isNullOrBlank() }
                .sortedByDescending { it.timestamp }
                .take(5)

            if (sessionsWithNotes.isEmpty()) {
                return@withContext Result.success(FALLBACK_MESSAGE)
            }

            val cleanBackendUrl = backendUrl.trim()

            // If no backend endpoint has been deployed or configured, use safe local on-device heuristic
            if (cleanBackendUrl.isBlank()) {
                return@withContext Result.success(generateLocalReflection(sessionsWithNotes))
            }

            // Security check: Only allow HTTPS connections for the backend
            if (!cleanBackendUrl.startsWith("https://", ignoreCase = true)) {
                return@withContext Result.failure(
                    SecurityException("Insecure backend URL. Only HTTPS endpoints are permitted.")
                )
            }

            // Client-side rate-limiting cooldown check
            val now = System.currentTimeMillis()
            if (now - lastRequestTimestamp < MIN_REQUEST_INTERVAL_MS) {
                return@withContext Result.success(generateLocalReflection(sessionsWithNotes))
            }

            // Input Sanitization: Truncate notes and redact any accidentally typed secrets
            val sanitizedSessions = JSONArray()
            sessionsWithNotes.forEach { s ->
                val cleanSubject = s.subject.trim().take(50).ifBlank { "General" }
                val rawNote = s.notes?.trim()?.take(250) ?: ""
                val sanitizedNote = SENSITIVE_PATTERN.matcher(rawNote).replaceAll("[REDACTED]")

                sanitizedSessions.put(JSONObject().apply {
                    put("subject", cleanSubject)
                    put("energy", s.energy.coerceIn(1, 5))
                    put("plannedMinutes", s.plannedMinutes.coerceIn(1, 180))
                    put("note", sanitizedNote)
                    put("sessionType", s.sessionType.take(30))
                })
            }

            val requestJson = JSONObject().apply {
                put("sessions", sanitizedSessions)
                put("clientTimestamp", now)
            }

            val mediaType = "application/json; charset=utf-8".toMediaType()
            val requestNonce = java.util.UUID.randomUUID().toString()

            val requestBuilder = Request.Builder()
                .url(cleanBackendUrl)
                .post(requestJson.toString().toRequestBody(mediaType))
                .header("X-App-Package", "com.tempo.focus")
                .header("X-App-Version", BuildConfig.VERSION_NAME)
                .header("X-App-Build", BuildConfig.VERSION_CODE.toString())
                .header("X-Request-Timestamp", now.toString())
                .header("X-Request-Nonce", requestNonce)

            // Anonymous installation identifier used strictly for abuse control and rate limiting (not authentication)
            val validInstallationId = if (installationId.isNotBlank()) installationId else java.util.UUID.randomUUID().toString()
            requestBuilder.header("X-Installation-Id", validInstallationId)

            // Play Integrity token acquisition bound to requestNonce:
            val token = if (!playIntegrityToken.isNullOrBlank()) {
                playIntegrityToken.trim()
            } else {
                try {
                    integrityProvider?.requestToken(requestNonce)?.trim()
                } catch (e: Throwable) {
                    null
                }
            }

            if (!token.isNullOrBlank()) {
                requestBuilder.header("X-Play-Integrity-Token", token)
            }

            val request = requestBuilder.build()
            lastRequestTimestamp = now

            val response = httpClient.newCall(request).execute()
            if (!response.isSuccessful) {
                response.close()
                // Graceful fallback to on-device reflection
                return@withContext Result.success(generateLocalReflection(sessionsWithNotes))
            }

            val responseBody = response.body?.string() ?: ""
            response.close()

            val jsonResponse = JSONObject(responseBody)
            val insightText = jsonResponse.optString("insight", "").trim()
            if (insightText.isNotEmpty()) {
                Result.success(insightText)
            } else {
                Result.success(generateLocalReflection(sessionsWithNotes))
            }
        } catch (e: IOException) {
            // Offline or network error: return local on-device reflection safely
            val sessionsWithNotes = sessions.filter { !it.notes.isNullOrBlank() }.take(5)
            if (sessionsWithNotes.isNotEmpty()) {
                Result.success(generateLocalReflection(sessionsWithNotes))
            } else {
                Result.success(FALLBACK_MESSAGE)
            }
        } catch (e: Throwable) {
            val sessionsWithNotes = sessions.filter { !it.notes.isNullOrBlank() }.take(5)
            if (sessionsWithNotes.isNotEmpty()) {
                Result.success(generateLocalReflection(sessionsWithNotes))
            } else {
                Result.success(FALLBACK_MESSAGE)
            }
        }
    }

    /**
     * Privacy-first local heuristic for focus reflections when offline or unconfigured.
     * Uses honest, conservative language rather than unwarranted certainty.
     */
    fun generateLocalReflection(recentSessions: List<SessionEntity>): String {
        if (recentSessions.isEmpty()) return FALLBACK_MESSAGE
        val avgEnergy = recentSessions.map { it.energy }.average()
        val topSubject = recentSessions.groupBy { it.subject.trim().ifBlank { "General" } }
            .maxByOrNull { it.value.size }?.key ?: "General"
        val avgMinutes = recentSessions.map { it.plannedMinutes }.average().toInt()

        val energyLevelText = when {
            avgEnergy >= 4.0 -> "high energy (${String.format(java.util.Locale.US, "%.1f", avgEnergy)}/5)"
            avgEnergy <= 2.5 -> "low energy (${String.format(java.util.Locale.US, "%.1f", avgEnergy)}/5)"
            else -> "moderate energy (${String.format(java.util.Locale.US, "%.1f", avgEnergy)}/5)"
        }

        return when {
            avgEnergy >= 4.0 ->
                "Strong focus momentum logged with $energyLevelText across recent $topSubject sessions. Your recent sessions have commonly used $avgMinutes-minute intervals."
            avgEnergy <= 2.5 ->
                "Recent sessions reflect $energyLevelText. Pacing $topSubject in shorter blocks and honoring breaks will help protect stamina."
            else ->
                "Consistent pacing observed across recent $topSubject sessions with $energyLevelText. Your recent sessions have commonly used $avgMinutes-minute focus intervals for steady progress."
        }
    }
}
