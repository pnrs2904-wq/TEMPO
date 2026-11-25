package com.tempo.focus

import com.tempo.focus.data.db.SessionEntity
import com.tempo.focus.data.model.SessionType
import com.tempo.focus.domain.AdaptiveRecommendationEngine
import com.tempo.focus.domain.ExamFocusContext
import com.tempo.focus.domain.SubjectAwareRecommendationEngine
import com.tempo.focus.domain.exams.CaGroupSelection
import com.tempo.focus.domain.exams.ExamCategory
import com.tempo.focus.domain.exams.ExamRegistry
import com.tempo.focus.domain.exams.MarkingScheme
import com.tempo.focus.domain.exams.RevisionRule
import com.tempo.focus.domain.exams.TopicDifficulty
import com.tempo.focus.domain.exams.TopicStatus
import com.tempo.focus.domain.exams.WeightageSource
import com.tempo.focus.domain.prep.ErrorCategory
import com.tempo.focus.domain.prep.ExamReadinessEngine
import com.tempo.focus.domain.prep.MockPerformanceSnapshot
import com.tempo.focus.domain.prep.MockTestScoringEngine
import com.tempo.focus.domain.prep.QuestionAttemptInput
import com.tempo.focus.domain.prep.ReadinessStatus
import com.tempo.focus.domain.prep.RevisionSchedulerEngine
import com.tempo.focus.domain.prep.RevisionSnapshot
import com.tempo.focus.domain.prep.StudyPlanGenerator
import com.tempo.focus.domain.prep.SyllabusCsvImporter
import com.tempo.focus.domain.prep.TopicPlanInput
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertTrue
import org.junit.Test
import java.time.LocalDate
import java.time.ZoneId

/**
 * Comprehensive unit test suite for Tempo 2.0 Multi-Examination Platform domain engines:
 * - Exam Registry (26 examinations across Medical, Law, CA, UPSC, PSC, SSC, Banking, GATE, University, Custom)
 * - CA Group I / Group II / Both filtering
 * - Syllabus CSV Importer
 * - Revision Scheduler Engine (actual revision date calculation, recall adaptation, duplicate check)
 * - Mock Test Scoring Engine (NEET UG/PG, CLAT, TS LAWCET zero-negative, CA exemption, question-level errors)
 * - Weighted Adaptive Study Plan Generator
 * - 4-Pillar Exam Readiness Engine (honest Insufficient Data when < 2 mocks)
 * - Adaptive Focus Engine isolation of Mock Tests & transparent "Show working"
 */
class Tempo2ExamPlatformTest {

    // ---------------------------------------------------------
    // 1. EXAMINATION REGISTRY & CA GROUP SELECTION
    // ---------------------------------------------------------

    @Test
    fun `exam registry contains all 26 required examinations with versioned syllabi`() {
        val allExams = ExamRegistry.allExams
        assertEquals(26, allExams.size)

        val expectedIds = listOf(
            // Medical
            "neet_ug", "neet_pg",
            // Law
            "clat_ug", "clat_pg", "ailet_ug", "ailet_pg",
            "ts_lawcet_3yr", "ts_lawcet_5yr",
            "ap_lawcet_3yr", "ap_lawcet_5yr",
            "mh_cet_law_3yr", "mh_cet_law_5yr",
            "state_judiciary",
            // Chartered Accountancy
            "ca_foundation", "ca_inter_g1", "ca_inter_g2",
            "ca_final_g1", "ca_final_g2", "ca_final_spom",
            // General / Existing
            "upsc_cse", "state_psc", "ssc_cgl", "banking", "gate", "university", "custom"
        )
        expectedIds.forEach { id ->
            val config = ExamRegistry.getById(id)
            assertEquals("Expected exact config for $id", id, config.examId)
            assertTrue("Syllabus version required for $id", config.syllabusVersion.isNotBlank())
            assertTrue("Subjects required for $id", config.subjects.isNotEmpty())
        }

        // Verify categories
        assertEquals(2, ExamRegistry.getByCategory(ExamCategory.MEDICAL).size)
        assertEquals(11, ExamRegistry.getByCategory(ExamCategory.LAW).size)
        assertEquals(6, ExamRegistry.getByCategory(ExamCategory.CHARTERED_ACCOUNTANCY).size)
        assertEquals(1, ExamRegistry.getByCategory(ExamCategory.CIVIL_SERVICES).size)
        assertEquals(1, ExamRegistry.getByCategory(ExamCategory.ENGINEERING).size)
        assertEquals(3, ExamRegistry.getByCategory(ExamCategory.STATE_EXAMS).size)
        assertEquals(2, ExamRegistry.getByCategory(ExamCategory.UNIVERSITY_CUSTOM).size)
    }

    @Test
    fun `CA Intermediate and Final support Group I Group II and Both without mixing papers`() {
        val caInterG1 = ExamRegistry.getById("ca_inter_g1")
        assertTrue(caInterG1.supportsCaGroups)

        val g1Subjects = ExamRegistry.getEffectiveSubjects(caInterG1, CaGroupSelection.GROUP_1).map { it.name }
        val g2Subjects = ExamRegistry.getEffectiveSubjects(caInterG1, CaGroupSelection.GROUP_2).map { it.name }
        val bothSubjects = ExamRegistry.getEffectiveSubjects(caInterG1, CaGroupSelection.BOTH).map { it.name }

        assertEquals(3, g1Subjects.size)
        assertEquals(3, g2Subjects.size)
        assertEquals(6, bothSubjects.size)
        assertTrue(g1Subjects.intersect(g2Subjects.toSet()).isEmpty())

        val caFinalG1 = ExamRegistry.getById("ca_final_g1")
        val finalG1 = ExamRegistry.getEffectiveSubjects(caFinalG1, CaGroupSelection.GROUP_1)
        val finalG2 = ExamRegistry.getEffectiveSubjects(caFinalG1, CaGroupSelection.GROUP_2)
        val finalBoth = ExamRegistry.getEffectiveSubjects(caFinalG1, CaGroupSelection.BOTH)
        assertEquals(3, finalG1.size)
        assertEquals(3, finalG2.size)
        assertEquals(6, finalBoth.size)
    }

    // ---------------------------------------------------------
    // 2. SYLLABUS CSV BULK IMPORTER
    // ---------------------------------------------------------

    @Test
    fun `csv importer parses multi-column and single-column inputs and skips header`() {
        val csv = """
            Subject,Unit,Chapter,Topic,Difficulty
            Physics,Mechanics,Laws of Motion,Newton's Third Law,high
            Biology,Genetics,Molecular Basis,DNA Replication,critical
            Simple Single Topic Line
        """.trimIndent()

        val rows = SyllabusCsvImporter.parse(csv, defaultSubject = "Chemistry")
        assertEquals(3, rows.size)

        assertEquals("Physics", rows[0].subject)
        assertEquals("Mechanics", rows[0].unit)
        assertEquals("Laws of Motion", rows[0].chapter)
        assertEquals("Newton's Third Law", rows[0].topicName)
        assertEquals(TopicDifficulty.HIGH, rows[0].difficulty)

        assertEquals(TopicDifficulty.CRITICAL, rows[1].difficulty)

        assertEquals("Chemistry", rows[2].subject)
        assertEquals("Simple Single Topic Line", rows[2].topicName)
    }

    // ---------------------------------------------------------
    // 3. REVISION SCHEDULER ENGINE
    // ---------------------------------------------------------

    @Test
    fun `revision next date is calculated strictly from actual revision date not original study date`() {
        val actualRevisionDate = LocalDate.of(2026, 4, 20)
        // Even if the topic was originally studied 10 days earlier, revision #2 (index 1 -> 3d)
        // must be scheduled 3 days after actualRevisionDate (April 23).
        val result = RevisionSchedulerEngine.calculateNextRevision(
            actualRevisionDate = actualRevisionDate,
            previousRevisionCount = 1,
            recallRating = 3,
            rule = RevisionRule(intervalsDays = listOf(1, 3, 7, 14, 30))
        )

        assertEquals(2, result.revisionNumber)
        assertEquals(3, result.baseIntervalDays)
        assertEquals(3, result.adjustedIntervalDays)
        assertEquals(LocalDate.of(2026, 4, 23), result.nextRevisionDate)
    }

    @Test
    fun `poor recall shortens interval and strong recall lengthens interval`() {
        val revDate = LocalDate.of(2026, 5, 1)
        val rule = RevisionRule(
            intervalsDays = listOf(1, 3, 7, 14, 30),
            poorRecallMultiplier = 0.5,
            strongRecallMultiplier = 1.35
        )

        // Base interval for index 2 (3rd revision) is 7 days
        val poor = RevisionSchedulerEngine.calculateNextRevision(
            actualRevisionDate = revDate,
            previousRevisionCount = 2,
            recallRating = 2,
            rule = rule
        )
        val strong = RevisionSchedulerEngine.calculateNextRevision(
            actualRevisionDate = revDate,
            previousRevisionCount = 2,
            recallRating = 5,
            rule = rule
        )

        assertTrue("Poor recall (${poor.adjustedIntervalDays}d) must be shorter than base 7d", poor.adjustedIntervalDays < 7)
        assertTrue("Strong recall (${strong.adjustedIntervalDays}d) must be longer than base 7d", strong.adjustedIntervalDays > 7)
        assertEquals(revDate.plusDays(poor.adjustedIntervalDays.toLong()), poor.nextRevisionDate)
        assertEquals(revDate.plusDays(strong.adjustedIntervalDays.toLong()), strong.nextRevisionDate)
    }

    @Test
    fun `duplicate same-day revision detection blocks same topic on same epoch day`() {
        val day = LocalDate.of(2026, 5, 10).toEpochDay()
        val existing = setOf("topic-1" to day)

        assertTrue(RevisionSchedulerEngine.isDuplicateRevision("topic-1", day, existing))
        assertFalse(RevisionSchedulerEngine.isDuplicateRevision("topic-1", day + 1, existing))
        assertFalse(RevisionSchedulerEngine.isDuplicateRevision("topic-2", day, existing))
    }

    // ---------------------------------------------------------
    // 4. MOCK TEST SCORING ENGINE
    // ---------------------------------------------------------

    @Test
    fun `NEET UG marking applies +4 and -1 negative marking accurately`() {
        val neetUg = ExamRegistry.getById("neet_ug")
        assertEquals(4.0, neetUg.markingScheme.positiveMarks, 0.001)
        assertEquals(1.0, neetUg.markingScheme.negativeMarks, 0.001)
        assertEquals(180, neetUg.markingScheme.totalQuestions)
        assertEquals(720.0, neetUg.markingScheme.maxMarks, 0.001)

        // 140 correct, 20 incorrect, 20 unanswered => (140*4) - (20*1) = 560 - 20 = 540 / 720 = 75%
        val result = MockTestScoringEngine.scoreQuickEntry(
            totalQuestions = 180,
            correctAnswers = 140,
            incorrectAnswers = 20,
            markingScheme = neetUg.markingScheme,
            durationMinutes = 180
        )

        assertEquals(560.0, result.positiveMarksAwarded, 0.01)
        assertEquals(20.0, result.negativeMarksDeducted, 0.01)
        assertEquals(540.0, result.finalScore, 0.01)
        assertEquals(720.0, result.maxMarks, 0.01)
        assertEquals(75.0, result.percentage, 0.01)
        assertEquals(87.5, result.accuracyPercent, 0.01)
        assertEquals(20, result.unansweredQuestions)
    }

    @Test
    fun `NEET PG includes 5 sectional time limits of 42 minutes each`() {
        val neetPg = ExamRegistry.getById("neet_pg")
        assertEquals(5, neetPg.markingScheme.sectionalTimeLimits.size)
        assertTrue(neetPg.markingScheme.sectionalTimeLimits.all { it.timeLimitMinutes == 42 && it.questionCount == 40 })
        assertEquals(200, neetPg.markingScheme.totalQuestions)
        assertEquals(800.0, neetPg.markingScheme.maxMarks, 0.001)
    }

    @Test
    fun `CLAT UG applies +1 and -0_25 negative marking accurately`() {
        val clatUg = ExamRegistry.getById("clat_ug")
        // 80 correct, 20 incorrect, 20 unanswered => 80 - 5 = 75 / 120 = 62.5%
        val result = MockTestScoringEngine.scoreQuickEntry(
            totalQuestions = 120,
            correctAnswers = 80,
            incorrectAnswers = 20,
            markingScheme = clatUg.markingScheme
        )
        assertEquals(75.0, result.finalScore, 0.01)
        assertEquals(5.0, result.negativeMarksDeducted, 0.01)
        assertEquals(62.5, result.percentage, 0.01)
    }

    @Test
    fun `TS LAWCET zero-negative marking deducts zero marks for wrong answers`() {
        val tsLawcet = ExamRegistry.getById("ts_lawcet_3yr")
        assertFalse(tsLawcet.markingScheme.hasNegativeMarking)

        val result = MockTestScoringEngine.scoreQuickEntry(
            totalQuestions = 120,
            correctAnswers = 90,
            incorrectAnswers = 30,
            markingScheme = tsLawcet.markingScheme
        )
        assertEquals(0.0, result.negativeMarksDeducted, 0.01)
        assertEquals(90.0, result.finalScore, 0.01)
        assertEquals(75.0, result.percentage, 0.01)
    }

    @Test
    fun `detailed question-level mock computes subject accuracy CA exemption and repeated error diagnosis`() {
        val caFinalScheme = MarkingScheme(
            positiveMarks = 2.0,
            negativeMarks = 0.0,
            hasNegativeMarking = false,
            totalQuestions = 5,
            maxMarks = 10.0,
            durationMinutes = 30
        )

        val attempts = listOf(
            // Financial Reporting: 2/2 correct = 100% -> qualifies exemption (>= 60%)
            QuestionAttemptInput(1, "Financial Reporting", "Ind AS 115", "high", "A", "A", 45, null),
            QuestionAttemptInput(2, "Financial Reporting", "Consolidation", "high", "B", "B", 55, null),
            // Advanced Auditing: 1/3 correct = 33.3% -> does NOT qualify exemption, 2 conceptual errors
            QuestionAttemptInput(3, "Advanced Auditing", "SA 700", "moderate", "C", "C", 60, null),
            QuestionAttemptInput(4, "Advanced Auditing", "CARO 2020", "high", "D", "A", 75, ErrorCategory.CONCEPTUAL),
            QuestionAttemptInput(5, "Advanced Auditing", "Ethics", "moderate", "B", "D", 80, ErrorCategory.CONCEPTUAL)
        )

        val result = MockTestScoringEngine.scoreQuestionAttempts(attempts, caFinalScheme)
        assertEquals(6.0, result.finalScore, 0.01)
        assertEquals(60.0, result.accuracyPercent, 0.01)
        assertEquals(2, result.subjectBreakdown.size)

        val auditing = result.subjectBreakdown.first { it.subject == "Advanced Auditing" }
        val fr = result.subjectBreakdown.first { it.subject == "Financial Reporting" }
        assertFalse(auditing.qualifiesExemption)
        assertTrue(fr.qualifiesExemption)

        assertEquals(2, result.errorCategoryCounts[ErrorCategory.CONCEPTUAL])
        assertNotNull(result.repeatedErrorDiagnosis)
        assertTrue(result.repeatedErrorDiagnosis!!.contains("Conceptual error"))
    }

    // ---------------------------------------------------------
    // 5. WEIGHTED ADAPTIVE STUDY PLAN GENERATOR
    // ---------------------------------------------------------

    @Test
    fun `study plan allocates weighted non-equal shares boosts weak subjects and handles backlog`() {
        val neetUg = ExamRegistry.getById("neet_ug")
        val bioSubject = neetUg.subjects.first { it.name.contains("Botany", ignoreCase = true) }.name
        val physSubject = neetUg.subjects.first { it.name.contains("Physics", ignoreCase = true) }.name
        val chemSubject = neetUg.subjects.first { it.name.contains("Chemistry", ignoreCase = true) }.name
        val today = LocalDate.of(2026, 3, 1)
        val topics = listOf(
            TopicPlanInput("1", bioSubject, "Genetics", TopicStatus.LEARNING, TopicDifficulty.CRITICAL, today.minusDays(2).toEpochDay()),
            TopicPlanInput("2", bioSubject, "Human Physiology", TopicStatus.NOT_STARTED, TopicDifficulty.HIGH, null),
            TopicPlanInput("3", physSubject, "Electrostatics", TopicStatus.NOT_STARTED, TopicDifficulty.HIGH, null),
            TopicPlanInput("4", chemSubject, "Chemical Bonding", TopicStatus.NOT_STARTED, TopicDifficulty.MODERATE, null)
        )

        val plan = StudyPlanGenerator.generatePlan(
            exam = neetUg,
            topics = topics,
            today = today,
            examDate = today.plusDays(60),
            dailyAvailableHours = 4.0,
            studyDaysPerWeek = 6,
            subjectMockAccuracies = mapOf(physSubject to 42.0, bioSubject to 78.0),
            missedMinutesRecently = 60
        )

        assertEquals(60L, plan.daysUntilExam)
        assertEquals(7, plan.weeklySchedule.size)
        assertTrue("Backlog recovery must trigger when overdue revision exists", plan.revisionBacklogCount == 1)
        assertTrue("Backlog recovery minutes should be positive", plan.backlogRecoveryMinutesPerDay > 0)
        assertTrue("Today tasks should include backlog/revision work", plan.todayTasks.any { it.isBacklogRecovery || it.taskType == "Revision" })

        val bioAlloc = plan.subjectAllocations.first { it.subject == bioSubject }
        val physAlloc = plan.subjectAllocations.first { it.subject == physSubject }
        val chemAlloc = plan.subjectAllocations.first { it.subject == chemSubject }

        // Weighted allocation must never be a naive equal split
        assertTrue("Weighted allocation must not be equal split", bioAlloc.sharePercent != chemAlloc.sharePercent || physAlloc.sharePercent != chemAlloc.sharePercent)
        // Physics has 42% mock accuracy, so weak-subject boost must be applied
        assertTrue("Physics must receive weak-subject boost", physAlloc.weakSubjectBoostApplied)
        assertTrue(
            "Weak subject boost must be labelled ALGORITHMIC_RECOMMENDATION",
            physAlloc.weightageSource == WeightageSource.ALGORITHMIC_RECOMMENDATION
        )
        assertEquals(WeightageSource.ALGORITHMIC_RECOMMENDATION, bioAlloc.weightageSource)
        assertEquals(WeightageSource.OFFICIAL_NOTIFICATION, chemAlloc.weightageSource)

        // Changing exam date recalculates days left and milestones
        val closerPlan = StudyPlanGenerator.generatePlan(
            exam = neetUg,
            topics = topics,
            today = today,
            examDate = today.plusDays(14),
            dailyAvailableHours = 4.0,
            studyDaysPerWeek = 6
        )
        assertEquals(14L, closerPlan.daysUntilExam)
    }

    // ---------------------------------------------------------
    // 6. FOUR-PILLAR EXAM READINESS ENGINE
    // ---------------------------------------------------------

    @Test
    fun `exam readiness returns honest InsufficientData when fewer than 2 mocks exist despite high study hours`() {
        val today = LocalDate.of(2026, 4, 15)
        val zone = ZoneId.systemDefault()
        // 14 consecutive days of 2 hours/day study = high consistency!
        val sessions = (0L until 14L).map { offset ->
            val ts = today.minusDays(offset).atTime(10, 0).atZone(zone).toInstant().toEpochMilli()
            SessionEntity(
                timestamp = ts,
                phase = "focus",
                energy = 4,
                subject = "Biology",
                sessionType = "Study",
                plannedMinutes = 120,
                actualSeconds = 7200,
                status = "completed"
            )
        }
        val topics = listOf(
            TopicPlanInput("t1", "Biology", "Genetics", TopicStatus.MASTERED, TopicDifficulty.HIGH, null),
            TopicPlanInput("t2", "Physics", "Optics", TopicStatus.COMPLETED, TopicDifficulty.MODERATE, null)
        )
        val singleMock = listOf(
            MockPerformanceSnapshot(
                dateTimestamp = System.currentTimeMillis(),
                percentage = 80.0,
                accuracyPercent = 85.0,
                avgSecondsPerQuestion = 55.0,
                weakestSubject = "Physics",
                weakestSubjectAccuracy = 70.0
            )
        )

        val report = ExamReadinessEngine.evaluate(
            sessions = sessions,
            topics = topics,
            revisions = listOf(RevisionSnapshot(recallRating = 4, accuracyPercent = 85)),
            mocks = singleMock,
            dailyGoalMinutes = 120,
            today = today
        )

        // Consistency & Coverage are high, yet Exam Readiness MUST honestly report InsufficientData!
        assertTrue("Consistency should be high (${report.consistency.scorePercent}%)", report.consistency.scorePercent >= 85)
        assertEquals(100, report.coverage.scorePercent)
        assertTrue(
            "Exam Readiness MUST be InsufficientData when < 2 mocks exist",
            report.examReadiness is ReadinessStatus.InsufficientData
        )
        val insuff = report.examReadiness as ReadinessStatus.InsufficientData
        assertEquals(1, insuff.mocksRecorded)
        assertEquals(2, insuff.mocksRequired)
        assertTrue(report.consistency.calculationFormula.isNotBlank())
        assertTrue(report.coverage.calculationFormula.isNotBlank())
        assertTrue(report.competency.calculationFormula.isNotBlank())
    }

    @Test
    fun `exam readiness returns ReadyScore with trend once 2 or more mocks exist`() {
        val today = LocalDate.of(2026, 4, 15)
        val mocks = listOf(
            MockPerformanceSnapshot(2000L, percentage = 74.0, accuracyPercent = 82.0, avgSecondsPerQuestion = 52.0, weakestSubject = "Physics", weakestSubjectAccuracy = 60.0),
            MockPerformanceSnapshot(1000L, percentage = 62.0, accuracyPercent = 72.0, avgSecondsPerQuestion = 60.0, weakestSubject = "Physics", weakestSubjectAccuracy = 50.0)
        )
        val topics = listOf(
            TopicPlanInput("t1", "Biology", "Genetics", TopicStatus.MASTERED, TopicDifficulty.HIGH, null),
            TopicPlanInput("t2", "Physics", "Optics", TopicStatus.COMPLETED, TopicDifficulty.MODERATE, null)
        )

        val report = ExamReadinessEngine.evaluate(
            sessions = emptyList(),
            topics = topics,
            revisions = listOf(RevisionSnapshot(4, 80)),
            mocks = mocks,
            dailyGoalMinutes = 120,
            today = today
        )

        assertTrue(report.examReadiness is ReadinessStatus.ReadyScore)
        val ready = report.examReadiness as ReadinessStatus.ReadyScore
        assertTrue(ready.scorePercent in 1..100)
        assertTrue("Expected Improving trend, got: ${ready.trendLabel}", ready.trendLabel.startsWith("Improving"))
        assertTrue(ready.calculationFormula.contains("recent mock"))
    }

    // ---------------------------------------------------------
    // 7. ADAPTIVE FOCUS ENGINE — MOCK ISOLATION & SHOW WORKING
    // ---------------------------------------------------------

    @Test
    fun `mock test sessions are excluded from normal study duration adaptation`() {
        val mockSessions = List(5) { idx ->
            SessionEntity(
                timestamp = 1_000_000L + idx * 1000L,
                phase = "focus",
                energy = 3,
                subject = "NEET Full Mock",
                sessionType = SessionType.MOCK_TEST.displayName,
                plannedMinutes = 180,
                actualSeconds = 10800,
                status = "completed",
                focusQuality = 5,
                difficulty = 4,
                durationFeedback = "too_short"
            )
        }

        val rec = AdaptiveRecommendationEngine.calculateRecommendation(energy = 3, history = mockSessions)
        // Because all 5 sessions are Mock Tests, adaptive study history is empty -> default 25m for energy 3!
        assertEquals(25, rec.recommendedMinutes)
        assertEquals("Default duration", rec.reason)
    }

    @Test
    fun `exam-aware recommendation returns transparent Show Working steps`() {
        val result = SubjectAwareRecommendationEngine.calculateExamAwareRecommendation(
            energy = 3,
            subject = "Physics",
            allHistoryForEnergy = emptyList(),
            context = ExamFocusContext(
                examName = "NEET UG",
                sessionType = SessionType.STUDY,
                topicDifficulty = TopicDifficulty.CRITICAL,
                daysUntilExam = 10
            )
        )

        assertEquals(20, result.finalRecommendedMinutes) // 25m default - 5m for critical difficulty at energy 3
        assertTrue(result.workingSteps.size >= 3)
        assertTrue(result.workingSteps.any { it.contains("Difficulty adjustment") })
        assertTrue(result.workingSteps.any { it.contains("NEET UG") })
    }
}
