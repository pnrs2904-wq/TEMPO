package com.tempo.focus.domain.exams

object ExamRegistry {

    val allExams: List<ExamConfig> = buildList {
        addAll(MedicalExams.ALL)
        addAll(LawExams.ALL)
        addAll(CaExams.ALL)
        addAll(GeneralExams.ALL)
    }

    private val byId: Map<String, ExamConfig> = allExams.associateBy { it.examId }

    fun getById(examId: String?): ExamConfig {
        if (examId.isNullOrBlank()) return MedicalExams.NEET_UG
        return byId[examId] ?: MedicalExams.NEET_UG
    }

    fun getByCategory(category: ExamCategory): List<ExamConfig> =
        allExams.filter { it.category == category }

    fun getCategoriesWithExams(): List<Pair<ExamCategory, List<ExamConfig>>> =
        ExamCategory.entries.mapNotNull { category ->
            val exams = getByCategory(category)
            if (exams.isEmpty()) null else category to exams
        }

    /**
     * Returns effective subjects for CA Intermediate / CA Final when student selects Group I, Group II, or Both.
     */
    fun getEffectiveSubjects(exam: ExamConfig, caGroup: CaGroupSelection = CaGroupSelection.BOTH): List<SyllabusSubjectSeed> {
        if (!exam.supportsCaGroups) return exam.subjects
        return when (exam.examId) {
            "ca_inter_g1", "ca_inter_g2" -> when (caGroup) {
                CaGroupSelection.GROUP_1 -> CaExams.CA_INTERMEDIATE_G1.subjects
                CaGroupSelection.GROUP_2 -> CaExams.CA_INTERMEDIATE_G2.subjects
                CaGroupSelection.BOTH -> CaExams.CA_INTERMEDIATE_G1.subjects + CaExams.CA_INTERMEDIATE_G2.subjects
            }
            "ca_final_g1", "ca_final_g2" -> when (caGroup) {
                CaGroupSelection.GROUP_1 -> CaExams.CA_FINAL_G1.subjects
                CaGroupSelection.GROUP_2 -> CaExams.CA_FINAL_G2.subjects
                CaGroupSelection.BOTH -> CaExams.CA_FINAL_G1.subjects + CaExams.CA_FINAL_G2.subjects
            }
            else -> exam.subjects
        }
    }
}
