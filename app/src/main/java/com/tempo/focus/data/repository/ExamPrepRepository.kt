package com.tempo.focus.data.repository

import androidx.room.withTransaction
import com.tempo.focus.data.db.AppDatabase
import com.tempo.focus.data.db.ExamPrepDao
import com.tempo.focus.data.db.MockTestEntity
import com.tempo.focus.data.db.QuestionAttemptEntity
import com.tempo.focus.data.db.RevisionEventEntity
import com.tempo.focus.data.db.SyncDao
import com.tempo.focus.data.db.TopicProgressEntity
import com.tempo.focus.data.db.UserExamPlanEntity
import com.tempo.focus.data.sync.SyncPayloadSerializer
import com.tempo.focus.domain.exams.CaGroupSelection
import com.tempo.focus.domain.exams.ExamCategory
import com.tempo.focus.domain.exams.ExamConfig
import com.tempo.focus.domain.exams.ExamRegistry
import com.tempo.focus.domain.exams.MarkingScheme
import com.tempo.focus.domain.exams.TopicDifficulty
import com.tempo.focus.domain.exams.TopicStatus
import com.tempo.focus.domain.prep.MockTestScoringEngine
import com.tempo.focus.domain.prep.QuestionAttemptInput
import com.tempo.focus.domain.prep.RevisionMethod
import com.tempo.focus.domain.prep.RevisionSchedulerEngine
import com.tempo.focus.domain.prep.SyllabusCsvImporter
import kotlinx.coroutines.flow.Flow
import java.time.LocalDate
import java.util.UUID

sealed class RevisionLogOutcome {
    data class Logged(val event: RevisionEventEntity, val explanation: String) : RevisionLogOutcome()
    data class DuplicateBlocked(val message: String) : RevisionLogOutcome()
}

class ExamPrepRepository(
    private val dao: ExamPrepDao,
    private val syncDao: SyncDao? = null,
    private val database: AppDatabase? = null,
    private val onLocalChangeEnqueued: (() -> Unit)? = null
) {

    fun observeExamPlan(examId: String): Flow<UserExamPlanEntity?> = dao.observeExamPlan(examId)
    fun observeTopics(examId: String): Flow<List<TopicProgressEntity>> = dao.observeTopicsForExam(examId)
    fun observeRevisions(examId: String): Flow<List<RevisionEventEntity>> = dao.observeRevisionsForExam(examId)
    fun observeMocks(examId: String): Flow<List<MockTestEntity>> = dao.observeMocksForExam(examId)
    fun observeQuestionAttempts(examId: String): Flow<List<QuestionAttemptEntity>> = dao.observeQuestionAttemptsForExam(examId)

    suspend fun getAllExamPlans(): List<UserExamPlanEntity> = dao.getAllExamPlans()
    suspend fun getAllTopics(): List<TopicProgressEntity> = dao.getAllTopics()
    suspend fun getAllRevisions(): List<RevisionEventEntity> = dao.getAllRevisions()
    suspend fun getAllMocks(): List<MockTestEntity> = dao.getAllMocks()

    private suspend fun <T> runAtomic(block: suspend () -> T): T {
        return if (database != null) {
            database.withTransaction { block() }
        } else {
            block()
        }
    }

    /**
     * Ensures the exam has a saved plan and seeded official syllabus topics.
     * Never deletes existing user topics or topics from other exams.
     */
    suspend fun ensureExamInitialized(
        exam: ExamConfig,
        caGroup: CaGroupSelection = CaGroupSelection.BOTH
    ) {
        var enqueued = false
        runAtomic {
            val existingPlan = dao.getExamPlan(exam.examId)
            if (existingPlan == null) {
                val plan = UserExamPlanEntity(
                    examId = exam.examId,
                    applicableYear = exam.applicableYear,
                    syllabusVersion = exam.syllabusVersion,
                    selectedCaGroup = caGroup.value
                )
                dao.upsertExamPlan(plan)
                syncDao?.upsertOutbox(SyncPayloadSerializer.examPlanToOutbox(plan))
                enqueued = true
            }

            val existingTopics = dao.getTopicsForExam(exam.examId)
            val existingKeys = existingTopics.map {
                "${it.subject.lowercase()}|${it.chapter.lowercase()}|${it.topicName.lowercase()}"
            }.toSet()

            val subjectsToSeed = ExamRegistry.getEffectiveSubjects(exam, caGroup)
            val newTopics = mutableListOf<TopicProgressEntity>()

            for (subject in subjectsToSeed) {
                for (unit in subject.units) {
                    for (chapter in unit.chapters) {
                        for (topic in chapter.topics) {
                            val key = "${subject.name.lowercase()}|${chapter.name.lowercase()}|${topic.name.lowercase()}"
                            if (!existingKeys.contains(key)) {
                                newTopics.add(
                                    TopicProgressEntity(
                                        examId = exam.examId,
                                        syllabusVersion = exam.syllabusVersion,
                                        subject = subject.name,
                                        unit = unit.name,
                                        chapter = chapter.name,
                                        topicName = topic.name,
                                        subtopics = topic.subtopics.joinToString(", "),
                                        status = TopicStatus.NOT_STARTED.value,
                                        difficulty = topic.difficulty.value,
                                        isCustom = false
                                    )
                                )
                            }
                        }
                    }
                }
            }

            if (newTopics.isNotEmpty()) {
                dao.insertTopics(newTopics)
                syncDao?.upsertOutboxBatch(newTopics.map { SyncPayloadSerializer.topicToOutbox(it) })
                enqueued = true
            }
        }
        if (enqueued) onLocalChangeEnqueued?.invoke()
    }

    suspend fun updateExamPlanSettings(
        exam: ExamConfig,
        caGroup: CaGroupSelection? = null,
        examDateEpochDay: Long? = null,
        clearExamDate: Boolean = false,
        dailyHours: Double? = null,
        studyDaysPerWeek: Int? = null,
        targetScorePercent: Int? = null
    ) {
        runAtomic {
            val current = dao.getExamPlan(exam.examId) ?: UserExamPlanEntity(
                examId = exam.examId,
                applicableYear = exam.applicableYear,
                syllabusVersion = exam.syllabusVersion
            )
            val updated = current.copy(
                selectedCaGroup = caGroup?.value ?: current.selectedCaGroup,
                examDateEpochDay = when {
                    clearExamDate -> null
                    examDateEpochDay != null -> examDateEpochDay
                    else -> current.examDateEpochDay
                },
                dailyHours = dailyHours?.coerceIn(0.5, 14.0) ?: current.dailyHours,
                studyDaysPerWeek = studyDaysPerWeek?.coerceIn(1, 7) ?: current.studyDaysPerWeek,
                targetScorePercent = targetScorePercent?.coerceIn(30, 100) ?: current.targetScorePercent,
                updatedAt = System.currentTimeMillis()
            )
            dao.upsertExamPlan(updated)
            syncDao?.upsertOutbox(SyncPayloadSerializer.examPlanToOutbox(updated))
        }
        onLocalChangeEnqueued?.invoke()

        if (caGroup != null && exam.supportsCaGroups) {
            ensureExamInitialized(exam, caGroup)
        }
    }

    suspend fun addCustomTopic(
        exam: ExamConfig,
        subject: String,
        unit: String,
        chapter: String,
        topicName: String,
        difficulty: TopicDifficulty
    ) {
        val cleanName = topicName.trim()
        if (cleanName.isBlank()) return
        val entity = TopicProgressEntity(
            examId = exam.examId,
            syllabusVersion = exam.syllabusVersion,
            subject = subject.trim().ifBlank { exam.subjects.firstOrNull()?.name ?: "General" },
            unit = unit.trim().ifBlank { "Custom Unit" },
            chapter = chapter.trim().ifBlank { "Custom Chapter" },
            topicName = cleanName,
            status = TopicStatus.NOT_STARTED.value,
            difficulty = difficulty.value,
            isCustom = true
        )
        runAtomic {
            dao.insertTopic(entity)
            syncDao?.upsertOutbox(SyncPayloadSerializer.topicToOutbox(entity))
        }
        onLocalChangeEnqueued?.invoke()
    }

    suspend fun importTopicsFromCsv(exam: ExamConfig, rawCsv: String, defaultSubject: String): Int {
        val parsed = SyllabusCsvImporter.parse(rawCsv, defaultSubject)
        if (parsed.isEmpty()) return 0

        val existingKeys = dao.getTopicsForExam(exam.examId)
            .map { "${it.subject.lowercase()}|${it.topicName.lowercase()}" }
            .toSet()

        val entities = parsed.filterNot {
            existingKeys.contains("${it.subject.lowercase()}|${it.topicName.lowercase()}")
        }.map { row ->
            TopicProgressEntity(
                examId = exam.examId,
                syllabusVersion = exam.syllabusVersion,
                subject = row.subject,
                unit = row.unit,
                chapter = row.chapter,
                topicName = row.topicName,
                status = TopicStatus.NOT_STARTED.value,
                difficulty = row.difficulty.value,
                isCustom = true
            )
        }

        if (entities.isNotEmpty()) {
            runAtomic {
                dao.insertTopics(entities)
                syncDao?.upsertOutboxBatch(entities.map { SyncPayloadSerializer.topicToOutbox(it) })
            }
            onLocalChangeEnqueued?.invoke()
        }
        return entities.size
    }

    suspend fun updateTopicStatus(
        topic: TopicProgressEntity,
        newStatus: TopicStatus,
        today: LocalDate = LocalDate.now()
    ) {
        val todayEpoch = today.toEpochDay()
        val nextRev = when {
            newStatus == TopicStatus.COMPLETED && topic.nextRevisionEpochDay == null -> today.plusDays(1).toEpochDay()
            newStatus == TopicStatus.REVISION_DUE -> todayEpoch
            else -> topic.nextRevisionEpochDay
        }
        val updated = topic.copy(
            status = newStatus.value,
            lastStudiedEpochDay = if (newStatus != TopicStatus.NOT_STARTED) todayEpoch else topic.lastStudiedEpochDay,
            nextRevisionEpochDay = nextRev,
            updatedAt = System.currentTimeMillis()
        )
        runAtomic {
            dao.updateTopic(updated)
            syncDao?.upsertOutbox(SyncPayloadSerializer.topicToOutbox(updated))
        }
        onLocalChangeEnqueued?.invoke()
    }

    suspend fun updateTopicFlags(
        topic: TopicProgressEntity,
        ncertCompleted: Boolean = topic.ncertCompleted,
        formulaRevisionDone: Boolean = topic.formulaRevisionDone,
        diagramRevisionDone: Boolean = topic.diagramRevisionDone,
        rtpMtpCompleted: Boolean = topic.rtpMtpCompleted
    ) {
        val updated = topic.copy(
            ncertCompleted = ncertCompleted,
            formulaRevisionDone = formulaRevisionDone,
            diagramRevisionDone = diagramRevisionDone,
            rtpMtpCompleted = rtpMtpCompleted,
            updatedAt = System.currentTimeMillis()
        )
        runAtomic {
            dao.updateTopic(updated)
            syncDao?.upsertOutbox(SyncPayloadSerializer.topicToOutbox(updated))
        }
        onLocalChangeEnqueued?.invoke()
    }

    suspend fun deleteTopic(topicId: String) {
        val now = System.currentTimeMillis()
        runAtomic {
            val existing = dao.getTopicById(topicId)
            if (existing != null) {
                dao.softDeleteTopicById(topicId, now)
                syncDao?.upsertOutbox(SyncPayloadSerializer.topicToOutbox(existing.copy(deletedAt = now, updatedAt = now)))
            }
        }
        onLocalChangeEnqueued?.invoke()
    }

    /**
     * Logs a revision event calculated strictly from [actualRevisionDate] and blocks duplicates on the same day.
     */
    suspend fun logRevisionEvent(
        exam: ExamConfig,
        topic: TopicProgressEntity,
        recallRating: Int,
        accuracyPercent: Int?,
        difficulty: Int,
        method: RevisionMethod,
        notes: String?,
        actualRevisionDate: LocalDate = LocalDate.now()
    ): RevisionLogOutcome {
        val epochDay = actualRevisionDate.toEpochDay()
        val existingToday = dao.countRevisionsOnDay(topic.id, epochDay)
        if (existingToday > 0) {
            return RevisionLogOutcome.DuplicateBlocked(
                "A revision for \"${topic.topicName}\" was already logged today. Duplicate revision prevented."
            )
        }

        val scheduled = RevisionSchedulerEngine.calculateNextRevision(
            actualRevisionDate = actualRevisionDate,
            previousRevisionCount = topic.revisionCount,
            recallRating = recallRating,
            accuracyPercent = accuracyPercent,
            difficulty = difficulty,
            rule = exam.revisionRule
        )

        val now = System.currentTimeMillis()
        val event = RevisionEventEntity(
            examId = exam.examId,
            topicId = topic.id,
            topicName = topic.topicName,
            subject = topic.subject,
            revisionTimestamp = now,
            revisionEpochDay = epochDay,
            revisionNumber = scheduled.revisionNumber,
            recallRating = recallRating.coerceIn(1, 5),
            accuracyPercent = accuracyPercent?.coerceIn(0, 100),
            difficulty = difficulty.coerceIn(1, 5),
            nextRevisionEpochDay = scheduled.nextRevisionDate.toEpochDay(),
            method = method.value,
            notes = notes?.trim()?.take(200)?.ifBlank { null },
            updatedAt = now
        )

        val updatedStatus = when {
            recallRating >= 4 && scheduled.revisionNumber >= 3 && (accuracyPercent == null || accuracyPercent >= 80) -> TopicStatus.MASTERED
            recallRating <= 2 -> TopicStatus.REVISION_DUE
            else -> TopicStatus.COMPLETED
        }

        val updatedTopic = topic.copy(
            status = updatedStatus.value,
            revisionCount = scheduled.revisionNumber,
            lastStudiedEpochDay = epochDay,
            nextRevisionEpochDay = scheduled.nextRevisionDate.toEpochDay(),
            updatedAt = now
        )

        val insertedRow = runAtomic {
            val rowId = dao.insertRevisionEvent(event)
            if (rowId != -1L) {
                dao.updateTopic(updatedTopic)
                syncDao?.upsertOutbox(SyncPayloadSerializer.revisionToOutbox(event))
                syncDao?.upsertOutbox(SyncPayloadSerializer.topicToOutbox(updatedTopic))
            }
            rowId
        }

        if (insertedRow == -1L) {
            return RevisionLogOutcome.DuplicateBlocked(
                "A revision for \"${topic.topicName}\" was already logged today."
            )
        }

        onLocalChangeEnqueued?.invoke()
        return RevisionLogOutcome.Logged(event, scheduled.explanation)
    }

    suspend fun rescheduleTopicRevision(topic: TopicProgressEntity, newDate: LocalDate) {
        val updated = topic.copy(
            nextRevisionEpochDay = newDate.toEpochDay(),
            updatedAt = System.currentTimeMillis()
        )
        runAtomic {
            dao.updateTopic(updated)
            syncDao?.upsertOutbox(SyncPayloadSerializer.topicToOutbox(updated))
        }
        onLocalChangeEnqueued?.invoke()
    }

    suspend fun recordQuickMockTest(
        exam: ExamConfig,
        mockName: String,
        totalQuestions: Int,
        correctAnswers: Int,
        incorrectAnswers: Int,
        durationMinutes: Int,
        markingScheme: MarkingScheme = exam.markingScheme,
        weakestSubject: String? = null,
        notes: String? = null
    ): MockTestEntity {
        val result = MockTestScoringEngine.scoreQuickEntry(
            totalQuestions = totalQuestions,
            correctAnswers = correctAnswers,
            incorrectAnswers = incorrectAnswers,
            markingScheme = markingScheme,
            durationMinutes = durationMinutes
        )

        val now = System.currentTimeMillis()
        val entity = MockTestEntity(
            id = UUID.randomUUID().toString(),
            examId = exam.examId,
            attemptYear = exam.applicableYear,
            mockName = mockName.trim().ifBlank { "${exam.shortName} Mock" },
            dateTimestamp = now,
            totalQuestions = result.totalQuestions,
            attemptedQuestions = result.attemptedQuestions,
            correctAnswers = result.correctAnswers,
            incorrectAnswers = result.incorrectAnswers,
            unansweredQuestions = result.unansweredQuestions,
            positiveMarksPerQ = markingScheme.positiveMarks,
            negativeMarksPerQ = if (markingScheme.hasNegativeMarking) markingScheme.negativeMarks else 0.0,
            totalScore = result.finalScore,
            maxMarks = result.maxMarks,
            percentage = result.percentage,
            accuracyPercent = result.accuracyPercent,
            durationMinutes = durationMinutes.coerceAtLeast(1),
            avgSecondsPerQuestion = result.avgSecondsPerQuestion,
            weakestSubject = weakestSubject?.trim()?.ifBlank { null },
            weakestSubjectAccuracy = null,
            isQuickEntry = true,
            notes = notes?.trim()?.take(240)?.ifBlank { null },
            updatedAt = now
        )
        runAtomic {
            dao.insertMockTest(entity)
            syncDao?.upsertOutbox(SyncPayloadSerializer.mockToOutbox(entity))
        }
        onLocalChangeEnqueued?.invoke()
        return entity
    }

    /**
     * Records a direct marks-entry mock test for CA 100-mark papers and GATE mixed-weight papers.
     */
    suspend fun recordMarksEntryMockTest(
        exam: ExamConfig,
        paperName: String,
        marksObtained: Double,
        maxMarks: Double = exam.markingScheme.maxMarks,
        durationMinutes: Int = exam.markingScheme.durationMinutes,
        weakestSubject: String? = null,
        notes: String? = null
    ): MockTestEntity {
        val isCa = exam.category == ExamCategory.CHARTERED_ACCOUNTANCY
        val resolvedPaperName = paperName.ifBlank { "${exam.shortName} Paper" }
        val scored = MockTestScoringEngine.scoreMarksEntry(
            marksObtained = marksObtained,
            maxMarks = maxMarks,
            durationMinutes = durationMinutes,
            paperName = resolvedPaperName,
            isCaPaper = isCa
        )

        val now = System.currentTimeMillis()
        val noteParts = listOfNotNull(
            if (isCa) scored.repeatedErrorDiagnosis else null,
            notes?.trim()?.ifBlank { null }
        ).joinToString(" • ").take(240).ifBlank { null }

        val entity = MockTestEntity(
            id = UUID.randomUUID().toString(),
            examId = exam.examId,
            attemptYear = exam.applicableYear,
            mockName = resolvedPaperName,
            dateTimestamp = now,
            totalQuestions = scored.totalQuestions,
            attemptedQuestions = scored.attemptedQuestions,
            correctAnswers = scored.correctAnswers,
            incorrectAnswers = scored.incorrectAnswers,
            unansweredQuestions = scored.unansweredQuestions,
            positiveMarksPerQ = 0.0,
            negativeMarksPerQ = 0.0,
            totalScore = scored.finalScore,
            maxMarks = scored.maxMarks,
            percentage = scored.percentage,
            accuracyPercent = scored.accuracyPercent,
            durationMinutes = durationMinutes,
            avgSecondsPerQuestion = scored.avgSecondsPerQuestion,
            weakestSubject = weakestSubject?.trim()?.ifBlank { null },
            weakestSubjectAccuracy = null,
            isQuickEntry = true,
            notes = noteParts,
            updatedAt = now
        )
        runAtomic {
            dao.insertMockTest(entity)
            syncDao?.upsertOutbox(SyncPayloadSerializer.mockToOutbox(entity))
        }
        onLocalChangeEnqueued?.invoke()
        return entity
    }

    suspend fun recordDetailedMockTest(
        exam: ExamConfig,
        mockName: String,
        attempts: List<QuestionAttemptInput>,
        durationMinutes: Int,
        markingScheme: MarkingScheme = exam.markingScheme,
        notes: String? = null
    ): MockTestEntity {
        val result = MockTestScoringEngine.scoreQuestionAttempts(attempts, markingScheme)
        val weakest = result.subjectBreakdown.minByOrNull { it.accuracyPercent }
        val mockId = UUID.randomUUID().toString()
        val now = System.currentTimeMillis()

        val entity = MockTestEntity(
            id = mockId,
            examId = exam.examId,
            attemptYear = exam.applicableYear,
            mockName = mockName.trim().ifBlank { "${exam.shortName} Detailed Mock" },
            dateTimestamp = now,
            totalQuestions = result.totalQuestions,
            attemptedQuestions = result.attemptedQuestions,
            correctAnswers = result.correctAnswers,
            incorrectAnswers = result.incorrectAnswers,
            unansweredQuestions = result.unansweredQuestions,
            positiveMarksPerQ = markingScheme.positiveMarks,
            negativeMarksPerQ = if (markingScheme.hasNegativeMarking) markingScheme.negativeMarks else 0.0,
            totalScore = result.finalScore,
            maxMarks = result.maxMarks,
            percentage = result.percentage,
            accuracyPercent = result.accuracyPercent,
            durationMinutes = durationMinutes.coerceAtLeast(1),
            avgSecondsPerQuestion = result.avgSecondsPerQuestion,
            weakestSubject = weakest?.subject,
            weakestSubjectAccuracy = weakest?.accuracyPercent,
            isQuickEntry = false,
            notes = notes?.trim()?.take(240)?.ifBlank { null },
            updatedAt = now
        )

        val attemptEntities = attempts.map { q ->
            QuestionAttemptEntity(
                mockTestId = mockId,
                examId = exam.examId,
                questionNumber = q.questionNumber,
                subject = q.subject,
                topicName = q.topicName,
                difficulty = q.difficulty,
                selectedAnswer = q.selectedAnswer,
                correctAnswer = q.correctAnswer,
                isCorrect = q.isCorrect,
                timeSpentSeconds = q.timeSpentSeconds,
                errorCategory = q.errorCategory?.value,
                updatedAt = now
            )
        }

        runAtomic {
            dao.insertMockTest(entity)
            dao.insertQuestionAttempts(attemptEntities)
            syncDao?.upsertOutbox(SyncPayloadSerializer.mockToOutbox(entity))
            syncDao?.upsertOutboxBatch(attemptEntities.map { SyncPayloadSerializer.questionAttemptToOutbox(it) })
        }
        onLocalChangeEnqueued?.invoke()
        return entity
    }

    suspend fun deleteMock(mockId: String) {
        val now = System.currentTimeMillis()
        runAtomic {
            val existing = dao.getMockById(mockId)
            if (existing != null) {
                dao.softDeleteMockById(mockId, now)
                syncDao?.upsertOutbox(SyncPayloadSerializer.mockToOutbox(existing.copy(deletedAt = now, updatedAt = now)))
            }
        }
        onLocalChangeEnqueued?.invoke()
    }

    suspend fun clearAllExamPrepData() {
        runAtomic {
            dao.clearAllQuestionAttempts()
            dao.clearAllMocks()
            dao.clearAllRevisions()
            dao.clearAllTopics()
            dao.clearAllExamPlans()
        }
    }
}
