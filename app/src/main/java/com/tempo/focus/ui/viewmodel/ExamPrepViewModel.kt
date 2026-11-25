package com.tempo.focus.ui.viewmodel

import android.app.Application
import androidx.lifecycle.AndroidViewModel
import androidx.lifecycle.viewModelScope
import com.tempo.focus.data.db.AppDatabase
import com.tempo.focus.data.db.MockTestEntity
import com.tempo.focus.data.db.QuestionAttemptEntity
import com.tempo.focus.data.db.RevisionEventEntity
import com.tempo.focus.data.db.SessionEntity
import com.tempo.focus.data.db.TopicProgressEntity
import com.tempo.focus.data.db.UserExamPlanEntity
import com.tempo.focus.data.preferences.UserPreferencesRepository
import com.tempo.focus.data.repository.ExamPrepRepository
import com.tempo.focus.data.repository.RevisionLogOutcome
import com.tempo.focus.data.repository.SessionRepository
import com.tempo.focus.domain.exams.CaGroupSelection
import com.tempo.focus.domain.exams.ExamConfig
import com.tempo.focus.domain.exams.ExamRegistry
import com.tempo.focus.domain.exams.MarkingScheme
import com.tempo.focus.domain.exams.TopicDifficulty
import com.tempo.focus.domain.exams.TopicStatus
import com.tempo.focus.domain.prep.AdaptiveStudyPlan
import com.tempo.focus.domain.prep.ErrorCategory
import com.tempo.focus.domain.prep.ExamReadinessEngine
import com.tempo.focus.domain.prep.ExamReadinessReport
import com.tempo.focus.domain.prep.MockPerformanceSnapshot
import com.tempo.focus.domain.prep.QuestionAttemptInput
import com.tempo.focus.domain.prep.RevisionMethod
import com.tempo.focus.domain.prep.RevisionSchedulerEngine
import com.tempo.focus.domain.prep.RevisionSnapshot
import com.tempo.focus.domain.prep.StudyPlanGenerator
import com.tempo.focus.domain.prep.TopicPlanInput
import kotlinx.coroutines.ExperimentalCoroutinesApi
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.SharingStarted
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.flow.combine
import kotlinx.coroutines.flow.distinctUntilChanged
import kotlinx.coroutines.flow.flatMapLatest
import kotlinx.coroutines.flow.map
import kotlinx.coroutines.flow.stateIn
import kotlinx.coroutines.launch
import java.time.LocalDate

data class SubjectProgressSummary(
    val subject: String,
    val totalTopics: Int,
    val completedTopics: Int,
    val masteredTopics: Int,
    val dueRevisions: Int
) {
    val completionRatio: Float
        get() = if (totalTopics > 0) completedTopics.toFloat() / totalTopics.toFloat() else 0f
}

@OptIn(ExperimentalCoroutinesApi::class)
class ExamPrepViewModel(application: Application) : AndroidViewModel(application) {

    private val database = AppDatabase.getDatabase(application)
    private val examPrepRepository = ExamPrepRepository(database.examPrepDao())
    private val sessionRepository = SessionRepository(database.sessionDao())
    private val preferencesRepository = UserPreferencesRepository(application)

    private val _statusMessage = MutableStateFlow<String?>(null)
    val statusMessage: StateFlow<String?> = _statusMessage.asStateFlow()

    val userSettings = preferencesRepository.userSettingsFlow.stateIn(
        viewModelScope,
        SharingStarted.WhileSubscribed(5000),
        com.tempo.focus.data.preferences.UserSettings(120, 600, null, soundEnabled = true, autoStartBreak = false)
    )

    val advancedExamMode: StateFlow<Boolean> = userSettings
        .map { it.advancedExamMode }
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), true)

    val selectedExam: StateFlow<ExamConfig> = userSettings
        .map { ExamRegistry.getById(it.selectedExamId) }
        .distinctUntilChanged()
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), ExamRegistry.getById(null))

    val selectedCaGroup: StateFlow<CaGroupSelection> = userSettings
        .map { CaGroupSelection.fromValue(it.selectedCaGroup) }
        .distinctUntilChanged()
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), CaGroupSelection.BOTH)

    val examPlan: StateFlow<UserExamPlanEntity?> = selectedExam
        .flatMapLatest { examPrepRepository.observeExamPlan(it.examId) }
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), null)

    val rawTopicsForExam: StateFlow<List<TopicProgressEntity>> = selectedExam
        .flatMapLatest { examPrepRepository.observeTopics(it.examId) }
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), emptyList())

    /**
     * Topics filtered by active CA group (if CA Inter/Final) so Group I/II switching never mixes papers.
     */
    val activeTopics: StateFlow<List<TopicProgressEntity>> = combine(
        selectedExam,
        selectedCaGroup,
        rawTopicsForExam
    ) { exam, group, topics ->
        if (!exam.supportsCaGroups) {
            topics
        } else {
            val allowedSubjects = ExamRegistry.getEffectiveSubjects(exam, group)
                .map { it.name.lowercase() }
                .toSet()
            topics.filter { it.isCustom || allowedSubjects.contains(it.subject.lowercase()) }
        }
    }.stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), emptyList())

    val revisions: StateFlow<List<RevisionEventEntity>> = selectedExam
        .flatMapLatest { examPrepRepository.observeRevisions(it.examId) }
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), emptyList())

    val mocks: StateFlow<List<MockTestEntity>> = selectedExam
        .flatMapLatest { examPrepRepository.observeMocks(it.examId) }
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), emptyList())

    val questionAttempts: StateFlow<List<QuestionAttemptEntity>> = selectedExam
        .flatMapLatest { examPrepRepository.observeQuestionAttempts(it.examId) }
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), emptyList())

    private val allSessions: StateFlow<List<SessionEntity>> = sessionRepository.allSessions
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), emptyList())

    val dueRevisions: StateFlow<List<TopicProgressEntity>> = activeTopics
        .map { topics ->
            val todayEpoch = LocalDate.now().toEpochDay()
            topics.filter {
                RevisionSchedulerEngine.isDueOrOverdue(it.nextRevisionEpochDay, todayEpoch) ||
                    TopicStatus.fromValue(it.status) == TopicStatus.REVISION_DUE
            }.sortedBy { it.nextRevisionEpochDay ?: todayEpoch }
        }
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), emptyList())

    val subjectProgress: StateFlow<List<SubjectProgressSummary>> = activeTopics
        .map { topics ->
            val todayEpoch = LocalDate.now().toEpochDay()
            topics.groupBy { it.subject }.map { (subject, list) ->
                val completed = list.count {
                    val s = TopicStatus.fromValue(it.status)
                    s == TopicStatus.COMPLETED || s == TopicStatus.MASTERED
                }
                val mastered = list.count { TopicStatus.fromValue(it.status) == TopicStatus.MASTERED }
                val due = list.count {
                    RevisionSchedulerEngine.isDueOrOverdue(it.nextRevisionEpochDay, todayEpoch) ||
                        TopicStatus.fromValue(it.status) == TopicStatus.REVISION_DUE
                }
                SubjectProgressSummary(subject, list.size, completed, mastered, due)
            }.sortedBy { it.completionRatio }
        }
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), emptyList())

    val errorDiagnostics: StateFlow<Map<ErrorCategory, Int>> = questionAttempts
        .map { attempts ->
            attempts.filter { !it.isCorrect && !it.errorCategory.isNullOrBlank() }
                .mapNotNull { ErrorCategory.fromValue(it.errorCategory) }
                .groupingBy { it }
                .eachCount()
        }
        .stateIn(viewModelScope, SharingStarted.WhileSubscribed(5000), emptyMap())

    val studyPlan: StateFlow<AdaptiveStudyPlan> = combine(
        selectedExam,
        examPlan,
        activeTopics,
        mocks,
        userSettings
    ) { exam, plan, topics, mockList, settings ->
        val effectiveExamDate = (plan?.examDateEpochDay ?: settings.examDateEpochDay)?.let { LocalDate.ofEpochDay(it) }
        val topicInputs = topics.map {
            TopicPlanInput(
                topicId = it.id,
                subject = it.subject,
                topicName = it.topicName,
                status = TopicStatus.fromValue(it.status),
                difficulty = TopicDifficulty.fromValue(it.difficulty),
                nextRevisionEpochDay = it.nextRevisionEpochDay
            )
        }
        val subjectAccuracies = mockList
            .mapNotNull { m ->
                if (!m.weakestSubject.isNullOrBlank() && m.weakestSubjectAccuracy != null) {
                    m.weakestSubject to m.weakestSubjectAccuracy
                } else null
            }
            .groupBy({ it.first }, { it.second })
            .mapValues { (_, values) -> values.average() }

        StudyPlanGenerator.generatePlan(
            exam = exam,
            topics = topicInputs,
            today = LocalDate.now(),
            examDate = effectiveExamDate,
            dailyAvailableHours = plan?.dailyHours ?: (settings.dailyGoalMinutes / 60.0).coerceAtLeast(1.0),
            studyDaysPerWeek = plan?.studyDaysPerWeek ?: 6,
            subjectMockAccuracies = subjectAccuracies
        )
    }.stateIn(
        viewModelScope,
        SharingStarted.WhileSubscribed(5000),
        StudyPlanGenerator.generatePlan(
            exam = ExamRegistry.getById(null),
            topics = emptyList(),
            today = LocalDate.now(),
            examDate = null,
            dailyAvailableHours = 3.0,
            studyDaysPerWeek = 6
        )
    )

    val readinessReport: StateFlow<ExamReadinessReport> = combine(
        allSessions,
        activeTopics,
        revisions,
        mocks,
        userSettings
    ) { sessions, topics, revList, mockList, settings ->
        val topicInputs = topics.map {
            TopicPlanInput(
                topicId = it.id,
                subject = it.subject,
                topicName = it.topicName,
                status = TopicStatus.fromValue(it.status),
                difficulty = TopicDifficulty.fromValue(it.difficulty),
                nextRevisionEpochDay = it.nextRevisionEpochDay
            )
        }
        val revSnapshots = revList.map { RevisionSnapshot(it.recallRating, it.accuracyPercent) }
        val mockSnapshots = mockList.map {
            MockPerformanceSnapshot(
                dateTimestamp = it.dateTimestamp,
                percentage = it.percentage,
                accuracyPercent = it.accuracyPercent,
                avgSecondsPerQuestion = it.avgSecondsPerQuestion,
                weakestSubject = it.weakestSubject,
                weakestSubjectAccuracy = it.weakestSubjectAccuracy
            )
        }
        ExamReadinessEngine.evaluate(
            sessions = sessions,
            topics = topicInputs,
            revisions = revSnapshots,
            mocks = mockSnapshots,
            dailyGoalMinutes = settings.dailyGoalMinutes
        )
    }.stateIn(
        viewModelScope,
        SharingStarted.WhileSubscribed(5000),
        ExamReadinessEngine.evaluate(emptyList(), emptyList(), emptyList(), emptyList(), 120)
    )

    init {
        viewModelScope.launch {
            combine(selectedExam, selectedCaGroup) { exam, group -> exam to group }
                .distinctUntilChanged()
                .collect { (exam, group) ->
                    examPrepRepository.ensureExamInitialized(exam, group)
                }
        }
    }

    fun clearStatusMessage() {
        _statusMessage.value = null
    }

    fun setAdvancedExamMode(enabled: Boolean) {
        viewModelScope.launch {
            preferencesRepository.setAdvancedExamMode(enabled)
        }
    }

    fun switchExamination(examId: String, onSubjectCleared: () -> Unit = {}) {
        val targetExam = ExamRegistry.getById(examId)
        viewModelScope.launch {
            preferencesRepository.setSelectedExamId(targetExam.examId)
            examPrepRepository.ensureExamInitialized(targetExam, selectedCaGroup.value)
            onSubjectCleared()
            _statusMessage.value = "Switched to ${targetExam.name} (${targetExam.syllabusVersion}). Previous exam topics are preserved."
        }
    }

    fun setCaGroup(group: CaGroupSelection) {
        viewModelScope.launch {
            preferencesRepository.setSelectedCaGroup(group.value)
            examPrepRepository.updateExamPlanSettings(selectedExam.value, caGroup = group)
            _statusMessage.value = "CA syllabus updated to ${group.label}."
        }
    }

    fun updatePlanConfiguration(
        examDate: LocalDate?,
        clearDate: Boolean = false,
        dailyHours: Double,
        studyDaysPerWeek: Int,
        targetScorePercent: Int
    ) {
        viewModelScope.launch {
            examPrepRepository.updateExamPlanSettings(
                exam = selectedExam.value,
                examDateEpochDay = examDate?.toEpochDay(),
                clearExamDate = clearDate,
                dailyHours = dailyHours,
                studyDaysPerWeek = studyDaysPerWeek,
                targetScorePercent = targetScorePercent
            )
            if (!clearDate && examDate != null) {
                preferencesRepository.setExamDateEpochDay(examDate.toEpochDay())
            } else if (clearDate) {
                preferencesRepository.setExamDateEpochDay(null)
            }
            _statusMessage.value = "Study plan updated for ${selectedExam.value.shortName}."
        }
    }

    fun cycleTopicStatus(topic: TopicProgressEntity) {
        val next = TopicStatus.fromValue(topic.status).nextStatus()
        viewModelScope.launch {
            examPrepRepository.updateTopicStatus(topic, next)
        }
    }

    fun setTopicStatus(topic: TopicProgressEntity, status: TopicStatus) {
        viewModelScope.launch {
            examPrepRepository.updateTopicStatus(topic, status)
        }
    }

    fun updateTopicChecklist(
        topic: TopicProgressEntity,
        ncert: Boolean = topic.ncertCompleted,
        formula: Boolean = topic.formulaRevisionDone,
        diagram: Boolean = topic.diagramRevisionDone,
        rtpMtp: Boolean = topic.rtpMtpCompleted
    ) {
        viewModelScope.launch {
            examPrepRepository.updateTopicFlags(topic, ncert, formula, diagram, rtpMtp)
        }
    }

    fun addCustomTopic(
        subject: String,
        unit: String,
        chapter: String,
        topicName: String,
        difficulty: TopicDifficulty
    ) {
        viewModelScope.launch {
            examPrepRepository.addCustomTopic(selectedExam.value, subject, unit, chapter, topicName, difficulty)
            _statusMessage.value = "Added \"$topicName\" to ${selectedExam.value.shortName} syllabus."
        }
    }

    fun importCsvTopics(rawCsv: String, defaultSubject: String) {
        viewModelScope.launch {
            val count = examPrepRepository.importTopicsFromCsv(selectedExam.value, rawCsv, defaultSubject)
            _statusMessage.value = if (count > 0) {
                "Imported $count topics into ${selectedExam.value.shortName}."
            } else {
                "No new topics imported (all rows blank or already present)."
            }
        }
    }

    fun deleteTopic(topicId: String) {
        viewModelScope.launch {
            examPrepRepository.deleteTopic(topicId)
        }
    }

    fun logRevision(
        topic: TopicProgressEntity,
        recallRating: Int,
        accuracyPercent: Int?,
        difficulty: Int,
        method: RevisionMethod,
        notes: String?
    ) {
        viewModelScope.launch {
            when (
                val outcome = examPrepRepository.logRevisionEvent(
                    exam = selectedExam.value,
                    topic = topic,
                    recallRating = recallRating,
                    accuracyPercent = accuracyPercent,
                    difficulty = difficulty,
                    method = method,
                    notes = notes
                )
            ) {
                is RevisionLogOutcome.Logged -> {
                    _statusMessage.value = "Revision #${outcome.event.revisionNumber} saved — ${outcome.explanation}"
                }
                is RevisionLogOutcome.DuplicateBlocked -> {
                    _statusMessage.value = outcome.message
                }
            }
        }
    }

    fun rescheduleRevision(topic: TopicProgressEntity, daysFromToday: Long) {
        viewModelScope.launch {
            val newDate = LocalDate.now().plusDays(daysFromToday.coerceIn(0, 60))
            examPrepRepository.rescheduleTopicRevision(topic, newDate)
            _statusMessage.value = "Rescheduled \"${topic.topicName}\" to $newDate."
        }
    }

    fun recordQuickMock(
        mockName: String,
        totalQuestions: Int,
        correctAnswers: Int,
        incorrectAnswers: Int,
        durationMinutes: Int,
        customPositiveMarks: Double?,
        customNegativeMarks: Double?,
        negativeEnabled: Boolean,
        weakestSubject: String?,
        notes: String?
    ) {
        viewModelScope.launch {
            val base = selectedExam.value.markingScheme
            val scheme = MarkingScheme(
                positiveMarks = customPositiveMarks ?: base.positiveMarks,
                negativeMarks = if (negativeEnabled) (customNegativeMarks ?: base.negativeMarks) else 0.0,
                hasNegativeMarking = negativeEnabled,
                totalQuestions = totalQuestions,
                maxMarks = totalQuestions * (customPositiveMarks ?: base.positiveMarks),
                durationMinutes = durationMinutes
            )
            val saved = examPrepRepository.recordQuickMockTest(
                exam = selectedExam.value,
                mockName = mockName,
                totalQuestions = totalQuestions,
                correctAnswers = correctAnswers,
                incorrectAnswers = incorrectAnswers,
                durationMinutes = durationMinutes,
                markingScheme = scheme,
                weakestSubject = weakestSubject,
                notes = notes
            )
            _statusMessage.value = "Mock saved: ${saved.totalScore}/${saved.maxMarks} (${saved.percentage}%, Accuracy ${saved.accuracyPercent}%)."
        }
    }

    fun recordDetailedMock(
        mockName: String,
        attempts: List<QuestionAttemptInput>,
        durationMinutes: Int,
        notes: String?
    ) {
        if (attempts.isEmpty()) return
        viewModelScope.launch {
            val saved = examPrepRepository.recordDetailedMockTest(
                exam = selectedExam.value,
                mockName = mockName,
                attempts = attempts,
                durationMinutes = durationMinutes,
                notes = notes
            )
            _statusMessage.value = "Question-level mock saved: ${saved.totalScore}/${saved.maxMarks} (${saved.accuracyPercent}% accuracy)."
        }
    }

    fun deleteMock(mockId: String) {
        viewModelScope.launch {
            examPrepRepository.deleteMock(mockId)
        }
    }

    fun clearAllExamPrepData() {
        viewModelScope.launch {
            examPrepRepository.clearAllExamPrepData()
            examPrepRepository.ensureExamInitialized(selectedExam.value, selectedCaGroup.value)
            _statusMessage.value = "Exam preparation records cleared."
        }
    }
}
