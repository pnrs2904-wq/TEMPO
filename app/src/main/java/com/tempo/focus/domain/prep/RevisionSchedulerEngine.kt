package com.tempo.focus.domain.prep

import com.tempo.focus.domain.exams.RevisionRule
import java.time.LocalDate
import kotlin.math.roundToInt

enum class RevisionMethod(val value: String, val displayName: String) {
    READING("reading", "Reading"),
    ACTIVE_RECALL("active_recall", "Active recall"),
    MCQS("mcqs", "MCQs"),
    FLASHCARDS("flashcards", "Flashcards"),
    WRITING_PRACTICE("writing_practice", "Writing practice"),
    NUMERICAL_PROBLEMS("numerical_problems", "Numerical problems"),
    CASE_STUDIES("case_studies", "Case studies");

    companion object {
        fun fromValue(value: String?): RevisionMethod =
            entries.find { it.value.equals(value, ignoreCase = true) || it.displayName.equals(value, ignoreCase = true) }
                ?: ACTIVE_RECALL
    }
}

data class ScheduledRevisionResult(
    val revisionNumber: Int,
    val baseIntervalDays: Int,
    val adjustedIntervalDays: Int,
    val nextRevisionDate: LocalDate,
    val explanation: String
)

object RevisionSchedulerEngine {

    val DEFAULT_INTERVALS_DAYS = listOf(1, 3, 7, 14, 30)

    /**
     * Calculates the next revision date strictly from [actualRevisionDate] (never from original study date).
     *
     * - Recall rating 1..2 (poor): shortens interval via [RevisionRule.poorRecallMultiplier] (min 1 day).
     * - Recall rating 3 (moderate): uses base interval for [revisionNumber].
     * - Recall rating 4..5 (strong): lengthens interval via [RevisionRule.strongRecallMultiplier] (capped at 45 days).
     * - Accuracy < 55% or difficulty >= 5 also applies a conservative cap so weak topics return sooner.
     */
    fun calculateNextRevision(
        actualRevisionDate: LocalDate,
        previousRevisionCount: Int,
        recallRating: Int,
        accuracyPercent: Int? = null,
        difficulty: Int = 3,
        rule: RevisionRule = RevisionRule()
    ): ScheduledRevisionResult {
        val safeCount = previousRevisionCount.coerceAtLeast(0)
        val nextRevNumber = safeCount + 1
        val intervals = rule.intervalsDays.ifEmpty { DEFAULT_INTERVALS_DAYS }
        val index = safeCount.coerceAtMost(intervals.lastIndex)
        val baseInterval = intervals[index].coerceAtLeast(1)
        val safeRecall = recallRating.coerceIn(1, 5)

        var multiplier = when {
            safeRecall <= 1 -> 0.35
            safeRecall == 2 -> rule.poorRecallMultiplier.coerceIn(0.35, 0.8)
            safeRecall == 3 -> 1.0
            safeRecall == 4 -> 1.15
            else -> rule.strongRecallMultiplier.coerceIn(1.15, 1.6)
        }

        if (accuracyPercent != null && accuracyPercent < 55) {
            multiplier = minOf(multiplier, 0.6)
        }
        if (difficulty >= 5 && safeRecall <= 3) {
            multiplier = minOf(multiplier, 0.75)
        }

        val adjustedDays = if (safeRecall <= 1) {
            1
        } else {
            (baseInterval * multiplier).roundToInt().coerceIn(1, 45)
        }

        val nextDate = actualRevisionDate.plusDays(adjustedDays.toLong())
        val reason = when {
            safeRecall <= 2 -> "Shortened to $adjustedDays d due to low recall ($safeRecall/5)"
            safeRecall >= 4 -> "Extended to $adjustedDays d after strong recall ($safeRecall/5)"
            else -> "Scheduled in $adjustedDays d (Rev #$nextRevNumber from ${actualRevisionDate})"
        }

        return ScheduledRevisionResult(
            revisionNumber = nextRevNumber,
            baseIntervalDays = baseInterval,
            adjustedIntervalDays = adjustedDays,
            nextRevisionDate = nextDate,
            explanation = reason
        )
    }

    /**
     * Checks whether a revision event already exists for [topicId] on [revisionEpochDay]
     * to prevent duplicate revision logs on the same day.
     */
    fun isDuplicateRevision(
        topicId: String,
        revisionEpochDay: Long,
        existingTopicRevisionDays: Set<Pair<String, Long>>
    ): Boolean {
        return existingTopicRevisionDays.contains(topicId to revisionEpochDay)
    }

    /**
     * Returns true when a topic's nextRevisionEpochDay is today or earlier (overdue/due).
     */
    fun isDueOrOverdue(nextRevisionEpochDay: Long?, todayEpochDay: Long): Boolean {
        return nextRevisionEpochDay != null && nextRevisionEpochDay <= todayEpochDay
    }
}
