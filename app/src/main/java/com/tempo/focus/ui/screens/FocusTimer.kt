package com.tempo.focus.ui.screens

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.LocalFireDepartment
import androidx.compose.material.icons.filled.Schedule
import androidx.compose.material.icons.filled.School
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.VerticalDivider
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.tempo.focus.R
import com.tempo.focus.data.model.DurationFeedback
import com.tempo.focus.data.model.EnergyLevel
import com.tempo.focus.data.model.SessionStatus
import com.tempo.focus.data.model.SessionType
import com.tempo.focus.domain.ExamFocusContext
import com.tempo.focus.domain.SubjectAwareRecommendationEngine
import com.tempo.focus.domain.exams.ExamConfig
import com.tempo.focus.ui.components.CircularCountdownTimer
import com.tempo.focus.ui.theme.EnergyOchre
import com.tempo.focus.ui.theme.EnergyTerracotta
import com.tempo.focus.ui.theme.SuccessGreen
import com.tempo.focus.ui.viewmodel.FeedbackInputState
import com.tempo.focus.ui.viewmodel.TempoViewModel
import com.tempo.focus.ui.viewmodel.TimerState
import com.tempo.focus.ui.viewmodel.TimerUiState
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId

/**
 * Snapshot of today's session tracking metrics displayed on the FocusTimer screen.
 */
data class SessionTrackingSummary(
    val completedSessionsToday: Int = 0,
    val todayFocusMinutes: Int = 0,
    val dailyGoalMinutes: Int = 120,
    val currentStreakDays: Int = 0
)

/**
 * Primary 'FocusTimer' Compose screen with a countdown timer, start/stop/reset
 * controls, circular progress indicator, and live session tracking.
 */
@Composable
fun FocusTimer(
    viewModel: TempoViewModel,
    modifier: Modifier = Modifier,
    activeExam: ExamConfig? = null,
    examSubjects: List<String> = emptyList(),
    daysUntilExam: Long? = null,
    advancedMode: Boolean = false,
    onOpenDashboard: (() -> Unit)? = null,
    onEnableAdvancedMode: (() -> Unit)? = null
) {
    val uiState by viewModel.timerUiState.collectAsStateWithLifecycle()
    val feedbackInput by viewModel.feedbackInput.collectAsStateWithLifecycle()
    val allSessions by viewModel.allSessions.collectAsStateWithLifecycle()
    val userSettings by viewModel.userSettings.collectAsStateWithLifecycle()

    val trackingSummary = remember(allSessions, userSettings.dailyGoalMinutes) {
        val today = LocalDate.now()
        val zone = ZoneId.systemDefault()
        val completedToday = allSessions.count { session ->
            session.phase == "focus" &&
                session.status == "completed" &&
                Instant.ofEpochMilli(session.timestamp).atZone(zone).toLocalDate() == today
        }
        SessionTrackingSummary(
            completedSessionsToday = completedToday,
            todayFocusMinutes = viewModel.getTodayFocusMinutes(allSessions),
            dailyGoalMinutes = userSettings.dailyGoalMinutes,
            currentStreakDays = viewModel.getStreakInfo(allSessions).currentStreak
        )
    }

    val workingSteps = remember(
        allSessions,
        uiState.selectedEnergy,
        uiState.subject,
        uiState.sessionType,
        activeExam,
        daysUntilExam
    ) {
        val historyForEnergy = allSessions.filter {
            it.phase == "focus" &&
                it.status == SessionStatus.COMPLETED.value &&
                it.energy == uiState.selectedEnergy
        }
        val context = activeExam?.let {
            ExamFocusContext(
                examName = it.shortName,
                sessionType = uiState.sessionType,
                daysUntilExam = daysUntilExam
            )
        }
        SubjectAwareRecommendationEngine.calculateExamAwareRecommendation(
            energy = uiState.selectedEnergy,
            subject = uiState.subject,
            allHistoryForEnergy = historyForEnergy,
            context = context
        ).workingSteps
    }

    FocusTimerContent(
        uiState = uiState,
        feedbackInput = feedbackInput,
        trackingSummary = trackingSummary,
        onStart = { viewModel.startFocusSession() },
        onPause = { viewModel.pauseSession() },
        onResume = { viewModel.resumeSession() },
        onStop = { viewModel.endSessionEarly() },
        onReset = { viewModel.resetTimer() },
        onStartBreak = { viewModel.startBreak() },
        onSubjectChange = { viewModel.updateSubject(it) },
        onSessionTypeSelect = { viewModel.selectSessionType(it) },
        onEnergySelect = { viewModel.selectEnergy(it) },
        onQualitySelect = { viewModel.updateFocusQuality(it) },
        onDifficultySelect = { viewModel.updateDifficulty(it) },
        onDurationFeedbackSelect = { viewModel.updateDurationFeedback(it) },
        onDistractionsChange = { viewModel.updateDistractions(it) },
        onNotesChange = { viewModel.updateNotes(it) },
        onSaveFeedback = { viewModel.saveFeedback() },
        onSkipFeedback = { viewModel.skipFeedback() },
        onDismissBreakOffer = { viewModel.dismissBreakOffer() },
        activeExamName = if (advancedMode) activeExam?.shortName else null,
        examSubjects = if (advancedMode) examSubjects else emptyList(),
        workingSteps = workingSteps,
        showEnableExamModePill = !advancedMode && onEnableAdvancedMode != null,
        onOpenDashboard = onOpenDashboard,
        onEnableAdvancedMode = onEnableAdvancedMode,
        modifier = modifier
    )
}

/**
 * Stateless FocusTimer screen content for clean previews and deterministic UI testing.
 */
@Composable
fun FocusTimerContent(
    uiState: TimerUiState,
    feedbackInput: FeedbackInputState,
    trackingSummary: SessionTrackingSummary,
    onStart: () -> Unit,
    onPause: () -> Unit,
    onResume: () -> Unit,
    onStop: () -> Unit,
    onReset: () -> Unit,
    onStartBreak: () -> Unit,
    onSubjectChange: (String) -> Unit,
    onSessionTypeSelect: (SessionType) -> Unit,
    onEnergySelect: (Int) -> Unit,
    onQualitySelect: (Int) -> Unit,
    onDifficultySelect: (Int) -> Unit,
    onDurationFeedbackSelect: (DurationFeedback) -> Unit,
    onDistractionsChange: (String) -> Unit,
    onNotesChange: (String) -> Unit,
    onSaveFeedback: () -> Unit,
    onSkipFeedback: () -> Unit,
    onDismissBreakOffer: () -> Unit,
    modifier: Modifier = Modifier,
    activeExamName: String? = null,
    examSubjects: List<String> = emptyList(),
    workingSteps: List<String> = emptyList(),
    showEnableExamModePill: Boolean = false,
    onOpenDashboard: (() -> Unit)? = null,
    onEnableAdvancedMode: (() -> Unit)? = null
) {
    val scrollState = rememberScrollState()
    var showResetConfirmDialog by remember { mutableStateOf(false) }

    Box(
        modifier = modifier
            .fillMaxSize()
            .testTag("focus_timer_screen"),
        contentAlignment = Alignment.TopCenter
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .widthIn(max = 600.dp)
                .verticalScroll(scrollState)
                .padding(horizontal = 20.dp, vertical = 12.dp),
            horizontalAlignment = Alignment.CenterHorizontally
        ) {
            // Editorial Brand Header
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(bottom = 10.dp),
                horizontalAlignment = Alignment.CenterHorizontally
            ) {
                Text(
                    text = stringResource(R.string.focus_timer_brand_title),
                    style = MaterialTheme.typography.headlineMedium,
                    fontFamily = FontFamily.Serif,
                    fontWeight = FontWeight.Bold,
                    letterSpacing = 4.sp,
                    color = MaterialTheme.colorScheme.onBackground
                )
                Text(
                    text = stringResource(R.string.focus_timer_tagline),
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    letterSpacing = 0.5.sp
                )
                if (activeExamName != null) {
                    Spacer(modifier = Modifier.height(6.dp))
                    Row(
                        modifier = Modifier
                            .clip(RoundedCornerShape(10.dp))
                            .background(MaterialTheme.colorScheme.primaryContainer)
                            .clickable(enabled = onOpenDashboard != null) { onOpenDashboard?.invoke() }
                            .padding(horizontal = 10.dp, vertical = 4.dp)
                            .testTag("active_exam_timer_chip"),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Icon(
                            imageVector = Icons.Default.School,
                            contentDescription = null,
                            modifier = Modifier.size(14.dp),
                            tint = MaterialTheme.colorScheme.onPrimaryContainer
                        )
                        Spacer(modifier = Modifier.width(6.dp))
                        Text(
                            text = "Exam Mode: $activeExamName",
                            style = MaterialTheme.typography.labelSmall,
                            fontWeight = FontWeight.SemiBold,
                            color = MaterialTheme.colorScheme.onPrimaryContainer
                        )
                    }
                } else if (showEnableExamModePill) {
                    Spacer(modifier = Modifier.height(6.dp))
                    Row(
                        modifier = Modifier
                            .clip(RoundedCornerShape(10.dp))
                            .background(MaterialTheme.colorScheme.surfaceVariant)
                            .clickable { onEnableAdvancedMode?.invoke() }
                            .padding(horizontal = 10.dp, vertical = 4.dp)
                            .testTag("enable_exam_mode_chip"),
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Icon(
                            imageVector = Icons.Default.School,
                            contentDescription = null,
                            modifier = Modifier.size(14.dp),
                            tint = MaterialTheme.colorScheme.primary
                        )
                        Spacer(modifier = Modifier.width(6.dp))
                        Text(
                            text = "Switch to Exam Prep Mode",
                            style = MaterialTheme.typography.labelSmall,
                            fontWeight = FontWeight.SemiBold,
                            color = MaterialTheme.colorScheme.primary
                        )
                    }
                }
            }

            // Live Session Tracking Strip
            SessionTrackingStrip(summary = trackingSummary)

            Spacer(modifier = Modifier.height(12.dp))

            // Countdown Timer Card with Circular Progress Indicator and Start / Stop / Reset Controls
            CircularCountdownTimer(
                remainingSeconds = uiState.remainingSeconds,
                totalSeconds = uiState.plannedSeconds,
                timerState = uiState.state,
                phase = uiState.phase,
                energyLevel = uiState.selectedEnergy,
                onStart = onStart,
                onPause = onPause,
                onResume = onResume,
                onReset = {
                    if (uiState.state == TimerState.PAUSED || uiState.state == TimerState.RUNNING) {
                        showResetConfirmDialog = true
                    } else {
                        onReset()
                    }
                },
                onEndEarly = onStop,
                onStartBreak = onStartBreak
            )

            Spacer(modifier = Modifier.height(20.dp))

            // Session Setup Section (Locked while session is running/paused)
            SessionSetupCard(
                isLocked = uiState.isSetupLocked,
                subject = uiState.subject,
                onSubjectChange = onSubjectChange,
                sessionType = uiState.sessionType,
                onSessionTypeSelect = onSessionTypeSelect,
                selectedEnergy = uiState.selectedEnergy,
                onEnergySelect = onEnergySelect,
                recommendationMinutes = uiState.recommendation.recommendedMinutes,
                recommendationReason = uiState.recommendation.reason,
                recommendationOverrodeFeedback = uiState.recommendation.overrodeUserFeedback,
                recommendationOverrideExplanation = uiState.recommendation.overrideExplanation,
                recommendationSubjectSessionsLogged = uiState.recommendation.subjectSessionsLogged,
                examSubjects = examSubjects,
                workingSteps = workingSteps
            )

            Spacer(modifier = Modifier.height(24.dp))
        }
    }

    if (uiState.showFeedbackDialog) {
        FeedbackDialog(
            feedbackInput = feedbackInput,
            onQualitySelect = onQualitySelect,
            onDifficultySelect = onDifficultySelect,
            onDurationFeedbackSelect = onDurationFeedbackSelect,
            onDistractionsChange = onDistractionsChange,
            onNotesChange = onNotesChange,
            onSave = onSaveFeedback,
            onSkip = onSkipFeedback
        )
    }

    if (uiState.showBreakOfferDialog) {
        BreakOfferDialog(
            breakMinutes = EnergyLevel.defaultBreakMinutesFor(uiState.selectedEnergy),
            onStartBreak = onStartBreak,
            onDismiss = onDismissBreakOffer
        )
    }

    if (showResetConfirmDialog) {
        AlertDialog(
            onDismissRequest = { showResetConfirmDialog = false },
            title = {
                Text(
                    text = stringResource(R.string.focus_timer_reset_dialog_title),
                    fontFamily = FontFamily.Serif,
                    fontWeight = FontWeight.SemiBold
                )
            },
            text = {
                Text(stringResource(R.string.focus_timer_reset_dialog_body))
            },
            confirmButton = {
                Button(
                    onClick = {
                        showResetConfirmDialog = false
                        onReset()
                    },
                    colors = ButtonDefaults.buttonColors(containerColor = MaterialTheme.colorScheme.error),
                    modifier = Modifier.testTag("confirm_reset_button")
                ) {
                    Text(stringResource(R.string.focus_timer_action_reset))
                }
            },
            dismissButton = {
                TextButton(onClick = { showResetConfirmDialog = false }) {
                    Text(stringResource(R.string.focus_timer_dialog_cancel))
                }
            }
        )
    }
}

/**
 * Compact session-tracking summary strip showing sessions completed today,
 * focused minutes vs daily goal, and current focus streak.
 */
@Composable
fun SessionTrackingStrip(
    summary: SessionTrackingSummary,
    modifier: Modifier = Modifier
) {
    Card(
        modifier = modifier
            .fillMaxWidth()
            .testTag("session_tracking_card"),
        shape = RoundedCornerShape(16.dp),
        colors = CardDefaults.cardColors(
            containerColor = MaterialTheme.colorScheme.surface
        ),
        border = CardDefaults.outlinedCardBorder()
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(horizontal = 14.dp, vertical = 10.dp),
            horizontalArrangement = Arrangement.SpaceEvenly,
            verticalAlignment = Alignment.CenterVertically
        ) {
            TrackingMetricItem(
                icon = Icons.Default.CheckCircle,
                iconTint = SuccessGreen,
                value = "${summary.completedSessionsToday}",
                label = stringResource(R.string.focus_timer_tracking_sessions),
                modifier = Modifier
                    .weight(1f)
                    .testTag("tracking_sessions_count")
            )

            VerticalDivider(
                modifier = Modifier.height(28.dp),
                color = MaterialTheme.colorScheme.outlineVariant
            )

            TrackingMetricItem(
                icon = Icons.Default.Schedule,
                iconTint = EnergyOchre,
                value = "${summary.todayFocusMinutes}/${summary.dailyGoalMinutes}m",
                label = stringResource(R.string.focus_timer_tracking_today),
                modifier = Modifier
                    .weight(1.2f)
                    .testTag("tracking_today_minutes")
            )

            VerticalDivider(
                modifier = Modifier.height(28.dp),
                color = MaterialTheme.colorScheme.outlineVariant
            )

            TrackingMetricItem(
                icon = Icons.Default.LocalFireDepartment,
                iconTint = EnergyTerracotta,
                value = "${summary.currentStreakDays}d",
                label = stringResource(R.string.focus_timer_tracking_streak),
                modifier = Modifier
                    .weight(1f)
                    .testTag("tracking_streak_days")
            )
        }
    }
}

@Composable
private fun TrackingMetricItem(
    icon: ImageVector,
    iconTint: Color,
    value: String,
    label: String,
    modifier: Modifier = Modifier
) {
    Column(
        modifier = modifier,
        horizontalAlignment = Alignment.CenterHorizontally
    ) {
        Row(
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.Center
        ) {
            Icon(
                imageVector = icon,
                contentDescription = null,
                tint = iconTint,
                modifier = Modifier.size(15.dp)
            )
            Spacer(modifier = Modifier.width(4.dp))
            Text(
                text = value,
                style = MaterialTheme.typography.titleSmall,
                fontWeight = FontWeight.Bold,
                color = MaterialTheme.colorScheme.onSurface,
                maxLines = 1
            )
        }
        Text(
            text = label,
            style = MaterialTheme.typography.labelSmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            maxLines = 1
        )
    }
}
