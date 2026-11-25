package com.tempo.focus.data.preferences

import android.content.Context
import androidx.datastore.core.DataStore
import androidx.datastore.preferences.core.Preferences
import androidx.datastore.preferences.core.booleanPreferencesKey
import androidx.datastore.preferences.core.edit
import androidx.datastore.preferences.core.intPreferencesKey
import androidx.datastore.preferences.core.longPreferencesKey
import androidx.datastore.preferences.core.stringPreferencesKey
import androidx.datastore.preferences.preferencesDataStore
import kotlinx.coroutines.flow.Flow
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.flow.map
import java.util.UUID

private val Context.dataStore: DataStore<Preferences> by preferencesDataStore(name = "tempo_preferences")

data class UserSettings(
    val dailyGoalMinutes: Int,
    val weeklyGoalMinutes: Int,
    val examDateEpochDay: Long?,
    val soundEnabled: Boolean,
    val autoStartBreak: Boolean,
    val aiInsightsEnabled: Boolean = false,
    val selectedExamId: String = "neet_ug",
    val selectedCaGroup: String = "both",
    val advancedExamMode: Boolean = true,
    val themeMode: String = "auto",
    val roundsBeforeLongBreak: Int = 4,
    val longBreakMinutes: Int = 15,
    val autoStartNextRound: Boolean = false,
    val tickSoundFocus: Boolean = false,
    val tickSoundBreak: Boolean = false,
    val notificationPermissionRequested: Boolean = false
)

data class ActiveSessionState(
    val phase: String,
    val energy: Int,
    val subject: String,
    val sessionType: String,
    val plannedSeconds: Int,
    val accumulatedElapsedMs: Long,
    val startTimestamp: Long,
    val timerState: String, // "IDLE", "RUNNING", "PAUSED", "COMPLETED", "ENDED_EARLY"
    val activeSessionId: Long?,
    val savedTimestamp: Long
)

class UserPreferencesRepository(private val context: Context) {

    private object PreferencesKeys {
        val DAILY_GOAL = intPreferencesKey("daily_goal_minutes")
        val WEEKLY_GOAL = intPreferencesKey("weekly_goal_minutes")
        val EXAM_DATE_EPOCH_DAY = longPreferencesKey("exam_date_epoch_day")
        val SOUND_ENABLED = booleanPreferencesKey("sound_enabled")
        val AUTO_START_BREAK = booleanPreferencesKey("auto_start_break")
        val AI_INSIGHTS_ENABLED = booleanPreferencesKey("ai_insights_enabled")

        // Active session restoration
        val ACTIVE_PHASE = stringPreferencesKey("active_phase")
        val ACTIVE_ENERGY = intPreferencesKey("active_energy")
        val ACTIVE_SUBJECT = stringPreferencesKey("active_subject")
        val ACTIVE_SESSION_TYPE = stringPreferencesKey("active_session_type")
        val ACTIVE_PLANNED_SECONDS = intPreferencesKey("active_planned_seconds")
        val ACTIVE_ACCUMULATED_ELAPSED_MS = longPreferencesKey("active_accumulated_elapsed_ms")
        val ACTIVE_START_TIMESTAMP = longPreferencesKey("active_start_timestamp")
        val ACTIVE_TIMER_STATE = stringPreferencesKey("active_timer_state")
        val ACTIVE_SESSION_ID = longPreferencesKey("active_session_id")
        val ACTIVE_SAVED_TIMESTAMP = longPreferencesKey("active_saved_timestamp")
        val INSTALLATION_ID = stringPreferencesKey("anonymous_installation_id")
        val SELECTED_EXAM_ID = stringPreferencesKey("selected_exam_id")
        val SELECTED_CA_GROUP = stringPreferencesKey("selected_ca_group")
        val ADVANCED_EXAM_MODE = booleanPreferencesKey("advanced_exam_mode")

        // Tempo 4.0 theme & round cycle preferences
        val THEME_MODE = stringPreferencesKey("theme_mode")
        val ROUNDS_BEFORE_LONG_BREAK = intPreferencesKey("rounds_before_long_break")
        val LONG_BREAK_MINUTES = intPreferencesKey("long_break_minutes")
        val AUTO_START_NEXT_ROUND = booleanPreferencesKey("auto_start_next_round")
        val TICK_SOUND_FOCUS = booleanPreferencesKey("tick_sound_focus")
        val TICK_SOUND_BREAK = booleanPreferencesKey("tick_sound_break")
        val NOTIFICATION_PERMISSION_REQUESTED = booleanPreferencesKey("notification_permission_requested")
    }

    val userSettingsFlow: Flow<UserSettings> = context.dataStore.data.map { preferences ->
        val dailyGoal = preferences[PreferencesKeys.DAILY_GOAL] ?: 120
        val weeklyGoal = preferences[PreferencesKeys.WEEKLY_GOAL] ?: 600
        val examEpoch = preferences[PreferencesKeys.EXAM_DATE_EPOCH_DAY]
        val sound = preferences[PreferencesKeys.SOUND_ENABLED] ?: true
        val autoBreak = preferences[PreferencesKeys.AUTO_START_BREAK] ?: false
        val aiEnabled = preferences[PreferencesKeys.AI_INSIGHTS_ENABLED] ?: false
        val selectedExam = preferences[PreferencesKeys.SELECTED_EXAM_ID] ?: "neet_ug"
        val caGroup = preferences[PreferencesKeys.SELECTED_CA_GROUP] ?: "both"
        val advancedMode = preferences[PreferencesKeys.ADVANCED_EXAM_MODE] ?: true
        val themeMode = preferences[PreferencesKeys.THEME_MODE] ?: "auto"
        val roundsBeforeLong = (preferences[PreferencesKeys.ROUNDS_BEFORE_LONG_BREAK] ?: 4).coerceIn(2, 8)
        val longBreakMins = (preferences[PreferencesKeys.LONG_BREAK_MINUTES] ?: 15).coerceIn(5, 45)
        val autoNextRound = preferences[PreferencesKeys.AUTO_START_NEXT_ROUND] ?: false
        val tickFocus = preferences[PreferencesKeys.TICK_SOUND_FOCUS] ?: false
        val tickBreak = preferences[PreferencesKeys.TICK_SOUND_BREAK] ?: false
        val notifRequested = preferences[PreferencesKeys.NOTIFICATION_PERMISSION_REQUESTED] ?: false

        UserSettings(
            dailyGoalMinutes = dailyGoal,
            weeklyGoalMinutes = weeklyGoal,
            examDateEpochDay = if (examEpoch != null && examEpoch > 0) examEpoch else null,
            soundEnabled = sound,
            autoStartBreak = autoBreak,
            aiInsightsEnabled = aiEnabled,
            selectedExamId = selectedExam,
            selectedCaGroup = caGroup,
            advancedExamMode = advancedMode,
            themeMode = themeMode,
            roundsBeforeLongBreak = roundsBeforeLong,
            longBreakMinutes = longBreakMins,
            autoStartNextRound = autoNextRound,
            tickSoundFocus = tickFocus,
            tickSoundBreak = tickBreak,
            notificationPermissionRequested = notifRequested
        )
    }

    val activeSessionFlow: Flow<ActiveSessionState?> = context.dataStore.data.map { preferences ->
        val state = preferences[PreferencesKeys.ACTIVE_TIMER_STATE]
        if (state == null || state == "IDLE") {
            null
        } else {
            ActiveSessionState(
                phase = preferences[PreferencesKeys.ACTIVE_PHASE] ?: "focus",
                energy = preferences[PreferencesKeys.ACTIVE_ENERGY] ?: 3,
                subject = preferences[PreferencesKeys.ACTIVE_SUBJECT] ?: "",
                sessionType = preferences[PreferencesKeys.ACTIVE_SESSION_TYPE] ?: "Study",
                plannedSeconds = preferences[PreferencesKeys.ACTIVE_PLANNED_SECONDS] ?: (25 * 60),
                accumulatedElapsedMs = preferences[PreferencesKeys.ACTIVE_ACCUMULATED_ELAPSED_MS] ?: 0L,
                startTimestamp = preferences[PreferencesKeys.ACTIVE_START_TIMESTAMP] ?: 0L,
                timerState = state,
                activeSessionId = preferences[PreferencesKeys.ACTIVE_SESSION_ID]?.takeIf { it > 0 },
                savedTimestamp = preferences[PreferencesKeys.ACTIVE_SAVED_TIMESTAMP] ?: 0L
            )
        }
    }

    suspend fun updateDailyGoal(minutes: Int) {
        context.dataStore.edit { preferences ->
            preferences[PreferencesKeys.DAILY_GOAL] = minutes.coerceAtLeast(0)
        }
    }

    suspend fun updateWeeklyGoal(minutes: Int) {
        context.dataStore.edit { preferences ->
            preferences[PreferencesKeys.WEEKLY_GOAL] = minutes.coerceAtLeast(0)
        }
    }

    suspend fun setExamDateEpochDay(epochDay: Long?) {
        context.dataStore.edit { preferences ->
            if (epochDay == null) {
                preferences.remove(PreferencesKeys.EXAM_DATE_EPOCH_DAY)
            } else {
                preferences[PreferencesKeys.EXAM_DATE_EPOCH_DAY] = epochDay
            }
        }
    }

    suspend fun setSoundEnabled(enabled: Boolean) {
        context.dataStore.edit { preferences ->
            preferences[PreferencesKeys.SOUND_ENABLED] = enabled
        }
    }

    suspend fun setAutoStartBreak(enabled: Boolean) {
        context.dataStore.edit { preferences ->
            preferences[PreferencesKeys.AUTO_START_BREAK] = enabled
        }
    }

    suspend fun setAiInsightsEnabled(enabled: Boolean) {
        context.dataStore.edit { preferences ->
            preferences[PreferencesKeys.AI_INSIGHTS_ENABLED] = enabled
        }
    }

    suspend fun setSelectedExamId(examId: String) {
        context.dataStore.edit { preferences ->
            preferences[PreferencesKeys.SELECTED_EXAM_ID] = examId
        }
    }

    suspend fun setSelectedCaGroup(caGroup: String) {
        context.dataStore.edit { preferences ->
            preferences[PreferencesKeys.SELECTED_CA_GROUP] = caGroup
        }
    }

    suspend fun setAdvancedExamMode(enabled: Boolean) {
        context.dataStore.edit { preferences ->
            preferences[PreferencesKeys.ADVANCED_EXAM_MODE] = enabled
        }
    }

    suspend fun setThemeMode(mode: String) {
        context.dataStore.edit { preferences ->
            preferences[PreferencesKeys.THEME_MODE] = mode
        }
    }

    suspend fun setRoundsBeforeLongBreak(rounds: Int) {
        context.dataStore.edit { preferences ->
            preferences[PreferencesKeys.ROUNDS_BEFORE_LONG_BREAK] = rounds.coerceIn(2, 8)
        }
    }

    suspend fun setLongBreakMinutes(minutes: Int) {
        context.dataStore.edit { preferences ->
            preferences[PreferencesKeys.LONG_BREAK_MINUTES] = minutes.coerceIn(5, 45)
        }
    }

    suspend fun setAutoStartNextRound(enabled: Boolean) {
        context.dataStore.edit { preferences ->
            preferences[PreferencesKeys.AUTO_START_NEXT_ROUND] = enabled
        }
    }

    suspend fun setTickSoundFocus(enabled: Boolean) {
        context.dataStore.edit { preferences ->
            preferences[PreferencesKeys.TICK_SOUND_FOCUS] = enabled
        }
    }

    suspend fun setTickSoundBreak(enabled: Boolean) {
        context.dataStore.edit { preferences ->
            preferences[PreferencesKeys.TICK_SOUND_BREAK] = enabled
        }
    }

    suspend fun markNotificationPermissionRequested() {
        context.dataStore.edit { preferences ->
            preferences[PreferencesKeys.NOTIFICATION_PERMISSION_REQUESTED] = true
        }
    }

    suspend fun saveActiveSession(state: ActiveSessionState?) {
        context.dataStore.edit { preferences ->
            if (state == null || state.timerState == "IDLE") {
                preferences.remove(PreferencesKeys.ACTIVE_PHASE)
                preferences.remove(PreferencesKeys.ACTIVE_ENERGY)
                preferences.remove(PreferencesKeys.ACTIVE_SUBJECT)
                preferences.remove(PreferencesKeys.ACTIVE_SESSION_TYPE)
                preferences.remove(PreferencesKeys.ACTIVE_PLANNED_SECONDS)
                preferences.remove(PreferencesKeys.ACTIVE_ACCUMULATED_ELAPSED_MS)
                preferences.remove(PreferencesKeys.ACTIVE_START_TIMESTAMP)
                preferences[PreferencesKeys.ACTIVE_TIMER_STATE] = "IDLE"
                preferences.remove(PreferencesKeys.ACTIVE_SESSION_ID)
                preferences.remove(PreferencesKeys.ACTIVE_SAVED_TIMESTAMP)
            } else {
                preferences[PreferencesKeys.ACTIVE_PHASE] = state.phase
                preferences[PreferencesKeys.ACTIVE_ENERGY] = state.energy
                preferences[PreferencesKeys.ACTIVE_SUBJECT] = state.subject
                preferences[PreferencesKeys.ACTIVE_SESSION_TYPE] = state.sessionType
                preferences[PreferencesKeys.ACTIVE_PLANNED_SECONDS] = state.plannedSeconds
                preferences[PreferencesKeys.ACTIVE_ACCUMULATED_ELAPSED_MS] = state.accumulatedElapsedMs
                preferences[PreferencesKeys.ACTIVE_START_TIMESTAMP] = state.startTimestamp
                preferences[PreferencesKeys.ACTIVE_TIMER_STATE] = state.timerState
                if (state.activeSessionId != null) {
                    preferences[PreferencesKeys.ACTIVE_SESSION_ID] = state.activeSessionId
                } else {
                    preferences.remove(PreferencesKeys.ACTIVE_SESSION_ID)
                }
                preferences[PreferencesKeys.ACTIVE_SAVED_TIMESTAMP] = System.currentTimeMillis()
            }
        }
    }

    suspend fun clearAllPreferences() {
        context.dataStore.edit { preferences ->
            preferences.clear()
        }
    }

    suspend fun getOrCreateInstallationId(): String {
        val prefs = context.dataStore.data.first()
        val existing = prefs[PreferencesKeys.INSTALLATION_ID]
        if (!existing.isNullOrBlank()) return existing
        val newId = UUID.randomUUID().toString()
        context.dataStore.edit { preferences ->
            preferences[PreferencesKeys.INSTALLATION_ID] = newId
        }
        return newId
    }
}
