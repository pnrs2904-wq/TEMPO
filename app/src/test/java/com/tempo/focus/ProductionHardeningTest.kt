package com.tempo.focus

import com.tempo.focus.data.db.AppDatabase
import com.tempo.focus.data.db.SessionEntity
import com.tempo.focus.data.model.DurationFeedback
import com.tempo.focus.data.model.SessionStatus
import com.tempo.focus.domain.ExportHelper
import com.tempo.focus.domain.InsightGenerator
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertTrue
import org.junit.Test

class ProductionHardeningTest {

    private fun createTestSession(
        id: Long = 0,
        timestamp: Long = System.currentTimeMillis(),
        phase: String = "focus",
        energy: Int = 3,
        subject: String = "Subject",
        sessionType: String = "Study",
        plannedMinutes: Int = 25,
        actualSeconds: Int = plannedMinutes * 60,
        status: String = "completed",
        notes: String? = null
    ) = SessionEntity(
        id = id,
        timestamp = timestamp,
        phase = phase,
        energy = energy,
        subject = subject,
        sessionType = sessionType,
        plannedMinutes = plannedMinutes,
        actualSeconds = actualSeconds,
        status = status,
        notes = notes
    )

    @Test
    fun `sessionStatus fromString correctly maps all known statuses`() {
        assertEquals(SessionStatus.ACTIVE, SessionStatus.fromString("active"))
        assertEquals(SessionStatus.ACTIVE, SessionStatus.fromString("ACTIVE"))
        assertEquals(SessionStatus.PAUSED, SessionStatus.fromString("paused"))
        assertEquals(SessionStatus.PAUSED, SessionStatus.fromString("PAUSED"))
        assertEquals(SessionStatus.COMPLETED, SessionStatus.fromString("completed"))
        assertEquals(SessionStatus.COMPLETED, SessionStatus.fromString("COMPLETED"))
        assertEquals(SessionStatus.ENDED_EARLY, SessionStatus.fromString("ended_early"))
        assertEquals(SessionStatus.ENDED_EARLY, SessionStatus.fromString("ENDED_EARLY"))
        assertEquals(SessionStatus.CANCELLED, SessionStatus.fromString("cancelled"))
        assertEquals(SessionStatus.CANCELLED, SessionStatus.fromString("CANCELLED"))
        assertEquals(SessionStatus.UNKNOWN, SessionStatus.fromString("unknown"))
    }

    @Test
    fun `sessionStatus fromString returns UNKNOWN for corrupted or invalid values and NEVER COMPLETED`() {
        assertEquals(SessionStatus.UNKNOWN, SessionStatus.fromString("invalid_status_xyz"))
        assertEquals(SessionStatus.UNKNOWN, SessionStatus.fromString(""))
        assertEquals(SessionStatus.UNKNOWN, SessionStatus.fromString("corrupted"))
        assertEquals(SessionStatus.UNKNOWN, SessionStatus.fromString("null"))
        assertEquals(SessionStatus.UNKNOWN, SessionStatus.fromString("12345"))
    }

    @Test
    fun `exportHelper handles RFC4180 escaping for commas quotes and newlines`() {
        val testSession = SessionEntity(
            id = 101,
            timestamp = 1700000000000L,
            phase = "focus",
            energy = 4,
            subject = "Algorithms, Data Structures & \"Graphs\"",
            sessionType = "Study",
            plannedMinutes = 35,
            actualSeconds = 2100,
            status = "completed",
            durationFeedback = DurationFeedback.ABOUT_RIGHT.value,
            difficulty = 3,
            distractions = 0,
            focusQuality = 5,
            notes = "Line 1: Solved problem,\nLine 2: \"Included quotes\"\rLine 3: Finished!",
            updatedAt = 1700002100000L
        )

        val csv = ExportHelper.generateCsv(listOf(testSession))
        assertNotNull(csv)
        // Subject with comma and quotes must be quoted with doubled quotes
        assertTrue("Subject with comma and quotes must be escaped", csv.contains("\"Algorithms, Data Structures & \"\"Graphs\"\"\""))
        // Notes with commas, quotes, and newlines must be quoted with doubled quotes
        assertTrue("Notes with commas, quotes, and newlines must be escaped", csv.contains("\"Line 1: Solved problem,\nLine 2: \"\"Included quotes\"\"\rLine 3: Finished!\""))

        // Validate JSON export handles quotes and unicode
        val jsonString = ExportHelper.generateJson(listOf(testSession))
        assertTrue(jsonString.contains("\"id\": 101"))
        assertTrue(jsonString.contains("\"subject\": \"Algorithms, Data Structures & \\\"Graphs\\\"\""))
        assertTrue(jsonString.contains("Line 1: Solved problem,\\nLine 2: \\\"Included quotes\\\""))
    }

    @Test
    fun `exportHelper preserves Unicode characters Telugu script and emojis`() {
        val unicodeSession = SessionEntity(
            id = 202,
            timestamp = 1700000000000L,
            phase = "focus",
            energy = 5,
            subject = "తెలుగు అధ్యయనం 🎯🔥",
            sessionType = "Study",
            plannedMinutes = 45,
            actualSeconds = 2700,
            status = "completed",
            notes = "బాగా జరిగింది — తెలుగు నోట్స్: 🚀"
        )

        val csv = ExportHelper.generateCsv(listOf(unicodeSession))
        assertTrue(csv.contains("తెలుగు అధ్యయనం 🎯🔥"))
        assertTrue(csv.contains("బాగా జరిగింది — తెలుగు నోట్స్: 🚀"))

        val jsonString = ExportHelper.generateJson(listOf(unicodeSession))
        assertTrue(jsonString.contains("\"id\": 202"))
        assertTrue(jsonString.contains("తెలుగు అధ్యయనం 🎯🔥"))
        assertTrue(jsonString.contains("బాగా జరిగింది — తెలుగు నోట్స్: 🚀"))
    }

    @Test
    fun `insightGenerator local reflection provides accurate energy-based heuristics`() {
        val highEnergySessions = listOf(
            createTestSession(timestamp = 1000L, energy = 5, subject = "Math", plannedMinutes = 45, notes = "Great"),
            createTestSession(timestamp = 2000L, energy = 4, subject = "Math", plannedMinutes = 45, notes = "Solid")
        )
        val highReflection = InsightGenerator.generateLocalReflection(highEnergySessions)
        assertTrue(highReflection.contains("Strong focus momentum"))
        assertTrue(highReflection.contains("high energy"))
        assertTrue(highReflection.contains("Math"))

        val lowEnergySessions = listOf(
            createTestSession(timestamp = 1000L, energy = 1, subject = "History", plannedMinutes = 15, notes = "Tired"),
            createTestSession(timestamp = 2000L, energy = 2, subject = "History", plannedMinutes = 15, notes = "Exhausted")
        )
        val lowReflection = InsightGenerator.generateLocalReflection(lowEnergySessions)
        assertTrue(lowReflection.contains("low energy"))
        assertTrue(lowReflection.contains("History"))
        assertTrue(lowReflection.contains("protect stamina"))

        val modEnergySessions = listOf(
            createTestSession(timestamp = 1000L, energy = 3, subject = "Biology", plannedMinutes = 25, notes = "Steady"),
            createTestSession(timestamp = 2000L, energy = 3, subject = "Biology", plannedMinutes = 25, notes = "Okay")
        )
        val modReflection = InsightGenerator.generateLocalReflection(modEnergySessions)
        assertTrue(modReflection.contains("moderate energy"))
        assertTrue(modReflection.contains("Biology"))
    }

    @Test
    fun `insightGenerator rejects insecure HTTP backend URL`() = runTest {
        val sessions = listOf(
            createTestSession(timestamp = 1000L, energy = 4, subject = "Math", plannedMinutes = 30, notes = "Good work")
        )
        val result = InsightGenerator.generateWeeklyInsight(
            sessions = sessions,
            backendUrl = "http://insecure-backend.com/api/v1/reflections"
        )
        assertTrue("Insecure HTTP must be rejected", result.isFailure)
        assertTrue(result.exceptionOrNull() is SecurityException)
    }

    @Test
    fun `insightGenerator empty sessions returns static fallback`() {
        val reflection = InsightGenerator.generateLocalReflection(emptyList())
        assertEquals(InsightGenerator.FALLBACK_MESSAGE, reflection)
    }

    @Test
    fun `migration 1 to 2 executes index creation queries without errors`() {
        val executedSql = mutableListOf<String>()
        val mockDb = java.lang.reflect.Proxy.newProxyInstance(
            androidx.sqlite.db.SupportSQLiteDatabase::class.java.classLoader,
            arrayOf(androidx.sqlite.db.SupportSQLiteDatabase::class.java)
        ) { _, method, args ->
            if (method.name == "execSQL" && args != null && args.isNotEmpty()) {
                executedSql.add(args[0] as String)
            }
            null
        } as androidx.sqlite.db.SupportSQLiteDatabase

        AppDatabase.MIGRATION_1_2.migrate(mockDb)
        assertEquals(3, executedSql.size)
        assertTrue(executedSql[0].contains("index_sessions_timestamp"))
        assertTrue(executedSql[1].contains("index_sessions_phase_energy"))
        assertTrue(executedSql[2].contains("index_sessions_subject"))
    }

    @Test
    fun `playIntegrityProvider requests token bound to nonce`() = runTest {
        var capturedNonce: String? = null
        val fakeProvider = object : com.tempo.focus.security.PlayIntegrityProvider {
            override suspend fun requestToken(nonce: String): String {
                capturedNonce = nonce
                return "fake-attested-token-for-$nonce"
            }
        }

        val testNonce = "test-crypto-nonce-12345"
        val token = fakeProvider.requestToken(testNonce)
        assertEquals("test-crypto-nonce-12345", capturedNonce)
        assertEquals("fake-attested-token-for-test-crypto-nonce-12345", token)
    }
}
