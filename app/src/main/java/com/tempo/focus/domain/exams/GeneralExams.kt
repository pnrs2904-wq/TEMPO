package com.tempo.focus.domain.exams

object GeneralExams {

    val UPSC_CSE = ExamConfig(
        examId = "upsc_cse",
        name = "UPSC Civil Services (CSE)",
        shortName = "UPSC CSE",
        category = ExamCategory.CIVIL_SERVICES,
        level = ExamLevel.COMPETITIVE,
        applicableYear = 2026,
        syllabusVersion = "UPSC-CSE-2026.1",
        patternStatus = PatternVerificationStatus.PROVISIONAL,
        authorityName = "Union Public Service Commission (UPSC)",
        officialNotificationUrl = "https://upsc.gov.in/",
        officialSyllabusUrl = "https://upsc.gov.in/",
        markingScheme = MarkingScheme(
            positiveMarks = 2.0,
            negativeMarks = 0.66,
            hasNegativeMarking = true,
            totalQuestions = 100,
            maxMarks = 200.0,
            durationMinutes = 120,
            passCriteriaNote = "Prelims GS-I: 100 Qs (+2 / -0.66). CSAT GS-II: 80 Qs, 33% qualifying."
        ),
        questionTypes = listOf(QuestionType.MCQ, QuestionType.DESCRIPTIVE),
        revisionRule = RevisionRule(
            intervalsDays = listOf(1, 3, 7, 14, 30),
            recommendedMethods = listOf("Active Recall", "Writing Practice", "MCQs", "Reading")
        ),
        subjects = listOf(
            SyllabusSubjectSeed("Polity & Governance", officialWeightagePercent = 18.0, weightageSource = WeightageSource.HISTORICAL_ANALYSIS, units = listOf(
                SyllabusUnitSeed("Indian Constitution", listOf(SyllabusChapterSeed("Core Polity", listOf(
                    SyllabusTopicSeed("Fundamental Rights, Parliament, Federalism & Constitutional Bodies", difficulty = TopicDifficulty.CRITICAL)
                ))))
            )),
            SyllabusSubjectSeed("Economy & Environment", officialWeightagePercent = 28.0, weightageSource = WeightageSource.HISTORICAL_ANALYSIS, units = listOf(
                SyllabusUnitSeed("Macroeconomics & Ecology", listOf(SyllabusChapterSeed("Core Economy & Environment", listOf(
                    SyllabusTopicSeed("Monetary Policy, Fiscal Budget, Biodiversity & Climate Treaties", difficulty = TopicDifficulty.CRITICAL)
                ))))
            )),
            SyllabusSubjectSeed("History, Culture & Geography", officialWeightagePercent = 28.0, weightageSource = WeightageSource.HISTORICAL_ANALYSIS, units = listOf(
                SyllabusUnitSeed("GS-I Core", listOf(SyllabusChapterSeed("Modern India & Geography", listOf(
                    SyllabusTopicSeed("Modern Indian Freedom Struggle, Art & Culture, Physical Geography", difficulty = TopicDifficulty.HIGH)
                ))))
            )),
            SyllabusSubjectSeed("Science, IR, Ethics & CSAT", officialWeightagePercent = 26.0, weightageSource = WeightageSource.HISTORICAL_ANALYSIS, units = listOf(
                SyllabusUnitSeed("Integrated GS & CSAT", listOf(SyllabusChapterSeed("GS-III/IV & CSAT", listOf(
                    SyllabusTopicSeed("Science & Tech, International Relations, Ethics Case Studies & CSAT", difficulty = TopicDifficulty.HIGH)
                ))))
            ))
        ),
        strategySummary = "Integrated Prelims + Mains approach combining daily answer writing, current affairs linking, and 1/3rd negative-marking control."
    )

    val STATE_PSC = ExamConfig(
        examId = "state_psc",
        name = "State PSC",
        shortName = "State PSC",
        category = ExamCategory.STATE_EXAMS,
        level = ExamLevel.COMPETITIVE,
        applicableYear = 2026,
        syllabusVersion = "STATE-PSC-2026.1",
        patternStatus = PatternVerificationStatus.PROVISIONAL,
        authorityName = "Respective State Public Service Commission",
        officialNotificationUrl = "https://www.india.gov.in/",
        officialSyllabusUrl = "https://www.india.gov.in/",
        markingScheme = MarkingScheme(
            positiveMarks = 1.0,
            negativeMarks = 0.33,
            hasNegativeMarking = true,
            totalQuestions = 150,
            maxMarks = 150.0,
            durationMinutes = 120,
            passCriteriaNote = "Provisional State PSC Prelims template (customizable per state notification)."
        ),
        questionTypes = listOf(QuestionType.MCQ, QuestionType.DESCRIPTIVE),
        revisionRule = RevisionRule(intervalsDays = listOf(1, 3, 7, 14, 30)),
        subjects = listOf(
            SyllabusSubjectSeed("General Studies (Polity, History, Economy, Geography)", units = listOf(
                SyllabusUnitSeed("Core GS", listOf(SyllabusChapterSeed("National GS", listOf(
                    SyllabusTopicSeed("Indian Polity, Economy, Modern History & Geography", difficulty = TopicDifficulty.HIGH)
                ))))
            )),
            SyllabusSubjectSeed("State-Specific History, Geography & Schemes", units = listOf(
                SyllabusUnitSeed("State Special", listOf(SyllabusChapterSeed("Regional Knowledge", listOf(
                    SyllabusTopicSeed("State History, Economy, Welfare Schemes & Local Governance", difficulty = TopicDifficulty.CRITICAL)
                ))))
            ))
        ),
        strategySummary = "Combine standard GS mastery with high-yield state-specific history, geography, and welfare schemes."
    )

    val SSC_CGL = ExamConfig(
        examId = "ssc_cgl",
        name = "SSC CGL / Competitive",
        shortName = "SSC",
        category = ExamCategory.STATE_EXAMS,
        level = ExamLevel.COMPETITIVE,
        applicableYear = 2026,
        syllabusVersion = "SSC-CGL-2026.1",
        patternStatus = PatternVerificationStatus.PROVISIONAL,
        authorityName = "Staff Selection Commission (SSC)",
        officialNotificationUrl = "https://ssc.gov.in/",
        officialSyllabusUrl = "https://ssc.gov.in/",
        markingScheme = MarkingScheme(
            positiveMarks = 2.0,
            negativeMarks = 0.5,
            hasNegativeMarking = true,
            totalQuestions = 100,
            maxMarks = 200.0,
            durationMinutes = 60,
            passCriteriaNote = "Tier-I: 100 Qs in 60 min (+2 / -0.5). Tier-II: +3 / -1."
        ),
        questionTypes = listOf(QuestionType.MCQ, QuestionType.NUMERICAL),
        revisionRule = RevisionRule(intervalsDays = listOf(1, 3, 7, 14, 30)),
        subjects = listOf(
            SyllabusSubjectSeed("Quantitative Aptitude", officialWeightagePercent = 25.0, weightageSource = WeightageSource.OFFICIAL_NOTIFICATION, units = listOf(
                SyllabusUnitSeed("Arithmetic & Advance Maths", listOf(SyllabusChapterSeed("Speed Maths", listOf(
                    SyllabusTopicSeed("Arithmetic, Algebra, Geometry & Trigonometry", difficulty = TopicDifficulty.HIGH)
                ))))
            )),
            SyllabusSubjectSeed("General Intelligence & Reasoning", officialWeightagePercent = 25.0, weightageSource = WeightageSource.OFFICIAL_NOTIFICATION, units = listOf(
                SyllabusUnitSeed("Verbal & Non-Verbal", listOf(SyllabusChapterSeed("Core Reasoning", listOf(
                    SyllabusTopicSeed("Number Series, Coding-Decoding, Syllogisms & Seating", difficulty = TopicDifficulty.MODERATE)
                ))))
            )),
            SyllabusSubjectSeed("English Comprehension", officialWeightagePercent = 25.0, weightageSource = WeightageSource.OFFICIAL_NOTIFICATION, units = listOf(
                SyllabusUnitSeed("Grammar & Vocab", listOf(SyllabusChapterSeed("Error Spotting & Cloze", listOf(
                    SyllabusTopicSeed("Grammar Rules, Idioms, One-Word Substitution & Cloze Test", difficulty = TopicDifficulty.MODERATE)
                ))))
            )),
            SyllabusSubjectSeed("General Awareness", officialWeightagePercent = 25.0, weightageSource = WeightageSource.OFFICIAL_NOTIFICATION, units = listOf(
                SyllabusUnitSeed("Static GK & Science", listOf(SyllabusChapterSeed("General Awareness", listOf(
                    SyllabusTopicSeed("Polity, History, General Science & Current Affairs", difficulty = TopicDifficulty.HIGH)
                ))))
            ))
        ),
        strategySummary = "Ultra-fast 60-minute execution across 100 questions through previous-year question drills and formula recall."
    )

    val BANKING = ExamConfig(
        examId = "banking",
        name = "Banking (IBPS / SBI PO)",
        shortName = "Banking",
        category = ExamCategory.STATE_EXAMS,
        level = ExamLevel.COMPETITIVE,
        applicableYear = 2026,
        syllabusVersion = "IBPS-SBI-2026.1",
        patternStatus = PatternVerificationStatus.PROVISIONAL,
        authorityName = "IBPS / State Bank of India",
        officialNotificationUrl = "https://www.ibps.in/",
        officialSyllabusUrl = "https://www.ibps.in/",
        markingScheme = MarkingScheme(
            positiveMarks = 1.0,
            negativeMarks = 0.25,
            hasNegativeMarking = true,
            totalQuestions = 100,
            maxMarks = 100.0,
            durationMinutes = 60,
            sectionalTimeLimits = listOf(
                SectionTimeLimit("English Language", 30, 20, 30.0),
                SectionTimeLimit("Quantitative Aptitude", 35, 20, 35.0),
                SectionTimeLimit("Reasoning Ability", 35, 20, 35.0)
            ),
            passCriteriaNote = "Strict 20-minute sectional timers per section. +1 correct, -0.25 incorrect."
        ),
        questionTypes = listOf(QuestionType.MCQ, QuestionType.NUMERICAL),
        revisionRule = RevisionRule(intervalsDays = listOf(1, 3, 7, 14, 30)),
        subjects = listOf(
            SyllabusSubjectSeed("Reasoning Ability & Puzzles", officialWeightagePercent = 35.0, weightageSource = WeightageSource.OFFICIAL_NOTIFICATION, units = listOf(
                SyllabusUnitSeed("Puzzles & Logic", listOf(SyllabusChapterSeed("High-Speed Puzzles", listOf(
                    SyllabusTopicSeed("Floor, Box & Circular Seating Puzzles, Inequalities & Syllogisms", difficulty = TopicDifficulty.CRITICAL)
                ))))
            )),
            SyllabusSubjectSeed("Quantitative Aptitude & DI", officialWeightagePercent = 35.0, weightageSource = WeightageSource.OFFICIAL_NOTIFICATION, units = listOf(
                SyllabusUnitSeed("Data Interpretation", listOf(SyllabusChapterSeed("DI & Arithmetic", listOf(
                    SyllabusTopicSeed("Caselets, Bar/Line DI, Simplification & Arithmetic", difficulty = TopicDifficulty.HIGH)
                ))))
            )),
            SyllabusSubjectSeed("English & Banking Awareness", officialWeightagePercent = 30.0, weightageSource = WeightageSource.OFFICIAL_NOTIFICATION, units = listOf(
                SyllabusUnitSeed("Comprehension & Financial Awareness", listOf(SyllabusChapterSeed("RC & RBI Updates", listOf(
                    SyllabusTopicSeed("Reading Comprehension, Para-jumbles & RBI/Banking Awareness", difficulty = TopicDifficulty.MODERATE)
                ))))
            ))
        ),
        strategySummary = "Train strict 20-minute sectional pacing, puzzle selection speed, and high accuracy under -0.25 negative marking."
    )

    val GATE = ExamConfig(
        examId = "gate",
        name = "GATE",
        shortName = "GATE",
        category = ExamCategory.ENGINEERING,
        level = ExamLevel.POSTGRADUATE,
        applicableYear = 2026,
        syllabusVersion = "GATE-IIT-2026.1",
        patternStatus = PatternVerificationStatus.PROVISIONAL,
        authorityName = "Organizing IIT / IISc",
        officialNotificationUrl = "https://gate2026.iitg.ac.in/",
        officialSyllabusUrl = "https://gate2026.iitg.ac.in/",
        markingScheme = MarkingScheme(
            positiveMarks = 2.0,
            negativeMarks = 0.66,
            hasNegativeMarking = true,
            totalQuestions = 65,
            maxMarks = 100.0,
            durationMinutes = 180,
            passCriteriaNote = "65 Qs / 100 Marks in 180 min. MCQs carry 1/3rd negative marking; MSQ & NAT carry NO negative marking.",
            scoringMode = MockScoringMode.MARKS_ENTRY
        ),
        questionTypes = listOf(QuestionType.MCQ, QuestionType.NUMERICAL),
        revisionRule = RevisionRule(
            intervalsDays = listOf(1, 3, 7, 14, 30),
            recommendedMethods = listOf("Numerical Problems", "Active Recall", "MCQs")
        ),
        subjects = listOf(
            SyllabusSubjectSeed("General Aptitude", officialWeightagePercent = 15.0, weightageSource = WeightageSource.OFFICIAL_NOTIFICATION, units = listOf(
                SyllabusUnitSeed("Verbal & Quantitative Aptitude", listOf(SyllabusChapterSeed("Core Aptitude", listOf(
                    SyllabusTopicSeed("Analytical, Spatial & Verbal Aptitude", difficulty = TopicDifficulty.MODERATE)
                ))))
            )),
            SyllabusSubjectSeed("Engineering Mathematics", officialWeightagePercent = 13.0, weightageSource = WeightageSource.OFFICIAL_NOTIFICATION, units = listOf(
                SyllabusUnitSeed("Applied Mathematics", listOf(SyllabusChapterSeed("Core Engineering Maths", listOf(
                    SyllabusTopicSeed("Linear Algebra, Calculus, Probability & Differential Equations", difficulty = TopicDifficulty.HIGH)
                ))))
            )),
            SyllabusSubjectSeed("Core Branch Subjects", officialWeightagePercent = 72.0, weightageSource = WeightageSource.OFFICIAL_NOTIFICATION, units = listOf(
                SyllabusUnitSeed("Technical Discipline", listOf(SyllabusChapterSeed("Core Technical Papers", listOf(
                    SyllabusTopicSeed("Core Branch Modules (Editable per CS/EC/ME/CE/EE Stream)", difficulty = TopicDifficulty.CRITICAL)
                ))))
            ))
        ),
        strategySummary = "Master Engineering Maths + General Aptitude (28% guaranteed weightage) alongside deep numerical PYQ mastery in core branch subjects."
    )

    val UNIVERSITY = ExamConfig(
        examId = "university",
        name = "University Examinations",
        shortName = "University",
        category = ExamCategory.UNIVERSITY_CUSTOM,
        level = ExamLevel.UNDERGRADUATE,
        applicableYear = 2026,
        syllabusVersion = "UNIV-2026.1",
        patternStatus = PatternVerificationStatus.PROVISIONAL,
        authorityName = "User-Configured University / College",
        officialNotificationUrl = "https://www.ugc.gov.in/",
        officialSyllabusUrl = "https://www.ugc.gov.in/",
        markingScheme = MarkingScheme(
            positiveMarks = 1.0,
            negativeMarks = 0.0,
            hasNegativeMarking = false,
            totalQuestions = 100,
            maxMarks = 100.0,
            durationMinutes = 180,
            passCriteriaNote = "Customizable semester syllabus and descriptive/objective paper structure."
        ),
        questionTypes = listOf(QuestionType.DESCRIPTIVE, QuestionType.MCQ, QuestionType.NUMERICAL),
        revisionRule = RevisionRule(intervalsDays = listOf(1, 3, 7, 14, 30)),
        subjects = listOf(
            SyllabusSubjectSeed("Core Course 1", units = listOf(
                SyllabusUnitSeed("Unit 1", listOf(SyllabusChapterSeed("Foundations", listOf(
                    SyllabusTopicSeed("Core Lecture Topics & Lab Concepts", difficulty = TopicDifficulty.MODERATE)
                ))))
            )),
            SyllabusSubjectSeed("Core Course 2", units = listOf(
                SyllabusUnitSeed("Unit 1", listOf(SyllabusChapterSeed("Applied Concepts", listOf(
                    SyllabusTopicSeed("Problem Sets & Past Semester Papers", difficulty = TopicDifficulty.MODERATE)
                ))))
            ))
        ),
        strategySummary = "Customize with your semester courses, lecture units, and past university question papers."
    )

    val CUSTOM = ExamConfig(
        examId = "custom",
        name = "Custom Examination",
        shortName = "Custom",
        category = ExamCategory.UNIVERSITY_CUSTOM,
        level = ExamLevel.CUSTOM,
        applicableYear = 2026,
        syllabusVersion = "CUSTOM-1.0",
        patternStatus = PatternVerificationStatus.PROVISIONAL,
        authorityName = "Custom User Configuration",
        officialNotificationUrl = "",
        officialSyllabusUrl = "",
        markingScheme = MarkingScheme(
            positiveMarks = 1.0,
            negativeMarks = 0.0,
            hasNegativeMarking = false,
            totalQuestions = 100,
            maxMarks = 100.0,
            durationMinutes = 120,
            passCriteriaNote = "Fully editable syllabus, subjects, and marking rules."
        ),
        questionTypes = listOf(QuestionType.MCQ, QuestionType.DESCRIPTIVE, QuestionType.NUMERICAL),
        revisionRule = RevisionRule(intervalsDays = listOf(1, 3, 7, 14, 30)),
        subjects = listOf(
            SyllabusSubjectSeed("General Subject", units = listOf(
                SyllabusUnitSeed("Unit 1", listOf(SyllabusChapterSeed("Chapter 1", listOf(
                    SyllabusTopicSeed("Add your custom topics via + or CSV import", difficulty = TopicDifficulty.MODERATE)
                ))))
            ))
        ),
        strategySummary = "Build your own syllabus hierarchy, configure marking rules, and track revisions and mock tests."
    )

    val ALL: List<ExamConfig> = listOf(
        UPSC_CSE, STATE_PSC, SSC_CGL, BANKING, GATE, UNIVERSITY, CUSTOM
    )
}
