package com.tempo.focus.ui.screens

import androidx.compose.foundation.background
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
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.AutoAwesome
import androidx.compose.material.icons.filled.Info
import androidx.compose.material.icons.filled.TrendingUp
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.tempo.focus.data.db.SessionEntity
import com.tempo.focus.data.model.DurationFeedback
import com.tempo.focus.data.model.EnergyLevel
import com.tempo.focus.data.model.SessionType
import com.tempo.focus.ui.theme.EnergyBlue
import com.tempo.focus.ui.theme.EnergyOchre
import com.tempo.focus.ui.theme.EnergyTerracotta
import com.tempo.focus.ui.theme.SuccessGreen
import com.tempo.focus.ui.viewmodel.TempoViewModel

@Composable
fun PatternsScreen(viewModel: TempoViewModel) {
    val allSessions by viewModel.allSessions.collectAsStateWithLifecycle()
    val recentReflection by viewModel.recentReflection.collectAsStateWithLifecycle()
    val isLoadingInsight by viewModel.isLoadingInsight.collectAsStateWithLifecycle()
    val userSettings by viewModel.userSettings.collectAsStateWithLifecycle()
    val scrollState = rememberScrollState()

    // Trigger reflection load once per app session (offline-safe, non-blocking)
    LaunchedEffect(Unit) {
        viewModel.loadRecentReflectionIfNeeded()
    }

    val completedFocusSessions = remember(allSessions) {
        allSessions.filter { it.phase == "focus" && it.status == "completed" }
    }

    val totalFocusSessions = remember(allSessions) {
        allSessions.filter { it.phase == "focus" }
    }

    Column(
        modifier = Modifier
            .fillMaxSize()
            .verticalScroll(scrollState)
            .padding(horizontal = 20.dp, vertical = 16.dp),
        horizontalAlignment = Alignment.CenterHorizontally
    ) {
        // Section Header
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(bottom = 16.dp)
        ) {
            Text(
                text = "Focus Patterns",
                style = MaterialTheme.typography.headlineMedium,
                fontFamily = FontFamily.Serif,
                fontWeight = FontWeight.Bold,
                color = MaterialTheme.colorScheme.onBackground
            )
            Text(
                text = "Discover how energy levels shape your study rhythm.",
                style = MaterialTheme.typography.bodyMedium,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
        }

        // Gemini AI Recent Focus Reflection Card (Non-blocking, offline-safe, opt-in)
        RecentReflectionCard(
            insight = recentReflection,
            isLoading = isLoadingInsight,
            aiEnabled = userSettings.aiInsightsEnabled,
            onEnableAi = { viewModel.setAiInsightsEnabled(true) }
        )

        Spacer(modifier = Modifier.height(16.dp))

        // Insufficient data threshold check (requires >= 3 completed focus sessions)
        if (completedFocusSessions.size < 3) {
            Card(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(vertical = 12.dp)
                    .testTag("insufficient_data_card"),
                shape = RoundedCornerShape(16.dp),
                colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
                border = CardDefaults.outlinedCardBorder()
            ) {
                Column(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(24.dp),
                    horizontalAlignment = Alignment.CenterHorizontally
                ) {
                    Icon(
                        imageVector = Icons.Default.AutoAwesome,
                        contentDescription = null,
                        tint = EnergyOchre,
                        modifier = Modifier.size(36.dp)
                    )
                    Spacer(modifier = Modifier.height(12.dp))
                    Text(
                        text = "Gathering Your Rhythm",
                        style = MaterialTheme.typography.titleMedium,
                        fontFamily = FontFamily.Serif,
                        fontWeight = FontWeight.Bold
                    )
                    Spacer(modifier = Modifier.height(8.dp))
                    Text(
                        text = "Tempo requires at least 3 completed focus intervals to uncover statistically meaningful patterns and energy trends. You have completed ${completedFocusSessions.size} so far.",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        fontSize = 13.sp,
                        lineHeight = 18.sp
                    )
                }
            }
        } else {
            // 1. Completion Rate by Energy Level
            CompletionRateCard(totalFocusSessions)

            Spacer(modifier = Modifier.height(16.dp))

            // 2. Focus Quality by Energy Level
            FocusQualityCard(totalFocusSessions)

            Spacer(modifier = Modifier.height(16.dp))

            // 3. Average Distractions by Session Type
            DistractionsBySessionTypeCard(totalFocusSessions)

            Spacer(modifier = Modifier.height(16.dp))

            // 4. Duration Feedback Distribution
            DurationFeedbackDistributionCard(totalFocusSessions)

            Spacer(modifier = Modifier.height(16.dp))

            // 5. Top Subjects by Focus Minutes
            TopSubjectsCard(totalFocusSessions)
        }

        Spacer(modifier = Modifier.height(16.dp))

        // Honest Productivity Disclaimer
        Card(
            modifier = Modifier.fillMaxWidth(),
            shape = RoundedCornerShape(12.dp),
            colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.4f))
        ) {
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(14.dp),
                verticalAlignment = Alignment.Top
            ) {
                Icon(
                    imageVector = Icons.Default.Info,
                    contentDescription = null,
                    tint = MaterialTheme.colorScheme.outline,
                    modifier = Modifier.size(18.dp)
                )
                Spacer(modifier = Modifier.width(10.dp))
                Text(
                    text = "Tempo insights are derived exclusively from your self-reported logs and local timer data. They are designed for reflective personal habit tuning, not clinical evaluation.",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    fontSize = 11.sp,
                    lineHeight = 16.sp
                )
            }
        }

        Spacer(modifier = Modifier.height(24.dp))
    }
}

@Composable
fun CompletionRateCard(sessions: List<SessionEntity>) {
    Card(
        modifier = Modifier
            .fillMaxWidth()
            .testTag("completion_rate_card"),
        shape = RoundedCornerShape(16.dp),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
        border = CardDefaults.outlinedCardBorder()
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(18.dp)
        ) {
            Text(
                text = "Completion Rate by Energy",
                style = MaterialTheme.typography.titleMedium,
                fontFamily = FontFamily.Serif,
                fontWeight = FontWeight.Bold
            )
            Text(
                text = "Percentage of intervals completed without early stops",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )

            Spacer(modifier = Modifier.height(14.dp))

            (1..5).forEach { level ->
                val energySessions = sessions.filter { it.energy == level }
                val count = energySessions.size
                val completed = energySessions.count { it.status == "completed" }
                val rate = if (count > 0) completed.toFloat() / count.toFloat() else 0f
                val percent = (rate * 100).toInt()
                val color = EnergyLevel.colorFor(level)

                Column(modifier = Modifier.padding(vertical = 4.dp)) {
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween
                    ) {
                        Text(
                            text = "Level $level (${EnergyLevel.fromLevel(level).shortLabel})",
                            style = MaterialTheme.typography.bodySmall,
                            fontWeight = FontWeight.Medium
                        )
                        Text(
                            text = if (count > 0) "$percent% ($completed/$count)" else "No data",
                            style = MaterialTheme.typography.bodySmall,
                            color = if (count > 0) color else MaterialTheme.colorScheme.outline
                        )
                    }
                    Spacer(modifier = Modifier.height(4.dp))
                    LinearProgressIndicator(
                        progress = { rate },
                        modifier = Modifier
                            .fillMaxWidth()
                            .height(6.dp)
                            .clip(RoundedCornerShape(3.dp)),
                        color = color,
                        trackColor = MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.3f),
                        strokeCap = StrokeCap.Round
                    )
                }
            }
        }
    }
}

@Composable
fun FocusQualityCard(sessions: List<SessionEntity>) {
    Card(
        modifier = Modifier
            .fillMaxWidth()
            .testTag("focus_quality_card"),
        shape = RoundedCornerShape(16.dp),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
        border = CardDefaults.outlinedCardBorder()
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(18.dp)
        ) {
            Text(
                text = "Average Focus Quality",
                style = MaterialTheme.typography.titleMedium,
                fontFamily = FontFamily.Serif,
                fontWeight = FontWeight.Bold
            )
            Text(
                text = "Self-rated flow depth across energy bands (1 to 5 scale)",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )

            Spacer(modifier = Modifier.height(14.dp))

            (1..5).forEach { level ->
                val ratedSessions = sessions.filter { it.energy == level }.mapNotNull { it.focusQuality }
                val avgQuality = if (ratedSessions.isNotEmpty()) ratedSessions.average() else null
                val color = EnergyLevel.colorFor(level)

                Column(modifier = Modifier.padding(vertical = 4.dp)) {
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween
                    ) {
                        Text(
                            text = "Level $level (${EnergyLevel.fromLevel(level).shortLabel})",
                            style = MaterialTheme.typography.bodySmall,
                            fontWeight = FontWeight.Medium
                        )
                        Text(
                            text = avgQuality?.let { String.format(java.util.Locale.US, "%.1f / 5.0", it) } ?: "No ratings",
                            style = MaterialTheme.typography.bodySmall,
                            color = if (avgQuality != null) color else MaterialTheme.colorScheme.outline
                        )
                    }
                    Spacer(modifier = Modifier.height(4.dp))
                    val progress = avgQuality?.let { (it / 5.0).toFloat() } ?: 0f
                    LinearProgressIndicator(
                        progress = { progress },
                        modifier = Modifier
                            .fillMaxWidth()
                            .height(6.dp)
                            .clip(RoundedCornerShape(3.dp)),
                        color = color,
                        trackColor = MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.3f),
                        strokeCap = StrokeCap.Round
                    )
                }
            }
        }
    }
}

@Composable
fun DistractionsBySessionTypeCard(sessions: List<SessionEntity>) {
    Card(
        modifier = Modifier
            .fillMaxWidth()
            .testTag("distractions_card"),
        shape = RoundedCornerShape(16.dp),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
        border = CardDefaults.outlinedCardBorder()
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(18.dp)
        ) {
            Text(
                text = "Distractions by Session Type",
                style = MaterialTheme.typography.titleMedium,
                fontFamily = FontFamily.Serif,
                fontWeight = FontWeight.Bold
            )
            Text(
                text = "Average recorded distraction count per interval",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )

            Spacer(modifier = Modifier.height(14.dp))

            SessionType.entries.forEach { type ->
                val typeSessions = sessions.filter { it.sessionType.equals(type.displayName, ignoreCase = true) }
                val distractionList = typeSessions.mapNotNull { it.distractions }
                val avgDistractions = if (distractionList.isNotEmpty()) distractionList.average() else null

                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(vertical = 5.dp),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Text(
                        text = type.displayName,
                        style = MaterialTheme.typography.bodySmall,
                        fontWeight = FontWeight.Medium
                    )

                    Text(
                        text = avgDistractions?.let { String.format(java.util.Locale.US, "%.1f avg", it) } ?: "No logs",
                        style = MaterialTheme.typography.bodySmall,
                        color = if (avgDistractions != null) MaterialTheme.colorScheme.onSurface else MaterialTheme.colorScheme.outline
                    )
                }
            }
        }
    }
}

@Composable
fun DurationFeedbackDistributionCard(sessions: List<SessionEntity>) {
    val feedbackList = sessions.mapNotNull { it.durationFeedback }
    val totalFeedback = feedbackList.size

    val tooShort = feedbackList.count { it == DurationFeedback.TOO_SHORT.value }
    val aboutRight = feedbackList.count { it == DurationFeedback.ABOUT_RIGHT.value }
    val tooLong = feedbackList.count { it == DurationFeedback.TOO_LONG.value }

    Card(
        modifier = Modifier
            .fillMaxWidth()
            .testTag("feedback_distribution_card"),
        shape = RoundedCornerShape(16.dp),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
        border = CardDefaults.outlinedCardBorder()
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(18.dp)
        ) {
            Text(
                text = "Duration Feedback Balance",
                style = MaterialTheme.typography.titleMedium,
                fontFamily = FontFamily.Serif,
                fontWeight = FontWeight.Bold
            )
            Text(
                text = "How intervals felt relative to your expectations",
                style = MaterialTheme.typography.bodySmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )

            Spacer(modifier = Modifier.height(14.dp))

            if (totalFeedback == 0) {
                Text(
                    text = "No duration feedback recorded yet. Provide reflection votes after focus sessions.",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.outline
                )
            } else {
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(10.dp)
                        .clip(RoundedCornerShape(5.dp))
                ) {
                    if (tooShort > 0) {
                        Box(
                            modifier = Modifier
                                .weight(tooShort.toFloat())
                                .background(EnergyBlue)
                        )
                    }
                    if (aboutRight > 0) {
                        Box(
                            modifier = Modifier
                                .weight(aboutRight.toFloat())
                                .background(SuccessGreen)
                        )
                    }
                    if (tooLong > 0) {
                        Box(
                            modifier = Modifier
                                .weight(tooLong.toFloat())
                                .background(EnergyTerracotta)
                        )
                    }
                }

                Spacer(modifier = Modifier.height(12.dp))

                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween
                ) {
                    Text(
                        text = "Too short: $tooShort",
                        style = MaterialTheme.typography.bodySmall,
                        color = EnergyBlue,
                        fontSize = 12.sp
                    )
                    Text(
                        text = "About right: $aboutRight",
                        style = MaterialTheme.typography.bodySmall,
                        color = SuccessGreen,
                        fontSize = 12.sp
                    )
                    Text(
                        text = "Too long: $tooLong",
                        style = MaterialTheme.typography.bodySmall,
                        color = EnergyTerracotta,
                        fontSize = 12.sp
                    )
                }
            }
        }
    }
}

@Composable
fun TopSubjectsCard(sessions: List<SessionEntity>) {
    val subjectMinutes = sessions
        .filter { it.subject.isNotBlank() }
        .groupBy { it.subject }
        .mapValues { entry -> entry.value.sumOf { it.actualSeconds / 60 } }
        .entries
        .sortedByDescending { it.value }
        .take(5)

    if (subjectMinutes.isNotEmpty()) {
        val maxMinutes = subjectMinutes.maxOfOrNull { it.value }?.coerceAtLeast(1) ?: 1

        Card(
            modifier = Modifier
                .fillMaxWidth()
                .testTag("top_subjects_card"),
            shape = RoundedCornerShape(16.dp),
            colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
            border = CardDefaults.outlinedCardBorder()
        ) {
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(18.dp)
            ) {
                Text(
                    text = "Top Focus Topics",
                    style = MaterialTheme.typography.titleMedium,
                    fontFamily = FontFamily.Serif,
                    fontWeight = FontWeight.Bold
                )
                Text(
                    text = "Cumulative focus minutes per subject",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )

                Spacer(modifier = Modifier.height(14.dp))

                subjectMinutes.forEach { (subject, minutes) ->
                    val fraction = minutes.toFloat() / maxMinutes.toFloat()

                    Column(modifier = Modifier.padding(vertical = 4.dp)) {
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.SpaceBetween
                        ) {
                            Text(
                                text = subject,
                                style = MaterialTheme.typography.bodySmall,
                                fontWeight = FontWeight.Medium
                            )
                            Text(
                                text = "$minutes min",
                                style = MaterialTheme.typography.bodySmall,
                                color = EnergyTerracotta
                            )
                        }
                        Spacer(modifier = Modifier.height(4.dp))
                        LinearProgressIndicator(
                            progress = { fraction },
                            modifier = Modifier
                                .fillMaxWidth()
                                .height(6.dp)
                                .clip(RoundedCornerShape(3.dp)),
                            color = EnergyTerracotta,
                            trackColor = MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.3f),
                            strokeCap = StrokeCap.Round
                        )
                    }
                }
            }
        }
    }
}

@Composable
fun RecentReflectionCard(
    insight: String?,
    isLoading: Boolean,
    aiEnabled: Boolean,
    onEnableAi: () -> Unit
) {
    if (!aiEnabled) {
        Card(
            modifier = Modifier
                .fillMaxWidth()
                .testTag("recent_reflection_card"),
            shape = RoundedCornerShape(16.dp),
            colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.35f)),
            border = CardDefaults.outlinedCardBorder()
        ) {
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(16.dp)
            ) {
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    Icon(
                        imageVector = Icons.Default.AutoAwesome,
                        contentDescription = null,
                        tint = EnergyOchre,
                        modifier = Modifier.size(18.dp)
                    )
                    Text(
                        text = "AI Study Reflections",
                        style = MaterialTheme.typography.titleMedium,
                        fontFamily = FontFamily.Serif,
                        fontWeight = FontWeight.Bold
                    )
                }
                Spacer(modifier = Modifier.height(6.dp))
                Text(
                    text = "AI reflections are 100% optional and disabled by default. When enabled, Tempo analyzes your notes to observe focus patterns across energy levels.",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    lineHeight = 16.sp
                )
                Spacer(modifier = Modifier.height(10.dp))
                OutlinedButton(
                    onClick = onEnableAi,
                    modifier = Modifier.testTag("enable_ai_insight_button")
                ) {
                    Icon(
                        imageVector = Icons.Default.AutoAwesome,
                        contentDescription = null,
                        modifier = Modifier.size(14.dp),
                        tint = EnergyOchre
                    )
                    Spacer(modifier = Modifier.width(6.dp))
                    Text("Turn On Reflections", fontSize = 12.sp)
                }
            }
        }
        return
    }

    if (insight == null && !isLoading) return

    Card(
        modifier = Modifier
            .fillMaxWidth()
            .testTag("recent_reflection_card"),
        shape = RoundedCornerShape(16.dp),
        colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
        border = CardDefaults.outlinedCardBorder()
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(18.dp)
        ) {
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                Icon(
                    imageVector = Icons.Default.AutoAwesome,
                    contentDescription = null,
                    tint = EnergyOchre,
                    modifier = Modifier.size(20.dp)
                )
                Text(
                    text = "Recent Focus Reflection",
                    style = MaterialTheme.typography.titleMedium,
                    fontFamily = FontFamily.Serif,
                    fontWeight = FontWeight.Bold
                )
            }

            Spacer(modifier = Modifier.height(10.dp))

            if (isLoading) {
                Text(
                    text = "Synthesizing your recent reflections...",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
                Spacer(modifier = Modifier.height(8.dp))
                LinearProgressIndicator(
                    modifier = Modifier
                        .fillMaxWidth()
                        .height(4.dp)
                        .clip(RoundedCornerShape(2.dp)),
                    color = EnergyOchre,
                    trackColor = MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.3f)
                )
            } else if (!insight.isNullOrBlank()) {
                Text(
                    text = insight,
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurface,
                    lineHeight = 20.sp
                )
            }
        }
    }
}

@Deprecated("Use RecentReflectionCard instead", ReplaceWith("RecentReflectionCard(insight, isLoading, aiEnabled, onEnableAi)"))
@Composable
fun WeeklyInsightCard(
    insight: String?,
    isLoading: Boolean,
    aiEnabled: Boolean,
    onEnableAi: () -> Unit
) = RecentReflectionCard(insight, isLoading, aiEnabled, onEnableAi)
