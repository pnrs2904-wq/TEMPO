package com.tempo.focus.domain.prep

import com.tempo.focus.domain.exams.MarkingScheme
import kotlin.math.roundToInt

enum class ErrorCategory(val value: String, val displayName: String) {
    CONCEPTUAL("conceptual", "Conceptual error"),
    CALCULATION("calculation", "Calculation error"),
    MISREADING("misreading", "Misreading"),
    GUESSING("guessing", "Guessing"),
    MEMORY_FAILURE("memory_failure", "Memory failure"),
    TIME_PRESSURE("time_pressure", "Time-pressure error");

    companion object {
        fun fromValue(value: String?): ErrorCategory? =
            entries.find { it.value.equals(value, ignoreCase = true) }
    }
}

data class QuestionAttemptInput(
    val questionNumber: Int,
    val subject: String,
    val topicName: String,
    val difficulty: String = "moderate",
    val selectedAnswer: String?,
    val correctAnswer: String,
    val timeSpentSeconds: Int = 60,
    val errorCategory: ErrorCategory? = null
) {
    val isAttempted: Boolean get() = !selectedAnswer.isNullOrBlank()
    val isCorrect: Boolean get() = isAttempted && selectedAnswer!!.trim().equals(correctAnswer.trim(), ignoreCase = true)
}

data class SubjectScoreSummary(
    val subject: String,
    val attempted: Int,
    val correct: Int,
    val incorrect: Int,
    val unanswered: Int,
    val score: Double,
    val maxMarks: Double,
    val accuracyPercent: Double,
    val avgSecondsPerQuestion: Double,
    val qualifiesExemption: Boolean // >= 60% (for CA papers)
)

data class MockScoreResult(
    val totalQuestions: Int,
    val attemptedQuestions: Int,
    val correctAnswers: Int,
    val incorrectAnswers: Int,
    val unansweredQuestions: Int,
    val positiveMarksAwarded: Double,
    val negativeMarksDeducted: Double,
    val finalScore: Double,
    val maxMarks: Double,
    val percentage: Double,
    val accuracyPercent: Double,
    val attemptRatePercent: Double,
    val avgSecondsPerQuestion: Double,
    val subjectBreakdown: List<SubjectScoreSummary> = emptyList(),
    val errorCategoryCounts: Map<ErrorCategory, Int> = emptyMap(),
    val repeatedErrorDiagnosis: String? = null
)

object MockTestScoringEngine {

    /**
     * Quick-entry mock scoring using exact formula:
     * Final Score = (Correct Answers * Positive Marks) - (Incorrect Answers * Negative Marks)
     */
    fun scoreQuickEntry(
        totalQuestions: Int,
        correctAnswers: Int,
        incorrectAnswers: Int,
        markingScheme: MarkingScheme,
        durationMinutes: Int = markingScheme.durationMinutes
    ): MockScoreResult {
        val safeTotal = totalQuestions.coerceAtLeast(1)
        val safeCorrect = correctAnswers.coerceIn(0, safeTotal)
        val safeIncorrect = incorrectAnswers.coerceIn(0, (safeTotal - safeCorrect).coerceAtLeast(0))
        val attempted = safeCorrect + safeIncorrect
        val unanswered = (safeTotal - attempted).coerceAtLeast(0)

        val effectiveNegative = if (markingScheme.hasNegativeMarking) {
            markingScheme.negativeMarks.coerceAtLeast(0.0)
        } else {
            0.0
        }

        val positiveAwarded = safeCorrect * markingScheme.positiveMarks
        val negativeDeducted = safeIncorrect * effectiveNegative
        val finalScore = round2(positiveAwarded - negativeDeducted)
        val maxMarks = if (markingScheme.maxMarks > 0.0 && safeTotal == markingScheme.totalQuestions) {
            markingScheme.maxMarks
        } else {
            round2(safeTotal * markingScheme.positiveMarks)
        }

        val percentage = if (maxMarks > 0.0) round2((finalScore / maxMarks) * 100.0) else 0.0
        val accuracy = if (attempted > 0) round2((safeCorrect.toDouble() / attempted) * 100.0) else 0.0
        val attemptRate = round2((attempted.toDouble() / safeTotal) * 100.0)
        val avgSec = if (attempted > 0) round2((durationMinutes * 60.0) / attempted) else 0.0

        return MockScoreResult(
            totalQuestions = safeTotal,
            attemptedQuestions = attempted,
            correctAnswers = safeCorrect,
            incorrectAnswers = safeIncorrect,
            unansweredQuestions = unanswered,
            positiveMarksAwarded = round2(positiveAwarded),
            negativeMarksDeducted = round2(negativeDeducted),
            finalScore = finalScore,
            maxMarks = maxMarks,
            percentage = percentage,
            accuracyPercent = accuracy,
            attemptRatePercent = attemptRate,
            avgSecondsPerQuestion = avgSec
        )
    }

    /**
     * Direct marks-entry scoring for examinations such as CA papers (one mock = one 100-mark paper)
     * and GATE where mixed MCQ/MSQ/NAT or descriptive marks are entered directly out of the paper maximum.
     */
    fun scoreMarksEntry(
        marksObtained: Double,
        maxMarks: Double,
        durationMinutes: Int,
        paperName: String = "Paper",
        isCaPaper: Boolean = false
    ): MockScoreResult {
        val safeMax = maxMarks.coerceAtLeast(1.0)
        val safeObtained = marksObtained.coerceIn(0.0, safeMax)
        val percentage = round2((safeObtained / safeMax) * 100.0)
        val qualifiesExemption = percentage >= 60.0
        val diagnosis = if (isCaPaper) {
            when {
                qualifiesExemption -> "Exemption level (>=60%) achieved on $paperName."
                percentage >= 40.0 -> "Individual paper pass (>=40%); aim for >=50% aggregate or >=60% exemption."
                else -> "Below 40% individual paper minimum on $paperName; prioritize conceptual & writing practice."
            }
        } else {
            null
        }

        val summary = SubjectScoreSummary(
            subject = paperName.ifBlank { "Paper" },
            attempted = 1,
            correct = if (percentage >= 40.0) 1 else 0,
            incorrect = if (percentage < 40.0) 1 else 0,
            unanswered = 0,
            score = round2(safeObtained),
            maxMarks = round2(safeMax),
            accuracyPercent = percentage,
            avgSecondsPerQuestion = round2(durationMinutes * 60.0),
            qualifiesExemption = qualifiesExemption
        )

        return MockScoreResult(
            totalQuestions = 1,
            attemptedQuestions = 1,
            correctAnswers = if (percentage >= 40.0) 1 else 0,
            incorrectAnswers = if (percentage < 40.0) 1 else 0,
            unansweredQuestions = 0,
            positiveMarksAwarded = round2(safeObtained),
            negativeMarksDeducted = 0.0,
            finalScore = round2(safeObtained),
            maxMarks = round2(safeMax),
            percentage = percentage,
            accuracyPercent = percentage,
            attemptRatePercent = 100.0,
            avgSecondsPerQuestion = round2(durationMinutes * 60.0),
            subjectBreakdown = listOf(summary),
            errorCategoryCounts = emptyMap(),
            repeatedErrorDiagnosis = diagnosis
        )
    }

    /**
     * Detailed question-level mock scoring with subject breakdowns and error diagnostics.
     */
    fun scoreQuestionAttempts(
        attempts: List<QuestionAttemptInput>,
        markingScheme: MarkingScheme
    ): MockScoreResult {
        if (attempts.isEmpty()) {
            return scoreQuickEntry(markingScheme.totalQuestions, 0, 0, markingScheme)
        }

        val effectiveNegative = if (markingScheme.hasNegativeMarking) {
            markingScheme.negativeMarks.coerceAtLeast(0.0)
        } else {
            0.0
        }

        val total = attempts.size
        val correct = attempts.count { it.isCorrect }
        val incorrect = attempts.count { it.isAttempted && !it.isCorrect }
        val attempted = correct + incorrect
        val unanswered = total - attempted

        val positiveAwarded = correct * markingScheme.positiveMarks
        val negativeDeducted = incorrect * effectiveNegative
        val finalScore = round2(positiveAwarded - negativeDeducted)
        val maxMarks = round2(total * markingScheme.positiveMarks)

        val subjectBreakdown = attempts.groupBy { it.subject.ifBlank { "General" } }
            .map { (subject, items) ->
                val sCorrect = items.count { it.isCorrect }
                val sIncorrect = items.count { it.isAttempted && !it.isCorrect }
                val sAttempted = sCorrect + sIncorrect
                val sUnanswered = items.size - sAttempted
                val sScore = round2((sCorrect * markingScheme.positiveMarks) - (sIncorrect * effectiveNegative))
                val sMax = round2(items.size * markingScheme.positiveMarks)
                val sPct = if (sMax > 0.0) (sScore / sMax) * 100.0 else 0.0
                val sAcc = if (sAttempted > 0) round2((sCorrect.toDouble() / sAttempted) * 100.0) else 0.0
                val avgSec = if (items.isNotEmpty()) round2(items.map { it.timeSpentSeconds }.average()) else 0.0
                SubjectScoreSummary(
                    subject = subject,
                    attempted = sAttempted,
                    correct = sCorrect,
                    incorrect = sIncorrect,
                    unanswered = sUnanswered,
                    score = sScore,
                    maxMarks = sMax,
                    accuracyPercent = sAcc,
                    avgSecondsPerQuestion = avgSec,
                    qualifiesExemption = sPct >= 60.0
                )
            }
            .sortedBy { it.accuracyPercent }

        val errorCounts = attempts
            .filter { it.isAttempted && !it.isCorrect && it.errorCategory != null }
            .groupingBy { it.errorCategory!! }
            .eachCount()

        val topError = errorCounts.maxByOrNull { it.value }
        val diagnosis = topError?.let { (cat, count) ->
            "Top repeated mistake: ${cat.displayName} ($count of $incorrect incorrect answers)"
        }

        val totalSec = attempts.sumOf { it.timeSpentSeconds.coerceAtLeast(0) }
        val avgSec = if (attempted > 0) round2(totalSec.toDouble() / attempted) else 0.0

        return MockScoreResult(
            totalQuestions = total,
            attemptedQuestions = attempted,
            correctAnswers = correct,
            incorrectAnswers = incorrect,
            unansweredQuestions = unanswered,
            positiveMarksAwarded = round2(positiveAwarded),
            negativeMarksDeducted = round2(negativeDeducted),
            finalScore = finalScore,
            maxMarks = maxMarks,
            percentage = if (maxMarks > 0.0) round2((finalScore / maxMarks) * 100.0) else 0.0,
            accuracyPercent = if (attempted > 0) round2((correct.toDouble() / attempted) * 100.0) else 0.0,
            attemptRatePercent = round2((attempted.toDouble() / total) * 100.0),
            avgSecondsPerQuestion = avgSec,
            subjectBreakdown = subjectBreakdown,
            errorCategoryCounts = errorCounts,
            repeatedErrorDiagnosis = diagnosis
        )
    }

    private fun round2(value: Double): Double = (value * 100.0).roundToInt() / 100.0
}
