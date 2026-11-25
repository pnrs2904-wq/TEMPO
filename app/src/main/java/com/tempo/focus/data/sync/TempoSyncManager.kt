package com.tempo.focus.data.sync

import android.app.job.JobInfo
import android.app.job.JobParameters
import android.app.job.JobScheduler
import android.app.job.JobService
import android.content.ComponentName
import android.content.Context
import androidx.room.withTransaction
import com.tempo.focus.BuildConfig
import com.tempo.focus.data.auth.AuthTokenStore
import com.tempo.focus.data.auth.SupabaseAuthRepository
import com.tempo.focus.data.db.AppDatabase
import com.tempo.focus.data.db.MockTestEntity
import com.tempo.focus.data.db.QuestionAttemptEntity
import com.tempo.focus.data.db.RevisionEventEntity
import com.tempo.focus.data.db.SessionEntity
import com.tempo.focus.data.db.SyncCursorEntity
import com.tempo.focus.data.db.TopicProgressEntity
import com.tempo.focus.data.db.UserExamPlanEntity
import com.tempo.focus.domain.sync.MergeWinner
import com.tempo.focus.domain.sync.OutboxItemMeta
import com.tempo.focus.domain.sync.ServerAcceptedRecord
import com.tempo.focus.domain.sync.ServerRejectedRecord
import com.tempo.focus.domain.sync.SyncMergeEngine
import com.tempo.focus.domain.sync.SyncRecordMeta
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.OkHttpClient
import okhttp3.Request
import okhttp3.RequestBody.Companion.toRequestBody
import org.json.JSONArray
import org.json.JSONObject
import java.util.concurrent.TimeUnit

data class SyncStatusSnapshot(
    val isSyncing: Boolean = false,
    val lastSyncedAt: Long? = null,
    val lastError: String? = null
)

sealed class SyncRunOutcome {
    data class Success(val pushedCount: Int, val pulledCount: Int, val rejectedCount: Int) : SyncRunOutcome()
    data class Skipped(val reason: String) : SyncRunOutcome()
    data class RetryableError(val message: String) : SyncRunOutcome()
}

/**
 * Offline-first bidirectional sync client against `POST /api/sync`.
 *
 * Contract:
 * - Dual cursors: `sessionsCursor` and `prepCursor`
 * - `sessions`: array of session rows
 * - `prep`: array of `{ table, row }` envelopes
 * - Conflict resolution via [SyncMergeEngine] (later updatedAt wins; tombstone wins ties)
 * - Outbox entries cleared ONLY when acceptedUpdatedAt >= outbox.updatedAt
 * - Rejected records surfaced to the user with Retry / Discard actions
 */
class TempoSyncManager(
    private val context: Context,
    private val database: AppDatabase,
    private val authRepository: SupabaseAuthRepository,
    private val apiBaseUrl: String = BuildConfig.TEMPO_API_BASE_URL,
    private val httpClient: OkHttpClient = defaultHttpClient()
) {
    private val jsonMediaType = "application/json; charset=utf-8".toMediaType()
    private val syncDao = database.syncDao()

    private val _status = MutableStateFlow(SyncStatusSnapshot())
    val status: StateFlow<SyncStatusSnapshot> = _status.asStateFlow()

    val pendingCountFlow = syncDao.observePendingCount()
    val rejectedItemsFlow = syncDao.observeRejectedItems()
    val cursorsFlow = syncDao.observeCursors()

    /**
     * Enqueues all existing local records on first sign-in so offline work uploads cleanly.
     */
    suspend fun enqueueAllLocalDataForFirstSync() {
        database.withTransaction {
            val sessions = database.sessionDao().getAllSessionsList()
            val plans = database.examPrepDao().getAllExamPlans()
            val topics = database.examPrepDao().getAllTopics()
            val revisions = database.examPrepDao().getAllRevisions()
            val mocks = database.examPrepDao().getAllMocks()
            val attempts = database.examPrepDao().getAllQuestionAttempts()

            val batch = buildList {
                sessions.forEach { add(SyncPayloadSerializer.sessionToOutbox(it)) }
                plans.forEach { add(SyncPayloadSerializer.examPlanToOutbox(it)) }
                topics.forEach { add(SyncPayloadSerializer.topicToOutbox(it)) }
                revisions.forEach { add(SyncPayloadSerializer.revisionToOutbox(it)) }
                mocks.forEach { add(SyncPayloadSerializer.mockToOutbox(it)) }
                attempts.forEach { add(SyncPayloadSerializer.questionAttemptToOutbox(it)) }
            }
            if (batch.isNotEmpty()) {
                syncDao.upsertOutboxBatch(batch)
            }
        }
        scheduleDebouncedSync(context)
    }

    suspend fun retryRejected(entityKey: String) {
        syncDao.retryRejectedItem(entityKey)
        scheduleDebouncedSync(context)
    }

    suspend fun discardRejected(entityKey: String) {
        syncDao.deleteOutboxByKey(entityKey)
    }

    suspend fun syncNow(): SyncRunOutcome {
        if (!apiBaseUrl.startsWith("https://")) {
            return SyncRunOutcome.Skipped("Sync backend URL not configured.")
        }
        val token = authRepository.getValidAccessToken()
            ?: return SyncRunOutcome.Skipped("Not signed in — staying in local offline mode.")

        _status.value = _status.value.copy(isSyncing = true, lastError = null)

        return withContext(Dispatchers.IO) {
            try {
                val pending = syncDao.getPendingOutbox()
                val sessionsCursor = syncDao.getCursor(STREAM_SESSIONS)?.cursorValue
                val prepCursor = syncDao.getCursor(STREAM_PREP)?.cursorValue

                val sessionsArray = JSONArray()
                val prepArray = JSONArray()
                pending.forEach { item ->
                    val rowObj = JSONObject(item.payloadJson)
                    if (item.tableName == "sessions") {
                        sessionsArray.put(rowObj)
                    } else {
                        prepArray.put(JSONObject().apply {
                            put("table", item.tableName)
                            put("row", rowObj)
                        })
                    }
                }

                val requestPayload = JSONObject().apply {
                    if (sessionsCursor != null) put("sessionsCursor", sessionsCursor)
                    if (prepCursor != null) put("prepCursor", prepCursor)
                    put("sessions", sessionsArray)
                    put("prep", prepArray)
                }

                val request = Request.Builder()
                    .url("${apiBaseUrl.trimEnd('/')}/api/sync")
                    .addHeader("Authorization", "Bearer $token")
                    .addHeader("Content-Type", "application/json")
                    .post(requestPayload.toString().toRequestBody(jsonMediaType))
                    .build()

                httpClient.newCall(request).execute().use { response ->
                    val raw = response.body?.string().orEmpty()
                    if (!response.isSuccessful) {
                        val msg = "Sync HTTP ${response.code}"
                        _status.value = _status.value.copy(isSyncing = false, lastError = msg)
                        return@withContext SyncRunOutcome.RetryableError(msg)
                    }

                    val root = JSONObject(raw)
                    var pulledCount = 0
                    var rejectedCount = 0
                    val now = System.currentTimeMillis()

                    database.withTransaction {
                        val acceptedRecords = mutableListOf<ServerAcceptedRecord>()
                        val acceptedArr = root.optJSONArray("accepted") ?: JSONArray()
                        for (i in 0 until acceptedArr.length()) {
                            val acc = acceptedArr.getJSONObject(i)
                            acceptedRecords.add(
                                ServerAcceptedRecord(
                                    table = acc.optString("table"),
                                    id = acc.optString("id"),
                                    acceptedUpdatedAt = acc.optLong("updatedAt", now)
                                )
                            )
                        }

                        val rejectedRecords = mutableListOf<ServerRejectedRecord>()
                        val rejectedArr = root.optJSONArray("rejected") ?: JSONArray()
                        for (i in 0 until rejectedArr.length()) {
                            val rej = rejectedArr.getJSONObject(i)
                            rejectedRecords.add(
                                ServerRejectedRecord(
                                    table = rej.optString("table"),
                                    id = rej.optString("id"),
                                    reason = rej.optString("reason", "Rejected by server")
                                )
                            )
                        }

                        val outboxMetas = pending.map { OutboxItemMeta(it.tableName, it.recordId, it.updatedAt) }
                        val resolution = SyncMergeEngine.resolveOutboxAfterSync(outboxMetas, acceptedRecords, rejectedRecords)

                        for (item in pending) {
                            val pairKey = item.tableName to item.recordId
                            val rejectionReason = resolution.rejectedWithReason[pairKey]
                            if (rejectionReason != null) {
                                syncDao.markOutboxRejected(item.entityKey, rejectionReason)
                                rejectedCount++
                            } else if (pairKey in resolution.idsToClear) {
                                syncDao.deleteOutboxByKey(item.entityKey)
                            } else if (acceptedArr.length() == 0 && rejectedArr.length() == 0) {
                                // Server accepted full batch without itemized echo
                                syncDao.deleteOutboxByKey(item.entityKey)
                            }
                        }

                        // 2. Apply pulled remote sessions
                        val remoteSessions = root.optJSONArray("sessions") ?: JSONArray()
                        for (i in 0 until remoteSessions.length()) {
                            applyRemoteSession(remoteSessions.getJSONObject(i))
                            pulledCount++
                        }

                        // 3. Apply pulled remote prep envelopes ({ table, row })
                        val remotePrep = root.optJSONArray("prep") ?: JSONArray()
                        for (i in 0 until remotePrep.length()) {
                            val env = remotePrep.getJSONObject(i)
                            val table = env.optString("table")
                            val row = env.optJSONObject("row") ?: continue
                            applyRemotePrepRow(table, row)
                            pulledCount++
                        }

                        // 4. Advance dual cursors
                        root.optString("sessionsCursor").takeIf { it.isNotBlank() }?.let { cursor ->
                            syncDao.upsertCursor(SyncCursorEntity(STREAM_SESSIONS, cursor, now))
                        }
                        root.optString("prepCursor").takeIf { it.isNotBlank() }?.let { cursor ->
                            syncDao.upsertCursor(SyncCursorEntity(STREAM_PREP, cursor, now))
                        }
                    }

                    _status.value = SyncStatusSnapshot(
                        isSyncing = false,
                        lastSyncedAt = now,
                        lastError = if (rejectedCount > 0) "$rejectedCount record(s) rejected by server." else null
                    )
                    SyncRunOutcome.Success(
                        pushedCount = pending.size - rejectedCount,
                        pulledCount = pulledCount,
                        rejectedCount = rejectedCount
                    )
                }
            } catch (e: Throwable) {
                val msg = "Sync offline — changes queued locally."
                _status.value = _status.value.copy(isSyncing = false, lastError = msg)
                SyncRunOutcome.RetryableError(msg)
            }
        }
    }

    private suspend fun applyRemoteSession(row: JSONObject) {
        val syncId = row.optString("id").ifBlank { return }
        val remoteUpdated = row.optLong("updatedAt", 0L)
        val remoteDeleted = if (row.isNull("deletedAt")) null else row.optLong("deletedAt")
        val existing = database.sessionDao().getSessionBySyncId(syncId)
        val localMeta = existing?.let { SyncRecordMeta("sessions", syncId, it.updatedAt, it.deletedAt) }
        val decision = SyncMergeEngine.resolveWinner(localMeta, SyncRecordMeta("sessions", syncId, remoteUpdated, remoteDeleted))
        if (decision != MergeWinner.INCOMING) return

        val entity = SessionEntity(
            id = existing?.id ?: 0L,
            timestamp = row.optLong("timestamp", System.currentTimeMillis()),
            phase = row.optString("phase", "focus"),
            energy = row.optInt("energy", 3).coerceIn(1, 5),
            subject = row.optString("subject", ""),
            sessionType = row.optString("sessionType", "Study"),
            plannedMinutes = row.optInt("plannedMinutes", 25),
            actualSeconds = row.optInt("actualSeconds", 0),
            status = row.optString("status", "completed"),
            focusQuality = if (row.has("focusQuality") && !row.isNull("focusQuality")) row.optInt("focusQuality") else null,
            difficulty = if (row.has("difficulty") && !row.isNull("difficulty")) row.optInt("difficulty") else null,
            durationFeedback = if (row.has("durationFeedback") && !row.isNull("durationFeedback")) row.optString("durationFeedback") else null,
            distractions = if (row.has("distractions") && !row.isNull("distractions")) row.optInt("distractions") else null,
            notes = if (row.has("notes") && !row.isNull("notes")) row.optString("notes") else null,
            createdAt = row.optLong("createdAt", System.currentTimeMillis()),
            updatedAt = remoteUpdated,
            syncId = syncId,
            deletedAt = remoteDeleted
        )
        database.sessionDao().insertSession(entity)
    }

    private suspend fun applyRemotePrepRow(table: String, row: JSONObject) {
        val id = row.optString("id").ifBlank { return }
        val remoteUpdated = row.optLong("updatedAt", 0L)
        val remoteDeleted = if (row.isNull("deletedAt")) null else row.optLong("deletedAt")
        val remoteMeta = SyncRecordMeta(table, id, remoteUpdated, remoteDeleted)
        val dao = database.examPrepDao()

        when (table) {
            "user_exam_plans" -> {
                val existing = dao.getExamPlanById(id)
                val localMeta = existing?.let { SyncRecordMeta(table, id, it.updatedAt, it.deletedAt) }
                if (SyncMergeEngine.resolveWinner(localMeta, remoteMeta) != MergeWinner.INCOMING) return
                dao.upsertExamPlan(
                    UserExamPlanEntity(
                        id = id,
                        examId = row.optString("examId"),
                        applicableYear = row.optInt("applicableYear", 2026),
                        syllabusVersion = row.optString("syllabusVersion", "2026.1"),
                        selectedCaGroup = row.optString("selectedCaGroup", "both"),
                        examDateEpochDay = if (row.isNull("examDateEpochDay")) null else row.optLong("examDateEpochDay"),
                        dailyHours = row.optDouble("dailyHours", 4.0),
                        studyDaysPerWeek = row.optInt("studyDaysPerWeek", 6),
                        targetScorePercent = row.optInt("targetScorePercent", 75),
                        updatedAt = remoteUpdated,
                        deletedAt = remoteDeleted
                    )
                )
            }
            "user_topic_progress" -> {
                val existing = dao.getTopicById(id)
                val localMeta = existing?.let { SyncRecordMeta(table, id, it.updatedAt, it.deletedAt) }
                if (SyncMergeEngine.resolveWinner(localMeta, remoteMeta) != MergeWinner.INCOMING) return
                dao.insertTopic(
                    TopicProgressEntity(
                        id = id,
                        examId = row.optString("examId"),
                        syllabusVersion = row.optString("syllabusVersion", "2026.1"),
                        subject = row.optString("subject"),
                        unit = row.optString("unit"),
                        chapter = row.optString("chapter"),
                        topicName = row.optString("topicName"),
                        subtopics = row.optString("subtopics", ""),
                        status = row.optString("status", "not_started"),
                        difficulty = row.optString("difficulty", "moderate"),
                        ncertCompleted = row.optBoolean("ncertCompleted", false),
                        formulaRevisionDone = row.optBoolean("formulaRevisionDone", false),
                        diagramRevisionDone = row.optBoolean("diagramRevisionDone", false),
                        rtpMtpCompleted = row.optBoolean("rtpMtpCompleted", false),
                        revisionCount = row.optInt("revisionCount", 0),
                        lastStudiedEpochDay = if (row.isNull("lastStudiedEpochDay")) null else row.optLong("lastStudiedEpochDay"),
                        nextRevisionEpochDay = if (row.isNull("nextRevisionEpochDay")) null else row.optLong("nextRevisionEpochDay"),
                        isCustom = row.optBoolean("isCustom", false),
                        updatedAt = remoteUpdated,
                        deletedAt = remoteDeleted
                    )
                )
            }
            "revision_events" -> {
                val existing = dao.getRevisionById(id)
                val localMeta = existing?.let { SyncRecordMeta(table, id, it.updatedAt, it.deletedAt) }
                if (SyncMergeEngine.resolveWinner(localMeta, remoteMeta) != MergeWinner.INCOMING) return
                dao.upsertRevisionEvent(
                    RevisionEventEntity(
                        id = id,
                        examId = row.optString("examId"),
                        topicId = row.optString("topicId"),
                        topicName = row.optString("topicName"),
                        subject = row.optString("subject"),
                        revisionTimestamp = row.optLong("revisionTimestamp", remoteUpdated),
                        revisionEpochDay = row.optLong("revisionEpochDay"),
                        revisionNumber = row.optInt("revisionNumber", 1),
                        recallRating = row.optInt("recallRating", 3),
                        accuracyPercent = if (row.isNull("accuracyPercent")) null else row.optInt("accuracyPercent"),
                        difficulty = row.optInt("difficulty", 3),
                        nextRevisionEpochDay = row.optLong("nextRevisionEpochDay"),
                        method = row.optString("method", "active_recall"),
                        notes = if (row.isNull("notes")) null else row.optString("notes"),
                        updatedAt = remoteUpdated,
                        deletedAt = remoteDeleted
                    )
                )
            }
            "mock_tests" -> {
                val existing = dao.getMockById(id)
                val localMeta = existing?.let { SyncRecordMeta(table, id, it.updatedAt, it.deletedAt) }
                if (SyncMergeEngine.resolveWinner(localMeta, remoteMeta) != MergeWinner.INCOMING) return
                dao.insertMockTest(
                    MockTestEntity(
                        id = id,
                        examId = row.optString("examId"),
                        attemptYear = row.optInt("attemptYear", 2026),
                        mockName = row.optString("mockName"),
                        dateTimestamp = row.optLong("dateTimestamp", remoteUpdated),
                        totalQuestions = row.optInt("totalQuestions", 0),
                        attemptedQuestions = row.optInt("attemptedQuestions", 0),
                        correctAnswers = row.optInt("correctAnswers", 0),
                        incorrectAnswers = row.optInt("incorrectAnswers", 0),
                        unansweredQuestions = row.optInt("unansweredQuestions", 0),
                        positiveMarksPerQ = row.optDouble("positiveMarksPerQ", 0.0),
                        negativeMarksPerQ = row.optDouble("negativeMarksPerQ", 0.0),
                        totalScore = row.optDouble("totalScore", 0.0),
                        maxMarks = row.optDouble("maxMarks", 100.0),
                        percentage = row.optDouble("percentage", 0.0),
                        accuracyPercent = row.optDouble("accuracyPercent", 0.0),
                        durationMinutes = row.optInt("durationMinutes", 60),
                        avgSecondsPerQuestion = row.optDouble("avgSecondsPerQuestion", 0.0),
                        weakestSubject = if (row.isNull("weakestSubject")) null else row.optString("weakestSubject"),
                        weakestSubjectAccuracy = if (row.isNull("weakestSubjectAccuracy")) null else row.optDouble("weakestSubjectAccuracy"),
                        isQuickEntry = row.optBoolean("isQuickEntry", true),
                        notes = if (row.isNull("notes")) null else row.optString("notes"),
                        updatedAt = remoteUpdated,
                        deletedAt = remoteDeleted
                    )
                )
            }
            "question_attempts" -> {
                val existing = dao.getQuestionAttemptById(id)
                val localMeta = existing?.let { SyncRecordMeta(table, id, it.updatedAt, it.deletedAt) }
                if (SyncMergeEngine.resolveWinner(localMeta, remoteMeta) != MergeWinner.INCOMING) return
                dao.insertQuestionAttempts(
                    listOf(
                        QuestionAttemptEntity(
                            id = id,
                            mockTestId = row.optString("mockTestId"),
                            examId = row.optString("examId"),
                            questionNumber = row.optInt("questionNumber", 1),
                            subject = row.optString("subject"),
                            topicName = row.optString("topicName"),
                            difficulty = row.optString("difficulty", "moderate"),
                            selectedAnswer = if (row.isNull("selectedAnswer")) null else row.optString("selectedAnswer"),
                            correctAnswer = row.optString("correctAnswer", "A"),
                            isCorrect = row.optBoolean("isCorrect", false),
                            timeSpentSeconds = row.optInt("timeSpentSeconds", 60),
                            errorCategory = if (row.isNull("errorCategory")) null else row.optString("errorCategory"),
                            updatedAt = remoteUpdated,
                            deletedAt = remoteDeleted
                        )
                    )
                )
            }
        }
    }

    companion object {
        const val STREAM_SESSIONS = "sessions"
        const val STREAM_PREP = "prep"
        private const val JOB_ID_DEBOUNCED = 4101
        private const val JOB_ID_PERIODIC = 4102

        fun defaultHttpClient(): OkHttpClient = OkHttpClient.Builder()
            .connectTimeout(15, TimeUnit.SECONDS)
            .readTimeout(25, TimeUnit.SECONDS)
            .writeTimeout(25, TimeUnit.SECONDS)
            .build()

        fun scheduleDebouncedSync(context: Context) {
            try {
                val scheduler = context.getSystemService(Context.JOB_SCHEDULER_SERVICE) as? JobScheduler ?: return
                val component = ComponentName(context, TempoSyncJobService::class.java)
                val job = JobInfo.Builder(JOB_ID_DEBOUNCED, component)
                    .setRequiredNetworkType(JobInfo.NETWORK_TYPE_ANY)
                    .setMinimumLatency(30_000L) // 30s debounce after local write
                    .setBackoffCriteria(60_000L, JobInfo.BACKOFF_POLICY_EXPONENTIAL)
                    .build()
                scheduler.schedule(job)
            } catch (_: Throwable) {
                // Safe under unit tests
            }
        }

        fun schedulePeriodicSync(context: Context) {
            try {
                val scheduler = context.getSystemService(Context.JOB_SCHEDULER_SERVICE) as? JobScheduler ?: return
                val component = ComponentName(context, TempoSyncJobService::class.java)
                val job = JobInfo.Builder(JOB_ID_PERIODIC, component)
                    .setRequiredNetworkType(JobInfo.NETWORK_TYPE_ANY)
                    .setPeriodic(6L * 60L * 60L * 1000L) // Every 6 hours
                    .setBackoffCriteria(120_000L, JobInfo.BACKOFF_POLICY_EXPONENTIAL)
                    .build()
                scheduler.schedule(job)
            } catch (_: Throwable) {
                // Safe under unit tests
            }
        }
    }
}

/**
 * Android JobScheduler service executing debounced (30s) and periodic (6h) cloud syncs
 * with exponential backoff on retryable errors.
 */
class TempoSyncJobService : JobService() {
    private val serviceScope = CoroutineScope(SupervisorJob() + Dispatchers.IO)

    override fun onStartJob(params: JobParameters?): Boolean {
        val appContext = applicationContext
        serviceScope.launch {
            val outcome = try {
                val db = AppDatabase.getDatabase(appContext)
                val authRepo = SupabaseAuthRepository(AuthTokenStore(appContext))
                val syncManager = TempoSyncManager(appContext, db, authRepo)
                syncManager.syncNow()
            } catch (_: Throwable) {
                SyncRunOutcome.RetryableError("Background sync failed")
            }
            val needsReschedule = outcome is SyncRunOutcome.RetryableError
            jobFinished(params, needsReschedule)
        }
        return true
    }

    override fun onStopJob(params: JobParameters?): Boolean = true
}
