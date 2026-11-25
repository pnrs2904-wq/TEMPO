package com.tempo.focus.ui.screens

import androidx.compose.animation.AnimatedVisibility
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
import androidx.compose.material.icons.filled.Info
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material.icons.filled.School
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Icon
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.tempo.focus.domain.exams.CaGroupSelection
import com.tempo.focus.domain.exams.ExamRegistry
import com.tempo.focus.domain.prep.ReadinessStatus
import com.tempo.focus.ui.components.ExamSelectionDialog
import com.tempo.focus.ui.theme.EnergyBlue
import com.tempo.focus.ui.theme.EnergyOchre
import com.tempo.focus.ui.theme.EnergyTerracotta
import com.tempo.focus.ui.theme.SuccessGreen
import com.tempo.focus.ui.viewmodel.ExamPrepViewModel
import com.tempo.focus.ui.viewmodel.TempoViewModel
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId

@Composable
fun ExamDashboardScreen(
    tempoViewModel: TempoViewModel,
    examPrepViewModel: ExamPrepViewModel,
    onStartTimerClick: () -> Unit,
    onOpenPrepHub: () -> Unit
) {
    val allSessions by tempoViewModel.allSessions.collectAsStateWithLifecycle()
    val settings by tempoViewModel.userSettings.collectAsStateWithLifecycle()
    val exam by examPrepViewModel.selectedExam.collectAsStateWithLifecycle()
    val caGroup by examPrepViewModel.selectedCaGroup.collectAsStateWithLifecycle()
    val subjectProgress by examPrepViewModel.subjectProgress.collectAsStateWithLifecycle()
    val dueRevisions by examPrepViewModel.dueRevisions.collectAsStateWithLifecycle()
    val mocks by examPrepViewModel.mocks.collectAsStateWithLifecycle()
    val studyPlan by examPrepViewModel.studyPlan.collectAsStateWithLifecycle()
    val readiness by examPrepViewModel.readinessReport.collectAsStateWithLifecycle()

    var showExamPicker by remember { mutableStateOf(false) }
    var showFormulas by remember { mutableStateOf(false) }

    val todayMinutes = remember(allSessions) { tempoViewModel.getTodayFocusMinutes(allSessions) }
    val todaySessionsCount = remember(allSessions) {
        val today = LocalDate.now()
        val zone = ZoneId.systemDefault()
        allSessions.count {
            it.phase == "focus" && it.status == "completed" &&
                Instant.ofEpochMilli(it.timestamp).atZone(zone).toLocalDate() == today
        }
    }
    val streak = remember(allSessions) { tempoViewModel.getStreakInfo(allSessions).currentStreak }
    val dailyGoal = settings.dailyGoalMinutes.coerceAtLeast(1)

    Box(
        modifier = Modifier
            .fillMaxSize()
            .testTag("exam_dashboard_screen"),
        contentAlignment = Alignment.TopCenter
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .widthIn(max = 640.dp)
                .verticalScroll(rememberScrollState())
                .padding(horizontal = 20.dp, vertical = 14.dp),
            verticalArrangement = Arrangement.spacedBy(14.dp)
        ) {
            // Header + Simple/Advanced Mode Toggle
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Column {
                    Text(
                        text = "TEMPO 2.0",
                        style = MaterialTheme.typography.headlineMedium,
                        fontFamily = FontFamily.Serif,
                        fontWeight = FontWeight.Bold,
                        letterSpacing = 2.sp
                    )
                    Text(
                        text = "Examination Intelligence Dashboard",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                }
                OutlinedButton(
                    onClick = { examPrepViewModel.setAdvancedExamMode(false) },
                    shape = RoundedCornerShape(10.dp),
                    modifier = Modifier.testTag("switch_simple_mode_button")
                ) {
                    Text("Simple Mode", style = MaterialTheme.typography.labelSmall)
                }
            }

            // Selected Examination & Countdown Hero Card
            Card(
                modifier = Modifier
                    .fillMaxWidth()
                    .testTag("selected_exam_card"),
                shape = RoundedCornerShape(18.dp),
                colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
                border = CardDefaults.outlinedCardBorder()
            ) {
                Column(modifier = Modifier.padding(16.dp)) {
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.weight(1f)) {
                            Icon(Icons.Default.School, contentDescription = null, tint = MaterialTheme.colorScheme.primary)
                            Spacer(Modifier.width(8.dp))
                            Column {
                                Text(
                                    text = exam.name,
                                    style = MaterialTheme.typography.titleMedium,
                                    fontFamily = FontFamily.Serif,
                                    fontWeight = FontWeight.Bold
                                )
                                Text(
                                    text = "${exam.category.displayName} • ${exam.applicableYear} • ${exam.patternStatus.label}",
                                    style = MaterialTheme.typography.labelSmall,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant
                                )
                            }
                        }
                        OutlinedButton(
                            onClick = { showExamPicker = true },
                            shape = RoundedCornerShape(10.dp),
                            modifier = Modifier.testTag("dashboard_switch_exam_button")
                        ) {
                            Text("Switch", style = MaterialTheme.typography.labelMedium)
                        }
                    }

                    Spacer(Modifier.height(10.dp))
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        val countdownText = studyPlan.daysUntilExam?.let { "$it days remaining" } ?: "Exam date not set"
                        Box(
                            modifier = Modifier
                                .clip(RoundedCornerShape(8.dp))
                                .background(MaterialTheme.colorScheme.primaryContainer)
                                .padding(horizontal = 10.dp, vertical = 5.dp)
                        ) {
                            Text(
                                text = countdownText,
                                style = MaterialTheme.typography.labelMedium,
                                fontWeight = FontWeight.Bold,
                                color = MaterialTheme.colorScheme.onPrimaryContainer
                            )
                        }
                        Text(
                            text = "${exam.markingScheme.totalQuestions}Q • ${exam.markingScheme.maxMarks.toInt()}M",
                            style = MaterialTheme.typography.labelSmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                    }

                    if (exam.supportsCaGroups) {
                        Spacer(Modifier.height(8.dp))
                        Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                            CaGroupSelection.entries.forEach { g ->
                                FilterChip(
                                    selected = caGroup == g,
                                    onClick = { examPrepViewModel.setCaGroup(g) },
                                    label = { Text(g.label, style = MaterialTheme.typography.labelSmall) }
                                )
                            }
                        }
                    }
                }
            }

            // Today's Target & Quick Launch Card
            Card(
                modifier = Modifier.fillMaxWidth(),
                shape = RoundedCornerShape(16.dp),
                colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
                border = CardDefaults.outlinedCardBorder()
            ) {
                Column(modifier = Modifier.padding(16.dp)) {
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Column {
                            Text(
                                text = "Today's Focus Target",
                                style = MaterialTheme.typography.titleSmall,
                                fontWeight = FontWeight.Bold
                            )
                            Text(
                                text = "$todayMinutes / $dailyGoal min • $todaySessionsCount sessions • ${streak}d streak",
                                style = MaterialTheme.typography.bodySmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant
                            )
                        }
                        Button(
                            onClick = onStartTimerClick,
                            shape = RoundedCornerShape(12.dp),
                            modifier = Modifier.testTag("dashboard_start_timer_button")
                        ) {
                            Icon(Icons.Default.PlayArrow, contentDescription = null, modifier = Modifier.size(18.dp))
                            Spacer(Modifier.width(4.dp))
                            Text("Focus")
                        }
                    }
                    Spacer(Modifier.height(10.dp))
                    LinearProgressIndicator(
                        progress = { (todayMinutes.toFloat() / dailyGoal.toFloat()).coerceIn(0f, 1f) },
                        modifier = Modifier
                            .fillMaxWidth()
                            .height(7.dp)
                            .clip(RoundedCornerShape(4.dp)),
                        color = MaterialTheme.colorScheme.primary,
                        trackColor = MaterialTheme.colorScheme.surfaceVariant
                    )
                }
            }

            // 4-Pillar Exam Readiness Dashboard
            Card(
                modifier = Modifier
                    .fillMaxWidth()
                    .testTag("readiness_dashboard_card"),
                shape = RoundedCornerShape(18.dp),
                colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
                border = CardDefaults.outlinedCardBorder()
            ) {
                Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(10.dp)) {
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Text(
                            text = "4-Pillar Exam Readiness",
                            style = MaterialTheme.typography.titleMedium,
                            fontFamily = FontFamily.Serif,
                            fontWeight = FontWeight.Bold
                        )
                        Row(
                            modifier = Modifier
                                .clip(RoundedCornerShape(8.dp))
                                .clickable { showFormulas = !showFormulas }
                                .padding(horizontal = 6.dp, vertical = 4.dp),
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Icon(Icons.Default.Info, contentDescription = "How readiness is calculated", modifier = Modifier.size(15.dp), tint = MaterialTheme.colorScheme.primary)
                            Spacer(Modifier.width(4.dp))
                            Text(
                                text = if (showFormulas) "Hide formulas" else "How calculated",
                                style = MaterialTheme.typography.labelSmall,
                                color = MaterialTheme.colorScheme.primary,
                                fontWeight = FontWeight.SemiBold
                            )
                        }
                    }

                    Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                        PillarTile(
                            title = "A. Consistency",
                            value = "${readiness.consistency.scorePercent}%",
                            subtitle = "${readiness.consistency.activeDaysLast14Days}/14 active days • ${readiness.consistency.studyHoursLast14Days}h",
                            accent = EnergyBlue,
                            modifier = Modifier.weight(1f)
                        )
                        PillarTile(
                            title = "B. Coverage",
                            value = "${readiness.coverage.scorePercent}%",
                            subtitle = "${readiness.coverage.completedOrMasteredTopics}/${readiness.coverage.totalTopics} topics • ${readiness.coverage.overdueBacklog} due",
                            accent = EnergyOchre,
                            modifier = Modifier.weight(1f)
                        )
                    }

                    Row(horizontalArrangement = Arrangement.spacedBy(10.dp)) {
                        PillarTile(
                            title = "C. Competency",
                            value = readiness.competency.scorePercent?.let { "$it%" } ?: "Insufficient data",
                            subtitle = readiness.competency.averageAccuracyPercent?.let { "Acc $it% • Mastered ${readiness.competency.masteredTopicsPercent}%" }
                                ?: "Log mocks or revisions",
                            accent = SuccessGreen,
                            modifier = Modifier.weight(1f)
                        )

                        val examReady = readiness.examReadiness
                        val dValue = when (examReady) {
                            is ReadinessStatus.ReadyScore -> "${examReady.scorePercent}%"
                            is ReadinessStatus.InsufficientData -> "Insufficient data"
                        }
                        val dSub = when (examReady) {
                            is ReadinessStatus.ReadyScore -> "Mock avg ${examReady.recentMockAveragePercent}% • ${examReady.trendLabel}"
                            is ReadinessStatus.InsufficientData -> "${examReady.mocksRecorded}/${examReady.mocksRequired} mocks logged"
                        }
                        PillarTile(
                            title = "D. Exam Readiness",
                            value = dValue,
                            subtitle = dSub,
                            accent = EnergyTerracotta,
                            modifier = Modifier
                                .weight(1f)
                                .testTag("exam_readiness_pillar")
                        )
                    }

                    AnimatedVisibility(visible = showFormulas) {
                        Column(
                            modifier = Modifier
                                .fillMaxWidth()
                                .clip(RoundedCornerShape(10.dp))
                                .background(MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.55f))
                                .padding(10.dp),
                            verticalArrangement = Arrangement.spacedBy(4.dp)
                        ) {
                            Text("A. Consistency: ${readiness.consistency.calculationFormula}", style = MaterialTheme.typography.labelSmall)
                            Text("B. Coverage: ${readiness.coverage.calculationFormula}", style = MaterialTheme.typography.labelSmall)
                            Text("C. Competency: ${readiness.competency.calculationFormula}", style = MaterialTheme.typography.labelSmall)
                            val dFormula = when (val r = readiness.examReadiness) {
                                is ReadinessStatus.ReadyScore -> r.calculationFormula
                                is ReadinessStatus.InsufficientData -> r.calculationFormula
                            }
                            Text("D. Exam Readiness: $dFormula", style = MaterialTheme.typography.labelSmall)
                        }
                    }
                }
            }

            // Subject-Wise Progress & Weak Subjects
            Card(
                modifier = Modifier.fillMaxWidth(),
                shape = RoundedCornerShape(16.dp),
                colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
                border = CardDefaults.outlinedCardBorder()
            ) {
                Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Text(
                            text = "Subject Progress & Due Revisions",
                            style = MaterialTheme.typography.titleSmall,
                            fontFamily = FontFamily.Serif,
                            fontWeight = FontWeight.Bold
                        )
                        TextButton(onClick = onOpenPrepHub) { Text("Open Prep Hub") }
                    }
                    subjectProgress.take(5).forEach { sp ->
                        Column {
                            Row(
                                modifier = Modifier.fillMaxWidth(),
                                horizontalArrangement = Arrangement.SpaceBetween
                            ) {
                                Text(sp.subject, style = MaterialTheme.typography.bodySmall, fontWeight = FontWeight.SemiBold, modifier = Modifier.weight(1f))
                                Text(
                                    text = "${sp.completedTopics}/${sp.totalTopics}" + if (sp.dueRevisions > 0) " • ${sp.dueRevisions} due" else "",
                                    style = MaterialTheme.typography.labelSmall,
                                    color = if (sp.dueRevisions > 0) EnergyTerracotta else MaterialTheme.colorScheme.onSurfaceVariant
                                )
                            }
                            LinearProgressIndicator(
                                progress = { sp.completionRatio },
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .padding(top = 4.dp)
                                    .height(5.dp)
                                    .clip(RoundedCornerShape(3.dp)),
                                color = SuccessGreen,
                                trackColor = MaterialTheme.colorScheme.surfaceVariant
                            )
                        }
                    }

                    if (dueRevisions.isNotEmpty()) {
                        Text(
                            text = "${dueRevisions.size} topic(s) due for spaced revision today.",
                            style = MaterialTheme.typography.labelSmall,
                            color = EnergyTerracotta,
                            fontWeight = FontWeight.SemiBold
                        )
                    }
                }
            }

            // Upcoming Tasks & Mock Trend Summary
            Card(
                modifier = Modifier.fillMaxWidth(),
                shape = RoundedCornerShape(16.dp),
                colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
                border = CardDefaults.outlinedCardBorder()
            ) {
                Column(modifier = Modifier.padding(16.dp), verticalArrangement = Arrangement.spacedBy(6.dp)) {
                    Text(
                        text = "Today's Study Plan & Mock Trend",
                        style = MaterialTheme.typography.titleSmall,
                        fontFamily = FontFamily.Serif,
                        fontWeight = FontWeight.Bold
                    )
                    studyPlan.todayTasks.take(3).forEach { task ->
                        Text(
                            text = "• ${task.taskType}: ${task.subject} — ${task.topicName} (${task.allocatedMinutes}m)",
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurface
                        )
                    }
                    Spacer(Modifier.height(4.dp))
                    Text(
                        text = if (mocks.isEmpty()) {
                            "Mock Trend: No mock tests recorded yet for ${exam.shortName}."
                        } else {
                            val latest = mocks.first()
                            "Latest Mock: ${latest.mockName} — ${latest.totalScore}/${latest.maxMarks.toInt()} (${latest.percentage}%, Acc ${latest.accuracyPercent}%)"
                        },
                        style = MaterialTheme.typography.labelSmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                }
            }

            Spacer(Modifier.height(20.dp))
        }
    }

    if (showExamPicker) {
        ExamSelectorDialog(
            currentExamId = exam.examId,
            currentCaGroup = caGroup,
            onDismiss = { showExamPicker = false },
            onSelectExam = { newExamId ->
                examPrepViewModel.switchExamination(newExamId) {
                    tempoViewModel.updateSubject("")
                }
                showExamPicker = false
            },
            onSelectCaGroup = { examPrepViewModel.setCaGroup(it) }
        )
    }
}

@Composable
private fun PillarTile(
    title: String,
    value: String,
    subtitle: String,
    accent: Color,
    modifier: Modifier = Modifier
) {
    Column(
        modifier = modifier
            .clip(RoundedCornerShape(12.dp))
            .background(accent.copy(alpha = 0.1f))
            .padding(12.dp)
    ) {
        Text(
            text = title,
            style = MaterialTheme.typography.labelSmall,
            color = accent,
            fontWeight = FontWeight.Bold
        )
        Text(
            text = value,
            style = MaterialTheme.typography.titleMedium,
            fontWeight = FontWeight.Bold,
            color = MaterialTheme.colorScheme.onSurface
        )
        Text(
            text = subtitle,
            style = MaterialTheme.typography.labelSmall,
            color = MaterialTheme.colorScheme.onSurfaceVariant,
            lineHeight = 14.sp
        )
    }
}

@Composable
fun ExamSelectorDialog(
    currentExamId: String,
    currentCaGroup: CaGroupSelection = CaGroupSelection.BOTH,
    onDismiss: () -> Unit,
    onSelectExam: (String) -> Unit,
    onSelectCaGroup: ((CaGroupSelection) -> Unit)? = null
) {
    ExamSelectionDialog(
        currentExamId = currentExamId,
        currentCaGroup = currentCaGroup,
        onDismiss = onDismiss,
        onExamSelected = { scopedMetadata ->
            onSelectExam(scopedMetadata.exam.examId)
        },
        onCaGroupSelected = onSelectCaGroup
    )
}
