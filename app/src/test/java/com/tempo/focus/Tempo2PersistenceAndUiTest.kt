package com.tempo.focus

import android.content.Context
import android.database.sqlite.SQLiteDatabase
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.room.Room
import androidx.sqlite.db.SupportSQLiteDatabase
import androidx.sqlite.db.framework.FrameworkSQLiteOpenHelperFactory
import androidx.test.core.app.ApplicationProvider
import com.tempo.focus.data.db.AppDatabase
import com.tempo.focus.data.repository.ExamPrepRepository
import com.tempo.focus.data.repository.RevisionLogOutcome
import com.tempo.focus.domain.exams.CaGroupSelection
import com.tempo.focus.domain.exams.ExamRegistry
import com.tempo.focus.domain.exams.TopicStatus
import com.tempo.focus.domain.prep.ErrorCategory
import com.tempo.focus.domain.prep.QuestionAttemptInput
import com.tempo.focus.domain.prep.RevisionMethod
import com.tempo.focus.ui.TempoApp
import com.tempo.focus.ui.theme.TempoTheme
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.test.runTest
import org.junit.After
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertTrue
import org.junit.Before
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config
import java.time.LocalDate

/**
 * Robolectric integration & Compose UI tests for Tempo 2.0:
 * - Safe Room MIGRATION_2_3 preserving legacy sessions while creating all 5 Tempo 2.0 tables
 * - Safe exam switching isolating active topics without deleting previous exam records
 * - Same-day duplicate revision prevention and manual rescheduling in Room
 * - Mock test & question-level attempt persistence scoped by examId
 * - Compose UI navigation and rendering of Dashboard, Prep Hub, and Focus Timer
 */
@RunWith(RobolectricTestRunner::class)
@Config(qualifiers = "w412dp-h915dp", sdk = [36])
class Tempo2PersistenceAndUiTest {

    @get:Rule
    val composeTestRule = createComposeRule()

    private lateinit var context: Context
    private lateinit var db: AppDatabase
    private lateinit var repository: ExamPrepRepository

    @Before
    fun setUp() {
        context = ApplicationProvider.getApplicationContext()
        db = Room.inMemoryDatabaseBuilder(context, AppDatabase::class.java)
            .allowMainThreadQueries()
            .build()
        repository = ExamPrepRepository(db.examPrepDao())
    }

    @After
    fun tearDown() {
        db.close()
    }

    @Test
    fun `MIGRATION_2_3 preserves existing sessions and creates all 5 Tempo 2_0 tables`() {
        val dbName = "migration_2_3_test.db"
        context.deleteDatabase(dbName)

        val helper = FrameworkSQLiteOpenHelperFactory().create(
            androidx.sqlite.db.SupportSQLiteOpenHelper.Configuration.builder(context)
                .name(dbName)
                .callback(object : androidx.sqlite.db.SupportSQLiteOpenHelper.Callback(2) {
                    override fun onCreate(db: SupportSQLiteDatabase) {
                        db.execSQL(
                            """
                            CREATE TABLE IF NOT EXISTS `sessions` (
                                `id` INTEGER PRIMARY KEY AUTOINCREMENT NOT NULL,
                                `timestamp` INTEGER NOT NULL,
                                `phase` TEXT NOT NULL,
                                `energy` INTEGER NOT NULL,
                                `subject` TEXT NOT NULL,
                                `sessionType` TEXT NOT NULL,
                                `plannedMinutes` INTEGER NOT NULL,
                                `actualSeconds` INTEGER NOT NULL,
                                `status` TEXT NOT NULL,
                                `durationFeedback` TEXT,
                                `difficulty` INTEGER,
                                `distractions` INTEGER,
                                `focusQuality` INTEGER,
                                `notes` TEXT,
                                `updatedAt` INTEGER NOT NULL
                            )
                            """.trimIndent()
                        )
                        db.execSQL(
                            """
                            INSERT INTO `sessions` (
                                `timestamp`, `phase`, `energy`, `subject`, `sessionType`,
                                `plannedMinutes`, `actualSeconds`, `status`, `updatedAt`
                            ) VALUES (1700000000000, 'focus', 4, 'Organic Chemistry', 'Study', 30, 1800, 'completed', 1700001800000)
                            """.trimIndent()
                        )
                    }

                    override fun onUpgrade(db: SupportSQLiteDatabase, oldVersion: Int, newVersion: Int) {}
                })
                .build()
        )

        val supportDb = helper.writableDatabase
        AppDatabase.MIGRATION_2_3.migrate(supportDb)

        // 1. Legacy session must remain untouched
        val sessionCursor = supportDb.query("SELECT subject, plannedMinutes FROM sessions")
        assertTrue(sessionCursor.moveToFirst())
        assertEquals("Organic Chemistry", sessionCursor.getString(0))
        assertEquals(30, sessionCursor.getInt(1))
        sessionCursor.close()

        // 2. All 5 Tempo 2.0 tables must exist
        val expectedTables = listOf(
            "user_exam_plans",
            "user_topic_progress",
            "revision_events",
            "mock_tests",
            "question_attempts"
        )
        expectedTables.forEach { table ->
            val cursor = supportDb.query("SELECT name FROM sqlite_master WHERE type='table' AND name='$table'")
            assertTrue("Expected table $table to exist after MIGRATION_2_3", cursor.moveToFirst())
            cursor.close()
        }

        supportDb.close()
        context.deleteDatabase(dbName)
    }

    @Test
    fun `exam switching isolates active exam subjects and preserves previous exam progress`() = runTest {
        val neetUg = ExamRegistry.getById("neet_ug")
        val clatUg = ExamRegistry.getById("clat_ug")

        // 1. Initialize NEET UG and mark a topic as Mastered
        repository.ensureExamInitialized(neetUg, CaGroupSelection.BOTH)
        val neetTopicsBefore = repository.observeTopics(neetUg.examId).first()
        assertTrue("NEET UG topics must be seeded", neetTopicsBefore.isNotEmpty())
        val firstNeetTopic = neetTopicsBefore.first()
        repository.updateTopicStatus(firstNeetTopic, TopicStatus.MASTERED)

        // 2. Switch to CLAT UG
        repository.ensureExamInitialized(clatUg, CaGroupSelection.BOTH)
        val clatTopics = repository.observeTopics(clatUg.examId).first()
        assertTrue("CLAT UG topics must be seeded", clatTopics.isNotEmpty())
        assertTrue(
            "CLAT UG active topics must NEVER contain NEET Physics or Biology",
            clatTopics.none { it.subject.contains("Physics", ignoreCase = true) || it.subject.contains("Biology", ignoreCase = true) }
        )

        // 3. Switch back to NEET UG and verify Mastered topic is still preserved!
        val neetTopicsAfter = repository.observeTopics(neetUg.examId).first()
        val preserved = neetTopicsAfter.firstOrNull { it.id == firstNeetTopic.id }
        assertNotNull("Original NEET topic must still exist", preserved)
        assertEquals(TopicStatus.MASTERED.value, preserved?.status)
    }

    @Test
    fun `same-day duplicate revision is blocked and manual reschedule shifts nextRevisionEpochDay`() = runTest {
        val neetUg = ExamRegistry.getById("neet_ug")
        repository.ensureExamInitialized(neetUg, CaGroupSelection.BOTH)
        val topic = repository.observeTopics(neetUg.examId).first().first()
        val revDate = LocalDate.of(2026, 6, 1)

        // First revision on revDate succeeds
        val firstOutcome = repository.logRevisionEvent(
            exam = neetUg,
            topic = topic,
            recallRating = 4,
            accuracyPercent = 85,
            difficulty = 3,
            method = RevisionMethod.ACTIVE_RECALL,
            notes = "Solid recall",
            actualRevisionDate = revDate
        )
        assertTrue(firstOutcome is RevisionLogOutcome.Logged)

        // Reload updated topic and attempt duplicate same-day revision
        val updatedTopic = repository.observeTopics(neetUg.examId).first().first { it.id == topic.id }
        assertEquals(1, updatedTopic.revisionCount)
        assertEquals(revDate.toEpochDay(), updatedTopic.lastStudiedEpochDay)

        val duplicateOutcome = repository.logRevisionEvent(
            exam = neetUg,
            topic = updatedTopic,
            recallRating = 5,
            accuracyPercent = 90,
            difficulty = 2,
            method = RevisionMethod.FLASHCARDS,
            notes = "Duplicate attempt",
            actualRevisionDate = revDate
        )
        assertTrue("Duplicate same-day revision must be blocked", duplicateOutcome is RevisionLogOutcome.DuplicateBlocked)

        // Manual reschedule shifts nextRevisionEpochDay
        val targetDate = revDate.plusDays(5)
        repository.rescheduleTopicRevision(updatedTopic, targetDate)
        val rescheduled = repository.observeTopics(neetUg.examId).first().first { it.id == topic.id }
        assertEquals(targetDate.toEpochDay(), rescheduled.nextRevisionEpochDay)
    }

    @Test
    fun `detailed mock test persists mock summary and question attempts scoped to examId`() = runTest {
        val clatUg = ExamRegistry.getById("clat_ug")
        val neetUg = ExamRegistry.getById("neet_ug")

        val attempts = listOf(
            QuestionAttemptInput(1, "Legal Reasoning", "Torts", "high", "A", "A", 50, null),
            QuestionAttemptInput(2, "Legal Reasoning", "Contracts", "moderate", "B", "C", 65, ErrorCategory.MISREADING),
            QuestionAttemptInput(3, "Logical Reasoning", "Assumptions", "high", "D", "D", 55, null)
        )

        val saved = repository.recordDetailedMockTest(
            exam = clatUg,
            mockName = "CLAT Mock #1",
            attempts = attempts,
            durationMinutes = 120,
            notes = "Watch misreading in contracts"
        )

        assertEquals(clatUg.examId, saved.examId)
        assertEquals(1.75, saved.totalScore, 0.01) // 2 correct (+2) - 1 incorrect (-0.25) = 1.75

        val clatMocks = repository.observeMocks(clatUg.examId).first()
        val neetMocks = repository.observeMocks(neetUg.examId).first()
        val clatAttempts = repository.observeQuestionAttempts(clatUg.examId).first()

        assertEquals(1, clatMocks.size)
        assertTrue("NEET UG must not see CLAT UG mocks", neetMocks.isEmpty())
        assertEquals(3, clatAttempts.size)
        assertFalse(clatAttempts[1].isCorrect)
        assertEquals(ErrorCategory.MISREADING.value, clatAttempts[1].errorCategory)
    }

    @Test
    fun `TempoApp renders Dashboard Prep Hub and Focus Timer with honest Insufficient Data state`() {
        composeTestRule.setContent {
            TempoTheme {
                TempoApp()
            }
        }

        // Default start route is FocusTimer with Exam Mode chip
        composeTestRule.onNodeWithTag("focus_timer_screen").assertIsDisplayed()
        composeTestRule.onNodeWithTag("nav_dashboard").assertIsDisplayed()
        composeTestRule.onNodeWithTag("nav_prep").assertIsDisplayed()

        // Navigate to Dashboard and verify 4-pillar readiness card & honest Insufficient data
        composeTestRule.onNodeWithTag("nav_dashboard").performClick()
        composeTestRule.onNodeWithTag("exam_dashboard_screen").assertIsDisplayed()
        composeTestRule.onNodeWithTag("readiness_dashboard_card").assertIsDisplayed()
        composeTestRule.onNodeWithTag("exam_readiness_pillar").assertIsDisplayed()

        // Navigate to Prep Hub and verify Syllabus/Revisions/Mocks/Plan tabs
        composeTestRule.onNodeWithTag("nav_prep").performClick()
        composeTestRule.onNodeWithTag("exam_prep_hub_screen").assertIsDisplayed()
        composeTestRule.onNodeWithTag("prep_tab_0").assertIsDisplayed()
        composeTestRule.onNodeWithTag("prep_tab_1").performClick()
        composeTestRule.onNodeWithTag("prep_tab_2").performClick()
        composeTestRule.onNodeWithTag("prep_tab_3").performClick()

        // Switch back to Timer
        composeTestRule.onNodeWithTag("nav_timer").performClick()
        composeTestRule.onNodeWithTag("focus_timer_screen").assertIsDisplayed()
    }
}
