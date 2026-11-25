package com.tempo.focus.ui.components

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.animateContentSize
import androidx.compose.animation.core.Spring
import androidx.compose.animation.core.spring
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.heightIn
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.AccountBalance
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.Clear
import androidx.compose.material.icons.filled.Engineering
import androidx.compose.material.icons.filled.Gavel
import androidx.compose.material.icons.filled.LocalHospital
import androidx.compose.material.icons.filled.MenuBook
import androidx.compose.material.icons.filled.Public
import androidx.compose.material.icons.filled.School
import androidx.compose.material.icons.filled.Search
import androidx.compose.material.icons.filled.VerifiedUser
import androidx.compose.material.icons.filled.Work
import androidx.compose.material3.AlertDialog
import androidx.compose.material3.Button
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.FilterChip
import androidx.compose.material3.FilterChipDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.material3.minimumInteractiveComponentSize
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.tempo.focus.R
import com.tempo.focus.domain.exams.CaGroupSelection
import com.tempo.focus.domain.exams.ExamCategory
import com.tempo.focus.domain.exams.ExamConfig
import com.tempo.focus.domain.exams.ExamRegistry
import com.tempo.focus.domain.exams.WeightageSource
import com.tempo.focus.ui.theme.SuccessGreen

/**
 * Immutable summary of a single subject and its topics strictly scoped to one selected examination.
 */
data class ScopedSubjectMetadata(
    val name: String,
    val officialWeightagePercent: Double?,
    val weightageSource: WeightageSource,
    val unitCount: Int,
    val chapterCount: Int,
    val topicCount: Int,
    val topicNames: List<String>
)

/**
 * Complete subject, topic, and marking metadata strictly scoped to an examination (and CA group if applicable).
 */
data class ScopedExamMetadata(
    val exam: ExamConfig,
    val category: ExamCategory,
    val caGroup: CaGroupSelection,
    val subjects: List<ScopedSubjectMetadata>,
    val totalSubjects: Int,
    val totalTopics: Int,
    val markingSummary: String
)

/**
 * Pure domain resolver guaranteeing that subject and topic metadata belong exclusively to the selected exam
 * (and active CA group for CA Intermediate / CA Final).
 */
object ExamMetadataScope {

    fun resolve(
        examId: String?,
        caGroup: CaGroupSelection = CaGroupSelection.BOTH
    ): ScopedExamMetadata {
        val exam = ExamRegistry.getById(examId)
        val effectiveGroup = if (exam.supportsCaGroups) caGroup else CaGroupSelection.BOTH
        val effectiveSubjects = ExamRegistry.getEffectiveSubjects(exam, effectiveGroup)

        val scopedSubjects = effectiveSubjects.map { subjectSeed ->
            val allChapters = subjectSeed.units.flatMap { it.chapters }
            val allTopics = allChapters.flatMap { it.topics }
            ScopedSubjectMetadata(
                name = subjectSeed.name,
                officialWeightagePercent = subjectSeed.officialWeightagePercent,
                weightageSource = subjectSeed.weightageSource,
                unitCount = subjectSeed.units.size,
                chapterCount = allChapters.size,
                topicCount = allTopics.size,
                topicNames = allTopics.map { it.name }
            )
        }

        val marking = exam.markingScheme
        val markingSummary = buildString {
            if (marking.hasNegativeMarking && marking.negativeMarks > 0.0) {
                append("+${formatMark(marking.positiveMarks)} / -${formatMark(marking.negativeMarks)}")
            } else {
                append("+${formatMark(marking.positiveMarks)} (No negative)")
            }
            append(" • ${marking.totalQuestions}Q • ${marking.maxMarks.toInt()}M")
        }

        return ScopedExamMetadata(
            exam = exam,
            category = exam.category,
            caGroup = effectiveGroup,
            subjects = scopedSubjects,
            totalSubjects = scopedSubjects.size,
            totalTopics = scopedSubjects.sumOf { it.topicCount },
            markingSummary = markingSummary
        )
    }

    fun examsForCategory(category: ExamCategory): List<ExamConfig> =
        ExamRegistry.getByCategory(category)

    fun searchExams(query: String, category: ExamCategory? = null): List<ExamConfig> {
        val trimmed = query.trim()
        val pool = if (category != null && trimmed.isEmpty()) {
            ExamRegistry.getByCategory(category)
        } else {
            ExamRegistry.allExams
        }
        if (trimmed.isEmpty()) return pool

        return pool.filter { exam ->
            exam.name.contains(trimmed, ignoreCase = true) ||
                exam.shortName.contains(trimmed, ignoreCase = true) ||
                exam.category.displayName.contains(trimmed, ignoreCase = true) ||
                exam.subjects.any { subject ->
                    subject.name.contains(trimmed, ignoreCase = true) ||
                        subject.units.any { u ->
                            u.chapters.any { c ->
                                c.topics.any { t -> t.name.contains(trimmed, ignoreCase = true) }
                            }
                        }
                }
        }
    }

    private fun formatMark(value: Double): String =
        if (value % 1.0 == 0.0) value.toInt().toString() else value.toString()
}

/**
 * Reusable Compose component allowing students to switch between predefined examination categories
 * (Medical / NEET, Law, Chartered Accountancy, Civil Services, Engineering, SSC/Banking/State, University/Custom)
 * while visibly scoping subject and topic metadata exclusively to the selected exam.
 */
@Composable
fun ExamSelectionComponent(
    selectedExamId: String,
    selectedCaGroup: CaGroupSelection = CaGroupSelection.BOTH,
    onExamSelected: (ScopedExamMetadata) -> Unit,
    onCaGroupSelected: ((CaGroupSelection) -> Unit)? = null,
    modifier: Modifier = Modifier,
    requireConfirmation: Boolean = true,
    showSearch: Boolean = true,
    showScopedMetadataPreview: Boolean = true
) {
    val activeScope = remember(selectedExamId, selectedCaGroup) {
        ExamMetadataScope.resolve(selectedExamId, selectedCaGroup)
    }
    val categories = remember { ExamRegistry.getCategoriesWithExams().map { it.first } }

    var selectedCategory by remember(selectedExamId) { mutableStateOf(activeScope.category) }
    var searchQuery by remember { mutableStateOf("") }
    var previewExamId by remember(selectedExamId) { mutableStateOf(activeScope.exam.examId) }
    var pendingConfirmExamId by remember { mutableStateOf<String?>(null) }

    // Keep preview and category synchronized if parent updates selectedExamId externally.
    LaunchedEffect(selectedExamId) {
        val resolved = ExamMetadataScope.resolve(selectedExamId, selectedCaGroup)
        selectedCategory = resolved.category
        previewExamId = resolved.exam.examId
    }

    val visibleExams = remember(searchQuery, selectedCategory) {
        ExamMetadataScope.searchExams(
            query = searchQuery,
            category = if (searchQuery.isBlank()) selectedCategory else null
        )
    }

    val previewScope = remember(previewExamId, selectedCaGroup) {
        ExamMetadataScope.resolve(previewExamId, selectedCaGroup)
    }

    Column(
        modifier = modifier
            .fillMaxWidth()
            .animateContentSize(animationSpec = spring(stiffness = Spring.StiffnessMediumLow))
            .testTag("exam_selection_component"),
        verticalArrangement = Arrangement.spacedBy(12.dp)
    ) {
        // Optional Search Bar across all categories, exams, subjects, and topics
        if (showSearch) {
            OutlinedTextField(
                value = searchQuery,
                onValueChange = { searchQuery = it },
                placeholder = {
                    Text(
                        text = stringResource(R.string.exam_selection_search_placeholder),
                        style = MaterialTheme.typography.bodySmall,
                        maxLines = 1,
                        overflow = TextOverflow.Ellipsis
                    )
                },
                leadingIcon = {
                    Icon(
                        imageVector = Icons.Default.Search,
                        contentDescription = stringResource(R.string.exam_selection_cd_search),
                        modifier = Modifier.size(18.dp)
                    )
                },
                trailingIcon = {
                    if (searchQuery.isNotEmpty()) {
                        IconButton(
                            onClick = { searchQuery = "" },
                            modifier = Modifier.testTag("exam_search_clear_button")
                        ) {
                            Icon(
                                imageVector = Icons.Default.Clear,
                                contentDescription = stringResource(R.string.exam_selection_cd_clear_search),
                                modifier = Modifier.size(18.dp)
                            )
                        }
                    }
                },
                singleLine = true,
                shape = RoundedCornerShape(12.dp),
                modifier = Modifier
                    .fillMaxWidth()
                    .testTag("exam_search_input")
            )
        }

        // Category Switcher Pills (NEET / Medical, Law, CA, Civil Services, Engineering, etc.)
        LazyRow(
            modifier = Modifier
                .fillMaxWidth()
                .testTag("exam_category_row"),
            horizontalArrangement = Arrangement.spacedBy(8.dp),
            contentPadding = PaddingValues(horizontal = 2.dp)
        ) {
            items(categories, key = { it.name }) { category ->
                val isSelected = searchQuery.isBlank() && selectedCategory == category
                FilterChip(
                    selected = isSelected,
                    onClick = {
                        searchQuery = ""
                        selectedCategory = category
                        val firstInCategory = ExamMetadataScope.examsForCategory(category).firstOrNull()
                        if (firstInCategory != null) {
                            previewExamId = firstInCategory.examId
                        }
                    },
                    leadingIcon = {
                        Icon(
                            imageVector = categoryIcon(category),
                            contentDescription = null,
                            modifier = Modifier.size(16.dp)
                        )
                    },
                    label = {
                        Text(
                            text = categoryShortLabel(category),
                            style = MaterialTheme.typography.labelMedium,
                            fontWeight = if (isSelected) FontWeight.Bold else FontWeight.Medium,
                            maxLines = 1
                        )
                    },
                    colors = FilterChipDefaults.filterChipColors(
                        selectedContainerColor = MaterialTheme.colorScheme.primaryContainer,
                        selectedLabelColor = MaterialTheme.colorScheme.onPrimaryContainer,
                        selectedLeadingIconColor = MaterialTheme.colorScheme.onPrimaryContainer
                    ),
                    modifier = Modifier
                        .minimumInteractiveComponentSize()
                        .testTag("exam_category_chip_${category.name.lowercase()}")
                )
            }
        }

        // Exam List for Selected Category (or Search Matches)
        if (visibleExams.isEmpty()) {
            Card(
                modifier = Modifier
                    .fillMaxWidth()
                    .testTag("exam_selection_empty_state"),
                shape = RoundedCornerShape(14.dp),
                colors = CardDefaults.cardColors(
                    containerColor = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.45f)
                )
            ) {
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(16.dp),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(10.dp)
                ) {
                    Icon(
                        imageVector = Icons.Default.Search,
                        contentDescription = null,
                        tint = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                    Text(
                        text = stringResource(R.string.exam_selection_empty_search, searchQuery),
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant
                    )
                }
            }
        } else {
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .testTag("exam_options_list"),
                verticalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                visibleExams.forEach { exam ->
                    val isCurrentlyActive = exam.examId == activeScope.exam.examId
                    val isPreviewed = exam.examId == previewExamId
                    val itemScope = remember(exam.examId, selectedCaGroup) {
                        ExamMetadataScope.resolve(exam.examId, selectedCaGroup)
                    }

                    ExamOptionRow(
                        scope = itemScope,
                        isCurrentlyActive = isCurrentlyActive,
                        isPreviewed = isPreviewed,
                        onClick = {
                            previewExamId = exam.examId
                            if (isCurrentlyActive) {
                                onExamSelected(itemScope)
                            } else if (requireConfirmation) {
                                pendingConfirmExamId = exam.examId
                            } else {
                                onExamSelected(itemScope)
                            }
                        }
                    )
                }
            }
        }

        // CA Group I / Group II / Both Selector (scoped specifically to CA Intermediate & Final)
        AnimatedVisibility(visible = previewScope.exam.supportsCaGroups && onCaGroupSelected != null) {
            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .testTag("ca_group_selector_section"),
                verticalArrangement = Arrangement.spacedBy(6.dp)
            ) {
                Text(
                    text = "CA GROUP SCOPE",
                    style = MaterialTheme.typography.labelSmall,
                    fontWeight = FontWeight.Bold,
                    color = MaterialTheme.colorScheme.primary,
                    letterSpacing = 0.8.sp
                )
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .horizontalScroll(rememberScrollState()),
                    horizontalArrangement = Arrangement.spacedBy(8.dp)
                ) {
                    CaGroupSelection.entries.forEach { group ->
                        val isGroupSelected = selectedCaGroup == group
                        FilterChip(
                            selected = isGroupSelected,
                            onClick = { onCaGroupSelected?.invoke(group) },
                            label = {
                                Text(
                                    text = group.label,
                                    style = MaterialTheme.typography.labelSmall,
                                    fontWeight = if (isGroupSelected) FontWeight.Bold else FontWeight.Normal
                                )
                            },
                            modifier = Modifier
                                .minimumInteractiveComponentSize()
                                .testTag("ca_group_chip_${group.value}")
                        )
                    }
                }
            }
        }

        // Scoped Subject & Topic Metadata Preview Card
        if (showScopedMetadataPreview) {
            ScopedMetadataPreviewCard(scope = previewScope)
        }
    }

    // Safe Confirmation Dialog ensuring users know subjects/topics are isolated & prior data is preserved
    pendingConfirmExamId?.let { targetId ->
        val targetScope = remember(targetId, selectedCaGroup) {
            ExamMetadataScope.resolve(targetId, selectedCaGroup)
        }
        AlertDialog(
            onDismissRequest = { pendingConfirmExamId = null },
            icon = {
                Icon(
                    imageVector = categoryIcon(targetScope.category),
                    contentDescription = null,
                    tint = MaterialTheme.colorScheme.primary
                )
            },
            title = {
                Text(
                    text = stringResource(R.string.exam_selection_confirm_title, targetScope.exam.name),
                    fontFamily = FontFamily.Serif,
                    fontWeight = FontWeight.Bold
                )
            },
            text = {
                Column(verticalArrangement = Arrangement.spacedBy(8.dp)) {
                    Text(
                        text = stringResource(
                            R.string.exam_selection_confirm_body,
                            targetScope.exam.name,
                            targetScope.totalSubjects,
                            targetScope.totalTopics,
                            targetScope.markingSummary,
                            targetScope.exam.syllabusVersion
                        ),
                        style = MaterialTheme.typography.bodySmall
                    )
                    Text(
                        text = "Subjects: ${targetScope.subjects.joinToString(", ") { it.name }}",
                        style = MaterialTheme.typography.labelSmall,
                        fontWeight = FontWeight.SemiBold,
                        color = MaterialTheme.colorScheme.primary
                    )
                }
            },
            confirmButton = {
                Button(
                    onClick = {
                        pendingConfirmExamId = null
                        onExamSelected(targetScope)
                    },
                    modifier = Modifier.testTag("confirm_switch_exam_button")
                ) {
                    Text(stringResource(R.string.exam_selection_confirm_action))
                }
            },
            dismissButton = {
                TextButton(
                    onClick = { pendingConfirmExamId = null },
                    modifier = Modifier.testTag("cancel_switch_exam_button")
                ) {
                    Text(stringResource(R.string.focus_timer_dialog_cancel))
                }
            }
        )
    }
}

@Composable
private fun ExamOptionRow(
    scope: ScopedExamMetadata,
    isCurrentlyActive: Boolean,
    isPreviewed: Boolean,
    onClick: () -> Unit
) {
    val exam = scope.exam
    val containerColor = when {
        isCurrentlyActive -> MaterialTheme.colorScheme.primaryContainer.copy(alpha = 0.75f)
        isPreviewed -> MaterialTheme.colorScheme.secondaryContainer.copy(alpha = 0.55f)
        else -> MaterialTheme.colorScheme.surface
    }
    val borderColor = when {
        isCurrentlyActive -> MaterialTheme.colorScheme.primary
        isPreviewed -> MaterialTheme.colorScheme.secondary
        else -> MaterialTheme.colorScheme.outlineVariant
    }

    Row(
        modifier = Modifier
            .fillMaxWidth()
            .minimumInteractiveComponentSize()
            .clip(RoundedCornerShape(12.dp))
            .background(containerColor)
            .border(width = if (isCurrentlyActive) 1.5.dp else 1.dp, color = borderColor, shape = RoundedCornerShape(12.dp))
            .clickable(onClick = onClick)
            .padding(horizontal = 14.dp, vertical = 12.dp)
            .testTag("exam_option_${exam.examId}"),
        horizontalArrangement = Arrangement.SpaceBetween,
        verticalAlignment = Alignment.CenterVertically
    ) {
        Column(modifier = Modifier.weight(1f), verticalArrangement = Arrangement.spacedBy(2.dp)) {
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(6.dp)
            ) {
                Text(
                    text = exam.name,
                    style = MaterialTheme.typography.bodyMedium,
                    fontWeight = FontWeight.Bold,
                    color = MaterialTheme.colorScheme.onSurface
                )
            }
            Text(
                text = "${exam.applicableYear} • ${scope.markingSummary}",
                style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant
            )
            Text(
                text = "${scope.totalSubjects} subjects • ${scope.totalTopics} topics • ${exam.patternStatus.label}",
                style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.primary
            )
        }

        Spacer(modifier = Modifier.width(8.dp))

        if (isCurrentlyActive) {
            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(4.dp)
            ) {
                Icon(
                    imageVector = Icons.Default.CheckCircle,
                    contentDescription = stringResource(R.string.exam_selection_active_badge),
                    tint = SuccessGreen,
                    modifier = Modifier.size(18.dp)
                )
                Text(
                    text = stringResource(R.string.exam_selection_active_badge),
                    style = MaterialTheme.typography.labelSmall,
                    fontWeight = FontWeight.Bold,
                    color = SuccessGreen
                )
            }
        }
    }
}

@Composable
private fun ScopedMetadataPreviewCard(
    scope: ScopedExamMetadata
) {
    Card(
        modifier = Modifier
            .fillMaxWidth()
            .testTag("scoped_metadata_preview"),
        shape = RoundedCornerShape(14.dp),
        colors = CardDefaults.cardColors(
            containerColor = MaterialTheme.colorScheme.surfaceVariant.copy(alpha = 0.45f)
        ),
        border = CardDefaults.outlinedCardBorder()
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(14.dp),
            verticalArrangement = Arrangement.spacedBy(8.dp)
        ) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(6.dp)
                ) {
                    Icon(
                        imageVector = Icons.Default.MenuBook,
                        contentDescription = null,
                        tint = MaterialTheme.colorScheme.primary,
                        modifier = Modifier.size(16.dp)
                    )
                    Text(
                        text = stringResource(R.string.exam_selection_scoped_metadata_header),
                        style = MaterialTheme.typography.labelMedium,
                        fontWeight = FontWeight.Bold,
                        color = MaterialTheme.colorScheme.onSurface
                    )
                }
                Text(
                    text = "${scope.exam.shortName} • ${scope.totalSubjects}S / ${scope.totalTopics}T",
                    style = MaterialTheme.typography.labelSmall,
                    fontWeight = FontWeight.SemiBold,
                    color = MaterialTheme.colorScheme.primary
                )
            }

            Column(verticalArrangement = Arrangement.spacedBy(6.dp)) {
                scope.subjects.forEach { subject ->
                    val sampleTopics = subject.topicNames.take(3).joinToString(" • ")
                    Column(
                        modifier = Modifier
                            .fillMaxWidth()
                            .clip(RoundedCornerShape(8.dp))
                            .background(MaterialTheme.colorScheme.surface)
                            .padding(horizontal = 10.dp, vertical = 8.dp)
                            .testTag("scoped_subject_item_${subject.name.lowercase().replace(" ", "_")}")
                    ) {
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.SpaceBetween,
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            Text(
                                text = subject.name,
                                style = MaterialTheme.typography.bodySmall,
                                fontWeight = FontWeight.SemiBold,
                                color = MaterialTheme.colorScheme.onSurface,
                                modifier = Modifier.weight(1f)
                            )
                            Text(
                                text = buildString {
                                    append("${subject.topicCount} topics")
                                    subject.officialWeightagePercent?.let { w ->
                                        append(" • ${w.toInt()}%")
                                    }
                                },
                                style = MaterialTheme.typography.labelSmall,
                                color = MaterialTheme.colorScheme.primary
                            )
                        }
                        if (sampleTopics.isNotEmpty()) {
                            Spacer(modifier = Modifier.height(2.dp))
                            Text(
                                text = sampleTopics,
                                style = MaterialTheme.typography.labelSmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant,
                                maxLines = 1,
                                overflow = TextOverflow.Ellipsis
                            )
                        }
                    }
                }
            }

            Row(
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(6.dp)
            ) {
                Icon(
                    imageVector = Icons.Default.VerifiedUser,
                    contentDescription = null,
                    tint = SuccessGreen,
                    modifier = Modifier.size(14.dp)
                )
                Text(
                    text = stringResource(R.string.exam_selection_isolation_note, scope.exam.shortName),
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    lineHeight = 14.sp
                )
            }
        }
    }
}

/**
 * Dialog presentation of [ExamSelectionComponent] for quick exam switching from Dashboard, Prep Hub, or Settings.
 */
@Composable
fun ExamSelectionDialog(
    currentExamId: String,
    currentCaGroup: CaGroupSelection = CaGroupSelection.BOTH,
    onDismiss: () -> Unit,
    onExamSelected: (ScopedExamMetadata) -> Unit,
    onCaGroupSelected: ((CaGroupSelection) -> Unit)? = null
) {
    AlertDialog(
        onDismissRequest = onDismiss,
        title = {
            Column {
                Text(
                    text = stringResource(R.string.exam_selection_title),
                    fontFamily = FontFamily.Serif,
                    fontWeight = FontWeight.Bold
                )
                Text(
                    text = stringResource(R.string.exam_selection_subtitle),
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
            }
        },
        text = {
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .heightIn(max = 460.dp)
                    .verticalScroll(rememberScrollState())
            ) {
                ExamSelectionComponent(
                    selectedExamId = currentExamId,
                    selectedCaGroup = currentCaGroup,
                    onExamSelected = { scoped ->
                        onExamSelected(scoped)
                        onDismiss()
                    },
                    onCaGroupSelected = onCaGroupSelected,
                    requireConfirmation = true,
                    showSearch = true,
                    showScopedMetadataPreview = true
                )
            }
        },
        confirmButton = {
            TextButton(onClick = onDismiss) {
                Text(stringResource(R.string.exam_selection_close_action))
            }
        }
    )
}

private fun categoryShortLabel(category: ExamCategory): String = when (category) {
    ExamCategory.MEDICAL -> "Medical (NEET)"
    ExamCategory.LAW -> "Law"
    ExamCategory.CHARTERED_ACCOUNTANCY -> "CA"
    ExamCategory.CIVIL_SERVICES -> "UPSC"
    ExamCategory.ENGINEERING -> "GATE"
    ExamCategory.STATE_EXAMS -> "SSC & Banking"
    ExamCategory.UNIVERSITY_CUSTOM -> "University / Custom"
}

private fun categoryIcon(category: ExamCategory): ImageVector = when (category) {
    ExamCategory.MEDICAL -> Icons.Default.LocalHospital
    ExamCategory.LAW -> Icons.Default.Gavel
    ExamCategory.CHARTERED_ACCOUNTANCY -> Icons.Default.AccountBalance
    ExamCategory.CIVIL_SERVICES -> Icons.Default.Public
    ExamCategory.ENGINEERING -> Icons.Default.Engineering
    ExamCategory.STATE_EXAMS -> Icons.Default.Work
    ExamCategory.UNIVERSITY_CUSTOM -> Icons.Default.School
}
