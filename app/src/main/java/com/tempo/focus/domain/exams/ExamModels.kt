package com.tempo.focus.domain.exams

enum class ExamCategory(val displayName: String) {
    MEDICAL("Medical"),
    LAW("Law"),
    CHARTERED_ACCOUNTANCY("Chartered Accountancy"),
    CIVIL_SERVICES("Civil Services"),
    ENGINEERING("Engineering"),
    STATE_EXAMS("SSC, Banking & State"),
    UNIVERSITY_CUSTOM("University & Custom")
}

enum class ExamLevel(val displayName: String) {
    UNDERGRADUATE("Undergraduate"),
    POSTGRADUATE("Postgraduate"),
    FOUNDATION("Foundation"),
    INTERMEDIATE("Intermediate"),
    FINAL("Final"),
    SELF_PACED("Self-Paced Module"),
    COMPETITIVE("Competitive"),
    JUDICIARY("Judiciary"),
    CUSTOM("Custom")
}

enum class PatternVerificationStatus(val label: String) {
    VERIFIED("Official"),
    PROVISIONAL("Provisional")
}

enum class MockScoringMode(val value: String, val label: String) {
    PER_QUESTION("per_question", "Per-Question"),
    MARKS_ENTRY("marks_entry", "Marks Entry");

    companion object {
        fun fromValue(value: String?): MockScoringMode =
            entries.find { it.value.equals(value, ignoreCase = true) } ?: PER_QUESTION
    }
}

enum class QuestionType(val label: String) {
    MCQ("Objective MCQs"),
    CASE_BASED_MCQ("Case-Based MCQs"),
    IMAGE_BASED("Image-Based Questions"),
    PASSAGE_BASED("Passage-Based Questions"),
    DESCRIPTIVE("Descriptive Answers"),
    NUMERICAL("Numerical Problems"),
    OMR_SIMULATION("OMR Simulation"),
    SELF_PACED_ONLINE("Self-Paced Online Module")
}

enum class TopicStatus(val value: String, val displayName: String) {
    NOT_STARTED("not_started", "Not started"),
    LEARNING("learning", "Learning"),
    PRACTISING("practising", "Practising"),
    COMPLETED("completed", "Completed"),
    REVISION_DUE("revision_due", "Revision due"),
    MASTERED("mastered", "Mastered");

    fun nextStatus(): TopicStatus = when (this) {
        NOT_STARTED -> LEARNING
        LEARNING -> PRACTISING
        PRACTISING -> COMPLETED
        COMPLETED -> REVISION_DUE
        REVISION_DUE -> MASTERED
        MASTERED -> NOT_STARTED
    }

    companion object {
        fun fromValue(value: String?): TopicStatus =
            entries.find { it.value.equals(value, ignoreCase = true) } ?: NOT_STARTED
    }
}

enum class TopicDifficulty(val value: String, val label: String, val weightMultiplier: Double) {
    FOUNDATIONAL("foundational", "Foundational", 0.85),
    MODERATE("moderate", "Moderate", 1.0),
    HIGH("high", "High", 1.25),
    CRITICAL("critical", "Critical", 1.45);

    companion object {
        fun fromValue(value: String?): TopicDifficulty =
            entries.find { it.value.equals(value, ignoreCase = true) } ?: MODERATE
    }
}

enum class WeightageSource(val label: String) {
    OFFICIAL_NOTIFICATION("Official Weightage"),
    HISTORICAL_ANALYSIS("Historical Analysis"),
    ALGORITHMIC_RECOMMENDATION("Algorithmic Recommendation")
}

enum class CaGroupSelection(val value: String, val label: String) {
    GROUP_1("group_1", "Group I"),
    GROUP_2("group_2", "Group II"),
    BOTH("both", "Both Groups");

    companion object {
        fun fromValue(value: String?): CaGroupSelection =
            entries.find { it.value.equals(value, ignoreCase = true) } ?: BOTH
    }
}

data class SectionTimeLimit(
    val sectionName: String,
    val questionCount: Int,
    val timeLimitMinutes: Int? = null,
    val maxMarks: Double? = null
)

data class MarkingScheme(
    val positiveMarks: Double,
    val negativeMarks: Double,
    val hasNegativeMarking: Boolean = negativeMarks > 0.0,
    val totalQuestions: Int,
    val maxMarks: Double,
    val durationMinutes: Int,
    val sectionalTimeLimits: List<SectionTimeLimit> = emptyList(),
    val passCriteriaNote: String? = null,
    val scoringMode: MockScoringMode = MockScoringMode.PER_QUESTION
)

data class RevisionRule(
    val intervalsDays: List<Int> = listOf(1, 3, 7, 14, 30),
    val poorRecallMultiplier: Double = 0.5,
    val strongRecallMultiplier: Double = 1.35,
    val recommendedMethods: List<String> = listOf("Active Recall", "MCQs", "Reading")
)

data class ExamResource(
    val title: String,
    val category: String,
    val url: String? = null,
    val note: String = ""
)

data class SyllabusTopicSeed(
    val name: String,
    val subtopics: List<String> = emptyList(),
    val difficulty: TopicDifficulty = TopicDifficulty.MODERATE,
    val historicalFrequencyNote: String? = null,
    val ncertLinked: Boolean = false
)

data class SyllabusChapterSeed(
    val name: String,
    val topics: List<SyllabusTopicSeed>
)

data class SyllabusUnitSeed(
    val name: String,
    val chapters: List<SyllabusChapterSeed>
)

data class SyllabusSubjectSeed(
    val name: String,
    val categoryGroup: String? = null, // e.g., "Pre-clinical", "Group I", "Prelims"
    val officialWeightagePercent: Double? = null,
    val weightageSource: WeightageSource = WeightageSource.ALGORITHMIC_RECOMMENDATION,
    val paperCode: String? = null,
    val units: List<SyllabusUnitSeed>
)

data class ExamConfig(
    val examId: String,
    val name: String,
    val shortName: String,
    val category: ExamCategory,
    val level: ExamLevel,
    val applicableYear: Int,
    val syllabusVersion: String,
    val patternStatus: PatternVerificationStatus,
    val authorityName: String,
    val officialNotificationUrl: String,
    val officialSyllabusUrl: String,
    val markingScheme: MarkingScheme,
    val questionTypes: List<QuestionType>,
    val revisionRule: RevisionRule,
    val subjects: List<SyllabusSubjectSeed>,
    val resources: List<ExamResource> = emptyList(),
    val supportsCaGroups: Boolean = false,
    val supportsNcertTracking: Boolean = false,
    val supportsClinicalCaseTracking: Boolean = false,
    val supportsJudiciaryStages: Boolean = false,
    val supportsPaperExemptions: Boolean = false,
    val sourceVerificationDate: String? = null,
    val strategySummary: String
)
