package com.tempo.focus

import com.tempo.focus.data.db.SessionEntity
import com.tempo.focus.data.model.DurationFeedback
import com.tempo.focus.data.model.EnergyLevel
import com.tempo.focus.domain.AdaptiveRecommendationEngine
import com.tempo.focus.domain.ExportHelper
import com.tempo.focus.domain.InsightGenerator
import com.tempo.focus.domain.StreakCalculator
import com.tempo.focus.domain.SubjectAwareRecommendationEngine
import kotlinx.coroutines.test.runTest
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertTrue
import org.junit.Test
import java.time.LocalDate
import java.time.ZoneId

class TempoRecommendationTest {

    private fun createSession(
        energy: Int,
        plannedMinutes: Int,
        feedback: DurationFeedback? = null,
        difficulty: Int? = null,
        distractions: Int? = null,
        focusQuality: Int? = null,
        subject: String = "Math",
        status: String = "completed",
        notes: String? = null,
        timestamp: Long = System.currentTimeMillis()
    ): SessionEntity {
        return SessionEntity(
            timestamp = timestamp,
            phase = "focus",
            energy = energy,
            subject = subject,
            sessionType = "Study",
            plannedMinutes = plannedMinutes,
            actualSeconds = plannedMinutes * 60,
            status = status,
            durationFeedback = feedback?.value,
            difficulty = difficulty,
            distractions = distractions,
            focusQuality = focusQuality,
            notes = notes
        )
    }

    @Test
    fun `rule 1 empty history uses default duration`() {
        // Energy 1 default is 15 min
        val rec1 = AdaptiveRecommendationEngine.calculateRecommendation(1, emptyList())
        assertEquals(15, rec1.recommendedMinutes)
        assertEquals("Default duration", rec1.reason)

        // Energy 3 default is 25 min
        val rec3 = AdaptiveRecommendationEngine.calculateRecommendation(3, emptyList())
        assertEquals(25, rec3.recommendedMinutes)
        assertEquals("Default duration", rec3.reason)

        // Energy 5 default is 45 min
        val rec5 = AdaptiveRecommendationEngine.calculateRecommendation(5, emptyList())
        assertEquals(45, rec5.recommendedMinutes)
        assertEquals("Default duration", rec5.reason)
    }

    @Test
    fun `rule 2 fewer than 3 sessions uses most recent planned clamped`() {
        val history = listOf(
            createSession(energy = 3, plannedMinutes = 30)
        )
        val rec = AdaptiveRecommendationEngine.calculateRecommendation(3, history)
        assertEquals(30, rec.recommendedMinutes)
        assertEquals("Based on the last session", rec.reason)
    }

    @Test
    fun `rule 4 more too short feedback increases by 5 minutes`() {
        val history = listOf(
            createSession(energy = 3, plannedMinutes = 25, feedback = DurationFeedback.TOO_SHORT),
            createSession(energy = 3, plannedMinutes = 25, feedback = DurationFeedback.TOO_SHORT),
            createSession(energy = 3, plannedMinutes = 25, feedback = DurationFeedback.ABOUT_RIGHT)
        )
        val rec = AdaptiveRecommendationEngine.calculateRecommendation(3, history)
        assertEquals(30, rec.recommendedMinutes)
        assertEquals("Based on recent adaptive feedback", rec.reason)
        assertEquals(5, rec.adjustmentMinutes)
    }

    @Test
    fun `rule 4 more too long feedback decreases by 5 minutes`() {
        val history = listOf(
            createSession(energy = 3, plannedMinutes = 30, feedback = DurationFeedback.TOO_LONG),
            createSession(energy = 3, plannedMinutes = 30, feedback = DurationFeedback.TOO_LONG),
            createSession(energy = 3, plannedMinutes = 30, feedback = DurationFeedback.ABOUT_RIGHT)
        )
        val rec = AdaptiveRecommendationEngine.calculateRecommendation(3, history)
        assertEquals(25, rec.recommendedMinutes)
        assertEquals("Based on recent adaptive feedback", rec.reason)
        assertEquals(-5, rec.adjustmentMinutes)
    }

    @Test
    fun `rule 5 high difficulty cancels proposed increase`() {
        val history = listOf(
            createSession(energy = 3, plannedMinutes = 25, feedback = DurationFeedback.TOO_SHORT, difficulty = 4),
            createSession(energy = 3, plannedMinutes = 25, feedback = DurationFeedback.TOO_SHORT, difficulty = 5),
            createSession(energy = 3, plannedMinutes = 25, feedback = DurationFeedback.TOO_SHORT, difficulty = 4)
        )
        val rec = AdaptiveRecommendationEngine.calculateRecommendation(3, history)
        assertEquals(25, rec.recommendedMinutes)
        assertEquals(0, rec.adjustmentMinutes)
    }

    @Test
    fun `rule 5 high distractions cancel proposed increase`() {
        val history = listOf(
            createSession(energy = 3, plannedMinutes = 25, feedback = DurationFeedback.TOO_SHORT, distractions = 3),
            createSession(energy = 3, plannedMinutes = 25, feedback = DurationFeedback.TOO_SHORT, distractions = 4),
            createSession(energy = 3, plannedMinutes = 25, feedback = DurationFeedback.TOO_SHORT, distractions = 3)
        )
        val rec = AdaptiveRecommendationEngine.calculateRecommendation(3, history)
        assertEquals(25, rec.recommendedMinutes)
        assertEquals(0, rec.adjustmentMinutes)
    }

    @Test
    fun `rule 5 low focus quality triggers 5 min decrease when no other adjustment`() {
        val history = listOf(
            createSession(energy = 3, plannedMinutes = 25, feedback = DurationFeedback.ABOUT_RIGHT, focusQuality = 2),
            createSession(energy = 3, plannedMinutes = 25, feedback = DurationFeedback.ABOUT_RIGHT, focusQuality = 1),
            createSession(energy = 3, plannedMinutes = 25, feedback = DurationFeedback.ABOUT_RIGHT, focusQuality = 2)
        )
        val rec = AdaptiveRecommendationEngine.calculateRecommendation(3, history)
        assertEquals(20, rec.recommendedMinutes)
        assertEquals(-5, rec.adjustmentMinutes)
    }

    @Test
    fun `rule 6 clamps duration to 50 max and 10 min min`() {
        // Upper bound clamp
        val historyMax = listOf(
            createSession(energy = 5, plannedMinutes = 50, feedback = DurationFeedback.TOO_SHORT),
            createSession(energy = 5, plannedMinutes = 50, feedback = DurationFeedback.TOO_SHORT),
            createSession(energy = 5, plannedMinutes = 50, feedback = DurationFeedback.TOO_SHORT)
        )
        val recMax = AdaptiveRecommendationEngine.calculateRecommendation(5, historyMax)
        assertEquals(50, recMax.recommendedMinutes)

        // Lower bound clamp
        val historyMin = listOf(
            createSession(energy = 1, plannedMinutes = 10, feedback = DurationFeedback.TOO_LONG),
            createSession(energy = 1, plannedMinutes = 10, feedback = DurationFeedback.TOO_LONG),
            createSession(energy = 1, plannedMinutes = 10, feedback = DurationFeedback.TOO_LONG)
        )
        val recMin = AdaptiveRecommendationEngine.calculateRecommendation(1, historyMin)
        assertEquals(10, recMin.recommendedMinutes)
    }

    @Test
    fun `streak calculation computes correct streak`() {
        val zone = ZoneId.of("UTC")
        val today = LocalDate.of(2026, 9, 15)
        val epochToday = today.atStartOfDay(zone).toInstant().toEpochMilli()
        val epochYesterday = today.minusDays(1).atStartOfDay(zone).toInstant().toEpochMilli()
        val epoch2DaysAgo = today.minusDays(2).atStartOfDay(zone).toInstant().toEpochMilli()

        val sessions = listOf(
            createSession(energy = 3, plannedMinutes = 25, timestamp = epochToday),
            createSession(energy = 3, plannedMinutes = 25, timestamp = epochYesterday),
            createSession(energy = 3, plannedMinutes = 25, timestamp = epoch2DaysAgo)
        )

        val streak = StreakCalculator.calculateStreak(sessions, zone, today)
        assertEquals(3, streak.currentStreak)
        assertEquals(3, streak.bestStreak)
        assertEquals(3, streak.totalActiveDays)
        assertTrue(streak.hasSessionToday)
    }

    @Test
    fun `export helper generates valid JSON and CSV`() {
        val sessions = listOf(
            createSession(energy = 3, plannedMinutes = 25, feedback = DurationFeedback.ABOUT_RIGHT)
        )

        val json = ExportHelper.generateJson(sessions)
        assertTrue(json.contains("\"phase\": \"focus\""))
        assertTrue(json.contains("\"plannedMinutes\": 25"))

        val csv = ExportHelper.generateCsv(sessions)
        assertTrue(csv.contains("id,timestamp,iso_date"))
        assertTrue(csv.contains(",focus,3,Math,Study,25,"))
    }

    // --- Fix 1 Tests ---
    @Test
    fun `fix 1 ended_early session is excluded from recent-3 window and does not affect baseline or votes`() {
        val completedSession1 = createSession(energy = 3, plannedMinutes = 25, feedback = DurationFeedback.TOO_SHORT, timestamp = 1000L)
        val endedEarlySession = createSession(energy = 3, plannedMinutes = 50, feedback = DurationFeedback.TOO_LONG, status = "ended_early", timestamp = 2000L)
        val completedSession2 = createSession(energy = 3, plannedMinutes = 25, feedback = DurationFeedback.TOO_SHORT, timestamp = 3000L)
        val completedSession3 = createSession(energy = 3, plannedMinutes = 25, feedback = DurationFeedback.ABOUT_RIGHT, timestamp = 4000L)

        // Session list sorted newest first
        val rawHistory = listOf(completedSession3, completedSession2, endedEarlySession, completedSession1)

        val rec = AdaptiveRecommendationEngine.calculateRecommendation(3, rawHistory)
        // Baseline should be median of the 3 completed sessions [25, 25, 25] = 25
        assertEquals(25, rec.baselineMinutes)
        // Too short votes = 2, too long votes = 0 (ended early session's TOO_LONG vote is excluded)
        assertEquals(5, rec.adjustmentMinutes)
        assertEquals(30, rec.recommendedMinutes)
    }

    // --- Fix 2 Tests ---
    @Test
    fun `fix 2 increase cancelled by difficulty with no further decrease sets overrodeUserFeedback true`() {
        val history = listOf(
            createSession(energy = 3, plannedMinutes = 25, feedback = DurationFeedback.TOO_SHORT, difficulty = 4, focusQuality = 4),
            createSession(energy = 3, plannedMinutes = 25, feedback = DurationFeedback.TOO_SHORT, difficulty = 5, focusQuality = 4),
            createSession(energy = 3, plannedMinutes = 25, feedback = DurationFeedback.TOO_SHORT, difficulty = 4, focusQuality = 4)
        )
        val rec = AdaptiveRecommendationEngine.calculateRecommendation(3, history)
        assertEquals(25, rec.recommendedMinutes)
        assertEquals(0, rec.adjustmentMinutes)
        assertTrue("overrodeUserFeedback should be true when difficulty cancels vote increase", rec.overrodeUserFeedback)
    }

    @Test
    fun `fix 2 increase cancelled by difficulty and cascades into decrease via low focus quality`() {
        val history = listOf(
            createSession(energy = 3, plannedMinutes = 25, feedback = DurationFeedback.TOO_SHORT, difficulty = 4, focusQuality = 2),
            createSession(energy = 3, plannedMinutes = 25, feedback = DurationFeedback.TOO_SHORT, difficulty = 5, focusQuality = 1),
            createSession(energy = 3, plannedMinutes = 25, feedback = DurationFeedback.TOO_SHORT, difficulty = 4, focusQuality = 2)
        )
        val rec = AdaptiveRecommendationEngine.calculateRecommendation(3, history)
        assertEquals(20, rec.recommendedMinutes)
        assertEquals(-5, rec.adjustmentMinutes)
        assertTrue("overrodeUserFeedback should be true when difficulty cancels and cascades into decrease", rec.overrodeUserFeedback)
    }

    // --- Fix 3 Tests ---
    @Test
    fun `fix 3 median of 3 different planned durations is used as baseline rather than most recent`() {
        // Order: newest first. Most recent is 50, but median of [50, 20, 25] is 25.
        val history = listOf(
            createSession(energy = 3, plannedMinutes = 50, feedback = DurationFeedback.ABOUT_RIGHT),
            createSession(energy = 3, plannedMinutes = 20, feedback = DurationFeedback.ABOUT_RIGHT),
            createSession(energy = 3, plannedMinutes = 25, feedback = DurationFeedback.ABOUT_RIGHT)
        )
        val rec = AdaptiveRecommendationEngine.calculateRecommendation(3, history)
        assertEquals(25, rec.baselineMinutes)
        assertEquals(25, rec.recommendedMinutes)
        assertEquals(0, rec.adjustmentMinutes)
        assertFalse(rec.overrodeUserFeedback)
    }

    // --- Fix 4 Tests ---
    @Test
    fun `fix 4 difficulty majority 4 4 3 cancels proposed increase unlike old average`() {
        // Behavior change:
        // Under old average logic: (4 + 4 + 3) / 3.0 = 3.67, which was < 4.0 and did NOT cancel the increase.
        // Under new majority logic: 2 of 3 sessions have difficulty >= 4 (count >= 2), which triggers the safety gate and cancels the increase.
        val history = listOf(
            createSession(energy = 3, plannedMinutes = 25, feedback = DurationFeedback.TOO_SHORT, difficulty = 4),
            createSession(energy = 3, plannedMinutes = 25, feedback = DurationFeedback.TOO_SHORT, difficulty = 4),
            createSession(energy = 3, plannedMinutes = 25, feedback = DurationFeedback.TOO_SHORT, difficulty = 3)
        )
        val rec = AdaptiveRecommendationEngine.calculateRecommendation(3, history)
        assertEquals(25, rec.recommendedMinutes)
        assertEquals(0, rec.adjustmentMinutes)
        assertTrue(rec.overrodeUserFeedback)
    }

    // --- Fix 5 Tests ---
    @Test
    fun `fix 5 subject history empty falls back to energy engine with unchanged reason`() {
        val history = listOf(
            createSession(energy = 3, plannedMinutes = 25, subject = "Math"),
            createSession(energy = 3, plannedMinutes = 25, subject = "Math"),
            createSession(energy = 3, plannedMinutes = 25, subject = "Math")
        )
        val rec = SubjectAwareRecommendationEngine.calculateRecommendation(3, "Physics", history)
        val energyOnlyRec = AdaptiveRecommendationEngine.calculateRecommendation(3, history)
        assertEquals(energyOnlyRec.recommendedMinutes, rec.recommendedMinutes)
        assertEquals(energyOnlyRec.reason, rec.reason)
    }

    @Test
    fun `fix 5 subject history under 3 falls back with not enough history reason`() {
        val history = listOf(
            createSession(energy = 3, plannedMinutes = 25, subject = "Physics"),
            createSession(energy = 3, plannedMinutes = 25, subject = "Physics"),
            createSession(energy = 3, plannedMinutes = 25, subject = "Math"),
            createSession(energy = 3, plannedMinutes = 25, subject = "Math")
        )
        val rec = SubjectAwareRecommendationEngine.calculateRecommendation(3, "Physics", history)
        assertEquals("Not enough Physics history yet — using your overall pattern at this energy level", rec.reason)
    }

    @Test
    fun `fix 5 subject history 3 or more uses subject level signal and differs from energy-only`() {
        // 3 Math sessions with TOO_SHORT -> would recommend 30 min
        val mathSessions = listOf(
            createSession(energy = 3, plannedMinutes = 25, feedback = DurationFeedback.TOO_SHORT, subject = "Math"),
            createSession(energy = 3, plannedMinutes = 25, feedback = DurationFeedback.TOO_SHORT, subject = "Math"),
            createSession(energy = 3, plannedMinutes = 25, feedback = DurationFeedback.TOO_SHORT, subject = "Math")
        )
        // 3 Physics sessions with TOO_LONG -> cancels out votes in combined history
        val physicsSessions = listOf(
            createSession(energy = 3, plannedMinutes = 25, feedback = DurationFeedback.TOO_LONG, subject = "Physics"),
            createSession(energy = 3, plannedMinutes = 25, feedback = DurationFeedback.TOO_LONG, subject = "Physics"),
            createSession(energy = 3, plannedMinutes = 25, feedback = DurationFeedback.TOO_LONG, subject = "Physics")
        )
        val combined = listOf(
            mathSessions[0],
            physicsSessions[0],
            mathSessions[1],
            physicsSessions[1],
            mathSessions[2],
            physicsSessions[2]
        )

        val subjectRec = SubjectAwareRecommendationEngine.calculateRecommendation(3, "Math", combined)
        assertEquals(30, subjectRec.recommendedMinutes)
        assertEquals("Based on your Math sessions at this energy level", subjectRec.reason)

        // The energy-only recommendation for the combined list would have 3 TOO_SHORT and 3 TOO_LONG or recent 3 mixed
        val energyOnlyRec = AdaptiveRecommendationEngine.calculateRecommendation(3, combined)
        assertNotEquals(subjectRec.reason, energyOnlyRec.reason)
    }

    // --- Fix 6 Tests ---
    @Test
    fun `fix 6 insight generator returns static fallback when no sessions have notes`() = runTest {
        val sessionsWithoutNotes = listOf(
            createSession(energy = 3, plannedMinutes = 25, notes = null),
            createSession(energy = 3, plannedMinutes = 25, notes = "   ")
        )
        val result = InsightGenerator.generateWeeklyInsight(sessionsWithoutNotes)
        assertTrue(result.isSuccess)
        assertEquals("Log a few session notes to unlock personalized insights.", result.getOrNull())
    }
}
