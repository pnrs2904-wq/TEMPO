package com.tempo.focus.ui.screens.prep

import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
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
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.input.KeyboardType
import androidx.compose.ui.unit.dp
import com.tempo.focus.data.db.UserExamPlanEntity
import com.tempo.focus.domain.exams.WeightageSource
import com.tempo.focus.domain.prep.AdaptiveStudyPlan
import com.tempo.focus.ui.theme.EnergyBlue
import com.tempo.focus.ui.theme.EnergyOchre
import com.tempo.focus.ui.theme.EnergyTerracotta
import com.tempo.focus.ui.theme.SuccessGreen
import java.time.LocalDate

@Composable
fun StudyPlanTabContent(
    plan: AdaptiveStudyPlan,
    savedPlanEntity: UserExamPlanEntity?,
    onUpdatePlanConfig: (LocalDate?, Boolean, Double, Int, Int) -> Unit
) {
    var showConfigDialog by remember { mutableStateOf(false) }

    Column(
        modifier = Modifier
            .fillMaxWidth()
            .testTag("study_plan_tab_content"),
        verticalArrangement = Arrangement.spacedBy(12.dp)
    ) {
        // Plan Summary & Edit Header
        Card(
            shape = RoundedCornerShape(16.dp),
            colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
            border = CardDefaults.outlinedCardBorder()
        ) {
            Column(modifier = Modifier.padding(14.dp)) {
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Column(modifier = Modifier.weight(1f)) {
                        Text(
                            text = "Adaptive Study Plan",
                            style = MaterialTheme.typography.titleMedium,
                            fontFamily = FontFamily.Serif,
                            fontWeight = FontWeight.Bold
                        )
                        val countdown = plan.daysUntilExam?.let { "$it days to exam" } ?: "Set exam date for countdown"
                        Text(
                            text = "$countdown • ${plan.dailyTargetMinutes / 60.0}h/day • ${plan.studyDaysPerWeek} days/wk",
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                    }
                    OutlinedButton(
                        onClick = { showConfigDialog = true },
                        shape = RoundedCornerShape(10.dp),
                        modifier = Modifier.testTag("edit_study_plan_button")
                    ) {
                        Text("Configure")
                    }
                }

                if (plan.revisionBacklogCount > 0) {
                    Spacer(Modifier.height(8.dp))
                    Box(
                        modifier = Modifier
                            .fillMaxWidth()
                            .clip(RoundedCornerShape(10.dp))
                            .background(EnergyTerracotta.copy(alpha = 0.12f))
                            .padding(10.dp)
                    ) {
                        Text(
                            text = "Backlog Recovery Active: ${plan.revisionBacklogCount} overdue revision(s) — allocating ${plan.backlogRecoveryMinutesPerDay} min/day automatically.",
                            style = MaterialTheme.typography.labelSmall,
                            color = EnergyTerracotta,
                            fontWeight = FontWeight.SemiBold
                        )
                    }
                }
            }
        }

        // Today's Prioritized Plan
        Text(
            text = "TODAY'S PLAN",
            style = MaterialTheme.typography.labelMedium,
            fontWeight = FontWeight.Bold,
            color = MaterialTheme.colorScheme.onSurfaceVariant
        )
        plan.todayTasks.forEach { task ->
            Card(
                modifier = Modifier.fillMaxWidth(),
                shape = RoundedCornerShape(12.dp),
                colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
                border = CardDefaults.outlinedCardBorder()
            ) {
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(12.dp),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Column(modifier = Modifier.weight(1f)) {
                        Text(
                            text = "${task.taskType} • ${task.subject}",
                            style = MaterialTheme.typography.labelSmall,
                            fontWeight = FontWeight.Bold,
                            color = if (task.isBacklogRecovery) EnergyTerracotta else MaterialTheme.colorScheme.primary
                        )
                        Text(
                            text = task.topicName,
                            style = MaterialTheme.typography.bodyMedium,
                            fontWeight = FontWeight.SemiBold
                        )
                        SourceTag(task.weightageSource)
                    }
                    Text(
                        text = "${task.allocatedMinutes}m",
                        style = MaterialTheme.typography.titleMedium,
                        fontWeight = FontWeight.Bold,
                        color = MaterialTheme.colorScheme.onSurface
                    )
                }
            }
        }

        // Weighted Subject Allocations (Transparent Official vs Historical vs Algorithmic)
        Text(
            text = "WEIGHTED SUBJECT ALLOCATION (WEEKLY)",
            style = MaterialTheme.typography.labelMedium,
            fontWeight = FontWeight.Bold,
            color = MaterialTheme.colorScheme.onSurfaceVariant
        )
        plan.subjectAllocations.forEach { alloc ->
            Card(
                modifier = Modifier.fillMaxWidth(),
                shape = RoundedCornerShape(12.dp),
                colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
                border = CardDefaults.outlinedCardBorder()
            ) {
                Column(modifier = Modifier.padding(12.dp)) {
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Text(
                            text = alloc.subject,
                            style = MaterialTheme.typography.bodyMedium,
                            fontWeight = FontWeight.Bold,
                            modifier = Modifier.weight(1f)
                        )
                        Text(
                            text = "${alloc.allocatedMinutesPerWeek}m/wk (${alloc.sharePercent}%)",
                            style = MaterialTheme.typography.labelMedium,
                            fontWeight = FontWeight.Bold,
                            color = MaterialTheme.colorScheme.primary
                        )
                    }
                    Spacer(Modifier.height(4.dp))
                    Text(
                        text = alloc.rationale,
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                    Spacer(Modifier.height(6.dp))
                    SourceTag(alloc.weightageSource)
                }
            }
        }

        // Weekly Timetable & Monthly Milestones
        Text(
            text = "WEEKLY TIMETABLE (MOCK DAY: ${plan.nextRecommendedMockDay.uppercase()})",
            style = MaterialTheme.typography.labelMedium,
            fontWeight = FontWeight.Bold,
            color = MaterialTheme.colorScheme.onSurfaceVariant
        )
        plan.weeklySchedule.forEach { day ->
            Card(
                modifier = Modifier.fillMaxWidth(),
                shape = RoundedCornerShape(12.dp),
                colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.35f))
            ) {
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(10.dp),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Column(modifier = Modifier.weight(1f)) {
                        Text(
                            text = "${day.dayOfWeek.name.lowercase().replaceFirstChar { it.uppercase() }} (${day.date})",
                            style = MaterialTheme.typography.labelLarge,
                            fontWeight = FontWeight.Bold
                        )
                        Text(
                            text = if (day.tasks.isEmpty()) {
                                "Rest & light recovery day"
                            } else {
                                day.tasks.joinToString(" • ") { "${it.subject} (${it.allocatedMinutes}m)" }
                            },
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                    }
                    Text(
                        text = "${day.totalMinutes}m",
                        style = MaterialTheme.typography.labelLarge,
                        fontWeight = FontWeight.Bold
                    )
                }
            }
        }

        Text(
            text = "MONTHLY MILESTONES",
            style = MaterialTheme.typography.labelMedium,
            fontWeight = FontWeight.Bold,
            color = MaterialTheme.colorScheme.onSurfaceVariant
        )
        plan.monthlyMilestones.forEach { ms ->
            Card(
                modifier = Modifier.fillMaxWidth(),
                shape = RoundedCornerShape(12.dp),
                colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
                border = CardDefaults.outlinedCardBorder()
            ) {
                Column(modifier = Modifier.padding(12.dp)) {
                    Text(ms.monthLabel, style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.Bold)
                    Text(
                        text = "Target: ${ms.targetTopicsToComplete} topics • ${ms.recommendedMocks} timed mocks",
                        style = MaterialTheme.typography.labelSmall,
                        color = SuccessGreen,
                        fontWeight = FontWeight.SemiBold
                    )
                    Text(
                        text = ms.focusDirective,
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                }
            }
        }
    }

    if (showConfigDialog) {
        StudyPlanConfigDialog(
            initialDaysAhead = plan.daysUntilExam?.toInt() ?: 90,
            initialDailyHours = savedPlanEntity?.dailyHours ?: (plan.dailyTargetMinutes / 60.0),
            initialStudyDays = savedPlanEntity?.studyDaysPerWeek ?: plan.studyDaysPerWeek,
            initialTargetPercent = savedPlanEntity?.targetScorePercent ?: 75,
            onDismiss = { showConfigDialog = false },
            onSave = { daysAhead, hours, studyDays, target ->
                val date = daysAhead?.let { LocalDate.now().plusDays(it.toLong()) }
                onUpdatePlanConfig(date, daysAhead == null, hours, studyDays, target)
                showConfigDialog = false
            }
        )
    }
}

@Composable
private fun SourceTag(source: WeightageSource) {
    val color = when (source) {
        WeightageSource.OFFICIAL_NOTIFICATION -> SuccessGreen
        WeightageSource.HISTORICAL_ANALYSIS -> EnergyBlue
        WeightageSource.ALGORITHMIC_RECOMMENDATION -> EnergyOchre
    }
    Box(
        modifier = Modifier
            .padding(top = 4.dp)
            .clip(RoundedCornerShape(6.dp))
            .background(color.copy(alpha = 0.14f))
            .padding(horizontal = 8.dp, vertical = 2.dp)
    ) {
        Text(
            text = source.label,
            style = MaterialTheme.typography.labelSmall,
            color = color,
            fontWeight = FontWeight.SemiBold
        )
    }
}

@Composable
private fun StudyPlanConfigDialog(
    initialDaysAhead: Int,
    initialDailyHours: Double,
    initialStudyDays: Int,
    initialTargetPercent: Int,
    onDismiss: () -> Unit,
    onSave: (Int?, Double, Int, Int) -> Unit
) {
    var daysStr by remember { mutableStateOf(initialDaysAhead.toString()) }
    var hoursStr by remember { mutableStateOf(String.format("%.1f", initialDailyHours)) }
    var studyDaysStr by remember { mutableStateOf(initialStudyDays.toString()) }
    var targetStr by remember { mutableStateOf(initialTargetPercent.toString()) }

    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Configure Study Plan", fontFamily = FontFamily.Serif, fontWeight = FontWeight.Bold) },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                OutlinedTextField(
                    value = daysStr,
                    onValueChange = { daysStr = it.filter(Char::isDigit) },
                    label = { Text("Days until exam (blank to clear)") },
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                    singleLine = true
                )
                OutlinedTextField(
                    value = hoursStr,
                    onValueChange = { hoursStr = it },
                    label = { Text("Available daily hours (0.5 - 14)") },
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal),
                    singleLine = true
                )
                OutlinedTextField(
                    value = studyDaysStr,
                    onValueChange = { studyDaysStr = it.filter(Char::isDigit) },
                    label = { Text("Study days per week (1 - 7)") },
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                    singleLine = true
                )
                OutlinedTextField(
                    value = targetStr,
                    onValueChange = { targetStr = it.filter(Char::isDigit) },
                    label = { Text("Target score % (30 - 100)") },
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                    singleLine = true
                )
            }
        },
        confirmButton = {
            Button(onClick = {
                onSave(
                    daysStr.toIntOrNull(),
                    hoursStr.toDoubleOrNull() ?: 4.0,
                    studyDaysStr.toIntOrNull() ?: 6,
                    targetStr.toIntOrNull() ?: 75
                )
            }) { Text("Update Plan") }
        },
        dismissButton = { TextButton(onClick = onDismiss) { Text("Cancel") } }
    )
}
