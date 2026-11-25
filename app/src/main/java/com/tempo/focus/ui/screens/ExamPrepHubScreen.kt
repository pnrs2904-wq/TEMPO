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
import androidx.compose.foundation.layout.widthIn
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.foundation.verticalScroll
import androidx.compose.material3.ExperimentalMaterial3Api
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.SecondaryTabRow
import androidx.compose.material3.Tab
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.saveable.rememberSaveable
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import com.tempo.focus.data.db.TopicProgressEntity
import com.tempo.focus.ui.screens.prep.LogRevisionDialog
import com.tempo.focus.ui.screens.prep.MocksTabContent
import com.tempo.focus.ui.screens.prep.RevisionsTabContent
import com.tempo.focus.ui.screens.prep.StudyPlanTabContent
import com.tempo.focus.ui.screens.prep.SyllabusTabContent
import com.tempo.focus.ui.viewmodel.ExamPrepViewModel

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ExamPrepHubScreen(
    examPrepViewModel: ExamPrepViewModel,
    initialTab: Int = 0,
    onSubjectClearedOnExamSwitch: () -> Unit = {}
) {
    val exam by examPrepViewModel.selectedExam.collectAsStateWithLifecycle()
    val caGroup by examPrepViewModel.selectedCaGroup.collectAsStateWithLifecycle()
    val topics by examPrepViewModel.activeTopics.collectAsStateWithLifecycle()
    val dueRevisions by examPrepViewModel.dueRevisions.collectAsStateWithLifecycle()
    val revisions by examPrepViewModel.revisions.collectAsStateWithLifecycle()
    val mocks by examPrepViewModel.mocks.collectAsStateWithLifecycle()
    val errorDiagnostics by examPrepViewModel.errorDiagnostics.collectAsStateWithLifecycle()
    val studyPlan by examPrepViewModel.studyPlan.collectAsStateWithLifecycle()
    val savedPlan by examPrepViewModel.examPlan.collectAsStateWithLifecycle()
    val statusMessage by examPrepViewModel.statusMessage.collectAsStateWithLifecycle()

    var selectedTab by rememberSaveable { mutableIntStateOf(initialTab) }
    var showExamPicker by remember { mutableStateOf(false) }
    var quickLogTopic by remember { mutableStateOf<TopicProgressEntity?>(null) }

    val tabs = listOf(
        "Syllabus",
        "Revisions${if (dueRevisions.isNotEmpty()) " (${dueRevisions.size})" else ""}",
        "Mocks",
        "Plan"
    )

    Box(
        modifier = Modifier
            .fillMaxSize()
            .testTag("exam_prep_hub_screen"),
        contentAlignment = Alignment.TopCenter
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .widthIn(max = 680.dp)
                .fillMaxSize()
        ) {
            // Top Header with Exam Switcher Pill
            Row(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 20.dp, vertical = 12.dp),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Column(modifier = Modifier.weight(1f)) {
                    Text(
                        text = "Exam Prep Hub",
                        style = MaterialTheme.typography.headlineSmall,
                        fontFamily = FontFamily.Serif,
                        fontWeight = FontWeight.Bold
                    )
                    Text(
                        text = exam.strategySummary,
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.onSurfaceVariant,
                        maxLines = 2
                    )
                }
                Box(
                    modifier = Modifier
                        .clip(RoundedCornerShape(10.dp))
                        .background(MaterialTheme.colorScheme.primaryContainer)
                        .clickable { showExamPicker = true }
                        .padding(horizontal = 12.dp, vertical = 8.dp)
                        .testTag("prep_hub_exam_switcher")
                ) {
                    Text(
                        text = "${exam.shortName} ▾",
                        style = MaterialTheme.typography.labelMedium,
                        fontWeight = FontWeight.Bold,
                        color = MaterialTheme.colorScheme.onPrimaryContainer
                    )
                }
            }

            // Dismissible Status Message Banner
            statusMessage?.let { msg ->
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .padding(horizontal = 20.dp, vertical = 4.dp)
                        .clip(RoundedCornerShape(10.dp))
                        .background(MaterialTheme.colorScheme.secondaryContainer)
                        .clickable { examPrepViewModel.clearStatusMessage() }
                        .padding(horizontal = 12.dp, vertical = 8.dp),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Text(
                        text = msg,
                        style = MaterialTheme.typography.labelSmall,
                        color = MaterialTheme.colorScheme.onSecondaryContainer,
                        modifier = Modifier.weight(1f)
                    )
                    Text(
                        text = "Dismiss",
                        style = MaterialTheme.typography.labelSmall,
                        fontWeight = FontWeight.Bold,
                        color = MaterialTheme.colorScheme.primary
                    )
                }
            }

            SecondaryTabRow(selectedTabIndex = selectedTab) {
                tabs.forEachIndexed { index, title ->
                    Tab(
                        selected = selectedTab == index,
                        onClick = { selectedTab = index },
                        text = {
                            Text(
                                text = title,
                                style = MaterialTheme.typography.labelMedium,
                                maxLines = 1
                            )
                        },
                        modifier = Modifier.testTag("prep_tab_$index")
                    )
                }
            }

            Column(
                modifier = Modifier
                    .fillMaxWidth()
                    .weight(1f)
                    .verticalScroll(rememberScrollState())
                    .padding(horizontal = 20.dp, vertical = 14.dp)
            ) {
                when (selectedTab) {
                    0 -> SyllabusTabContent(
                        exam = exam,
                        caGroup = caGroup,
                        topics = topics,
                        onCaGroupChange = { examPrepViewModel.setCaGroup(it) },
                        onCycleStatus = { examPrepViewModel.cycleTopicStatus(it) },
                        onUpdateChecklist = { t, n, f, d, r -> examPrepViewModel.updateTopicChecklist(t, n, f, d, r) },
                        onAddTopic = { s, u, c, n, d -> examPrepViewModel.addCustomTopic(s, u, c, n, d) },
                        onImportCsv = { raw, sub -> examPrepViewModel.importCsvTopics(raw, sub) },
                        onDeleteTopic = { examPrepViewModel.deleteTopic(it) },
                        onLogRevisionClick = { quickLogTopic = it }
                    )
                    1 -> RevisionsTabContent(
                        exam = exam,
                        dueTopics = dueRevisions,
                        allTopics = topics,
                        revisionHistory = revisions,
                        onLogRevision = { t, rec, acc, diff, m, notes ->
                            examPrepViewModel.logRevision(t, rec, acc, diff, m, notes)
                        },
                        onReschedule = { t, days -> examPrepViewModel.rescheduleRevision(t, days) }
                    )
                    2 -> MocksTabContent(
                        exam = exam,
                        mocks = mocks,
                        errorDiagnostics = errorDiagnostics,
                        onRecordQuickMock = { name, tot, cor, inc, dur, pos, neg, negOn, weak, notes ->
                            examPrepViewModel.recordQuickMock(name, tot, cor, inc, dur, pos, neg, negOn, weak, notes)
                        },
                        onRecordDetailedMock = { name, attempts, dur, notes ->
                            examPrepViewModel.recordDetailedMock(name, attempts, dur, notes)
                        },
                        onDeleteMock = { examPrepViewModel.deleteMock(it) }
                    )
                    3 -> StudyPlanTabContent(
                        plan = studyPlan,
                        savedPlanEntity = savedPlan,
                        onUpdatePlanConfig = { date, clear, hours, days, target ->
                            examPrepViewModel.updatePlanConfiguration(date, clear, hours, days, target)
                        }
                    )
                }
                Spacer(Modifier.height(24.dp))
            }
        }
    }

    if (showExamPicker) {
        ExamSelectorDialog(
            currentExamId = exam.examId,
            currentCaGroup = caGroup,
            onDismiss = { showExamPicker = false },
            onSelectExam = { newExamId ->
                examPrepViewModel.switchExamination(newExamId, onSubjectClearedOnExamSwitch)
                showExamPicker = false
            },
            onSelectCaGroup = { examPrepViewModel.setCaGroup(it) }
        )
    }

    quickLogTopic?.let { topic ->
        LogRevisionDialog(
            exam = exam,
            topic = topic,
            onDismiss = { quickLogTopic = null },
            onSubmit = { recall, accuracy, diff, method, notes ->
                examPrepViewModel.logRevision(topic, recall, accuracy, diff, method, notes)
                quickLogTopic = null
            }
        )
    }
}
