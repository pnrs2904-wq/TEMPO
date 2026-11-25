package com.tempo.focus.domain

import com.tempo.focus.data.db.SessionEntity
import com.tempo.focus.data.model.SessionType
import com.tempo.focus.domain.exams.TopicDifficulty

data class ExamFocusContext(
    val examName: String,
    val sessionType: SessionType = SessionType.STUDY,
    val topicDifficulty: TopicDifficulty? = null,
    val daysUntilExam: Long? = null
)

data class ExamAwareRecommendation(
    val baseResult: RecommendationResult,
    val finalRecommendedMinutes: Int,
    val workingSteps: List<String>
)

object SubjectAwareRecommendationEngine {

    /**
     * Calculates recommended focus duration prioritizing subject-specific history for the selected energy level.
     *
     * @param energy The selected energy level (1..5)
     * @param subject The current subject/topic
     * @param allHistoryForEnergy Completed focus sessions for this energy level, sorted newest first
     */
    fun calculateRecommendation(
        energy: Int,
        subject: String,
        allHistoryForEnergy: List<SessionEntity>
    ): RecommendationResult {
        val trimmedSubject = subject.trim()

        // Exclude Mock Test sessions from ordinary study duration adaptation
        val studyOnlyHistory = allHistoryForEnergy.filter {
            !it.sessionType.equals(SessionType.MOCK_TEST.displayName, ignoreCase = true) &&
                !it.sessionType.equals("mock_test", ignoreCase = true)
        }

        val subjectHistory = if (trimmedSubject.isEmpty()) {
            emptyList()
        } else {
            studyOnlyHistory.filter {
                it.subject.trim().equals(trimmedSubject, ignoreCase = true)
            }
        }

        return when {
            subjectHistory.size >= AdaptiveRecommendationEngine.MIN_HISTORY_REQUIRED -> {
                val recommendation = AdaptiveRecommendationEngine.calculateRecommendation(energy, subjectHistory)
                recommendation.copy(
                    reason = "Based on your $trimmedSubject sessions at this energy level",
                    subjectSessionsLogged = subjectHistory.size
                )
            }
            subjectHistory.isNotEmpty() -> {
                val fallbackRecommendation = AdaptiveRecommendationEngine.calculateRecommendation(energy, studyOnlyHistory)
                fallbackRecommendation.copy(
                    reason = "Not enough $trimmedSubject history yet — using your overall pattern at this energy level",
                    subjectSessionsLogged = subjectHistory.size
                )
            }
            else -> {
                AdaptiveRecommendationEngine.calculateRecommendation(energy, studyOnlyHistory)
            }
        }
    }

    /**
     * Extends Tempo's original recommendation engine with transparent exam-aware context
     * ("Show working") without altering the core adaptive engine.
     */
    fun calculateExamAwareRecommendation(
        energy: Int,
        subject: String,
        allHistoryForEnergy: List<SessionEntity>,
        context: ExamFocusContext?
    ): ExamAwareRecommendation {
        val base = calculateRecommendation(energy, subject, allHistoryForEnergy)
        val steps = mutableListOf(
            "Base adaptive recommendation: ${base.recommendedMinutes}m (${base.reason})"
        )

        if (context == null) {
            return ExamAwareRecommendation(base, base.recommendedMinutes, steps)
        }

        // Mock tests are kept completely separate from ordinary study adaptation
        if (context.sessionType == SessionType.MOCK_TEST) {
            steps.add("Mock Test mode: isolated from normal focus-duration adaptation so exam blocks do not skew daily study durations.")
            return ExamAwareRecommendation(base, base.recommendedMinutes, steps)
        }

        var adjusted = base.recommendedMinutes

        // High/critical difficulty topics benefit from slightly shorter, sharper cognitive intervals when energy <= 3
        if ((context.topicDifficulty == TopicDifficulty.CRITICAL || context.topicDifficulty == TopicDifficulty.HIGH) && energy <= 3) {
            adjusted = (adjusted - 5).coerceAtLeast(AdaptiveRecommendationEngine.MIN_DURATION_MINUTES)
            steps.add("Difficulty adjustment (${context.topicDifficulty.label} topic at energy $energy): -5m to prevent cognitive fatigue.")
        }

        // Revision sprints within 14 days of exam use crisp recall cadence when duration > 35m
        if (context.sessionType == SessionType.REVISION && context.daysUntilExam != null && context.daysUntilExam in 0..14 && adjusted > 35) {
            adjusted = (adjusted - 5).coerceAtLeast(AdaptiveRecommendationEngine.MIN_DURATION_MINUTES)
            steps.add("Exam proximity (${context.daysUntilExam}d left, Revision sprint): -5m for tighter active-recall intervals.")
        }

        steps.add("Final recommendation for ${context.examName}: ${adjusted}m (clamped 10–50m).")
        return ExamAwareRecommendation(base, adjusted, steps)
    }
}
