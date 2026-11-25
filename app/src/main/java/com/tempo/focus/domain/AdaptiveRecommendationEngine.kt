package com.tempo.focus.domain

import com.tempo.focus.data.db.SessionEntity
import com.tempo.focus.data.model.DurationFeedback
import com.tempo.focus.data.model.EnergyLevel

data class RecommendationResult(
    val recommendedMinutes: Int,
    val reason: String,
    val baselineMinutes: Int,
    val adjustmentMinutes: Int = 0,
    val overrodeUserFeedback: Boolean = false,
    val overrideExplanation: String? = null,
    val subjectSessionsLogged: Int? = null
)

object AdaptiveRecommendationEngine {

    const val MIN_DURATION_MINUTES = 10
    const val MAX_DURATION_MINUTES = 50
    const val ADJUSTMENT_STEP_MINUTES = 5
    const val MIN_HISTORY_REQUIRED = 3

    /**
     * Calculates the recommended focus duration based on the user's energy level
     * and their historical sessions for that energy level according to the exact specification.
     *
     * @param energy The selected energy level (1..5)
     * @param history Recent focus sessions for this energy level, sorted newest first
     */
    fun calculateRecommendation(
        energy: Int,
        history: List<SessionEntity>
    ): RecommendationResult {
        val defaultMinutes = EnergyLevel.defaultFocusMinutesFor(energy)

        // Fix 1 & Tempo 2.0 Section 10: Exclude non-completed sessions AND Mock Test sessions
        // so long mock examinations never distort ordinary focus-session recommendations.
        val validHistory = history.filter {
            it.status == "completed" &&
                !it.sessionType.equals("Mock Test", ignoreCase = true) &&
                !it.sessionType.equals("mock_test", ignoreCase = true)
        }

        // Rule 1: If there is no previous focus history for the selected energy level, use the default focus duration.
        if (validHistory.isEmpty()) {
            return RecommendationResult(
                recommendedMinutes = defaultMinutes.coerceIn(MIN_DURATION_MINUTES, MAX_DURATION_MINUTES),
                reason = "Default duration",
                baselineMinutes = defaultMinutes,
                adjustmentMinutes = 0,
                overrodeUserFeedback = false
            )
        }

        // Rule 2: If there are fewer than three focus sessions at that energy level,
        // use the planned duration of the most recent session, clamped between 10 and 50 minutes.
        if (validHistory.size < MIN_HISTORY_REQUIRED) {
            val mostRecentPlanned = validHistory.first().plannedMinutes
            val clampedDuration = mostRecentPlanned.coerceIn(MIN_DURATION_MINUTES, MAX_DURATION_MINUTES)
            return RecommendationResult(
                recommendedMinutes = clampedDuration,
                reason = "Based on the last session",
                baselineMinutes = clampedDuration,
                adjustmentMinutes = 0,
                overrodeUserFeedback = false
            )
        }

        // Rule 3 & Fix 3: Once at least three focus sessions exist, inspect the three most recent sessions.
        // Use the MEDIAN of the 3 most recent sessions' plannedMinutes (clamped to 10–50), not the single most recent.
        val recentThree = validHistory.take(MIN_HISTORY_REQUIRED)
        val plannedDurations = recentThree.map { it.plannedMinutes }.sorted()
        val baseline = plannedDurations[1].coerceIn(MIN_DURATION_MINUTES, MAX_DURATION_MINUTES)

        // Rule 4: Use the user's duration feedback as the primary adjustment
        var tooShortVotes = 0
        var tooLongVotes = 0

        for (session in recentThree) {
            when (session.durationFeedback) {
                DurationFeedback.TOO_SHORT.value -> tooShortVotes++
                DurationFeedback.TOO_LONG.value -> tooLongVotes++
            }
        }

        var adjustment = when {
            tooShortVotes > tooLongVotes -> ADJUSTMENT_STEP_MINUTES
            tooLongVotes > tooShortVotes -> -ADJUSTMENT_STEP_MINUTES
            else -> 0
        }

        val proposedIncrease = adjustment > 0
        var overrodeFeedback = false
        var overrideGateExplanation: String? = null

        // Rule 5 & Fix 4: Conservative safety gates using majority (>= 2 of 3 sessions meeting threshold individually).
        // Behavior change from average-of-3 to majority-based (>= 2 of 3):
        // Previously, an average difficulty threshold >= 4.0 would miss a 2-of-3 majority like [4, 4, 3] (average 3.67).
        // Under the majority-based gate, >= 2 sessions with difficulty >= 4 will now trigger the cancel-increase gate.
        val highDifficultyCount = recentThree.count { it.difficulty != null && it.difficulty >= 4 }
        val highDistractionsCancelCount = recentThree.count { it.distractions != null && it.distractions >= 3 }
        val lowFocusQualityCount = recentThree.count { it.focusQuality != null && it.focusQuality <= 2 }
        val highDistractionsDecreaseCount = recentThree.count { it.distractions != null && it.distractions >= 4 }

        // If a proposed increase exists and perceived difficulty is high (>= 4) for >= 2 sessions, cancel increase.
        if (adjustment > 0 && highDifficultyCount >= 2) {
            adjustment = 0
            if (proposedIncrease) {
                overrodeFeedback = true
                overrideGateExplanation = "difficulty rated 4+ on $highDifficultyCount of your last 3 sessions"
            }
        }

        // If a proposed increase exists and distractions are high (>= 3) for >= 2 sessions, cancel increase.
        if (adjustment > 0 && highDistractionsCancelCount >= 2) {
            adjustment = 0
            if (proposedIncrease) {
                overrodeFeedback = true
                overrideGateExplanation = "distractions rated 3+ on $highDistractionsCancelCount of your last 3 sessions"
            }
        }

        // If no adjustment remains and focus quality is low (<= 2) for >= 2 sessions, decrease by 5 minutes.
        if (adjustment == 0 && lowFocusQualityCount >= 2) {
            adjustment = -ADJUSTMENT_STEP_MINUTES
            if (proposedIncrease) {
                overrodeFeedback = true
                overrideGateExplanation = "focus quality rated 2 or lower on $lowFocusQualityCount of your last 3 sessions"
            }
        }

        // If no adjustment remains and distractions are very high (>= 4) for >= 2 sessions, decrease by 5 minutes.
        if (adjustment == 0 && highDistractionsDecreaseCount >= 2) {
            adjustment = -ADJUSTMENT_STEP_MINUTES
            if (proposedIncrease) {
                overrodeFeedback = true
                overrideGateExplanation = "distractions rated 4+ on $highDistractionsDecreaseCount of your last 3 sessions"
            }
        }

        // Rule 6 & 7: Clamp final duration between 10 and 50 minutes. Never adjustment larger than 5 min.
        val finalMinutes = (baseline + adjustment).coerceIn(MIN_DURATION_MINUTES, MAX_DURATION_MINUTES)

        // Rule 8: Reason
        return RecommendationResult(
            recommendedMinutes = finalMinutes,
            reason = "Based on recent adaptive feedback",
            baselineMinutes = baseline,
            adjustmentMinutes = adjustment,
            overrodeUserFeedback = overrodeFeedback,
            overrideExplanation = if (overrodeFeedback) overrideGateExplanation ?: "difficulty or focus quality in recent sessions suggested holding steady" else null
        )
    }
}
