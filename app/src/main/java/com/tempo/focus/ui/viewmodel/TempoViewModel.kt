package com.tempo.focus.ui.viewmodel

import android.app.Application
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.tempo.focus.BuildConfig
import com.tempo.focus.data.db.AppDatabase
import com.tempo.focus.data.db.SessionEntity
import com.tempo.focus.data.model.DurationFeedback
import com.tempo.focus.data.model.EnergyLevel
import com.tempo.focus.data.model.SessionPhase
import com.tempo.focus.data.model.SessionStatus
import com.tempo.focus.data.model.SessionType
import com.tempo.focus.data.preferences.ActiveSessionState
import com.tempo.focus.data.preferences.UserPreferencesRepository
import com.tempo.focus.data.preferences.UserSettings
import com.tempo.focus.data.repository.SessionRepository
import com.tempo.focus.domain.AdaptiveRecommendationEngine
import com.tempo.focus.domain.ExportHelper
import com.tempo.focus.domain.InsightGenerator
import com.tempo.focus.domain.RecommendationResult
import com.tempo.focus.domain.StreakCalculator
import com.tempo.focus.domain.StreakInfo
import com.tempo.focus.domain.SubjectAwareRecommendationEngine
import com.tempo.focus.security.GooglePlayIntegrityProvider
import com.tempo.focus.service.NotificationHelper
import com.tempo.focus.service.SoundPlayer
import kotlinx.coroutines.Job
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch
import java.time.DayOfWeek
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId
import java.time.temporal.TemporalAdjusters
import java.util.concurrent.atomic.AtomicBoolean

enum class TimerState {
    IDLE,
    RUNNING,
    PAUSED,
    COMPLETED,
    ENDED_EARLY
}

enum class HistoryPhaseFilter(val label: String) {
    ALL("Focus & breaks"),
    FOCUS_ONLY("Focus only"),
    BREAKS_ONLY("Breaks only")
}

enum class HistoryStatusFilter(val label: String) {
    ALL("Any status"),
    COMPLETED("Completed"),
    ENDED_EARLY("Ended early")
}

enum class HistoryDateFilter(val label: String) {
    ALL("All time"),
    TODAY("Today"),
    THIS_WEEK("This week")
}

enum class HistorySort(val label: String) {
    NEWEST("Newest first"),
    OLDEST("Oldest first"),
    LONGEST("Longest first")
}

data class TimerUiState(
    val state: TimerState = TimerState.IDLE,
    val phase: SessionPhase = SessionPhase.FOCUS,
    val selectedEnergy: Int = 3,
    val subject: String = "",
    val sessionType: SessionType = SessionType.STUDY,
    val plannedSeconds: Int = 25 * 60,
    val remainingSeconds: Int = 25 * 60,
    val recommendation: RecommendationResult = RecommendationResult(25, "Default duration", 25, 0),
    val lastCompletedSessionId: Long? = null,
    val showFeedbackDialog: Boolean = false,
    val showBreakOfferDialog: Boolean = false,
    val isSetupLocked: Boolean = false
)

data class FeedbackInputState(
    val focusQuality: Int? = null,
    val difficulty: Int? = null,
    val durationFeedback: DurationFeedback? = null,
    val distractionsText: String = "",
    val notesText: String = ""
)

data class HistorySummary(
    val totalSessions: Int = 0,
    val totalFocusMinutes: Int = 0,
    val completedCount: Int = 0,
    val endedEarlyCount: Int = 0
)

class TempoViewModel(application: Application) : AndroidViewModel(application) {

    private val database = AppDatabase.getDatabase(application)
    private val sessionRepository = SessionRepository(database.sessionDao())
    private val preferencesRepository = UserPreferencesRepository(application)

    val allSessions: StateFlow<List<SessionEntity>> = sessionRepository.allSessions
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), emptyList())

    val userSettings: StateFlow<UserSettings> = preferencesRepository.userSettingsFlow
        .stateIn(
            viewModelScope,
            SharingStarted.WhileSubscribed(5000),
            UserSettings(120, 600, null, soundEnabled = true, autoStartBreak = false)
        )

    val uniqueSubjects: StateFlow<List<String>> = sessionRepository.uniqueSubjects
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), emptyList())

    private val _timerUiState = MutableStateFlow(TimerUiState())
    val timerUiState: StateFlow<TimerUiState> = _timerUiState.asStateFlow()

    private val _feedbackInput = MutableStateFlow(FeedbackInputState())
    val feedbackInput: StateFlow<FeedbackInputState> = _feedbackInput.asStateFlow()

    // History Filters State
    private val _phaseFilter = MutableStateFlow(HistoryPhaseFilter.ALL)
    val phaseFilter: StateFlow<HistoryPhaseFilter> = _phaseFilter.asStateFlow()

    private val _statusFilter = MutableStateFlow(HistoryStatusFilter.ALL)
    val statusFilter: StateFlow<HistoryStatusFilter> = _statusFilter.asStateFlow()

    private val _dateFilter = MutableStateFlow(HistoryDateFilter.ALL)
    val dateFilter: StateFlow<HistoryDateFilter> = _dateFilter.asStateFlow()

    private val _subjectFilter = MutableStateFlow<String?>(null) // null = all subjects
    val subjectFilter: StateFlow<String?> = _subjectFilter.asStateFlow()

    private val _historySort = MutableStateFlow(HistorySort.NEWEST)
    val historySort: StateFlow<HistorySort> = _historySort.asStateFlow()

    // Recent Focus Reflection State (formerly weeklyInsight, powered by Gemini via proxy)
    private val _recentReflection = MutableStateFlow<String?>(null)
    val recentReflection: StateFlow<String?> = _recentReflection.asStateFlow()
    val weeklyInsight: StateFlow<String?> = recentReflection

    private val _isLoadingInsight = MutableStateFlow(false)
    val isLoadingInsight: StateFlow<Boolean> = _isLoadingInsight.asStateFlow()

    private var hasFetchedInsightThisSession = false

    // Internal timing variables for zero drift
    private var accumulatedElapsedMs: Long = 0L
    private var runStartTimestamp: Long = 0L
    private var timerJob: Job? = null
    private var currentSessionRecordId: Long? = null
    private val isCompletingSession = AtomicBoolean(false)

    init {
        // Observe sessions to update recommendations and restore active session if available
        viewModelScope.launch {
            allSessions.collect { sessions ->
                updateRecommendationForCurrentEnergy(sessions)
            }
        }

        viewModelScope.launch {
            // Check for restored active session
            preferencesRepository.activeSessionFlow.collect { active ->
                if (active != null && _timerUiState.value.state == TimerState.IDLE) {
                    restoreActiveSession(active)
                }
            }
        }
    }

    private fun updateRecommendationForCurrentEnergy(sessions: List<SessionEntity> = allSessions.value) {
        val energy = _timerUiState.value.selectedEnergy
        val subject = _timerUiState.value.subject
        // Fix 1: Filter to completed sessions only (matching StreakCalculator)
        val energyFocusHistory = sessions.filter {
            it.phase == "focus" && it.status == SessionStatus.COMPLETED.value && it.energy == energy
        }
        // Fix 5: Use SubjectAwareRecommendationEngine
        val recommendation = SubjectAwareRecommendationEngine.calculateRecommendation(energy, subject, energyFocusHistory)

        _timerUiState.value = _timerUiState.value.copy(
            recommendation = recommendation,
            plannedSeconds = if (_timerUiState.value.state == TimerState.IDLE && _timerUiState.value.phase == SessionPhase.FOCUS) {
                recommendation.recommendedMinutes * 60
            } else {
                _timerUiState.value.plannedSeconds
            },
            remainingSeconds = if (_timerUiState.value.state == TimerState.IDLE && _timerUiState.value.phase == SessionPhase.FOCUS) {
                recommendation.recommendedMinutes * 60
            } else {
                _timerUiState.value.remainingSeconds
            }
        )
    }

    /**
     * Loads recent focus reflection using Gemini API via secure proxy IF explicitly enabled in Settings.
     * Respects user privacy: strictly opt-in and OFF by default.
     * Offline-safe, non-blocking, and never interferes with timer operations.
     * Acquires genuine Play Integrity token bound to request nonce via GooglePlayIntegrityProvider.
     */
    fun loadRecentReflectionIfNeeded(forceRefresh: Boolean = false) {
        if (!userSettings.value.aiInsightsEnabled) {
            _recentReflection.value = null
            return
        }

        if (hasFetchedInsightThisSession && !forceRefresh) return
        hasFetchedInsightThisSession = true

        viewModelScope.launch {
            _isLoadingInsight.value = true
            val installationId = try {
                preferencesRepository.getOrCreateInstallationId()
            } catch (e: Throwable) {
                ""
            }
            val playIntegrityProvider = GooglePlayIntegrityProvider(getApplication())
            val result = InsightGenerator.generateRecentFocusReflection(
                sessions = allSessions.value,
                installationId = installationId,
                integrityProvider = playIntegrityProvider
            )
            result.onSuccess { insight ->
                _recentReflection.value = insight
            }.onFailure {
                // Safe failure, insight remains null or fallback
            }
            _isLoadingInsight.value = false
        }
    }

    fun loadWeeklyInsightIfNeeded(forceRefresh: Boolean = false) = loadRecentReflectionIfNeeded(forceRefresh)

    private fun restoreActiveSession(active: ActiveSessionState) {
        val phase = SessionPhase.fromString(active.phase)
        val now = System.currentTimeMillis()
        var accumulated = active.accumulatedElapsedMs
        var remaining = active.plannedSeconds

        val state = when (active.timerState) {
            "RUNNING" -> {
                val elapsedSinceStart = (now - active.startTimestamp).coerceAtLeast(0L)
                val totalElapsedSec = ((accumulated + elapsedSinceStart) / 1000).toInt()
                remaining = (active.plannedSeconds - totalElapsedSec).coerceAtLeast(0)

                if (remaining <= 0) {
                    // Completed while in background
                    accumulated = active.plannedSeconds * 1000L
                    remaining = 0
                    TimerState.COMPLETED
                } else {
                    accumulated += elapsedSinceStart
                    TimerState.RUNNING
                }
            }
            "PAUSED" -> {
                val totalElapsedSec = (accumulated / 1000).toInt()
                remaining = (active.plannedSeconds - totalElapsedSec).coerceAtLeast(0)
                TimerState.PAUSED
            }
            "COMPLETED" -> {
                remaining = 0
                TimerState.COMPLETED
            }
            "ENDED_EARLY" -> TimerState.ENDED_EARLY
            else -> TimerState.IDLE
        }

        accumulatedElapsedMs = accumulated
        runStartTimestamp = if (state == TimerState.RUNNING) now else active.startTimestamp
        currentSessionRecordId = active.activeSessionId

        _timerUiState.value = _timerUiState.value.copy(
            state = state,
            phase = phase,
            selectedEnergy = active.energy,
            subject = active.subject,
            sessionType = SessionType.fromString(active.sessionType),
            plannedSeconds = active.plannedSeconds,
            remainingSeconds = remaining,
            lastCompletedSessionId = active.activeSessionId,
            isSetupLocked = state == TimerState.RUNNING || state == TimerState.PAUSED
        )

        if (state == TimerState.RUNNING) {
            startTicker()
        } else if (state == TimerState.COMPLETED) {
            if (active.timerState == "RUNNING") {
                handleSessionCompletion(active.activeSessionId)
            } else {
                viewModelScope.launch {
                    preferencesRepository.saveActiveSession(null)
                }
            }
        }
    }

    fun selectEnergy(energy: Int) {
        if (_timerUiState.value.isSetupLocked) return
        val clampedEnergy = energy.coerceIn(1, 5)
        _timerUiState.value = _timerUiState.value.copy(selectedEnergy = clampedEnergy)
        updateRecommendationForCurrentEnergy()
    }

    fun updateSubject(newSubject: String) {
        if (_timerUiState.value.isSetupLocked) return
        if (newSubject.length <= 60) {
            _timerUiState.value = _timerUiState.value.copy(subject = newSubject)
            updateRecommendationForCurrentEnergy()
        }
    }

    fun selectSessionType(type: SessionType) {
        if (_timerUiState.value.isSetupLocked) return
        _timerUiState.value = _timerUiState.value.copy(sessionType = type)
    }

    fun startFocusSession() {
        val currentState = _timerUiState.value
        if (currentState.state == TimerState.RUNNING) return

        val durationMinutes = currentState.recommendation.recommendedMinutes
        val plannedSec = durationMinutes * 60
        val now = System.currentTimeMillis()

        accumulatedElapsedMs = 0L
        runStartTimestamp = now
        isCompletingSession.set(false)

        viewModelScope.launch {
            // Pre-create session record in Room
            val sessionEntity = SessionEntity(
                timestamp = now,
                phase = SessionPhase.FOCUS.value,
                energy = currentState.selectedEnergy,
                subject = currentState.subject.trim(),
                sessionType = currentState.sessionType.displayName,
                plannedMinutes = durationMinutes,
                actualSeconds = 0,
                status = SessionStatus.ACTIVE.value
            )
            val dbId = sessionRepository.insertSession(sessionEntity)
            currentSessionRecordId = dbId

            _timerUiState.value = currentState.copy(
                state = TimerState.RUNNING,
                phase = SessionPhase.FOCUS,
                plannedSeconds = plannedSec,
                remainingSeconds = plannedSec,
                lastCompletedSessionId = dbId,
                isSetupLocked = true,
                showFeedbackDialog = false,
                showBreakOfferDialog = false
            )

            saveActiveSessionStateToPrefs()
            startTicker()
        }
    }

    fun pauseSession() {
        if (_timerUiState.value.state != TimerState.RUNNING) return
        timerJob?.cancel()

        val now = System.currentTimeMillis()
        accumulatedElapsedMs += (now - runStartTimestamp).coerceAtLeast(0L)

        val totalElapsedSec = (accumulatedElapsedMs / 1000).toInt()
        val remaining = (_timerUiState.value.plannedSeconds - totalElapsedSec).coerceAtLeast(0)

        _timerUiState.value = _timerUiState.value.copy(
            state = TimerState.PAUSED,
            remainingSeconds = remaining,
            isSetupLocked = true
        )

        viewModelScope.launch {
            val recordId = currentSessionRecordId
            if (recordId != null) {
                val session = sessionRepository.getSessionById(recordId)
                if (session != null) {
                    sessionRepository.updateSession(
                        session.copy(
                            status = SessionStatus.PAUSED.value,
                            actualSeconds = totalElapsedSec,
                            updatedAt = now
                        )
                    )
                }
            }
            saveActiveSessionStateToPrefs()
        }
    }

    fun resumeSession() {
        if (_timerUiState.value.state != TimerState.PAUSED) return
        val now = System.currentTimeMillis()
        runStartTimestamp = now
        isCompletingSession.set(false)

        _timerUiState.value = _timerUiState.value.copy(
            state = TimerState.RUNNING,
            isSetupLocked = true
        )

        viewModelScope.launch {
            val recordId = currentSessionRecordId
            if (recordId != null) {
                val session = sessionRepository.getSessionById(recordId)
                if (session != null) {
                    sessionRepository.updateSession(
                        session.copy(
                            status = SessionStatus.ACTIVE.value,
                            updatedAt = now
                        )
                    )
                }
            }
            saveActiveSessionStateToPrefs()
        }
        startTicker()
    }

    fun endSessionEarly() {
        val currentState = _timerUiState.value
        if (currentState.state != TimerState.RUNNING && currentState.state != TimerState.PAUSED) return

        timerJob?.cancel()
        val now = System.currentTimeMillis()
        if (currentState.state == TimerState.RUNNING) {
            accumulatedElapsedMs += (now - runStartTimestamp).coerceAtLeast(0L)
        }

        val actualSec = (accumulatedElapsedMs / 1000).toInt().coerceAtMost(currentState.plannedSeconds)

        viewModelScope.launch {
            val recordId = currentSessionRecordId
            if (recordId != null) {
                val existing = sessionRepository.getSessionById(recordId)
                if (existing != null) {
                    sessionRepository.updateSession(
                        existing.copy(
                            actualSeconds = actualSec,
                            status = SessionStatus.ENDED_EARLY.value,
                            updatedAt = now
                        )
                    )
                }
            }

            _timerUiState.value = currentState.copy(
                state = TimerState.ENDED_EARLY,
                remainingSeconds = (currentState.plannedSeconds - actualSec).coerceAtLeast(0),
                isSetupLocked = false,
                showFeedbackDialog = currentState.phase == SessionPhase.FOCUS,
                showBreakOfferDialog = false
            )

            preferencesRepository.saveActiveSession(null)
            resetFeedbackInput()
        }
    }

    fun resetTimer() {
        timerJob?.cancel()
        val currentState = _timerUiState.value
        val sessionId = currentSessionRecordId
        if ((currentState.state == TimerState.RUNNING || currentState.state == TimerState.PAUSED) && sessionId != null) {
            val now = System.currentTimeMillis()
            val totalElapsed = if (currentState.state == TimerState.RUNNING) {
                accumulatedElapsedMs + (now - runStartTimestamp).coerceAtLeast(0L)
            } else {
                accumulatedElapsedMs
            }
            val elapsedSec = (totalElapsed / 1000).toInt()
            viewModelScope.launch {
                val session = sessionRepository.getSessionById(sessionId)
                if (session != null) {
                    sessionRepository.updateSession(
                        session.copy(
                            status = SessionStatus.CANCELLED.value,
                            actualSeconds = elapsedSec,
                            updatedAt = now
                        )
                    )
                }
            }
        }

        accumulatedElapsedMs = 0L
        runStartTimestamp = 0L
        currentSessionRecordId = null
        isCompletingSession.set(false)

        val currentEnergy = _timerUiState.value.selectedEnergy
        val rec = _timerUiState.value.recommendation

        _timerUiState.value = TimerUiState(
            state = TimerState.IDLE,
            phase = SessionPhase.FOCUS,
            selectedEnergy = currentEnergy,
            subject = _timerUiState.value.subject,
            sessionType = _timerUiState.value.sessionType,
            plannedSeconds = rec.recommendedMinutes * 60,
            remainingSeconds = rec.recommendedMinutes * 60,
            recommendation = rec,
            isSetupLocked = false,
            showFeedbackDialog = false,
            showBreakOfferDialog = false
        )

        viewModelScope.launch {
            preferencesRepository.saveActiveSession(null)
        }
    }

    fun startBreak(customMinutes: Int? = null) {
        val breakMinutes = customMinutes ?: EnergyLevel.defaultBreakMinutesFor(_timerUiState.value.selectedEnergy)
        val plannedSec = breakMinutes * 60
        val now = System.currentTimeMillis()

        accumulatedElapsedMs = 0L
        runStartTimestamp = now
        isCompletingSession.set(false)

        viewModelScope.launch {
            val breakSession = SessionEntity(
                timestamp = now,
                phase = SessionPhase.BREAK.value,
                energy = _timerUiState.value.selectedEnergy,
                subject = _timerUiState.value.subject.trim(),
                sessionType = _timerUiState.value.sessionType.displayName,
                plannedMinutes = breakMinutes,
                actualSeconds = 0,
                status = SessionStatus.ACTIVE.value
            )
            val dbId = sessionRepository.insertSession(breakSession)
            currentSessionRecordId = dbId

            _timerUiState.value = _timerUiState.value.copy(
                state = TimerState.RUNNING,
                phase = SessionPhase.BREAK,
                plannedSeconds = plannedSec,
                remainingSeconds = plannedSec,
                lastCompletedSessionId = dbId,
                isSetupLocked = true,
                showFeedbackDialog = false,
                showBreakOfferDialog = false
            )

            saveActiveSessionStateToPrefs()
            startTicker()
        }
    }

    private fun startTicker() {
        timerJob?.cancel()
        timerJob = viewModelScope.launch {
            while (true) {
                delay(300)
                val now = System.currentTimeMillis()
                val totalElapsedMs = accumulatedElapsedMs + (now - runStartTimestamp).coerceAtLeast(0L)
                val totalElapsedSec = (totalElapsedMs / 1000).toInt()
                val remaining = (_timerUiState.value.plannedSeconds - totalElapsedSec).coerceAtLeast(0)

                _timerUiState.value = _timerUiState.value.copy(remainingSeconds = remaining)

                if (remaining <= 0) {
                    accumulatedElapsedMs = _timerUiState.value.plannedSeconds * 1000L
                    handleSessionCompletion(currentSessionRecordId)
                    break
                }
            }
        }
    }

    private fun handleSessionCompletion(sessionId: Long?) {
        if (!isCompletingSession.compareAndSet(false, true)) {
            return
        }
        timerJob?.cancel()
        val currentState = _timerUiState.value
        val isFocus = currentState.phase == SessionPhase.FOCUS
        val now = System.currentTimeMillis()

        viewModelScope.launch {
            if (sessionId != null) {
                val session = sessionRepository.getSessionById(sessionId)
                if (session != null && session.status != SessionStatus.COMPLETED.value) {
                    sessionRepository.updateSession(
                        session.copy(
                            actualSeconds = currentState.plannedSeconds,
                            status = SessionStatus.COMPLETED.value,
                            updatedAt = now
                        )
                    )
                }
            }

            // Play completion tone and vibrate
            SoundPlayer.playCompletionTone(
                getApplication(),
                userSettings.value.soundEnabled
            )

            // Trigger notification
            NotificationHelper.showSessionCompletedNotification(
                getApplication(),
                isFocusSession = isFocus,
                subject = currentState.subject
            )

            // Check auto-start break setting
            val autoBreak = userSettings.value.autoStartBreak && isFocus

            _timerUiState.value = currentState.copy(
                state = TimerState.COMPLETED,
                remainingSeconds = 0,
                isSetupLocked = false,
                lastCompletedSessionId = sessionId,
                showFeedbackDialog = isFocus,
                showBreakOfferDialog = isFocus && !autoBreak
            )

            preferencesRepository.saveActiveSession(null)
            resetFeedbackInput()

            if (autoBreak && !currentState.showFeedbackDialog) {
                startBreak()
            }
        }
    }

    private suspend fun saveActiveSessionStateToPrefs() {
        val state = _timerUiState.value
        if (state.state == TimerState.IDLE) {
            preferencesRepository.saveActiveSession(null)
        } else {
            preferencesRepository.saveActiveSession(
                ActiveSessionState(
                    phase = state.phase.value,
                    energy = state.selectedEnergy,
                    subject = state.subject,
                    sessionType = state.sessionType.displayName,
                    plannedSeconds = state.plannedSeconds,
                    accumulatedElapsedMs = accumulatedElapsedMs,
                    startTimestamp = runStartTimestamp,
                    timerState = state.state.name,
                    activeSessionId = currentSessionRecordId,
                    savedTimestamp = System.currentTimeMillis()
                )
            )
        }
    }

    // Feedback Actions
    fun updateFocusQuality(rating: Int) {
        _feedbackInput.value = _feedbackInput.value.copy(focusQuality = rating.coerceIn(1, 5))
    }

    fun updateDifficulty(rating: Int) {
        _feedbackInput.value = _feedbackInput.value.copy(difficulty = rating.coerceIn(1, 5))
    }

    fun updateDurationFeedback(feedback: DurationFeedback?) {
        _feedbackInput.value = _feedbackInput.value.copy(durationFeedback = feedback)
    }

    fun updateDistractions(text: String) {
        // Only allow non-negative digits
        val filtered = text.filter { it.isDigit() }
        _feedbackInput.value = _feedbackInput.value.copy(distractionsText = filtered)
    }

    fun updateNotes(text: String) {
        if (text.length <= 240) {
            _feedbackInput.value = _feedbackInput.value.copy(notesText = text)
        }
    }

    fun saveFeedback() {
        val sessionId = _timerUiState.value.lastCompletedSessionId
        val input = _feedbackInput.value

        viewModelScope.launch {
            if (sessionId != null) {
                val session = sessionRepository.getSessionById(sessionId)
                if (session != null) {
                    val distractionNum = input.distractionsText.toIntOrNull()
                    sessionRepository.updateSession(
                        session.copy(
                            focusQuality = input.focusQuality,
                            difficulty = input.difficulty,
                            durationFeedback = input.durationFeedback?.value,
                            distractions = distractionNum,
                            notes = input.notesText.trim().ifEmpty { null },
                            updatedAt = System.currentTimeMillis()
                        )
                    )
                }
            }

            _timerUiState.value = _timerUiState.value.copy(
                showFeedbackDialog = false,
                showBreakOfferDialog = _timerUiState.value.phase == SessionPhase.FOCUS
            )

            // If auto-start break is on, begin break now
            if (userSettings.value.autoStartBreak && _timerUiState.value.phase == SessionPhase.FOCUS) {
                startBreak()
            }
        }
    }

    fun skipFeedback() {
        _timerUiState.value = _timerUiState.value.copy(
            showFeedbackDialog = false,
            showBreakOfferDialog = _timerUiState.value.phase == SessionPhase.FOCUS
        )

        if (userSettings.value.autoStartBreak && _timerUiState.value.phase == SessionPhase.FOCUS) {
            startBreak()
        }
    }

    fun dismissBreakOffer() {
        _timerUiState.value = _timerUiState.value.copy(showBreakOfferDialog = false)
        resetTimer()
    }

    private fun resetFeedbackInput() {
        _feedbackInput.value = FeedbackInputState()
    }

    // Goals & Progress Calculations
    fun getTodayFocusMinutes(sessions: List<SessionEntity> = allSessions.value): Int {
        val today = LocalDate.now()
        val zone = ZoneId.systemDefault()
        return sessions
            .filter { s ->
                s.phase == "focus" &&
                s.status == "completed" &&
                Instant.ofEpochMilli(s.timestamp).atZone(zone).toLocalDate() == today
            }
            .sumOf { it.actualSeconds / 60 }
    }

    fun getThisWeekFocusMinutes(sessions: List<SessionEntity> = allSessions.value): Int {
        val today = LocalDate.now()
        val startOfWeek = today.with(TemporalAdjusters.previousOrSame(DayOfWeek.MONDAY))
        val zone = ZoneId.systemDefault()
        return sessions
            .filter { s ->
                s.phase == "focus" &&
                s.status == "completed" &&
                !Instant.ofEpochMilli(s.timestamp).atZone(zone).toLocalDate().isBefore(startOfWeek)
            }
            .sumOf { it.actualSeconds / 60 }
    }

    fun getStreakInfo(sessions: List<SessionEntity> = allSessions.value): StreakInfo {
        return StreakCalculator.calculateStreak(sessions)
    }

    fun updateDailyGoal(minutes: Int) {
        viewModelScope.launch {
            preferencesRepository.updateDailyGoal(minutes)
        }
    }

    fun updateWeeklyGoal(minutes: Int) {
        viewModelScope.launch {
            preferencesRepository.updateWeeklyGoal(minutes)
        }
    }

    fun setExamDate(date: LocalDate?) {
        viewModelScope.launch {
            preferencesRepository.setExamDateEpochDay(date?.toEpochDay())
        }
    }

    fun setSoundEnabled(enabled: Boolean) {
        viewModelScope.launch {
            preferencesRepository.setSoundEnabled(enabled)
        }
    }

    fun setAutoStartBreak(enabled: Boolean) {
        viewModelScope.launch {
            preferencesRepository.setAutoStartBreak(enabled)
        }
    }

    fun setAiInsightsEnabled(enabled: Boolean) {
        viewModelScope.launch {
            preferencesRepository.setAiInsightsEnabled(enabled)
            if (enabled) {
                hasFetchedInsightThisSession = false
                loadRecentReflectionIfNeeded()
            } else {
                _recentReflection.value = null
            }
        }
    }

    // History Filters & Sorting
    fun setPhaseFilter(filter: HistoryPhaseFilter) {
        _phaseFilter.value = filter
    }

    fun setStatusFilter(filter: HistoryStatusFilter) {
        _statusFilter.value = filter
    }

    fun setDateFilter(filter: HistoryDateFilter) {
        _dateFilter.value = filter
    }

    fun setSubjectFilter(subject: String?) {
        _subjectFilter.value = subject
    }

    fun setHistorySort(sort: HistorySort) {
        _historySort.value = sort
    }

    fun getFilteredSessions(all: List<SessionEntity> = allSessions.value): List<SessionEntity> {
        val today = LocalDate.now()
        val startOfWeek = today.with(TemporalAdjusters.previousOrSame(DayOfWeek.MONDAY))
        val zone = ZoneId.systemDefault()

        val filtered = all.filter { s ->
            val matchesPhase = when (_phaseFilter.value) {
                HistoryPhaseFilter.ALL -> true
                HistoryPhaseFilter.FOCUS_ONLY -> s.phase == "focus"
                HistoryPhaseFilter.BREAKS_ONLY -> s.phase == "break"
            }

            val matchesStatus = when (_statusFilter.value) {
                HistoryStatusFilter.ALL -> true
                HistoryStatusFilter.COMPLETED -> s.status == "completed"
                HistoryStatusFilter.ENDED_EARLY -> s.status == "ended_early"
            }

            val sessionDate = Instant.ofEpochMilli(s.timestamp).atZone(zone).toLocalDate()
            val matchesDate = when (_dateFilter.value) {
                HistoryDateFilter.ALL -> true
                HistoryDateFilter.TODAY -> sessionDate == today
                HistoryDateFilter.THIS_WEEK -> !sessionDate.isBefore(startOfWeek)
            }

            val matchesSubject = _subjectFilter.value?.let { sub ->
                s.subject.equals(sub, ignoreCase = true)
            } ?: true

            matchesPhase && matchesStatus && matchesDate && matchesSubject
        }

        return when (_historySort.value) {
            HistorySort.NEWEST -> filtered.sortedByDescending { it.timestamp }
            HistorySort.OLDEST -> filtered.sortedBy { it.timestamp }
            HistorySort.LONGEST -> filtered.sortedByDescending { it.actualSeconds }
        }
    }

    fun getHistorySummary(filteredSessions: List<SessionEntity>): HistorySummary {
        val focusSessions = filteredSessions.filter { it.phase == "focus" }
        return HistorySummary(
            totalSessions = filteredSessions.size,
            totalFocusMinutes = focusSessions.sumOf { it.actualSeconds / 60 },
            completedCount = filteredSessions.count { it.status == "completed" },
            endedEarlyCount = filteredSessions.count { it.status == "ended_early" }
        )
    }

    fun deleteSession(id: Long) {
        viewModelScope.launch {
            sessionRepository.deleteSessionById(id)
        }
    }

    fun clearAllData() {
        viewModelScope.launch {
            sessionRepository.clearAll()
            preferencesRepository.clearAllPreferences()
            resetTimer()
        }
    }

    fun exportJson() {
        val sessions = allSessions.value
        val json = ExportHelper.generateJson(sessions)
        ExportHelper.shareExport(
            getApplication(),
            json,
            "Tempo Focus History (JSON)",
            "application/json"
        )
    }

    fun exportCsv() {
        val sessions = allSessions.value
        val csv = ExportHelper.generateCsv(sessions)
        ExportHelper.shareExport(
            getApplication(),
            csv,
            "Tempo Focus History (CSV)",
            "text/csv"
        )
    }
}
