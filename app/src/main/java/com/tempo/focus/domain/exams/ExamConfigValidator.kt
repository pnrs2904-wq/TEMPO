package com.tempo.focus.domain.exams

data class ExamValidationReport(
    val isValid: Boolean,
    val errors: List<String>
)

/**
 * Pure Kotlin validator ensuring all 26 exam definitions in [ExamRegistry] obey structural,
 * marking-mode (PER_QUESTION vs MARKS_ENTRY), and source-verification integrity rules.
 */
object ExamConfigValidator {

    private val CA_EXAM_IDS = setOf(
        "ca_foundation",
        "ca_inter_g1",
        "ca_inter_g2",
        "ca_final_g1",
        "ca_final_g2",
        "ca_final_spom"
    )

    fun validateAll(exams: List<ExamConfig> = ExamRegistry.allExams): ExamValidationReport {
        val errors = mutableListOf<String>()
        val seenIds = mutableSetOf<String>()

        if (exams.size < 26) {
            errors.add("Expected at least 26 exam configurations, found ${exams.size}.")
        }

        for (exam in exams) {
            if (exam.examId.isBlank()) {
                errors.add("Blank examId detected for '${exam.name}'.")
            } else if (!seenIds.add(exam.examId)) {
                errors.add("Duplicate examId '${exam.examId}'.")
            }

            if (exam.name.isBlank() || exam.shortName.isBlank()) {
                errors.add("${exam.examId}: name and shortName must not be blank.")
            }
            if (exam.syllabusVersion.isBlank()) {
                errors.add("${exam.examId}: syllabusVersion must not be blank.")
            }
            if (exam.applicableYear !in 2024..2030) {
                errors.add("${exam.examId}: applicableYear ${exam.applicableYear} out of range.")
            }
            if (!exam.officialNotificationUrl.startsWith("https://")) {
                errors.add("${exam.examId}: officialNotificationUrl must use https://.")
            }
            if (exam.patternStatus == PatternVerificationStatus.VERIFIED && exam.sourceVerificationDate.isNullOrBlank()) {
                errors.add("${exam.examId}: VERIFIED status requires non-blank sourceVerificationDate.")
            }

            val scheme = exam.markingScheme
            if (scheme.maxMarks <= 0.0) {
                errors.add("${exam.examId}: maxMarks must be positive.")
            }
            if (scheme.durationMinutes <= 0) {
                errors.add("${exam.examId}: durationMinutes must be positive.")
            }
            if (scheme.negativeMarks < 0.0) {
                errors.add("${exam.examId}: negativeMarks cannot be negative.")
            }
            if (!scheme.hasNegativeMarking && scheme.negativeMarks > 0.0) {
                errors.add("${exam.examId}: hasNegativeMarking=false cannot have negativeMarks > 0.")
            }

            // Tempo 4.0 rule: CA papers (100-mark single paper) and GATE use MARKS_ENTRY
            if (exam.examId in CA_EXAM_IDS) {
                if (scheme.scoringMode != MockScoringMode.MARKS_ENTRY) {
                    errors.add("${exam.examId}: CA exams must use MockScoringMode.MARKS_ENTRY.")
                }
                if (scheme.maxMarks != 100.0) {
                    errors.add("${exam.examId}: One CA mock must represent one 100-mark paper (found ${scheme.maxMarks}).")
                }
            }
            if (exam.examId == "gate" && scheme.scoringMode != MockScoringMode.MARKS_ENTRY) {
                errors.add("gate: GATE must use MockScoringMode.MARKS_ENTRY.")
            }

            if (exam.subjects.isEmpty()) {
                errors.add("${exam.examId}: must contain at least one subject.")
            }
            if (exam.revisionRule.intervalsDays.isEmpty() || exam.revisionRule.intervalsDays.any { it <= 0 }) {
                errors.add("${exam.examId}: revisionRule.intervalsDays must contain positive integers.")
            }
            exam.subjects.forEach { subject ->
                if (subject.units.isEmpty()) {
                    errors.add("${exam.examId}/${subject.name}: must contain at least one unit.")
                }
                val topicCount = subject.units.sumOf { u -> u.chapters.sumOf { it.topics.size } }
                if (topicCount == 0) {
                    errors.add("${exam.examId}/${subject.name}: must contain at least one topic.")
                }
            }
        }

        return ExamValidationReport(
            isValid = errors.isEmpty(),
            errors = errors
        )
    }
}
