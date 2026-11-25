package com.tempo.focus.data.billing

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

enum class BillingSource(val value: String, val label: String) {
    NONE("none", "Free Plan"),
    GOOGLE_PLAY("google_play", "Google Play"),
    RAZORPAY("razorpay", "Web (Razorpay)"),
    /** Launch offer: Pro free for every signed-in account until the server's freeAccessUntil. */
    FREE_ACCESS("free_access", "Launch offer");

    companion object {
        fun fromValue(raw: String?): BillingSource =
            entries.firstOrNull { it.value.equals(raw, ignoreCase = true) } ?: NONE
    }
}

enum class EntitlementStatus(val value: String) {
    NONE("none"),
    ACTIVE("active"),
    GRACE_PERIOD("grace_period"),
    ACCOUNT_HOLD("account_hold"),
    PENDING("pending"),
    CANCELLED("cancelled");

    companion object {
        fun fromValue(raw: String?): EntitlementStatus =
            entries.firstOrNull { it.value.equals(raw, ignoreCase = true) } ?: NONE
    }
}

data class BillingProductOffer(
    val productId: String,
    val title: String,
    val formattedPrice: String, // Always supplied by Google Play Billing; never hardcoded!
    val billingPeriodLabel: String,
    val isOneTime: Boolean = false
)

enum class PlayPurchaseState {
    PURCHASED,
    PENDING,
    CANCELLED,
    ERROR
}

data class PlayPurchaseRecord(
    val productId: String,
    val purchaseToken: String,
    val orderId: String?,
    val state: PlayPurchaseState,
    val isAcknowledged: Boolean = false,
    val isOneTime: Boolean = false
)

data class EntitlementState(
    val isPro: Boolean = false,
    val source: BillingSource = BillingSource.NONE,
    val status: EntitlementStatus = EntitlementStatus.NONE,
    val productId: String? = null,
    val expiresAtIso: String? = null,
    val products: List<BillingProductOffer> = emptyList(),
    val statusMessage: String? = null,
    val isBusy: Boolean = false
)

/**
 * Clean abstraction over Google Play Billing Library v7.
 * Production builds with Maven access attach the Play Billing Library implementation;
 * JVM unit tests attach a deterministic fake gateway.
 */
interface PlayBillingGateway {
    suspend fun queryProducts(productIds: List<String>): Result<List<BillingProductOffer>>
    suspend fun launchPurchase(productId: String): PlayPurchaseRecord
    suspend fun acknowledgePurchase(purchaseToken: String): Result<Unit>
    suspend fun consumePurchase(purchaseToken: String): Result<Unit>
    suspend fun queryActivePurchases(): Result<List<PlayPurchaseRecord>>
}

/**
 * Backend verification & entitlement contract matching docs/API.md:
 * - POST /api/billing/play/verify
 * - GET /api/me
 */
interface BillingBackendApi {
    suspend fun verifyPlayPurchase(
        accessToken: String,
        productId: String,
        purchaseToken: String,
        orderId: String?
    ): Result<Boolean>

    suspend fun fetchEntitlement(accessToken: String): Result<RemoteEntitlement>
}

data class RemoteEntitlement(
    val isPro: Boolean,
    val source: BillingSource,
    val status: EntitlementStatus,
    val productId: String?,
    val expiresAtIso: String?
)

class HttpBillingBackendApi(
    private val apiBaseUrl: String = BuildConfig.TEMPO_API_BASE_URL,
    private val httpClient: OkHttpClient = OkHttpClient.Builder()
        .connectTimeout(12, TimeUnit.SECONDS)
        .readTimeout(15, TimeUnit.SECONDS)
        .build()
) : BillingBackendApi {
    private val jsonMediaType = "application/json; charset=utf-8".toMediaType()

    override suspend fun verifyPlayPurchase(
        accessToken: String,
        productId: String,
        purchaseToken: String,
        orderId: String?
    ): Result<Boolean> = withContext(Dispatchers.IO) {
        if (!apiBaseUrl.startsWith("https://")) {
            return@withContext Result.failure(IllegalStateException("Backend URL not configured."))
        }
        try {
            val payload = JSONObject().apply {
                put("productId", productId)
                put("purchaseToken", purchaseToken)
                put("packageName", BuildConfig.APPLICATION_ID)
                if (!orderId.isNullOrBlank()) put("orderId", orderId)
            }
            val req = Request.Builder()
                .url("${apiBaseUrl.trimEnd('/')}/api/billing/play/verify")
                .addHeader("Authorization", "Bearer $accessToken")
                .addHeader("Content-Type", "application/json")
                .post(payload.toString().toRequestBody(jsonMediaType))
                .build()

            httpClient.newCall(req).execute().use { resp ->
                if (!resp.isSuccessful) {
                    return@withContext Result.failure(IllegalStateException("Verification HTTP ${resp.code}"))
                }
                val root = JSONObject(resp.body?.string().orEmpty())
                Result.success(root.optBoolean("verified", false))
            }
        } catch (t: Throwable) {
            Result.failure(t)
        }
    }

    override suspend fun fetchEntitlement(accessToken: String): Result<RemoteEntitlement> = withContext(Dispatchers.IO) {
        if (!apiBaseUrl.startsWith("https://")) {
            return@withContext Result.failure(IllegalStateException("Backend URL not configured."))
        }
        try {
            val req = Request.Builder()
                .url("${apiBaseUrl.trimEnd('/')}/api/me")
                .addHeader("Authorization", "Bearer $accessToken")
                .get()
                .build()

            httpClient.newCall(req).execute().use { resp ->
                if (!resp.isSuccessful) {
                    return@withContext Result.failure(IllegalStateException("Entitlement HTTP ${resp.code}"))
                }
                val root = JSONObject(resp.body?.string().orEmpty())
                val ent = root.optJSONObject("entitlement") ?: root
                val status = EntitlementStatus.fromValue(ent.optString("status"))
                val source = BillingSource.fromValue(ent.optString("source"))
                val isPro = ent.optBoolean("isPro", status == EntitlementStatus.ACTIVE || status == EntitlementStatus.GRACE_PERIOD)
                Result.success(
                    RemoteEntitlement(
                        isPro = isPro,
                        source = source,
                        status = status,
                        productId = ent.optString("productId").ifBlank { null },
                        expiresAtIso = ent.optString("expiresAt").ifBlank { null }
                    )
                )
            }
        } catch (t: Throwable) {
            Result.failure(t)
        }
    }
}

/**
 * Offline/no-Play-Services fallback gateway when Google Play Billing Library isn't available at runtime.
 * Never fabricates prices or unlocks Pro locally.
 */
class UnavailablePlayBillingGateway : PlayBillingGateway {
    override suspend fun queryProducts(productIds: List<String>): Result<List<BillingProductOffer>> =
        Result.failure(IllegalStateException("Google Play Billing is available on Play Store installs."))

    override suspend fun launchPurchase(productId: String): PlayPurchaseRecord =
        PlayPurchaseRecord(productId, "", null, PlayPurchaseState.ERROR)

    override suspend fun acknowledgePurchase(purchaseToken: String): Result<Unit> =
        Result.failure(IllegalStateException("Google Play Billing unavailable."))

    override suspend fun consumePurchase(purchaseToken: String): Result<Unit> =
        Result.failure(IllegalStateException("Google Play Billing unavailable."))

    override suspend fun queryActivePurchases(): Result<List<PlayPurchaseRecord>> =
        Result.success(emptyList())
}

/**
 * Coordinates Google Play Billing purchases with server-side verification and entitlement checks.
 *
 * Security invariants:
 * 1. Never unlocks Pro locally from a client-side purchase result alone.
 * 2. Never acknowledges or consumes a purchase before POST /api/billing/play/verify confirms it.
 * 3. Always reads final Pro status from GET /api/me (supporting both Google Play & Razorpay web purchases).
 * 4. Never hardcodes rupee prices; displays Play-supplied formatted prices only.
 */
class PlayBillingManager(
    private val gateway: PlayBillingGateway,
    private val backendApi: BillingBackendApi,
    private val accessTokenProvider: suspend () -> String?
) {
    private val _state = MutableStateFlow(EntitlementState())
    val state: StateFlow<EntitlementState> = _state.asStateFlow()

    suspend fun loadProducts() {
        val result = gateway.queryProducts(PRODUCT_IDS)
        result.onSuccess { offers ->
            _state.value = _state.value.copy(products = offers)
        }.onFailure {
            _state.value = _state.value.copy(
                products = emptyList(),
                statusMessage = "Live pricing loads from Google Play on Play Store installs."
            )
        }
    }

    suspend fun refreshEntitlement(): Result<RemoteEntitlement> {
        val token = accessTokenProvider()
        if (token.isNullOrBlank()) {
            _state.value = _state.value.copy(
                isPro = false,
                source = BillingSource.NONE,
                status = EntitlementStatus.NONE,
                statusMessage = "Sign in to sync your Tempo Pro subscription across Android and Web."
            )
            return Result.failure(IllegalStateException("Not signed in."))
        }
        _state.value = _state.value.copy(isBusy = true)
        val result = backendApi.fetchEntitlement(token)
        result.onSuccess { ent ->
            val msg = when (ent.status) {
                EntitlementStatus.GRACE_PERIOD -> "Payment grace period active. Update payment method in ${ent.source.label} to avoid interruption."
                EntitlementStatus.ACCOUNT_HOLD -> "Subscription on account hold. Please update payment details in ${ent.source.label}."
                EntitlementStatus.PENDING -> "Payment pending confirmation (e.g. UPI mandate). Pro unlocks automatically once settled."
                EntitlementStatus.ACTIVE ->
                    if (ent.source == BillingSource.FREE_ACCESS) "Tempo Pro is free for everyone during the launch offer. No payment needed."
                    else "Tempo Pro active via ${ent.source.label}."
                else -> null
            }
            _state.value = _state.value.copy(
                isPro = ent.isPro,
                source = ent.source,
                status = ent.status,
                productId = ent.productId,
                expiresAtIso = ent.expiresAtIso,
                statusMessage = msg,
                isBusy = false
            )
        }.onFailure { err ->
            _state.value = _state.value.copy(
                isBusy = false,
                statusMessage = "Could not verify subscription online (${err.message ?: "offline"})."
            )
        }
        return result
    }

    suspend fun purchaseProduct(productId: String): Boolean {
        val token = accessTokenProvider()
        if (token.isNullOrBlank()) {
            _state.value = _state.value.copy(statusMessage = "Sign in to a Tempo account before purchasing Pro.")
            return false
        }
        _state.value = _state.value.copy(isBusy = true, statusMessage = null)
        val purchase = gateway.launchPurchase(productId)
        return handlePurchaseRecord(token, purchase)
    }

    suspend fun restorePurchases(): Int {
        val token = accessTokenProvider()
        if (token.isNullOrBlank()) {
            _state.value = _state.value.copy(statusMessage = "Sign in to restore your purchases.")
            return 0
        }
        _state.value = _state.value.copy(isBusy = true, statusMessage = null)
        val active = gateway.queryActivePurchases().getOrElse { emptyList() }
        var verifiedCount = 0
        for (purchase in active) {
            if (handlePurchaseRecord(token, purchase)) {
                verifiedCount++
            }
        }
        refreshEntitlement()
        if (verifiedCount == 0 && !_state.value.isPro) {
            _state.value = _state.value.copy(
                isBusy = false,
                statusMessage = "No active Google Play or web purchases found for this account."
            )
        }
        return verifiedCount
    }

    private suspend fun handlePurchaseRecord(accessToken: String, purchase: PlayPurchaseRecord): Boolean {
        return when (purchase.state) {
            PlayPurchaseState.CANCELLED -> {
                _state.value = _state.value.copy(isBusy = false, statusMessage = "Purchase cancelled.")
                false
            }
            PlayPurchaseState.PENDING -> {
                _state.value = _state.value.copy(
                    isBusy = false,
                    status = EntitlementStatus.PENDING,
                    statusMessage = "Payment pending (UPI / bank approval). Pro will unlock once confirmed."
                )
                false
            }
            PlayPurchaseState.ERROR -> {
                _state.value = _state.value.copy(
                    isBusy = false,
                    statusMessage = "Google Play Billing could not complete the purchase."
                )
                false
            }
            PlayPurchaseState.PURCHASED -> {
                val verified = backendApi.verifyPlayPurchase(
                    accessToken = accessToken,
                    productId = purchase.productId,
                    purchaseToken = purchase.purchaseToken,
                    orderId = purchase.orderId
                ).getOrDefault(false)

                if (!verified) {
                    _state.value = _state.value.copy(
                        isBusy = false,
                        statusMessage = "Server could not verify the purchase. Not acknowledged; try Restore Purchases."
                    )
                    return false
                }

                // Only acknowledge/consume AFTER server verification succeeds
                if (!purchase.isAcknowledged) {
                    gateway.acknowledgePurchase(purchase.purchaseToken)
                }

                // Only unlock Pro from GET /api/me entitlement
                refreshEntitlement()
                _state.value.isPro
            }
        }
    }

    companion object {
        const val PRODUCT_PRO_MONTHLY = "pro_monthly"
        const val PRODUCT_PRO_ANNUAL = "pro_annual"
        const val PRODUCT_LIFETIME = "lifetime"
        val PRODUCT_IDS = listOf(PRODUCT_PRO_MONTHLY, PRODUCT_PRO_ANNUAL, PRODUCT_LIFETIME)
    }
}
