package com.tempo.focus.domain.prep

import com.tempo.focus.data.db.SessionEntity
import com.tempo.focus.domain.StreakCalculator
import com.tempo.focus.domain.exams.TopicStatus
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId
import kotlin.math.abs
import kotlin.math.roundToInt

data class ConsistencyMetrics(
    val scorePercent: Int,
    val studyHoursLast14Days: Double,
    val activeDaysLast14Days: Int,
    val completedSessions: Int,
    val currentStreakDays: Int,
    val calculationFormula: String
)

data class CoverageMetrics(
    val scorePercent: Int,
    val completedOrMasteredTopics: Int,
    val totalTopics: Int,
    val pendingTopics: Int,
    val revisionsCompleted: Int,
    val overdueBacklog: Int,
    val calculationFormula: String
)

data class CompetencyMetrics(
    val scorePercent: Int?, // null => Insufficient data
    val averageAccuracyPercent: Double?,
    val avgSecondsPerQuestion: Double?,
    val masteredTopicsPercent: Double,
    val averageRecallRating: Double?,
    val calculationFormula: String
)

sealed class ReadinessStatus {
    data class ReadyScore(
        val scorePercent: Int,
        val recentMockAveragePercent: Double,
        val consistencySpreadPercent: Double,
        val weakestSubjectName: String?,
        val weakestSubjectAccuracy: Double?,
        val revisionRetentionPercent: Double,
        val trendLabel: String,
        val calculationFormula: String
    ) : ReadinessStatus()

    data class InsufficientData(
        val mocksRecorded: Int,
        val mocksRequired: Int,
        val reason: String,
        val calculationFormula: String
    ) : ReadinessStatus()
}

data class ExamReadinessReport(
    val consistency: ConsistencyMetrics,
    val coverage: CoverageMetrics,
    val competency: CompetencyMetrics,
    val examReadiness: ReadinessStatus
)

data class MockPerformanceSnapshot(
    val dateTimestamp: Long,
    val percentage: Double,
    val accuracyPercent: Double,
    val avgSecondsPerQuestion: Double,
    val weakestSubject: String? = null,
    val weakestSubjectAccuracy: Double? = null
)

data class RevisionSnapshot(
    val recallRating: Int,
    val accuracyPercent: Int?
)

object ExamReadinessEngine {

    const val MIN_MOCKS_FOR_READINESS = 2

    /**
     * Evaluates four distinct, transparent measurements:
     * A. Consistency | B. Coverage | C. Competency | D. Examination Readiness.
     *
     * Never derives Examination Readiness from study hours alone.
     * Returns [ReadinessStatus.InsufficientData] when fewer than [MIN_MOCKS_FOR_READINESS] mocks exist.
     */
    fun evaluate(
        sessions: List<SessionEntity>,
        topics: List<TopicPlanInput>,
        revisions: List<RevisionSnapshot>,
        mocks: List<MockPerformanceSnapshot>,
        dailyGoalMinutes: Int,
        today: LocalDate = LocalDate.now()
    ): ExamReadinessReport {
        val zone = ZoneId.systemDefault()
        val windowStart = today.minusDays(13)

        // A. CONSISTENCY
        val completedFocus = sessions.filter { it.phase == "focus" && it.status == "completed" }
        val recentFocus = completedFocus.filter {
            !Instant.ofEpochMilli(it.timestamp).atZone(zone).toLocalDate().isBefore(windowStart)
        }
        val activeDays = recentFocus
            .map { Instant.ofEpochMilli(it.timestamp).atZone(zone).toLocalDate() }
            .distinct()
            .size
        val recentMinutes = recentFocus.sumOf { it.actualSeconds / 60 }
        val studyHours14d = ((recentMinutes / 60.0) * 10.0).roundToInt() / 10.0
        val streak = StreakCalculator.calculateStreak(sessions, zoneId = zone, currentDate = today).currentStreak

        val activeDayRatio = (activeDays / 14.0).coerceIn(0.0, 1.0)
        val targetMinutes14d = (dailyGoalMinutes.coerceAtLeast(30) * 10.0)
        val hoursRatio = (recentMinutes / targetMinutes14d).coerceIn(0.0, 1.0)
        val streakRatio = (streak / 7.0).coerceIn(0.0, 1.0)
        val consistencyScore = ((activeDayRatio * 50.0) + (hoursRatio * 30.0) + (streakRatio * 20.0)).roundToInt().coerceIn(0, 100)

        val consistency = ConsistencyMetrics(
            scorePercent = consistencyScore,
            studyHoursLast14Days = studyHours14d,
            activeDaysLast14Days = activeDays,
            completedSessions = completedFocus.size,
            currentStreakDays = streak,
            calculationFormula = "50% active days (last 14d) + 30% study hours vs target + 20% streak consistency"
        )

        // B. COVERAGE
        val totalTopics = topics.size
        val completedOrMastered = topics.count {
            it.status == TopicStatus.COMPLETED || it.status == TopicStatus.MASTERED
        }
        val pendingTopics = (totalTopics - completedOrMastered).coerceAtLeast(0)
        val todayEpoch = today.toEpochDay()
        val overdueBacklog = topics.count {
            it.nextRevisionEpochDay != null && it.nextRevisionEpochDay <= todayEpoch
        }
        val syllabusRatio = if (totalTopics > 0) completedOrMastered.toDouble() / totalTopics else 0.0
        val backlogPenalty = if (totalTopics > 0) (overdueBacklog.toDouble() / totalTopics) * 30.0 else 0.0
        val coverageScore = ((syllabusRatio * 100.0) - backlogPenalty).roundToInt().coerceIn(0, 100)

        val coverage = CoverageMetrics(
            scorePercent = coverageScore,
            completedOrMasteredTopics = completedOrMastered,
            totalTopics = totalTopics,
            pendingTopics = pendingTopics,
            revisionsCompleted = revisions.size,
            overdueBacklog = overdueBacklog,
            calculationFormula = "Syllabus completed/mastered % minus overdue revision backlog penalty"
        )

        // C. COMPETENCY
        val masteredCount = topics.count { it.status == TopicStatus.MASTERED }
        val masteredPct = if (totalTopics > 0) ((masteredCount.toDouble() / totalTopics) * 1000.0).roundToInt() / 10.0 else 0.0
        val avgAccuracy = if (mocks.isNotEmpty()) {
            (mocks.map { it.accuracyPercent }.average() * 10.0).roundToInt() / 10.0
        } else null
        val avgSpeed = if (mocks.any { it.avgSecondsPerQuestion > 0 }) {
            (mocks.filter { it.avgSecondsPerQuestion > 0 }.map { it.avgSecondsPerQuestion }.average() * 10.0).roundToInt() / 10.0
        } else null
        val avgRecall = if (revisions.isNotEmpty()) {
            (revisions.map { it.recallRating }.average() * 10.0).roundToInt() / 10.0
        } else null

        val competencyScore: Int? = if (avgAccuracy == null && avgRecall == null && masteredCount == 0) {
            null
        } else {
            val accPart = avgAccuracy ?: (avgRecall?.let { (it / 5.0) * 100.0 } ?: masteredPct)
            val recallPart = avgRecall?.let { (it / 5.0) * 100.0 } ?: accPart
            ((accPart * 0.5) + (recallPart * 0.3) + (masteredPct * 0.2)).roundToInt().coerceIn(0, 100)
        }

        val competency = CompetencyMetrics(
            scorePercent = competencyScore,
            averageAccuracyPercent = avgAccuracy,
            avgSecondsPerQuestion = avgSpeed,
            masteredTopicsPercent = masteredPct,
            averageRecallRating = avgRecall,
            calculationFormula = "50% mock accuracy + 30% active recall rating + 20% mastered topics %"
        )

        // D. EXAMINATION READINESS (Strictly requires verified mock evidence; never study hours alone)
        val sortedMocks = mocks.sortedByDescending { it.dateTimestamp }
        val readinessFormula = "45% recent mock avg + 20% score consistency + 20% weakest subject floor + 15% revision retention (requires >= $MIN_MOCKS_FOR_READINESS mocks)"

        val examReadiness: ReadinessStatus = if (sortedMocks.size < MIN_MOCKS_FOR_READINESS) {
            ReadinessStatus.InsufficientData(
                mocksRecorded = sortedMocks.size,
                mocksRequired = MIN_MOCKS_FOR_READINESS,
                reason = "Insufficient data — log at least $MIN_MOCKS_FOR_READINESS timed mock tests for this exam. Study hours alone never generate a readiness score.",
                calculationFormula = readinessFormula
            )
        } else {
            val recentMocks = sortedMocks.take(5)
            val recentAvg = recentMocks.map { it.percentage }.average().coerceIn(0.0, 100.0)
            val spread = (recentMocks.maxOf { it.percentage } - recentMocks.minOf { it.percentage }).coerceAtLeast(0.0)
            val consistencyFactor = (100.0 - (spread * 1.5)).coerceIn(0.0, 100.0)

            val weakest = recentMocks.mapNotNull { m ->
                if (m.weakestSubject != null && m.weakestSubjectAccuracy != null) {
                    m.weakestSubject to m.weakestSubjectAccuracy
                } else null
            }.minByOrNull { it.second }
            val weakFloor = weakest?.second?.coerceIn(0.0, 100.0) ?: recentAvg

            val retentionPct = avgRecall?.let { ((it / 5.0) * 100.0).coerceIn(0.0, 100.0) }
                ?: (100.0 - (overdueBacklog * 10.0)).coerceIn(20.0, 100.0)

            val trendLabel = if (recentMocks.size >= 2) {
                val delta = recentMocks.first().percentage - recentMocks.last().percentage
                when {
                    delta >= 4.0 -> "Improving (+${delta.roundToInt()}%)"
                    delta <= -4.0 -> "Declining (${delta.roundToInt()}%)"
                    else -> "Steady (${if (abs(delta) < 0.5) "0" else delta.roundToInt()}%)"
                }
            } else "Steady"

            val readinessScore = (
                (recentAvg * 0.45) +
                    (consistencyFactor * 0.20) +
                    (weakFloor * 0.20) +
                    (retentionPct * 0.15)
                ).roundToInt().coerceIn(0, 100)

            ReadinessStatus.ReadyScore(
                scorePercent = readinessScore,
                recentMockAveragePercent = (recentAvg * 10.0).roundToInt() / 10.0,
                consistencySpreadPercent = (spread * 10.0).roundToInt() / 10.0,
                weakestSubjectName = weakest?.first,
                weakestSubjectAccuracy = weakest?.second,
                revisionRetentionPercent = (retentionPct * 10.0).roundToInt() / 10.0,
                trendLabel = trendLabel,
                calculationFormula = readinessFormula
            )
        }

        return ExamReadinessReport(
            consistency = consistency,
            coverage = coverage,
            competency = competency,
            examReadiness = examReadiness
        )
    }
}
