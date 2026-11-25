package com.tempo.focus.ui.screens.prep

import androidx.compose.animation.AnimatedVisibility
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
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Add
import androidx.compose.material.icons.filled.DeleteOutline
import androidx.compose.material.icons.filled.ExpandLess
import androidx.compose.material.icons.filled.ExpandMore
import androidx.compose.material.icons.filled.Search
import androidx.compose.material.icons.filled.UploadFile
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.FilterChip
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.LinearProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.minimumInteractiveComponentSize
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateMapOf
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
import com.tempo.focus.data.db.TopicProgressEntity
import com.tempo.focus.domain.exams.CaGroupSelection
import com.tempo.focus.domain.exams.ExamConfig
import com.tempo.focus.domain.exams.TopicDifficulty
import com.tempo.focus.domain.exams.TopicStatus
import com.tempo.focus.ui.theme.EnergyBlue
import com.tempo.focus.ui.theme.EnergyOchre
import com.tempo.focus.ui.theme.EnergyTerracotta
import com.tempo.focus.ui.theme.SuccessGreen

@Composable
fun SyllabusTabContent(
    exam: ExamConfig,
    caGroup: CaGroupSelection,
    topics: List<TopicProgressEntity>,
    onCaGroupChange: (CaGroupSelection) -> Unit,
    onCycleStatus: (TopicProgressEntity) -> Unit,
    onUpdateChecklist: (TopicProgressEntity, Boolean, Boolean, Boolean, Boolean) -> Unit,
    onAddTopic: (String, String, String, String, TopicDifficulty) -> Unit,
    onImportCsv: (String, String) -> Unit,
    onDeleteTopic: (String) -> Unit,
    onLogRevisionClick: (TopicProgressEntity) -> Unit
) {
    var searchQuery by remember { mutableStateOf("") }
    var statusFilter by remember { mutableStateOf<TopicStatus?>(null) }
    var showAddDialog by remember { mutableStateOf(false) }
    var showCsvDialog by remember { mutableStateOf(false) }
    var pendingDeleteTopic by remember { mutableStateOf<TopicProgressEntity?>(null) }
    val expandedSubjects = remember { mutableStateMapOf<String, Boolean>() }

    val filteredTopics = remember(topics, searchQuery, statusFilter) {
        topics.filter { t ->
            val matchesQuery = searchQuery.isBlank() ||
                t.topicName.contains(searchQuery, ignoreCase = true) ||
                t.subject.contains(searchQuery, ignoreCase = true) ||
                t.chapter.contains(searchQuery, ignoreCase = true) ||
                t.unit.contains(searchQuery, ignoreCase = true)
            val matchesStatus = statusFilter == null || TopicStatus.fromValue(t.status) == statusFilter
            matchesQuery && matchesStatus
        }
    }

    val groupedBySubject = remember(filteredTopics) {
        filteredTopics.groupBy { it.subject }
    }

    Column(
        modifier = Modifier
            .fillMaxWidth()
            .testTag("syllabus_tab_content"),
        verticalArrangement = Arrangement.spacedBy(12.dp)
    ) {
        // Syllabus Version & Pattern Metadata Banner
        Card(
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
                            text = "${exam.name} (${exam.applicableYear})",
                            style = MaterialTheme.typography.titleSmall,
                            fontFamily = FontFamily.Serif,
                            fontWeight = FontWeight.Bold
                        )
                        Text(
                            text = "Version ${exam.syllabusVersion} • ${exam.patternStatus.label}",
                            style = MaterialTheme.typography.labelSmall,
                            color = MaterialTheme.colorScheme.onSurfaceVariant
                        )
                    }
                    Row(horizontalArrangement = Arrangement.spacedBy(6.dp)) {
                        OutlinedButton(
                            onClick = { showCsvDialog = true },
                            modifier = Modifier
                                .minimumInteractiveComponentSize()
                                .testTag("import_csv_button"),
                            shape = RoundedCornerShape(10.dp)
                        ) {
                            Icon(Icons.Default.UploadFile, contentDescription = "Import CSV", modifier = Modifier.size(16.dp))
                            Spacer(Modifier.width(4.dp))
                            Text("CSV", style = MaterialTheme.typography.labelMedium)
                        }
                        Button(
                            onClick = { showAddDialog = true },
                            modifier = Modifier
                                .minimumInteractiveComponentSize()
                                .testTag("add_topic_button"),
                            shape = RoundedCornerShape(10.dp)
                        ) {
                            Icon(Icons.Default.Add, contentDescription = "Add topic", modifier = Modifier.size(16.dp))
                            Spacer(Modifier.width(4.dp))
                            Text("Add", style = MaterialTheme.typography.labelMedium)
                        }
                    }
                }

                // CA Group I / Group II / Both selector
                if (exam.supportsCaGroups) {
                    Spacer(Modifier.height(10.dp))
                    Row(horizontalArrangement = Arrangement.spacedBy(8.dp)) {
                        CaGroupSelection.entries.forEach { option ->
                            FilterChip(
                                selected = caGroup == option,
                                onClick = { onCaGroupChange(option) },
                                label = { Text(option.label, style = MaterialTheme.typography.labelSmall) },
                                modifier = Modifier.testTag("ca_group_${option.value}")
                            )
                        }
                    }
                }
            }
        }

        // Searchable Syllabus Input
        OutlinedTextField(
            value = searchQuery,
            onValueChange = { searchQuery = it },
            modifier = Modifier
                .fillMaxWidth()
                .testTag("syllabus_search_field"),
            placeholder = { Text("Search subject, unit, chapter, or topic…") },
            leadingIcon = { Icon(Icons.Default.Search, contentDescription = "Search syllabus") },
            singleLine = true,
            shape = RoundedCornerShape(12.dp)
        )

        // Status Filter Row
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .horizontalScroll(rememberScrollState()),
            horizontalArrangement = Arrangement.spacedBy(6.dp)
        ) {
            FilterChip(
                selected = statusFilter == null,
                onClick = { statusFilter = null },
                label = { Text("All (${topics.size})", style = MaterialTheme.typography.labelSmall) }
            )
            TopicStatus.entries.forEach { st ->
                val count = topics.count { TopicStatus.fromValue(it.status) == st }
                FilterChip(
                    selected = statusFilter == st,
                    onClick = { statusFilter = if (statusFilter == st) null else st },
                    label = { Text("${st.displayName} ($count)", style = MaterialTheme.typography.labelSmall) }
                )
            }
        }

        if (groupedBySubject.isEmpty()) {
            Card(
                modifier = Modifier.fillMaxWidth(),
                shape = RoundedCornerShape(14.dp),
                colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.4f))
            ) {
                Text(
                    text = "No topics match your current filter. Add a custom topic or import via CSV.",
                    style = MaterialTheme.typography.bodyMedium,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier.padding(18.dp)
                )
            }
        } else {
            groupedBySubject.forEach { (subject, subjectTopics) ->
                val isExpanded = expandedSubjects.getOrPut(subject) { true }
                val completedCount = subjectTopics.count {
                    val s = TopicStatus.fromValue(it.status)
                    s == TopicStatus.COMPLETED || s == TopicStatus.MASTERED
                }
                val ratio = if (subjectTopics.isNotEmpty()) completedCount.toFloat() / subjectTopics.size else 0f

                Card(
                    modifier = Modifier.fillMaxWidth(),
                    shape = RoundedCornerShape(16.dp),
                    colors = CardDefaults.cardColors(containerColor = MaterialTheme.colorScheme.surface),
                    border = CardDefaults.outlinedCardBorder()
                ) {
                    Column(modifier = Modifier.padding(14.dp)) {
                        Row(
                            modifier = Modifier
                                .fillMaxWidth()
                                .clickable { expandedSubjects[subject] = !isExpanded }
                                .padding(vertical = 4.dp),
                            horizontalArrangement = Arrangement.SpaceBetween,
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Column(modifier = Modifier.weight(1f)) {
                                Text(
                                    text = subject,
                                    style = MaterialTheme.typography.titleMedium,
                                    fontFamily = FontFamily.Serif,
                                    fontWeight = FontWeight.Bold
                                )
                                Text(
                                    text = "$completedCount / ${subjectTopics.size} completed",
                                    style = MaterialTheme.typography.labelSmall,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant
                                )
                            }
                            Icon(
                                imageVector = if (isExpanded) Icons.Default.ExpandLess else Icons.Default.ExpandMore,
                                contentDescription = if (isExpanded) "Collapse $subject" else "Expand $subject"
                            )
                        }

                        LinearProgressIndicator(
                            progress = { ratio },
                            modifier = Modifier
                                .fillMaxWidth()
                                .padding(vertical = 8.dp)
                                .height(6.dp)
                                .clip(RoundedCornerShape(3.dp)),
                            color = SuccessGreen,
                            trackColor = MaterialTheme.colorScheme.surfaceVariant
                        )

                        AnimatedVisibility(visible = isExpanded) {
                            Column(verticalArrangement = Arrangement.spacedBy(10.dp)) {
                                subjectTopics.forEach { topic ->
                                    SyllabusTopicRow(
                                        topic = topic,
                                        showNcertTools = exam.supportsNcertTracking,
                                        showCaRtpTools = exam.supportsPaperExemptions,
                                        onCycleStatus = { onCycleStatus(topic) },
                                        onToggleChecklist = { n, f, d, r -> onUpdateChecklist(topic, n, f, d, r) },
                                        onLogRevision = { onLogRevisionClick(topic) },
                                        onDeleteRequest = { pendingDeleteTopic = topic }
                                    )
                                }
                            }
                        }
                    }
                }
            }
        }
    }

    if (showAddDialog) {
        AddTopicDialog(
            subjects = exam.subjects.map { it.name }.ifEmpty { listOf("General") },
            onDismiss = { showAddDialog = false },
            onSave = { sub, unit, chap, name, diff ->
                onAddTopic(sub, unit, chap, name, diff)
                showAddDialog = false
            }
        )
    }

    if (showCsvDialog) {
        CsvImportDialog(
            defaultSubject = exam.subjects.firstOrNull()?.name ?: "General",
            onDismiss = { showCsvDialog = false },
            onImport = { raw, defSub ->
                onImportCsv(raw, defSub)
                showCsvDialog = false
            }
        )
    }

    pendingDeleteTopic?.let { toDelete ->
        AlertDialog(
            onDismissRequest = { pendingDeleteTopic = null },
            title = { Text("Delete Topic?", fontFamily = FontFamily.Serif, fontWeight = FontWeight.Bold) },
            text = { Text("Remove \"${toDelete.topicName}\" and its revision history from this examination?") },
            confirmButton = {
                Button(onClick = {
                    onDeleteTopic(toDelete.id)
                    pendingDeleteTopic = null
                }) { Text("Delete") }
            },
            dismissButton = {
                TextButton(onClick = { pendingDeleteTopic = null }) { Text("Cancel") }
            }
        )
    }
}

@Composable
private fun SyllabusTopicRow(
    topic: TopicProgressEntity,
    showNcertTools: Boolean,
    showCaRtpTools: Boolean,
    onCycleStatus: () -> Unit,
    onToggleChecklist: (Boolean, Boolean, Boolean, Boolean) -> Unit,
    onLogRevision: () -> Unit,
    onDeleteRequest: () -> Unit
) {
    val status = TopicStatus.fromValue(topic.status)
    val badgeColor = when (status) {
        TopicStatus.NOT_STARTED -> MaterialTheme.colorScheme.outline
        TopicStatus.LEARNING -> EnergyBlue
        TopicStatus.PRACTISING -> EnergyOchre
        TopicStatus.COMPLETED -> SuccessGreen
        TopicStatus.REVISION_DUE -> EnergyTerracotta
        TopicStatus.MASTERED -> SuccessGreen
    }

    Column(
        modifier = Modifier
            .fillMaxWidth()
            .clip(RoundedCornerShape(12.dp))
            .background(MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.45f))
            .padding(12.dp)
    ) {
        Row(
            modifier = Modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.SpaceBetween,
            verticalAlignment = Alignment.Top
        ) {
            Column(modifier = Modifier.weight(1f)) {
                Text(
                    text = "${topic.unit} › ${topic.chapter}",
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
                Text(
                    text = topic.topicName,
                    style = MaterialTheme.typography.bodyMedium,
                    fontWeight = FontWeight.SemiBold,
                    color = MaterialTheme.colorScheme.onSurface
                )
                if (topic.subtopics.isNotBlank()) {
                    Text(
                        text = topic.subtopics,
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        fontSize = 11.sp
                    )
                }
            }
            if (topic.isCustom) {
                IconButton(onClick = onDeleteRequest, modifier = Modifier.size(36.dp)) {
                    Icon(Icons.Default.DeleteOutline, contentDescription = "Delete custom topic", modifier = Modifier.size(18.dp))
                }
            }
        }

        Spacer(Modifier.height(8.dp))

        Row(
            modifier = Modifier
                .fillMaxWidth()
                .horizontalScroll(rememberScrollState()),
            horizontalArrangement = Arrangement.spacedBy(8.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Box(
                modifier = Modifier
                    .clip(RoundedCornerShape(8.dp))
                    .background(badgeColor.copy(alpha = 0.16f))
                    .clickable(onClick = onCycleStatus)
                    .padding(horizontal = 10.dp, vertical = 6.dp)
                    .testTag("topic_status_chip_${topic.id}")
            ) {
                Text(
                    text = status.displayName,
                    style = MaterialTheme.typography.labelSmall,
                    fontWeight = FontWeight.Bold,
                    color = badgeColor
                )
            }

            Box(
                modifier = Modifier
                    .clip(RoundedCornerShape(8.dp))
                    .background(MaterialTheme.colorScheme.primaryContainer)
                    .clickable(onClick = onLogRevision)
                    .padding(horizontal = 10.dp, vertical = 6.dp)
            ) {
                Text(
                    text = "Log Rev (${topic.revisionCount})",
                    style = MaterialTheme.typography.labelSmall,
                    fontWeight = FontWeight.SemiBold,
                    color = MaterialTheme.colorScheme.onPrimaryContainer
                )
            }

            if (showNcertTools) {
                MiniToggleChip("NCERT", topic.ncertCompleted) {
                    onToggleChecklist(!topic.ncertCompleted, topic.formulaRevisionDone, topic.diagramRevisionDone, topic.rtpMtpCompleted)
                }
                MiniToggleChip("Formula", topic.formulaRevisionDone) {
                    onToggleChecklist(topic.ncertCompleted, !topic.formulaRevisionDone, topic.diagramRevisionDone, topic.rtpMtpCompleted)
                }
                MiniToggleChip("Diagrams", topic.diagramRevisionDone) {
                    onToggleChecklist(topic.ncertCompleted, topic.formulaRevisionDone, !topic.diagramRevisionDone, topic.rtpMtpCompleted)
                }
            }

            if (showCaRtpTools) {
                MiniToggleChip("ICAI RTP/MTP", topic.rtpMtpCompleted) {
                    onToggleChecklist(topic.ncertCompleted, topic.formulaRevisionDone, topic.diagramRevisionDone, !topic.rtpMtpCompleted)
                }
            }
        }
    }
}

@Composable
private fun MiniToggleChip(label: String, checked: Boolean, onToggle: () -> Unit) {
    Box(
        modifier = Modifier
            .clip(RoundedCornerShape(8.dp))
            .background(if (checked) SuccessGreen.copy(alpha = 0.18f) else MaterialTheme.colorScheme.surface)
            .clickable(onClick = onToggle)
            .padding(horizontal = 8.dp, vertical = 6.dp)
    ) {
        Text(
            text = if (checked) "✓ $label" else label,
            style = MaterialTheme.typography.labelSmall,
            color = if (checked) SuccessGreen else MaterialTheme.colorScheme.onSurfaceVariant
        )
    }
}

@Composable
private fun AddTopicDialog(
    subjects: List<String>,
    onDismiss: () -> Unit,
    onSave: (String, String, String, String, TopicDifficulty) -> Unit
) {
    var subject by remember { mutableStateOf(subjects.firstOrNull() ?: "General") }
    var unit by remember { mutableStateOf("") }
    var chapter by remember { mutableStateOf("") }
    var topicName by remember { mutableStateOf("") }
    var difficulty by remember { mutableStateOf(TopicDifficulty.MODERATE) }

    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Add Syllabus Topic", fontFamily = FontFamily.Serif, fontWeight = FontWeight.Bold) },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                OutlinedTextField(value = subject, onValueChange = { subject = it }, label = { Text("Subject") }, singleLine = true)
                OutlinedTextField(value = unit, onValueChange = { unit = it }, label = { Text("Unit") }, singleLine = true)
                OutlinedTextField(value = chapter, onValueChange = { chapter = it }, label = { Text("Chapter") }, singleLine = true)
                OutlinedTextField(value = topicName, onValueChange = { topicName = it }, label = { Text("Topic Name *") }, singleLine = true)
                Row(
                    modifier = Modifier.horizontalScroll(rememberScrollState()),
                    horizontalArrangement = Arrangement.spacedBy(6.dp)
                ) {
                    TopicDifficulty.entries.forEach { d ->
                        FilterChip(
                            selected = difficulty == d,
                            onClick = { difficulty = d },
                            label = { Text(d.label, style = MaterialTheme.typography.labelSmall) }
                        )
                    }
                }
            }
        },
        confirmButton = {
            Button(
                onClick = { onSave(subject, unit, chapter, topicName, difficulty) },
                enabled = topicName.isNotBlank()
            ) { Text("Add Topic") }
        },
        dismissButton = { TextButton(onClick = onDismiss) { Text("Cancel") } }
    )
}

@Composable
private fun CsvImportDialog(
    defaultSubject: String,
    onDismiss: () -> Unit,
    onImport: (String, String) -> Unit
) {
    var rawText by remember { mutableStateOf("") }

    AlertDialog(
        onDismissRequest = onDismiss,
        title = { Text("Bulk / CSV Topic Import", fontFamily = FontFamily.Serif, fontWeight = FontWeight.Bold) },
        text = {
            Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                Text(
                    text = "Paste one topic per line: Subject,Unit,Chapter,Topic,Difficulty (or just Topic name).",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
                OutlinedTextField(
                    value = rawText,
                    onValueChange = { rawText = it },
                    placeholder = { Text("Physics,Mechanics,Work,Conservation of Energy,high") },
                    minLines = 4,
                    maxLines = 8,
                    modifier = Modifier.fillMaxWidth()
                )
            }
        },
        confirmButton = {
            Button(
                onClick = { onImport(rawText, defaultSubject) },
                enabled = rawText.isNotBlank()
            ) { Text("Import") }
        },
        dismissButton = { TextButton(onClick = onDismiss) { Text("Cancel") } }
    )
}
