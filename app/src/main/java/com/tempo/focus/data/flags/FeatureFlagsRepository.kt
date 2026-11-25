package com.tempo.focus.data.flags

import android.content.Context
import com.tempo.focus.BuildConfig
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.withContext
import okhttp3.OkHttpClient
import okhttp3.Request
import org.json.JSONObject
import java.util.concurrent.TimeUnit

data class FeatureFlags(
    val examPrep: Boolean = true,
    val aiReflections: Boolean = false,
    val institutes: Boolean = false,
    val fetchedAtMillis: Long = 0L
) {
    companion object {
        val SAFE_DEFAULTS = FeatureFlags(
            examPrep = true,
            aiReflections = false,
            institutes = false,
            fetchedAtMillis = 0L
        )
    }
}

/**
 * Fetches GET /api/flags with 1-hour cache, falling back to cached values and then safe defaults.
 */
class FeatureFlagsRepository(
    context: Context,
    private val apiBaseUrl: String = BuildConfig.TEMPO_API_BASE_URL,
    private val httpClient: OkHttpClient = OkHttpClient.Builder()
        .connectTimeout(8, TimeUnit.SECONDS)
        .readTimeout(10, TimeUnit.SECONDS)
        .build()
) {
    private val prefs = context.applicationContext.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)

    private val _flags = MutableStateFlow(loadCachedOrDefault())
    val flags: StateFlow<FeatureFlags> = _flags.asStateFlow()

    fun loadCachedOrDefault(): FeatureFlags {
        val raw = prefs.getString(KEY_FLAGS_JSON, null) ?: return FeatureFlags.SAFE_DEFAULTS
        return try {
            val obj = JSONObject(raw)
            FeatureFlags(
                examPrep = obj.optBoolean("exam_prep", true),
                aiReflections = obj.optBoolean("ai_reflections", false),
                institutes = obj.optBoolean("institutes", false),
                fetchedAtMillis = obj.optLong("fetchedAtMillis", 0L)
            )
        } catch (_: Throwable) {
            FeatureFlags.SAFE_DEFAULTS
        }
    }

    suspend fun refreshIfStale(nowMillis: Long = System.currentTimeMillis(), force: Boolean = false): FeatureFlags {
        val cached = _flags.value
        if (!force && cached.fetchedAtMillis > 0L && (nowMillis - cached.fetchedAtMillis) < CACHE_TTL_MS) {
            return cached
        }
        if (!apiBaseUrl.startsWith("https://")) {
            return cached
        }

        return withContext(Dispatchers.IO) {
            try {
                val req = Request.Builder()
                    .url("${apiBaseUrl.trimEnd('/')}/api/flags")
                    .get()
                    .build()
                httpClient.newCall(req).execute().use { resp ->
                    if (!resp.isSuccessful) return@withContext cached
                    val root = JSONObject(resp.body?.string().orEmpty())
                    val flagsObj = root.optJSONObject("flags") ?: root
                    val updated = FeatureFlags(
                        examPrep = flagsObj.optBoolean("exam_prep", true),
                        aiReflections = flagsObj.optBoolean("ai_reflections", false),
                        institutes = flagsObj.optBoolean("institutes", false),
                        fetchedAtMillis = nowMillis
                    )
                    saveCache(updated)
                    _flags.value = updated
                    updated
                }
            } catch (_: Throwable) {
                // Offline fallback to cached values (or safe defaults)
                cached
            }
        }
    }

    private fun saveCache(flags: FeatureFlags) {
        val json = JSONObject().apply {
            put("exam_prep", flags.examPrep)
            put("ai_reflections", flags.aiReflections)
            put("institutes", flags.institutes)
            put("fetchedAtMillis", flags.fetchedAtMillis)
        }.toString()
        prefs.edit().putString(KEY_FLAGS_JSON, json).apply()
    }

    companion object {
        private const val PREFS_NAME = "tempo_feature_flags_cache"
        private const val KEY_FLAGS_JSON = "flags_json_v1"
        const val CACHE_TTL_MS = 60L * 60L * 1000L // 1 hour
    }
}
