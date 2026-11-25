package com.tempo.focus.ui.screens.prep

import androidx.compose.foundation.background
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.DeleteOutline
import androidx.compose.material.icons.filled.FactCheck
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Switch
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateListOf
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
import com.tempo.focus.data.db.MockTestEntity
import com.tempo.focus.domain.exams.ExamConfig
import com.tempo.focus.domain.exams.MarkingScheme
import com.tempo.focus.domain.prep.ErrorCategory
import com.tempo.focus.domain.prep.MockTestScoringEngine
import com.tempo.focus.domain.prep.QuestionAttemptInput
import com.tempo.focus.ui.theme.EnergyBlue
import com.tempo.focus.ui.theme.EnergyOchre
import com.tempo.focus.ui.theme.EnergyTerracotta
import com.tempo.focus.ui.theme.SuccessGreen
import java.time.Instant
import java.time.ZoneId
import java.time.format.DateTimeFormatter

@Composable
fun MocksTabContent(
    exam: ExamConfig,
    mocks: List<MockTestEntity>,
    errorDiagnostics: Map<ErrorCategory, Int>,
    onRecordQuickMock: (
        mockName: String,
        totalQuestions: Int,
        correctAnswers: Int,
        incorrectAnswers: Int,
        durationMinutes: Int,
        positiveMarks: Double?,
        negativeMarks: Double?,
        negativeEnabled: Boolean,
        weakestSubject: String?,
        notes: String?
    ) -> Unit,
    onRecordDetailedMock: (String, List<QuestionAttemptInput>, Int, String?) -> Unit,
    onDeleteMock: (String) -> Unit
) {
    var showQuickDialog by remember { mutableStateOf(false) }
    var showDetailedDialog by remember { mutableStateOf(false) }
    var pendingDeleteMock by remember { mutableStateOf<MockTestEntity?>(null) }

    val scheme = exam.markingScheme
    val formatter = remember { DateTimeFormatter.ofPattern("dd MMM yyyy") }

    Column(
        modifier = Modifier
            .fillMaxWidth()
            .testTag("mocks_tab_content"),
        verticalArrangement = Arrangement.spacedBy(12.dp)
    ) {
        // Marking Scheme & Action Card
        Card(
            shape = RoundedCornerShape(16.dp),
            colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
            border = CardDefaults.outlinedCardBorder()
        ) {
            Column(modifier = Modifier.padding(14.dp)) {
                Text(
                    text = "${exam.shortName} Scoring Configuration",
                    style = MaterialTheme.typography.titleSmall,
                    fontFamily = FontFamily.Serif,
                    fontWeight = FontWeight.Bold
                )
                Spacer(Modifier.height(4.dp))
                val negText = if (scheme.hasNegativeMarking) "-${scheme.negativeMarks} wrong" else "No negative marking"
                Text(
                    text = "${scheme.totalQuestions} Qs • Max ${scheme.maxMarks.toInt()} marks • +${scheme.positiveMarks} correct, $negText • ${scheme.durationMinutes} min",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
                scheme.passCriteriaNote?.let {
                    Text(
                        text = it,
                        style = MaterialTheme.typography.labelSmall,
                        color = MaterialTheme.colorScheme.primary,
                        modifier = Modifier.padding(top = 4.dp)
                    )
                }

                if (scheme.sectionalTimeLimits.isNotEmpty()) {
                    Spacer(Modifier.height(8.dp))
                    Row(
                        modifier = Modifier.horizontalScroll(rememberScrollState()),
                        horizontalArrangement = Arrangement.spacedBy(6.dp)
                    ) {
                        scheme.sectionalTimeLimits.forEach { sec ->
                            val timePart = sec.timeLimitMinutes?.let { " • ${it}m" } ?: ""
                            Box(
                                modifier = Modifier
                                    .clip(RoundedCornerShape(8.dp))
                                    .background(MaterialTheme.colorScheme.surfaceVariant)
                                    .padding(horizontal = 8.dp, vertical = 4.dp)
                            ) {
                                Text(
                                    text = "${sec.sectionName}: ${sec.questionCount}Q$timePart",
                                    style = MaterialTheme.typography.labelSmall
                                )
                            }
                        }
                    }
                }

                Spacer(Modifier.height(12.dp))
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    Button(
                        onClick = { showQuickDialog = true },
                        modifier = Modifier
                            .weight(1f)
                            .testTag("quick_mock_button"),
                        shape = RoundedCornerShape(12.dp)
                    ) {
                        Icon(Icons.Default.Add, contentDescription = null, modifier = Modifier.size(18.dp))
                        Spacer(Modifier.width(4.dp))
                        Text("Quick Score")
                    }
                    OutlinedButton(
                        onClick = { showDetailedDialog = true },
                        modifier = Modifier
                            .weight(1f)
                            .testTag("detailed_mock_button"),
                        shape = RoundedCornerShape(12.dp)
                    ) {
                        Icon(Icons.Default.FactCheck, contentDescription = null, modifier = Modifier.size(18.dp))
                        Spacer(Modifier.width(4.dp))
                        Text("Question Log")
                    }
                }
            }
        }

        // Repeated Error Diagnostics (when question-level data exists)
        if (errorDiagnostics.isNotEmpty()) {
            Card(
                shape = RoundedCornerShape(14.dp),
                colors = CardDefaults.cardColors(containerColor = EnergyTerracotta.copy(alpha = 0.09f)),
                border = CardDefaults.outlinedCardBorder()
            ) {
                Column(modifier = Modifier.padding(14.dp)) {
                    Text(
                        text = "Error Category Diagnostics",
                        style = MaterialTheme.typography.titleSmall,
                        fontWeight = FontWeight.Bold,
                        color = EnergyTerracotta
                    )
                    Spacer(Modifier.height(6.dp))
                    errorDiagnostics.entries.sortedByDescending { it.value }.forEach { (cat, count) ->
                        Text(
                            text = "• ${cat.displayName}: $count occurrences",
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurface
                        )
                    }
                }
            }
        }

        // Recorded Mocks List
        Text(
            text = "RECORDED MOCK TESTS (${mocks.size})",
            style = MaterialTheme.typography.labelMedium,
            fontWeight = FontWeight.Bold,
            color = MaterialTheme.colorScheme.onSurfaceVariant
        )

        if (mocks.isEmpty()) {
            Card(
                modifier = Modifier.fillMaxWidth(),
                shape = RoundedCornerShape(14.dp),
                colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.35f))
            ) {
                Text(
                    text = "No mock tests logged for ${exam.shortName} yet. Record a quick score or detailed question log to unlock negative-marking analytics and Examination Readiness.",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.padding(16.dp)
                )
            }
        } else {
            mocks.forEach { mock ->
                val dateLabel = Instant.ofEpochMilli(mock.dateTimestamp)
                    .atZone(ZoneId.systemDefault())
                    .toLocalDate()
                    .format(formatter)
                val negLoss = mock.incorrectAnswers * mock.negativeMarksPerQ

                Card(
                    modifier = Modifier.fillMaxWidth(),
                    shape = RoundedCornerShape(14.dp),
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
                                    text = mock.mockName,
                                    style = MaterialTheme.typography.titleSmall,
                                    fontWeight = FontWeight.Bold
                                )
                                Text(
                                    text = "$dateLabel • ${mock.durationMinutes} min • ${if (mock.isQuickEntry) "Quick entry" else "Question-level"}",
                                    style = MaterialTheme.typography.labelSmall,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant
                                )
                            }
                            IconButton(onClick = { pendingDeleteMock = mock }) {
                                Icon(Icons.Default.DeleteOutline, contentDescription = "Delete mock test")
                            }
                        }

                        Spacer(Modifier.height(8.dp))
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.SpaceBetween
                        ) {
                            MetricPill("Score", "${mock.totalScore}/${mock.maxMarks.toInt()}", MaterialTheme.colorScheme.primary)
                            MetricPill("Accuracy", "${mock.accuracyPercent}%", SuccessGreen)
                            MetricPill("Neg. Loss", "-${String.format("%.2f", negLoss)}", EnergyTerracotta)
                        }

                        Spacer(Modifier.height(6.dp))
                        Text(
                            text = "Correct: ${mock.correctAnswers}  •  Wrong: ${mock.incorrectAnswers}  •  Skipped: ${mock.unansweredQuestions}  •  Avg ${mock.avgSecondsPerQuestion}s/Q",
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant
                        )

                        if (exam.supportsPaperExemptions && mock.percentage >= 60.0) {
                            Spacer(Modifier.height(4.dp))
                            Text(
                                text = "★ Exemption threshold reached (${mock.percentage}% >= 60%)",
                                style = MaterialTheme.typography.labelSmall,
                                fontWeight = FontWeight.Bold,
                                color = SuccessGreen
                            )
                        }

                        mock.weakestSubject?.let { weak ->
                            Text(
                                text = "Weakest subject: $weak" + (mock.weakestSubjectAccuracy?.let { " ($it%)" } ?: ""),
                                style = MaterialTheme.typography.labelSmall,
                                color = EnergyOchre,
                                modifier = Modifier.padding(top = 4.dp)
                            )
                        }
                    }
                }
            }
        }
    }

    if (showQuickDialog) {
        QuickMockEntryDialog(
            exam = exam,
            onDismiss = { showQuickDialog = false },
            onSave = { name, total, correct, wrong, dur, pos, neg, negOn, weak, notes ->
                onRecordQuickMock(name, total, correct, wrong, dur, pos, neg, negOn, weak, notes)
                showQuickDialog = false
            }
        )
    }

    if (showDetailedDialog) {
        DetailedQuestionMockDialog(
            exam = exam,
            onDismiss = { showDetailedDialog = false },
            onSave = { name, attempts, dur, notes ->
                onRecordDetailedMock(name, attempts, dur, notes)
                showDetailedDialog = false
            }
        )
    }

    pendingDeleteMock?.let { toDelete ->
        AlertDialog(
            onDismissRequest = { pendingDeleteMock = null },
            title = { Text("Delete Mock Test?", fontFamily = FontFamily.Serif, fontWeight = FontWeight.Bold) },
            text = { Text("Delete \"${toDelete.mockName}\" permanently?") },
            confirmButton = {
                Button(onClick = {
                    onDeleteMock(toDelete.id)
                    pendingDeleteMock = null
                }) { Text("Delete") }
            },
            dismissButton = { TextButton(onClick = { pendingDeleteMock = null }) { Text("Cancel") } }
        )
    }
}

@Composable
private fun MetricPill(label: String, value: String, color: androidx.compose.ui.graphics.Color) {
    Column(
        horizontalAlignment = Alignment.CenterHorizontally,
        modifier = Modifier
            .clip(RoundedCornerShape(10.dp))
            .background(color.copy(alpha = 0.12f))
            .padding(horizontal = 12.dp, vertical = 6.dp)
    ) {
        Text(value, style = MaterialTheme.typography.titleSmall, fontWeight = FontWeight.Bold, color = color)
        Text(label, style = MaterialTheme.typography.labelSmall, color = MaterialTheme.colorScheme.onSurfaceVariant)
    }
}

@Composable
private fun QuickMockEntryDialog(
    exam: ExamConfig,
    onDismiss: () -> Unit,
    onSave: (String, Int, Int, Int, Int, Double?, Double?, Boolean, String?, String?) -> Unit
) {
    var name by remember { mutableStateOf("${exam.shortName} Mock #1") }
    var totalStr by remember { mutableStateOf(exam.markingScheme.totalQuestions.toString()) }
    var correctStr by remember { mutableStateOf("") }
    var wrongStr by remember { mutableStateOf("") }
    var durationStr by remember { mutableStateOf(exam.markingScheme.durationMinutes.toString()) }
    var positiveStr by remember { mutableStateOf(exam.markingScheme.positiveMarks.toString()) }
    var negativeStr by remember { mutableStateOf(exam.markingScheme.negativeMarks.toString()) }
    var negativeEnabled by remember { mutableStateOf(exam.markingScheme.hasNegativeMarking) }
    var weakSubject by remember { mutableStateOf(exam.subjects.firstOrNull()?.name ?: "") }
    var notes by remember { mutableStateOf("") }

    val total = totalStr.toIntOrNull() ?: exam.markingScheme.totalQuestions
    val correct = correctStr.toIntOrNull() ?: 0
    val wrong = wrongStr.toIntOrNull() ?: 0
    val pos = positiveStr.toDoubleOrNull() ?: exam.markingScheme.positiveMarks
    val neg = if (negativeEnabled) (negativeStr.toDoubleOrNull() ?: exam.markingScheme.negativeMarks) else 0.0

    val preview = MockTestScoringEngine.scoreQuickEntry(
        totalQuestions = total,
        correctAnswers = correct,
        incorrectAnswers = wrong,
        markingScheme = MarkingScheme(pos, neg, negativeEnabled, total, total * pos, durationStr.toIntOrNull() ?: 120)
    )

    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Quick Mock Score Entry", fontFamily = FontFamily.Serif, fontWeight = FontWeight.Bold) },
        text = {
            Column(
                modifier = Modifier.verticalScroll(rememberScrollState()),
                verticalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                OutlinedTextField(value = name, onValueChange = { name = it }, label = { Text("Mock Name") }, singleLine = true)
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    OutlinedTextField(
                        value = totalStr,
                        onValueChange = { totalStr = it.filter(Char::isDigit) },
                        label = { Text("Total Qs") },
                        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                        modifier = Modifier.weight(1f),
                        singleLine = true
                    )
                    OutlinedTextField(
                        value = durationStr,
                        onValueChange = { durationStr = it.filter(Char::isDigit) },
                        label = { Text("Mins") },
                        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                        modifier = Modifier.weight(1f),
                        singleLine = true
                    )
                }
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    OutlinedTextField(
                        value = correctStr,
                        onValueChange = { correctStr = it.filter(Char::isDigit) },
                        label = { Text("Correct") },
                        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                        modifier = Modifier.weight(1f),
                        singleLine = true
                    )
                    OutlinedTextField(
                        value = wrongStr,
                        onValueChange = { wrongStr = it.filter(Char::isDigit) },
                        label = { Text("Incorrect") },
                        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                        modifier = Modifier.weight(1f),
                        singleLine = true
                    )
                }
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Text("Negative Marking", style = MaterialTheme.typography.bodyMedium)
                    Switch(checked = negativeEnabled, onCheckedChange = { negativeEnabled = it })
                }
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    OutlinedTextField(
                        value = positiveStr,
                        onValueChange = { positiveStr = it },
                        label = { Text("+Marks") },
                        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal),
                        modifier = Modifier.weight(1f),
                        singleLine = true
                    )
                    if (negativeEnabled) {
                        OutlinedTextField(
                            value = negativeStr,
                            onValueChange = { negativeStr = it },
                            label = { Text("-Marks") },
                            keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Decimal),
                            modifier = Modifier.weight(1f),
                            singleLine = true
                        )
                    }
                }
                OutlinedTextField(value = weakSubject, onValueChange = { weakSubject = it }, label = { Text("Weakest Subject (optional)") }, singleLine = true)
                OutlinedTextField(value = notes, onValueChange = { notes = it.take(200) }, label = { Text("Notes (optional)") }, singleLine = true)

                Box(
                    modifier = Modifier
                        .fillMaxWidth()
                        .clip(RoundedCornerShape(10.dp))
                        .background(EnergyBlue.copy(alpha = 0.14f))
                        .padding(10.dp)
                ) {
                    Text(
                        text = "Live Score: ${preview.finalScore}/${preview.maxMarks.toInt()} (${preview.percentage}%) • Accuracy ${preview.accuracyPercent}% • Negative -${preview.negativeMarksDeducted}",
                        style = MaterialTheme.typography.labelSmall,
                        fontWeight = FontWeight.SemiBold
                    )
                }
            }
        },
        confirmButton = {
            Button(
                onClick = {
                    onSave(
                        name,
                        total,
                        correct,
                        wrong,
                        durationStr.toIntOrNull() ?: exam.markingScheme.durationMinutes,
                        pos,
                        neg,
                        negativeEnabled,
                        weakSubject,
                        notes
                    )
                },
                modifier = Modifier.testTag("save_quick_mock_button")
            ) { Text("Save Mock") }
        },
        dismissButton = { TextButton(onClick = onDismiss) { Text("Cancel") } }
    )
}

@Composable
private fun DetailedQuestionMockDialog(
    exam: ExamConfig,
    onDismiss: () -> Unit,
    onSave: (String, List<QuestionAttemptInput>, Int, String?) -> Unit
) {
    var mockName by remember { mutableStateOf("${exam.shortName} Detailed Analysis") }
    var subject by remember { mutableStateOf(exam.subjects.firstOrNull()?.name ?: "General") }
    var topicName by remember { mutableStateOf("") }
    var selectedAns by remember { mutableStateOf("A") }
    var correctAns by remember { mutableStateOf("A") }
    var secondsStr by remember { mutableStateOf("60") }
    var errorCategory by remember { mutableStateOf(ErrorCategory.CONCEPTUAL) }
    val attempts = remember { mutableStateListOf<QuestionAttemptInput>() }

    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Question-Level Analysis", fontFamily = FontFamily.Serif, fontWeight = FontWeight.Bold) },
        text = {
            Column(
                modifier = Modifier.verticalScroll(rememberScrollState()),
                verticalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                OutlinedTextField(value = mockName, onValueChange = { mockName = it }, label = { Text("Mock Name") }, singleLine = true)
                OutlinedTextField(value = subject, onValueChange = { subject = it }, label = { Text("Subject") }, singleLine = true)
                OutlinedTextField(value = topicName, onValueChange = { topicName = it }, label = { Text("Topic") }, singleLine = true)
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                    OutlinedTextField(value = selectedAns, onValueChange = { selectedAns = it.take(4) }, label = { Text("Your Ans") }, modifier = Modifier.weight(1f), singleLine = true)
                    OutlinedTextField(value = correctAns, onValueChange = { correctAns = it.take(4) }, label = { Text("Key") }, modifier = Modifier.weight(1f), singleLine = true)
                    OutlinedTextField(
                        value = secondsStr,
                        onValueChange = { secondsStr = it.filter(Char::isDigit) },
                        label = { Text("Sec") },
                        keyboardOptions = KeyboardOptions(keyboardType = KeyboardType.Number),
                        modifier = Modifier.weight(1f),
                        singleLine = true
                    )
                }
                if (!selectedAns.equals(correctAns, ignoreCase = true) && selectedAns.isNotBlank()) {
                    Text("Error Category", style = MaterialTheme.typography.labelSmall)
                    Row(
                        modifier = Modifier.horizontalScroll(rememberScrollState()),
                        horizontalArrangement = Arrangement.spacedBy(6.dp)
                    ) {
                        ErrorCategory.entries.forEach { cat ->
                            FilterChip(
                                selected = errorCategory == cat,
                                onClick = { errorCategory = cat },
                                label = { Text(cat.displayName, style = MaterialTheme.typography.labelSmall) }
                            )
                        }
                    }
                }
                OutlinedButton(
                    onClick = {
                        val isWrong = selectedAns.isNotBlank() && !selectedAns.equals(correctAns, ignoreCase = true)
                        attempts.add(
                            QuestionAttemptInput(
                                questionNumber = attempts.size + 1,
                                subject = subject.ifBlank { "General" },
                                topicName = topicName.ifBlank { "General" },
                                selectedAnswer = selectedAns.ifBlank { null },
                                correctAnswer = correctAns.ifBlank { "A" },
                                timeSpentSeconds = secondsStr.toIntOrNull() ?: 60,
                                errorCategory = if (isWrong) errorCategory else null
                            )
                        )
                    },
                    modifier = Modifier.fillMaxWidth()
                ) {
                    Text("Add Question #${attempts.size + 1}")
                }
                if (attempts.isNotEmpty()) {
                    val preview = MockTestScoringEngine.scoreQuestionAttempts(attempts, exam.markingScheme)
                    Text(
                        text = "Added ${attempts.size} Qs • Score ${preview.finalScore}/${preview.maxMarks} • Accuracy ${preview.accuracyPercent}%",
                        style = MaterialTheme.typography.labelSmall,
                        color = MaterialTheme.colorScheme.primary
                    )
                }
            }
        },
        confirmButton = {
            Button(
                onClick = {
                    val mins = (attempts.sumOf { it.timeSpentSeconds } / 60).coerceAtLeast(1)
                    onSave(mockName, attempts.toList(), mins, null)
                },
                enabled = attempts.isNotEmpty()
            ) { Text("Save Analysis") }
        },
        dismissButton = { TextButton(onClick = onDismiss) { Text("Cancel") } }
    )
}
