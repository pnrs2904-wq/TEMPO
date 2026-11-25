package com.tempo.focus.data.auth

import com.tempo.focus.BuildConfig
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.withContext
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONObject
import java.util.concurrent.TimeUnit

data class AuthAccountState(
    val isSignedIn: Boolean = false,
    val userId: String? = null,
    val email: String? = null,
    val isBusy: Boolean = false,
    val statusMessage: String? = null,
    val isConfigured: Boolean = false
)

sealed class AuthResult {
    data class Success(val message: String, val session: StoredAuthSession? = null) : AuthResult()
    data class Failure(val message: String) : AuthResult()
}

/**
 * Supabase Auth client for Tempo 4.0.
 * Supports email/password sign-in & sign-up, magic link, Google ID token exchange,
 * password reset, sign-out (keeping local data intact), and DELETE /api/account.
 * Never logs or exposes access/refresh tokens.
 */
class SupabaseAuthRepository(
    private val tokenStore: AuthTokenStore,
    private val supabaseUrl: String = BuildConfig.SUPABASE_URL,
    private val supabaseAnonKey: String = BuildConfig.SUPABASE_ANON_KEY,
    private val apiBaseUrl: String = BuildConfig.TEMPO_API_BASE_URL,
    private val httpClient: OkHttpClient = defaultHttpClient()
) {
    private val jsonMediaType = "application/json; charset=utf-8".toMediaType()

    private val _accountState = MutableStateFlow(buildInitialState())
    val accountState: StateFlow<AuthAccountState> = _accountState.asStateFlow()

    val isConfigured: Boolean
        get() = supabaseUrl.startsWith("https://") && supabaseAnonKey.isNotBlank()

    private fun buildInitialState(): AuthAccountState {
        val existing = tokenStore.loadSession()
        return AuthAccountState(
            isSignedIn = existing != null,
            userId = existing?.userId,
            email = existing?.email,
            isConfigured = isConfigured
        )
    }

    fun getCurrentAccessToken(): String? = tokenStore.loadSession()?.accessToken

    suspend fun getValidAccessToken(): String? {
        val session = tokenStore.loadSession() ?: return null
        if (!session.isExpired()) return session.accessToken
        return refreshAccessToken(session.refreshToken)?.accessToken
    }

    suspend fun signInWithEmailPassword(email: String, password: String): AuthResult {
        val cleanEmail = email.trim()
        if (cleanEmail.isBlank() || password.length < 6) {
            return AuthResult.Failure("Enter a valid email address and password (6+ characters).")
        }
        if (!isConfigured) {
            return AuthResult.Failure("Cloud account is not configured in this build. Local offline mode remains active.")
        }
        return executeTokenRequest(
            endpoint = "${supabaseUrl.trimEnd('/')}/auth/v1/token?grant_type=password",
            payload = JSONObject().apply {
                put("email", cleanEmail)
                put("password", password)
            },
            successMessage = "Signed in as $cleanEmail"
        )
    }

    suspend fun signUpWithEmailPassword(email: String, password: String): AuthResult {
        val cleanEmail = email.trim()
        if (cleanEmail.isBlank() || !cleanEmail.contains("@")) {
            return AuthResult.Failure("Enter a valid email address.")
        }
        if (password.length < 8) {
            return AuthResult.Failure("Password must be at least 8 characters.")
        }
        if (!isConfigured) {
            return AuthResult.Failure("Cloud account is not configured in this build. Local offline mode remains active.")
        }
        _accountState.value = _accountState.value.copy(isBusy = true, statusMessage = null)
        return withContext(Dispatchers.IO) {
            try {
                val body = JSONObject().apply {
                    put("email", cleanEmail)
                    put("password", password)
                }.toString().toRequestBody(jsonMediaType)

                val req = Request.Builder()
                    .url("${supabaseUrl.trimEnd('/')}/auth/v1/signup")
                    .addHeader("apikey", supabaseAnonKey)
                    .addHeader("Content-Type", "application/json")
                    .post(body)
                    .build()

                httpClient.newCall(req).execute().use { resp ->
                    val raw = resp.body?.string().orEmpty()
                    if (!resp.isSuccessful) {
                        val msg = extractErrorMessage(raw, "Sign-up failed (${resp.code}).")
                        _accountState.value = _accountState.value.copy(isBusy = false, statusMessage = msg)
                        return@withContext AuthResult.Failure(msg)
                    }
                    val parsed = parseSessionIfPresent(raw)
                    if (parsed != null) {
                        tokenStore.saveSession(parsed)
                        _accountState.value = AuthAccountState(
                            isSignedIn = true,
                            userId = parsed.userId,
                            email = parsed.email,
                            isBusy = false,
                            statusMessage = "Account created and signed in.",
                            isConfigured = isConfigured
                        )
                        AuthResult.Success("Account created and signed in.", parsed)
                    } else {
                        val msg = "Check $cleanEmail to confirm your account, then sign in."
                        _accountState.value = _accountState.value.copy(isBusy = false, statusMessage = msg)
                        AuthResult.Success(msg, null)
                    }
                }
            } catch (_: Throwable) {
                val msg = "Network unavailable. Your study data stays safely saved on this device."
                _accountState.value = _accountState.value.copy(isBusy = false, statusMessage = msg)
                AuthResult.Failure(msg)
            }
        }
    }

    suspend fun sendMagicLink(email: String): AuthResult {
        val cleanEmail = email.trim()
        if (cleanEmail.isBlank() || !cleanEmail.contains("@")) {
            return AuthResult.Failure("Enter a valid email address.")
        }
        if (!isConfigured) {
            return AuthResult.Failure("Cloud account is not configured in this build.")
        }
        return postSimpleAuthAction(
            endpoint = "${supabaseUrl.trimEnd('/')}/auth/v1/otp",
            payload = JSONObject().apply { put("email", cleanEmail) },
            successMessage = "Magic sign-in link sent to $cleanEmail."
        )
    }

    suspend fun sendPasswordReset(email: String): AuthResult {
        val cleanEmail = email.trim()
        if (cleanEmail.isBlank() || !cleanEmail.contains("@")) {
            return AuthResult.Failure("Enter your account email address first.")
        }
        if (!isConfigured) {
            return AuthResult.Failure("Cloud account is not configured in this build.")
        }
        return postSimpleAuthAction(
            endpoint = "${supabaseUrl.trimEnd('/')}/auth/v1/recover",
            payload = JSONObject().apply { put("email", cleanEmail) },
            successMessage = "Password reset instructions sent to $cleanEmail."
        )
    }

    suspend fun signInWithGoogleIdToken(idToken: String, nonce: String? = null): AuthResult {
        if (idToken.isBlank()) return AuthResult.Failure("Missing Google ID token.")
        if (!isConfigured) return AuthResult.Failure("Cloud account is not configured in this build.")
        val payload = JSONObject().apply {
            put("provider", "google")
            put("id_token", idToken)
            if (!nonce.isNullOrBlank()) put("nonce", nonce)
        }
        return executeTokenRequest(
            endpoint = "${supabaseUrl.trimEnd('/')}/auth/v1/token?grant_type=id_token",
            payload = payload,
            successMessage = "Signed in with Google."
        )
    }

    suspend fun signOut(clearLocalData: suspend () -> Unit = {}): AuthResult {
        tokenStore.clear()
        clearLocalData()
        _accountState.value = AuthAccountState(
            isSignedIn = false,
            userId = null,
            email = null,
            isBusy = false,
            statusMessage = "Signed out. Local data remains available unless cleared.",
            isConfigured = isConfigured
        )
        return AuthResult.Success("Signed out.")
    }

    /**
     * Permanently deletes the user's cloud account via DELETE /api/account.
     * Requires explicit confirmation in the UI ("DELETE").
     */
    suspend fun deleteAccount(onLocalWipe: suspend () -> Unit): AuthResult {
        val token = getValidAccessToken()
        if (token.isNullOrBlank() || !apiBaseUrl.startsWith("https://")) {
            return AuthResult.Failure("Sign in with an active internet connection to delete your cloud account, or use https://tempo.example.com/delete-account.")
        }
        _accountState.value = _accountState.value.copy(isBusy = true, statusMessage = null)
        return withContext(Dispatchers.IO) {
            try {
                val req = Request.Builder()
                    .url("${apiBaseUrl.trimEnd('/')}/api/account")
                    .addHeader("Authorization", "Bearer $token")
                    .delete()
                    .build()

                httpClient.newCall(req).execute().use { resp ->
                    if (!resp.isSuccessful) {
                        val msg = extractErrorMessage(resp.body?.string().orEmpty(), "Account deletion failed (${resp.code}).")
                        _accountState.value = _accountState.value.copy(isBusy = false, statusMessage = msg)
                        return@withContext AuthResult.Failure(msg)
                    }
                    tokenStore.clear()
                    onLocalWipe()
                    _accountState.value = AuthAccountState(
                        isSignedIn = false,
                        userId = null,
                        email = null,
                        isBusy = false,
                        statusMessage = "Account and cloud data deleted.",
                        isConfigured = isConfigured
                    )
                    AuthResult.Success("Account deleted permanently.")
                }
            } catch (_: Throwable) {
                val msg = "Could not reach Tempo servers to delete account. Try again online or visit https://tempo.example.com/delete-account."
                _accountState.value = _accountState.value.copy(isBusy = false, statusMessage = msg)
                AuthResult.Failure(msg)
            }
        }
    }

    private suspend fun refreshAccessToken(refreshToken: String): StoredAuthSession? {
        if (!isConfigured || refreshToken.isBlank()) return null
        return withContext(Dispatchers.IO) {
            try {
                val payload = JSONObject().apply { put("refresh_token", refreshToken) }
                val req = Request.Builder()
                    .url("${supabaseUrl.trimEnd('/')}/auth/v1/token?grant_type=refresh_token")
                    .addHeader("apikey", supabaseAnonKey)
                    .addHeader("Content-Type", "application/json")
                    .post(payload.toString().toRequestBody(jsonMediaType))
                    .build()
                httpClient.newCall(req).execute().use { resp ->
                    if (!resp.isSuccessful) return@withContext null
                    val parsed = parseSessionIfPresent(resp.body?.string().orEmpty()) ?: return@withContext null
                    tokenStore.saveSession(parsed)
                    parsed
                }
            } catch (_: Throwable) {
                null
            }
        }
    }

    private suspend fun executeTokenRequest(
        endpoint: String,
        payload: JSONObject,
        successMessage: String
    ): AuthResult {
        _accountState.value = _accountState.value.copy(isBusy = true, statusMessage = null)
        return withContext(Dispatchers.IO) {
            try {
                val req = Request.Builder()
                    .url(endpoint)
                    .addHeader("apikey", supabaseAnonKey)
                    .addHeader("Content-Type", "application/json")
                    .post(payload.toString().toRequestBody(jsonMediaType))
                    .build()

                httpClient.newCall(req).execute().use { resp ->
                    val raw = resp.body?.string().orEmpty()
                    if (!resp.isSuccessful) {
                        val msg = extractErrorMessage(raw, "Authentication failed (${resp.code}).")
                        _accountState.value = _accountState.value.copy(isBusy = false, statusMessage = msg)
                        return@withContext AuthResult.Failure(msg)
                    }
                    val parsed = parseSessionIfPresent(raw)
                    if (parsed == null) {
                        val msg = "Unexpected auth response from server."
                        _accountState.value = _accountState.value.copy(isBusy = false, statusMessage = msg)
                        return@withContext AuthResult.Failure(msg)
                    }
                    tokenStore.saveSession(parsed)
                    _accountState.value = AuthAccountState(
                        isSignedIn = true,
                        userId = parsed.userId,
                        email = parsed.email,
                        isBusy = false,
                        statusMessage = successMessage,
                        isConfigured = isConfigured
                    )
                    AuthResult.Success(successMessage, parsed)
                }
            } catch (_: Throwable) {
                val msg = "Network unavailable. Continuing offline with your local study data."
                _accountState.value = _accountState.value.copy(isBusy = false, statusMessage = msg)
                AuthResult.Failure(msg)
            }
        }
    }

    private suspend fun postSimpleAuthAction(
        endpoint: String,
        payload: JSONObject,
        successMessage: String
    ): AuthResult {
        _accountState.value = _accountState.value.copy(isBusy = true, statusMessage = null)
        return withContext(Dispatchers.IO) {
            try {
                val req = Request.Builder()
                    .url(endpoint)
                    .addHeader("apikey", supabaseAnonKey)
                    .addHeader("Content-Type", "application/json")
                    .post(payload.toString().toRequestBody(jsonMediaType))
                    .build()
                httpClient.newCall(req).execute().use { resp ->
                    if (!resp.isSuccessful) {
                        val msg = extractErrorMessage(resp.body?.string().orEmpty(), "Request failed (${resp.code}).")
                        _accountState.value = _accountState.value.copy(isBusy = false, statusMessage = msg)
                        return@withContext AuthResult.Failure(msg)
                    }
                    _accountState.value = _accountState.value.copy(isBusy = false, statusMessage = successMessage)
                    AuthResult.Success(successMessage)
                }
            } catch (_: Throwable) {
                val msg = "Network unavailable."
                _accountState.value = _accountState.value.copy(isBusy = false, statusMessage = msg)
                AuthResult.Failure(msg)
            }
        }
    }

    private fun parseSessionIfPresent(rawJson: String): StoredAuthSession? {
        return try {
            val root = JSONObject(rawJson)
            val accessToken = root.optString("access_token")
            val refreshToken = root.optString("refresh_token")
            if (accessToken.isBlank() || refreshToken.isBlank()) return null
            val expiresInSec = root.optLong("expires_in", 3600L)
            val userObj = root.optJSONObject("user")
            val userId = userObj?.optString("id").orEmpty()
            val email = userObj?.optString("email").orEmpty()
            StoredAuthSession(
                accessToken = accessToken,
                refreshToken = refreshToken,
                userId = userId,
                email = email,
                expiresAtMillis = System.currentTimeMillis() + (expiresInSec * 1000L)
            )
        } catch (_: Throwable) {
            null
        }
    }

    private fun extractErrorMessage(raw: String, fallback: String): String {
        return try {
            val obj = JSONObject(raw)
            obj.optString("error_description")
                .ifBlank { obj.optString("msg") }
                .ifBlank { obj.optString("message") }
                .ifBlank { fallback }
        } catch (_: Throwable) {
            fallback
        }
    }

    companion object {
        fun defaultHttpClient(): OkHttpClient = OkHttpClient.Builder()
            .connectTimeout(12, TimeUnit.SECONDS)
            .readTimeout(15, TimeUnit.SECONDS)
            .writeTimeout(15, TimeUnit.SECONDS)
            .build()
    }
}
