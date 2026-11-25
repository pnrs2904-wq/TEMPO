package com.tempo.focus.domain.exams

object LawExams {

    val CLAT_UG = ExamConfig(
        examId = "clat_ug",
        name = "CLAT UG",
        shortName = "CLAT UG",
        category = ExamCategory.LAW,
        level = ExamLevel.UNDERGRADUATE,
        applicableYear = 2026,
        syllabusVersion = "CNLU-UG-2026.1",
        patternStatus = PatternVerificationStatus.PROVISIONAL,
        authorityName = "Consortium of National Law Universities",
        officialNotificationUrl = "https://consortiumofnlus.ac.in/",
        officialSyllabusUrl = "https://consortiumofnlus.ac.in/",
        markingScheme = MarkingScheme(
            positiveMarks = 1.0,
            negativeMarks = 0.25,
            hasNegativeMarking = true,
            totalQuestions = 120,
            maxMarks = 120.0,
            durationMinutes = 120,
            sectionalTimeLimits = listOf(
                SectionTimeLimit("English Language", 24, null, 24.0),
                SectionTimeLimit("Current Affairs & GK", 30, null, 30.0),
                SectionTimeLimit("Legal Reasoning", 30, null, 30.0),
                SectionTimeLimit("Logical Reasoning", 24, null, 24.0),
                SectionTimeLimit("Quantitative Techniques", 12, null, 12.0)
            ),
            passCriteriaNote = "120 passage-based MCQs in 120 minutes. +1 correct, -0.25 incorrect."
        ),
        questionTypes = listOf(QuestionType.PASSAGE_BASED, QuestionType.MCQ),
        revisionRule = RevisionRule(
            intervalsDays = listOf(1, 3, 7, 14, 30),
            recommendedMethods = listOf("Active Recall", "MCQs", "Reading", "Case Studies")
        ),
        subjects = listOf(
            SyllabusSubjectSeed(
                name = "English",
                officialWeightagePercent = 20.0,
                weightageSource = WeightageSource.OFFICIAL_NOTIFICATION,
                units = listOf(
                    SyllabusUnitSeed("Reading Comprehension", listOf(
                        SyllabusChapterSeed("Passages & Inference", listOf(
                            SyllabusTopicSeed("Main Idea, Tone & Inference Passages", listOf("Editorial Comprehension", "Contextual Vocabulary"), TopicDifficulty.MODERATE)
                        ))
                    ))
                )
            ),
            SyllabusSubjectSeed(
                name = "Current Affairs and GK",
                officialWeightagePercent = 25.0,
                weightageSource = WeightageSource.OFFICIAL_NOTIFICATION,
                units = listOf(
                    SyllabusUnitSeed("Contemporary Events", listOf(
                        SyllabusChapterSeed("National & International Affairs", listOf(
                            SyllabusTopicSeed("National Polity, Legal News & Summits", listOf("Supreme Court Developments", "International Bodies", "Bills & Acts"), TopicDifficulty.HIGH)
                        ))
                    ))
                )
            ),
            SyllabusSubjectSeed(
                name = "Legal Reasoning",
                officialWeightagePercent = 25.0,
                weightageSource = WeightageSource.OFFICIAL_NOTIFICATION,
                units = listOf(
                    SyllabusUnitSeed("Legal Principles & Passages", listOf(
                        SyllabusChapterSeed("Core Legal Domains", listOf(
                            SyllabusTopicSeed("Constitutional, Torts, Contracts & Criminal Legal Passages", listOf("Principle-Fact Application", "Statutory Interpretation"), TopicDifficulty.CRITICAL)
                        ))
                    ))
                )
            ),
            SyllabusSubjectSeed(
                name = "Logical Reasoning",
                officialWeightagePercent = 20.0,
                weightageSource = WeightageSource.OFFICIAL_NOTIFICATION,
                units = listOf(
                    SyllabusUnitSeed("Critical Reasoning", listOf(
                        SyllabusChapterSeed("Arguments & Assumptions", listOf(
                            SyllabusTopicSeed("Strengthen, Weaken, Assumptions & Paradoxes", listOf("Deductive Links", "Flaw Identification"), TopicDifficulty.HIGH)
                        ))
                    ))
                )
            ),
            SyllabusSubjectSeed(
                name = "Quantitative Techniques",
                officialWeightagePercent = 10.0,
                weightageSource = WeightageSource.OFFICIAL_NOTIFICATION,
                units = listOf(
                    SyllabusUnitSeed("Data Interpretation", listOf(
                        SyllabusChapterSeed("Caselet DI & Ratios", listOf(
                            SyllabusTopicSeed("Percentages, Ratios, Averages & Caselet Graphs", listOf("Profit & Loss", "Mensuration Basics"), TopicDifficulty.MODERATE)
                        ))
                    ))
                )
            )
        ),
        resources = listOf(
            ExamResource("Consortium of NLUs Official Portal", "Official Syllabus", "https://consortiumofnlus.ac.in/")
        ),
        strategySummary = "Passage reading speed, daily current affairs compendiums, legal principle application, and strict 1-minute-per-question pacing."
    )

    val CLAT_PG = ExamConfig(
        examId = "clat_pg",
        name = "CLAT PG",
        shortName = "CLAT PG",
        category = ExamCategory.LAW,
        level = ExamLevel.POSTGRADUATE,
        applicableYear = 2026,
        syllabusVersion = "CNLU-PG-2026.1",
        patternStatus = PatternVerificationStatus.PROVISIONAL,
        authorityName = "Consortium of National Law Universities",
        officialNotificationUrl = "https://consortiumofnlus.ac.in/",
        officialSyllabusUrl = "https://consortiumofnlus.ac.in/",
        markingScheme = MarkingScheme(
            positiveMarks = 1.0,
            negativeMarks = 0.25,
            hasNegativeMarking = true,
            totalQuestions = 120,
            maxMarks = 120.0,
            durationMinutes = 120,
            passCriteriaNote = "120 comprehension-based legal MCQs (LL.B. standard). +1 correct, -0.25 incorrect."
        ),
        questionTypes = listOf(QuestionType.PASSAGE_BASED, QuestionType.CASE_BASED_MCQ),
        revisionRule = RevisionRule(
            intervalsDays = listOf(1, 3, 7, 14, 30),
            recommendedMethods = listOf("Case Studies", "Active Recall", "MCQs", "Reading")
        ),
        subjects = listOf(
            "Constitutional Law" to TopicDifficulty.CRITICAL,
            "Jurisprudence" to TopicDifficulty.HIGH,
            "Administrative Law" to TopicDifficulty.HIGH,
            "Law of Contract" to TopicDifficulty.HIGH,
            "Criminal Law" to TopicDifficulty.CRITICAL,
            "Law of Torts" to TopicDifficulty.MODERATE,
            "Property Law" to TopicDifficulty.MODERATE,
            "Family Law" to TopicDifficulty.MODERATE,
            "Public International Law" to TopicDifficulty.HIGH,
            "Environmental Law" to TopicDifficulty.MODERATE,
            "Company Law" to TopicDifficulty.HIGH
        ).map { (subjectName, diff) ->
            SyllabusSubjectSeed(
                name = subjectName,
                weightageSource = WeightageSource.HISTORICAL_ANALYSIS,
                units = listOf(
                    SyllabusUnitSeed(
                        name = "$subjectName Core",
                        chapters = listOf(
                            SyllabusChapterSeed(
                                name = "Statutes & Landmark Judgments",
                                topics = listOf(
                                    SyllabusTopicSeed("$subjectName — Doctrines & Recent SC Judgments", listOf("Bare Act Provisions", "Landmark Case Law"), diff)
                                )
                            )
                        )
                    )
                )
            )
        },
        resources = listOf(
            ExamResource("Consortium of NLUs PG Syllabus", "Official Notification", "https://consortiumofnlus.ac.in/")
        ),
        strategySummary = "Recent Supreme Court constitution-bench judgments, statutory analysis, and jurisprudence synthesis across 11 LL.B. domains."
    )

    val AILET_UG = ExamConfig(
        examId = "ailet_ug",
        name = "AILET UG",
        shortName = "AILET UG",
        category = ExamCategory.LAW,
        level = ExamLevel.UNDERGRADUATE,
        applicableYear = 2026,
        syllabusVersion = "NLUD-UG-2026.1",
        patternStatus = PatternVerificationStatus.PROVISIONAL,
        authorityName = "National Law University Delhi",
        officialNotificationUrl = "https://nationallawuniversitydelhi.in/",
        officialSyllabusUrl = "https://nationallawuniversitydelhi.in/",
        markingScheme = MarkingScheme(
            positiveMarks = 1.0,
            negativeMarks = 0.25,
            hasNegativeMarking = true,
            totalQuestions = 150,
            maxMarks = 150.0,
            durationMinutes = 120,
            sectionalTimeLimits = listOf(
                SectionTimeLimit("English Language", 50, null, 50.0),
                SectionTimeLimit("Current Affairs & GK", 30, null, 30.0),
                SectionTimeLimit("Logical Reasoning", 70, null, 70.0)
            ),
            passCriteriaNote = "150 MCQs in 120 minutes (+1 / -0.25). Independent NLU Delhi pattern."
        ),
        questionTypes = listOf(QuestionType.MCQ, QuestionType.PASSAGE_BASED),
        revisionRule = RevisionRule(intervalsDays = listOf(1, 3, 7, 14, 30)),
        subjects = listOf(
            SyllabusSubjectSeed("English Language", officialWeightagePercent = 33.3, weightageSource = WeightageSource.OFFICIAL_NOTIFICATION, units = listOf(
                SyllabusUnitSeed("Comprehension & Usage", listOf(SyllabusChapterSeed("Verbal Ability", listOf(
                    SyllabusTopicSeed("Reading Comprehension & Grammar Precision", difficulty = TopicDifficulty.HIGH)
                ))))
            )),
            SyllabusSubjectSeed("Current Affairs & General Knowledge", officialWeightagePercent = 20.0, weightageSource = WeightageSource.OFFICIAL_NOTIFICATION, units = listOf(
                SyllabusUnitSeed("Current Events", listOf(SyllabusChapterSeed("GK & Legal Updates", listOf(
                    SyllabusTopicSeed("Annual Current Affairs & Static GK", difficulty = TopicDifficulty.HIGH)
                ))))
            )),
            SyllabusSubjectSeed("Logical Reasoning", officialWeightagePercent = 46.7, weightageSource = WeightageSource.OFFICIAL_NOTIFICATION, units = listOf(
                SyllabusUnitSeed("Analytical & Critical Logic", listOf(SyllabusChapterSeed("Syllogisms, Puzzles & Critical Reasoning", listOf(
                    SyllabusTopicSeed("Analytical Puzzles, Legal Principles & Critical Reasoning", difficulty = TopicDifficulty.CRITICAL)
                ))))
            ))
        ),
        strategySummary = "High-speed accuracy across 150 questions in 120 minutes with heavy emphasis on Logical Reasoning (70 marks)."
    )

    val AILET_PG = ExamConfig(
        examId = "ailet_pg",
        name = "AILET PG",
        shortName = "AILET PG",
        category = ExamCategory.LAW,
        level = ExamLevel.POSTGRADUATE,
        applicableYear = 2026,
        syllabusVersion = "NLUD-PG-2026.1",
        patternStatus = PatternVerificationStatus.PROVISIONAL,
        authorityName = "National Law University Delhi",
        officialNotificationUrl = "https://nationallawuniversitydelhi.in/",
        officialSyllabusUrl = "https://nationallawuniversitydelhi.in/",
        markingScheme = MarkingScheme(
            positiveMarks = 1.0,
            negativeMarks = 0.25,
            hasNegativeMarking = true,
            totalQuestions = 100,
            maxMarks = 100.0,
            durationMinutes = 120,
            passCriteriaNote = "100 objective MCQs (+1 / -0.25). Provisional pending annual NLU Delhi notice."
        ),
        questionTypes = listOf(QuestionType.MCQ, QuestionType.CASE_BASED_MCQ),
        revisionRule = RevisionRule(intervalsDays = listOf(1, 3, 7, 14, 30)),
        subjects = listOf(
            SyllabusSubjectSeed("Constitutional & Administrative Law", units = listOf(
                SyllabusUnitSeed("Public Law", listOf(SyllabusChapterSeed("Core Public Law", listOf(
                    SyllabusTopicSeed("Constitutional Bench Cases & Administrative Review", difficulty = TopicDifficulty.CRITICAL)
                ))))
            )),
            SyllabusSubjectSeed("Jurisprudence & Core Private/Criminal Law", units = listOf(
                SyllabusUnitSeed("Substantive Law", listOf(SyllabusChapterSeed("Jurisprudence, Criminal, Contracts & IPR", listOf(
                    SyllabusTopicSeed("Schools of Jurisprudence, Criminal Law & Commercial Law", difficulty = TopicDifficulty.HIGH)
                ))))
            ))
        ),
        strategySummary = "Deep doctrinal precision across LL.B. subjects with emphasis on NLU Delhi's objective MCQ format."
    )

    private fun buildStateLawcet(
        examId: String,
        name: String,
        authority: String,
        url: String,
        durationMin: Int,
        programTag: String
    ): ExamConfig = ExamConfig(
        examId = examId,
        name = name,
        shortName = name,
        category = ExamCategory.LAW,
        level = ExamLevel.UNDERGRADUATE,
        applicableYear = 2026,
        syllabusVersion = "${examId.uppercase()}-2026.1",
        patternStatus = PatternVerificationStatus.PROVISIONAL,
        authorityName = authority,
        officialNotificationUrl = url,
        officialSyllabusUrl = url,
        markingScheme = MarkingScheme(
            positiveMarks = 1.0,
            negativeMarks = 0.0,
            hasNegativeMarking = false,
            totalQuestions = 120,
            maxMarks = 120.0,
            durationMinutes = durationMin,
            passCriteriaNote = "120 MCQs, +1 each, NO negative marking ($programTag programme)."
        ),
        questionTypes = listOf(QuestionType.MCQ),
        revisionRule = RevisionRule(intervalsDays = listOf(1, 3, 7, 14, 30)),
        subjects = listOf(
            SyllabusSubjectSeed("General Knowledge & Mental Ability", categoryGroup = programTag, officialWeightagePercent = 25.0, weightageSource = WeightageSource.OFFICIAL_NOTIFICATION, units = listOf(
                SyllabusUnitSeed("Static GK & Reasoning", listOf(SyllabusChapterSeed("GK & Mental Ability", listOf(
                    SyllabusTopicSeed("Indian Polity, History, Geography & Mental Ability", difficulty = TopicDifficulty.MODERATE)
                ))))
            )),
            SyllabusSubjectSeed("Current Affairs", categoryGroup = programTag, officialWeightagePercent = 25.0, weightageSource = WeightageSource.OFFICIAL_NOTIFICATION, units = listOf(
                SyllabusUnitSeed("Recent Events", listOf(SyllabusChapterSeed("National & State Affairs", listOf(
                    SyllabusTopicSeed("National, International & Legal Current Affairs", difficulty = TopicDifficulty.HIGH)
                ))))
            )),
            SyllabusSubjectSeed("Aptitude for Study of Law", categoryGroup = programTag, officialWeightagePercent = 50.0, weightageSource = WeightageSource.OFFICIAL_NOTIFICATION, units = listOf(
                SyllabusUnitSeed("Legal Aptitude", listOf(SyllabusChapterSeed("Legal Principles & Constitution", listOf(
                    SyllabusTopicSeed("Indian Constitution, Legal Maxims, Torts, Contracts & Crimes ($programTag)", difficulty = TopicDifficulty.CRITICAL)
                ))))
            ))
        ),
        strategySummary = "Maximize attempts with zero negative marking; prioritize Aptitude for Study of Law (50% weightage) for $programTag."
    )

    val TS_LAWCET_3YR = buildStateLawcet("ts_lawcet_3yr", "TS LAWCET (3-Year)", "TGCHE / Osmania University", "https://lawcet.tsche.ac.in/", 90, "3-Year LL.B.")
    val TS_LAWCET_5YR = buildStateLawcet("ts_lawcet_5yr", "TS LAWCET (5-Year)", "TGCHE / Osmania University", "https://lawcet.tsche.ac.in/", 90, "5-Year Integrated LL.B.")
    val AP_LAWCET_3YR = buildStateLawcet("ap_lawcet_3yr", "AP LAWCET (3-Year)", "APSCHE", "https://cets.apsche.ap.gov.in/", 90, "3-Year LL.B.")
    val AP_LAWCET_5YR = buildStateLawcet("ap_lawcet_5yr", "AP LAWCET (5-Year)", "APSCHE", "https://cets.apsche.ap.gov.in/", 90, "5-Year Integrated LL.B.")
    val MH_CET_LAW_3YR = buildStateLawcet("mh_cet_law_3yr", "MH CET Law (3-Year)", "State CET Cell Maharashtra", "https://cetcell.mahacet.org/", 120, "3-Year LL.B.")
    val MH_CET_LAW_5YR = buildStateLawcet("mh_cet_law_5yr", "MH CET Law (5-Year)", "State CET Cell Maharashtra", "https://cetcell.mahacet.org/", 120, "5-Year Integrated LL.B.")

    val STATE_JUDICIARY = ExamConfig(
        examId = "state_judiciary",
        name = "State Judiciary (PCS-J)",
        shortName = "Judiciary",
        category = ExamCategory.LAW,
        level = ExamLevel.JUDICIARY,
        applicableYear = 2026,
        syllabusVersion = "STATE-JUD-2026.1",
        patternStatus = PatternVerificationStatus.PROVISIONAL,
        authorityName = "Respective State High Court / State PSC",
        officialNotificationUrl = "https://ecourts.gov.in/",
        officialSyllabusUrl = "https://ecourts.gov.in/",
        markingScheme = MarkingScheme(
            positiveMarks = 1.0,
            negativeMarks = 0.25,
            hasNegativeMarking = true,
            totalQuestions = 150,
            maxMarks = 150.0,
            durationMinutes = 120,
            passCriteriaNote = "Provisional Prelims template (configurable per state). Supports Prelims, Mains & Interview stages."
        ),
        questionTypes = listOf(QuestionType.MCQ, QuestionType.DESCRIPTIVE, QuestionType.CASE_BASED_MCQ),
        revisionRule = RevisionRule(
            intervalsDays = listOf(1, 3, 7, 14, 30),
            recommendedMethods = listOf("Active Recall", "Writing Practice", "Case Studies", "MCQs")
        ),
        subjects = listOf(
            SyllabusSubjectSeed("Prelims — Substantive & Procedural Bare Acts", categoryGroup = "Prelims", units = listOf(
                SyllabusUnitSeed("Core Codes", listOf(SyllabusChapterSeed("Civil & Criminal Codes", listOf(
                    SyllabusTopicSeed("CPC, BNSS/CrPC, BNS/IPC & BSA/Evidence Act", listOf("Section Recall", "Illustrations", "Amendments"), TopicDifficulty.CRITICAL),
                    SyllabusTopicSeed("Constitution, Contract, Specific Relief & Limitation", difficulty = TopicDifficulty.HIGH)
                ))))
            )),
            SyllabusSubjectSeed("Mains — Judgment Writing & Descriptive Papers", categoryGroup = "Mains", units = listOf(
                SyllabusUnitSeed("Descriptive Mastery", listOf(SyllabusChapterSeed("Civil, Criminal & Language Papers", listOf(
                    SyllabusTopicSeed("Civil & Criminal Judgment Writing, Issues & Framing of Charges", difficulty = TopicDifficulty.CRITICAL),
                    SyllabusTopicSeed("State Local Laws, Translation & Legal Essay", difficulty = TopicDifficulty.HIGH)
                ))))
            )),
            SyllabusSubjectSeed("Interview / Viva-Voce", categoryGroup = "Interview", units = listOf(
                SyllabusUnitSeed("Judicial Temperament", listOf(SyllabusChapterSeed("Viva Preparation", listOf(
                    SyllabusTopicSeed("Recent SC Rulings, Judicial Ethics & Practical Court Scenarios", difficulty = TopicDifficulty.MODERATE)
                ))))
            ))
        ),
        supportsJudiciaryStages = true,
        strategySummary = "Three-stage preparation: Bare Act index drills for Prelims, timed judgment writing for Mains, and viva-voce case analysis."
    )

    val ALL: List<ExamConfig> = listOf(
        CLAT_UG, CLAT_PG, AILET_UG, AILET_PG,
        TS_LAWCET_3YR, TS_LAWCET_5YR,
        AP_LAWCET_3YR, AP_LAWCET_5YR,
        MH_CET_LAW_3YR, MH_CET_LAW_5YR,
        STATE_JUDICIARY
    )
}
