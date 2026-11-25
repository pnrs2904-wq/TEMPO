package com.tempo.focus.ui.screens.prep

import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.FilterChip
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
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
import com.tempo.focus.data.db.RevisionEventEntity
import com.tempo.focus.data.db.TopicProgressEntity
import com.tempo.focus.domain.exams.ExamConfig
import com.tempo.focus.domain.prep.RevisionMethod
import com.tempo.focus.domain.prep.RevisionSchedulerEngine
import com.tempo.focus.ui.theme.EnergyOchre
import com.tempo.focus.ui.theme.EnergyTerracotta
import com.tempo.focus.ui.theme.SuccessGreen
import java.time.LocalDate

@Composable
fun RevisionsTabContent(
    exam: ExamConfig,
    dueTopics: List<TopicProgressEntity>,
    allTopics: List<TopicProgressEntity>,
    revisionHistory: List<RevisionEventEntity>,
    onLogRevision: (TopicProgressEntity, Int, Int?, Int, RevisionMethod, String?) -> Unit,
    onReschedule: (TopicProgressEntity, Long) -> Unit
) {
    var selectedTopicForLog by remember { mutableStateOf<TopicProgressEntity?>(null) }

    Column(
        modifier = Modifier
            .fillMaxWidth()
            .testTag("revisions_tab_content"),
        verticalArrangement = Arrangement.spacedBy(14.dp)
    ) {
        // Spaced Repetition Rules Banner
        Card(
            shape = RoundedCornerShape(14.dp),
            colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
            border = CardDefaults.outlinedCardBorder()
        ) {
            Column(modifier = Modifier.padding(14.dp)) {
                Text(
                    text = "Intelligent Revision Engine",
                    style = MaterialTheme.typography.titleSmall,
                    fontFamily = FontFamily.Serif,
                    fontWeight = FontWeight.Bold
                )
                Text(
                    text = "Intervals (${exam.revisionRule.intervalsDays.joinToString(", ")} days) are calculated strictly from your actual revision date and adapted to your recall rating. Same-day duplicate revisions are automatically prevented.",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
            }
        }

        // Due & Overdue Queue
        Text(
            text = "DUE FOR REVISION (${dueTopics.size})",
            style = MaterialTheme.typography.labelMedium,
            fontWeight = FontWeight.Bold,
            color = if (dueTopics.isNotEmpty()) EnergyTerracotta else MaterialTheme.colorScheme.onSurfaceVariant
        )

        if (dueTopics.isEmpty()) {
            Card(
                modifier = Modifier.fillMaxWidth(),
                shape = RoundedCornerShape(14.dp),
                colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.45f))
            ) {
                Column(modifier = Modifier.padding(16.dp)) {
                    Text(
                        text = "No overdue revisions right now.",
                        style = MaterialTheme.typography.titleSmall,
                        fontWeight = FontWeight.SemiBold,
                        color = SuccessGreen
                    )
                    Text(
                        text = "Complete topics in your Syllabus tab or log a proactive revision below.",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                    if (allTopics.isNotEmpty()) {
                        Spacer(Modifier.height(10.dp))
                        OutlinedButton(onClick = { selectedTopicForLog = allTopics.first() }) {
                            Text("Log Proactive Revision")
                        }
                    }
                }
            }
        } else {
            dueTopics.forEach { topic ->
                Card(
                    modifier = Modifier.fillMaxWidth(),
                    shape = RoundedCornerShape(14.dp),
                    colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
                    border = CardDefaults.outlinedCardBorder()
                ) {
                    Column(modifier = Modifier.padding(14.dp)) {
                        Text(
                            text = topic.subject,
                            style = MaterialTheme.typography.labelSmall,
                            color = EnergyOchre,
                            fontWeight = FontWeight.Bold
                        )
                        Text(
                            text = topic.topicName,
                            style = MaterialTheme.typography.titleSmall,
                            fontWeight = FontWeight.SemiBold
                        )
                        val dueDateStr = topic.nextRevisionEpochDay?.let { LocalDate.ofEpochDay(it).toString() } ?: "Today"
                        Text(
                            text = "Due: $dueDateStr • Past revisions: ${topic.revisionCount}",
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                        Spacer(Modifier.height(10.dp))
                        Row(
                            horizontalArrangement = Arrangement.spacedBy(8.dp),
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Button(
                                onClick = { selectedTopicForLog = topic },
                                shape = RoundedCornerShape(10.dp),
                                modifier = Modifier.testTag("log_revision_btn_${topic.id}")
                            ) {
                                Text("Log Revision")
                            }
                            OutlinedButton(
                                onClick = { onReschedule(topic, 2) },
                                shape = RoundedCornerShape(10.dp)
                            ) {
                                Text("+2d")
                            }
                            OutlinedButton(
                                onClick = { onReschedule(topic, 5) },
                                shape = RoundedCornerShape(10.dp)
                            ) {
                                Text("+5d")
                            }
                        }
                    }
                }
            }
        }

        // Chronological Revision Event History
        Text(
            text = "REVISION HISTORY (${revisionHistory.size})",
            style = MaterialTheme.typography.labelMedium,
            fontWeight = FontWeight.Bold,
            color = MaterialTheme.colorScheme.onSurfaceVariant
        )

        if (revisionHistory.isEmpty()) {
            Card(
                modifier = Modifier.fillMaxWidth(),
                shape = RoundedCornerShape(14.dp),
                colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.35f))
            ) {
                Text(
                    text = "No revision events logged yet for ${exam.shortName}. Your complete spaced-repetition trail will appear here.",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.padding(16.dp)
                )
            }
        } else {
            revisionHistory.take(25).forEach { event ->
                val actualDate = LocalDate.ofEpochDay(event.revisionEpochDay)
                val nextDate = LocalDate.ofEpochDay(event.nextRevisionEpochDay)
                Card(
                    modifier = Modifier.fillMaxWidth(),
                    shape = RoundedCornerShape(12.dp),
                    colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
                    border = CardDefaults.outlinedCardBorder()
                ) {
                    Column(modifier = Modifier.padding(12.dp)) {
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.SpaceBetween
                        ) {
                            Text(
                                text = "Rev #${event.revisionNumber} • ${event.topicName}",
                                style = MaterialTheme.typography.bodyMedium,
                                fontWeight = FontWeight.SemiBold,
                                modifier = Modifier.weight(1f)
                            )
                            Text(
                                text = "Recall ${event.recallRating}/5",
                                style = MaterialTheme.typography.labelMedium,
                                fontWeight = FontWeight.Bold,
                                color = if (event.recallRating >= 4) SuccessGreen else EnergyOchre
                            )
                        }
                        Spacer(Modifier.height(4.dp))
                        Text(
                            text = "${event.subject} • ${RevisionMethod.fromValue(event.method).displayName}" +
                                (event.accuracyPercent?.let { " • Accuracy $it%" } ?: ""),
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                        Text(
                            text = "Done $actualDate → Next scheduled: $nextDate",
                            style = MaterialTheme.typography.labelSmall,
                            color = MaterialTheme.colorScheme.primary
                        )
                    }
                }
            }
        }
    }

    selectedTopicForLog?.let { topic ->
        LogRevisionDialog(
            exam = exam,
            topic = topic,
            onDismiss = { selectedTopicForLog = null },
            onSubmit = { recall, accuracy, diff, method, notes ->
                onLogRevision(topic, recall, accuracy, diff, method, notes)
                selectedTopicForLog = null
            }
        )
    }
}

@Composable
fun LogRevisionDialog(
    exam: ExamConfig,
    topic: TopicProgressEntity,
    onDismiss: () -> Unit,
    onSubmit: (Int, Int?, Int, RevisionMethod, String?) -> Unit
) {
    var recall by remember { mutableIntStateOf(3) }
    var difficulty by remember { mutableIntStateOf(3) }
    var accuracyText by remember { mutableStateOf("") }
    var method by remember { mutableStateOf(RevisionMethod.ACTIVE_RECALL) }
    var notes by remember { mutableStateOf("") }

    val preview = RevisionSchedulerEngine.calculateNextRevision(
        actualRevisionDate = LocalDate.now(),
        previousRevisionCount = topic.revisionCount,
        recallRating = recall,
        accuracyPercent = accuracyText.toIntOrNull(),
        difficulty = difficulty,
        rule = exam.revisionRule
    )

    AlertDialog(
        onDismissRequest = onDismiss,
        title = {
            Column {
                Text("Log Revision Event", fontFamily = FontFamily.Serif, fontWeight = FontWeight.Bold)
                Text(topic.topicName, style = MaterialTheme.typography.bodySmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
            }
        },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                Text("Recall Rating (1 = poor, 5 = effortless)", style = MaterialTheme.typography.labelSmall, fontWeight = FontWeight.SemiBold)
                Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                    (1..5).forEach { r ->
                        Box(
                            contentAlignment = Alignment.Center,
                            modifier = Modifier
                                .weight(1f)
                                .clip(RoundedCornerShape(8.dp))
                                .background(if (recall == r) MaterialTheme.colorScheme.primary else MaterialTheme.colorScheme.surfaceVariant)
                                .clickable { recall = r }
                                .padding(vertical = 8.dp)
                        ) {
                            Text(
                                text = "$r",
                                fontWeight = FontWeight.Bold,
                                color = if (recall == r) MaterialTheme.colorScheme.onPrimary else MaterialTheme.colorScheme.onSurface
                            )
                        }
                    }
                }

                Text("Revision Method", style = MaterialTheme.typography.labelSmall, fontWeight = FontWeight.SemiBold)
                Row(
                    modifier = Modifier.horizontalScroll(rememberScrollState()),
                    horizontalArrangement = Arrangement.spacedBy(6.dp)
                ) {
                    RevisionMethod.entries.forEach { m ->
                        FilterChip(
                            selected = method == m,
                            onClick = { method = m },
                            label = { Text(m.displayName, style = MaterialTheme.typography.labelSmall) }
                        )
                    }
                }

                OutlinedTextField(
                    value = accuracyText,
                    onValueChange = { if (it.all(Char::isDigit) && it.length <= 3) accuracyText = it },
                    label = { Text("Practice Accuracy % (optional)") },
                    keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                    singleLine = true
                )

                OutlinedTextField(
                    value = notes,
                    onValueChange = { notes = it.take(180) },
                    label = { Text("Revision Notes (optional)") },
                    singleLine = true
                )

                Box(
                    modifier = Modifier
                        .fillMaxWidth()
                        .clip(RoundedCornerShape(10.dp))
                        .background(MaterialTheme.colorScheme.secondaryContainer)
                        .padding(10.dp)
                ) {
                    Text(
                        text = "${preview.explanation} (${preview.nextRevisionDate})",
                        style = MaterialTheme.typography.labelSmall,
                        color = MaterialTheme.colorScheme.onSecondaryContainer
                    )
                }
            }
        },
        confirmButton = {
            Button(
                onClick = { onSubmit(recall, accuracyText.toIntOrNull(), difficulty, method, notes) },
                modifier = Modifier.testTag("confirm_log_revision_button")
            ) { Text("Save Revision") }
        },
        dismissButton = { TextButton(onClick = onDismiss) { Text("Cancel") } }
    )
}
