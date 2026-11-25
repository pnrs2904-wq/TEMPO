package com.tempo.focus.domain.exams

object CaExams {

    val CA_FOUNDATION = ExamConfig(
        examId = "ca_foundation",
        name = "CA Foundation",
        shortName = "CA Foundation",
        category = ExamCategory.CHARTERED_ACCOUNTANCY,
        level = ExamLevel.FOUNDATION,
        applicableYear = 2026,
        syllabusVersion = "ICAI-NEW-2026.1",
        patternStatus = PatternVerificationStatus.PROVISIONAL,
        authorityName = "Institute of Chartered Accountants of India (ICAI)",
        officialNotificationUrl = "https://www.icai.org/",
        officialSyllabusUrl = "https://boslive.icai.org/",
        markingScheme = MarkingScheme(
            positiveMarks = 1.0,
            negativeMarks = 0.25,
            hasNegativeMarking = true,
            totalQuestions = 100,
            maxMarks = 100.0,
            durationMinutes = 180,
            sectionalTimeLimits = listOf(
                SectionTimeLimit("Paper 1: Accounting (Descriptive)", 6, 180, 100.0),
                SectionTimeLimit("Paper 2: Business Laws (Descriptive)", 6, 180, 100.0),
                SectionTimeLimit("Paper 3: Quantitative Aptitude (MCQ, -0.25)", 100, 120, 100.0),
                SectionTimeLimit("Paper 4: Business Economics (MCQ, -0.25)", 100, 120, 100.0)
            ),
            passCriteriaNote = "40% minimum in each 100-mark paper, 50% aggregate, 60%+ exemption where applicable. Negative marking (-0.25) applies to Papers 3 & 4 (MCQs).",
            scoringMode = MockScoringMode.MARKS_ENTRY
        ),
        questionTypes = listOf(
            QuestionType.DESCRIPTIVE,
            QuestionType.NUMERICAL,
            QuestionType.MCQ
        ),
        revisionRule = RevisionRule(
            intervalsDays = listOf(1, 3, 7, 14, 30),
            recommendedMethods = listOf("Numerical Problems", "Writing Practice", "MCQs", "Active Recall")
        ),
        subjects = listOf(
            SyllabusSubjectSeed("Accounting", paperCode = "Paper 1", officialWeightagePercent = 25.0, weightageSource = WeightageSource.OFFICIAL_NOTIFICATION, units = listOf(
                SyllabusUnitSeed("Financial Accounting", listOf(SyllabusChapterSeed("Core Accounts", listOf(
                    SyllabusTopicSeed("BRS, Depreciation, Bills of Exchange & Final Accounts", listOf("Working Notes", "Adjustment Entries"), TopicDifficulty.HIGH),
                    SyllabusTopicSeed("Partnership, NPO & Company Accounts", listOf("Goodwill", "Share Forfeiture", "Debentures"), TopicDifficulty.CRITICAL)
                ))))
            )),
            SyllabusSubjectSeed("Business Laws", paperCode = "Paper 2", officialWeightagePercent = 25.0, weightageSource = WeightageSource.OFFICIAL_NOTIFICATION, units = listOf(
                SyllabusUnitSeed("Mercantile & Corporate Laws", listOf(SyllabusChapterSeed("Statutory Provisions", listOf(
                    SyllabusTopicSeed("Indian Contract Act, Sale of Goods & Partnership Act", listOf("Case Studies", "Provision-Fact-Conclusion Format"), TopicDifficulty.HIGH),
                    SyllabusTopicSeed("LLP Act, Companies Act Basics & Negotiable Instruments", difficulty = TopicDifficulty.HIGH)
                ))))
            )),
            SyllabusSubjectSeed("Quantitative Aptitude", paperCode = "Paper 3", officialWeightagePercent = 25.0, weightageSource = WeightageSource.OFFICIAL_NOTIFICATION, units = listOf(
                SyllabusUnitSeed("Business Maths, LR & Statistics", listOf(SyllabusChapterSeed("Objective Quantitative Core", listOf(
                    SyllabusTopicSeed("Time Value of Money, Permutations & Logical Reasoning", difficulty = TopicDifficulty.HIGH),
                    SyllabusTopicSeed("Statistical Dispersion, Correlation & Probability", difficulty = TopicDifficulty.MODERATE)
                ))))
            )),
            SyllabusSubjectSeed("Business Economics", paperCode = "Paper 4", officialWeightagePercent = 25.0, weightageSource = WeightageSource.OFFICIAL_NOTIFICATION, units = listOf(
                SyllabusUnitSeed("Micro & Macro Economics", listOf(SyllabusChapterSeed("Economic Theory & Indian Economy", listOf(
                    SyllabusTopicSeed("Demand, Supply, Production, Price Determination & Business Cycles", difficulty = TopicDifficulty.MODERATE),
                    SyllabusTopicSeed("National Income, Public Finance, Money Market & International Trade", difficulty = TopicDifficulty.HIGH)
                ))))
            ))
        ),
        resources = listOf(
            ExamResource("ICAI BoS Knowledge Portal", "Official Study Material, RTP & MTP", "https://boslive.icai.org/")
        ),
        supportsPaperExemptions = true,
        strategySummary = "Balance descriptive writing + accounting working notes (Papers 1–2) with timed MCQ drills (Papers 3–4, -0.25 negative marking) and ICAI RTP/MTPs."
    )

    val CA_INTERMEDIATE_G1 = ExamConfig(
        examId = "ca_inter_g1",
        name = "CA Intermediate — Group I",
        shortName = "CA Inter G1",
        category = ExamCategory.CHARTERED_ACCOUNTANCY,
        level = ExamLevel.INTERMEDIATE,
        applicableYear = 2026,
        syllabusVersion = "ICAI-INTER-2026.1",
        patternStatus = PatternVerificationStatus.PROVISIONAL,
        authorityName = "ICAI",
        officialNotificationUrl = "https://www.icai.org/",
        officialSyllabusUrl = "https://boslive.icai.org/",
        markingScheme = MarkingScheme(
            positiveMarks = 1.0,
            negativeMarks = 0.0,
            hasNegativeMarking = false,
            totalQuestions = 100,
            maxMarks = 100.0,
            durationMinutes = 180,
            passCriteriaNote = "One CA mock = one 100-mark paper. 30% Case-Based MCQs + 70% Descriptive. >=40% pass, >=50% aggregate, >=60% exemption.",
            scoringMode = MockScoringMode.MARKS_ENTRY
        ),
        questionTypes = listOf(QuestionType.CASE_BASED_MCQ, QuestionType.DESCRIPTIVE, QuestionType.NUMERICAL),
        revisionRule = RevisionRule(
            intervalsDays = listOf(1, 3, 7, 14, 30),
            recommendedMethods = listOf("Numerical Problems", "Case Studies", "Writing Practice", "MCQs")
        ),
        subjects = listOf(
            SyllabusSubjectSeed("Advanced Accounting", categoryGroup = "Group I", paperCode = "Paper 1", officialWeightagePercent = 33.3, weightageSource = WeightageSource.OFFICIAL_NOTIFICATION, units = listOf(
                SyllabusUnitSeed("Accounting Standards & Corporate Restructuring", listOf(SyllabusChapterSeed("AS & Financial Statements", listOf(
                    SyllabusTopicSeed("Accounting Standards (AS 1–29) & Consolidated Financial Statements", listOf("Working Notes", "ICAI Suggested Answers"), TopicDifficulty.CRITICAL),
                    SyllabusTopicSeed("Amalgamation, Internal Reconstruction & Buyback", difficulty = TopicDifficulty.HIGH)
                ))))
            )),
            SyllabusSubjectSeed("Corporate and Other Laws", categoryGroup = "Group I", paperCode = "Paper 2", officialWeightagePercent = 33.3, weightageSource = WeightageSource.OFFICIAL_NOTIFICATION, units = listOf(
                SyllabusUnitSeed("Companies Act & FEMA", listOf(SyllabusChapterSeed("Corporate Law", listOf(
                    SyllabusTopicSeed("Companies Act 2013 (Incorporation, Share Capital, Audit & Management)", difficulty = TopicDifficulty.HIGH),
                    SyllabusTopicSeed("LLP Act, General Clauses Act, Interpretation & FEMA", difficulty = TopicDifficulty.MODERATE)
                ))))
            )),
            SyllabusSubjectSeed("Taxation (Income Tax & GST)", categoryGroup = "Group I", paperCode = "Paper 3", officialWeightagePercent = 33.4, weightageSource = WeightageSource.OFFICIAL_NOTIFICATION, units = listOf(
                SyllabusUnitSeed("Direct & Indirect Taxes", listOf(SyllabusChapterSeed("Statutory Amendments & Computation", listOf(
                    SyllabusTopicSeed("Income Tax Heads, Total Income & Tax Amendments", listOf("Finance Act Amendments", "Working Notes"), TopicDifficulty.CRITICAL),
                    SyllabusTopicSeed("GST Supply, ITC, Exemptions, Returns & Registration", difficulty = TopicDifficulty.CRITICAL)
                ))))
            ))
        ),
        supportsCaGroups = true,
        supportsPaperExemptions = true,
        strategySummary = "Track ICAI RTPs, MTPs, statutory tax amendments, 30% case-based MCQs, and working-note presentation for exemptions (>=60%)."
    )

    val CA_INTERMEDIATE_G2 = ExamConfig(
        examId = "ca_inter_g2",
        name = "CA Intermediate — Group II",
        shortName = "CA Inter G2",
        category = ExamCategory.CHARTERED_ACCOUNTANCY,
        level = ExamLevel.INTERMEDIATE,
        applicableYear = 2026,
        syllabusVersion = "ICAI-INTER-2026.1",
        patternStatus = PatternVerificationStatus.PROVISIONAL,
        authorityName = "ICAI",
        officialNotificationUrl = "https://www.icai.org/",
        officialSyllabusUrl = "https://boslive.icai.org/",
        markingScheme = MarkingScheme(
            positiveMarks = 1.0,
            negativeMarks = 0.0,
            hasNegativeMarking = false,
            totalQuestions = 100,
            maxMarks = 100.0,
            durationMinutes = 180,
            passCriteriaNote = "One CA mock = one 100-mark paper. 30% Case-Based MCQs + 70% Descriptive. >=40% pass, >=50% aggregate, >=60% exemption.",
            scoringMode = MockScoringMode.MARKS_ENTRY
        ),
        questionTypes = listOf(QuestionType.CASE_BASED_MCQ, QuestionType.DESCRIPTIVE, QuestionType.NUMERICAL),
        revisionRule = RevisionRule(
            intervalsDays = listOf(1, 3, 7, 14, 30),
            recommendedMethods = listOf("Numerical Problems", "Writing Practice", "Case Studies", "Active Recall")
        ),
        subjects = listOf(
            SyllabusSubjectSeed("Cost and Management Accounting", categoryGroup = "Group II", paperCode = "Paper 4", officialWeightagePercent = 33.3, weightageSource = WeightageSource.OFFICIAL_NOTIFICATION, units = listOf(
                SyllabusUnitSeed("Costing Systems & Control", listOf(SyllabusChapterSeed("Core Costing", listOf(
                    SyllabusTopicSeed("Material, Employee, Overheads, ABC & Process Costing", difficulty = TopicDifficulty.HIGH),
                    SyllabusTopicSeed("Standard Costing, Marginal Costing & Budgets", difficulty = TopicDifficulty.CRITICAL)
                ))))
            )),
            SyllabusSubjectSeed("Auditing and Ethics", categoryGroup = "Group II", paperCode = "Paper 5", officialWeightagePercent = 33.3, weightageSource = WeightageSource.OFFICIAL_NOTIFICATION, units = listOf(
                SyllabusUnitSeed("Standards on Auditing", listOf(SyllabusChapterSeed("Audit Process & Ethics", listOf(
                    SyllabusTopicSeed("Risk Assessment, Audit Evidence, Sampling & CARO/Audit Report", listOf("SA Keywords", "Suggested Answers"), TopicDifficulty.CRITICAL)
                ))))
            )),
            SyllabusSubjectSeed("Financial Management and Strategic Management", categoryGroup = "Group II", paperCode = "Paper 6", officialWeightagePercent = 33.4, weightageSource = WeightageSource.OFFICIAL_NOTIFICATION, units = listOf(
                SyllabusUnitSeed("FM & SM", listOf(SyllabusChapterSeed("Capital Decisions & Strategy", listOf(
                    SyllabusTopicSeed("Cost of Capital, Capital Budgeting, Leverages & Working Capital", difficulty = TopicDifficulty.HIGH),
                    SyllabusTopicSeed("Strategic Analysis, Formulation & Implementation", difficulty = TopicDifficulty.MODERATE)
                ))))
            ))
        ),
        supportsCaGroups = true,
        supportsPaperExemptions = true,
        strategySummary = "Pair numerical speed in Costing & FM with ICAI SA keyword retention in Auditing & Ethics and RTP/MTP practice."
    )

    val CA_FINAL_G1 = ExamConfig(
        examId = "ca_final_g1",
        name = "CA Final — Group I",
        shortName = "CA Final G1",
        category = ExamCategory.CHARTERED_ACCOUNTANCY,
        level = ExamLevel.FINAL,
        applicableYear = 2026,
        syllabusVersion = "ICAI-FINAL-2026.1",
        patternStatus = PatternVerificationStatus.PROVISIONAL,
        authorityName = "ICAI",
        officialNotificationUrl = "https://www.icai.org/",
        officialSyllabusUrl = "https://boslive.icai.org/",
        markingScheme = MarkingScheme(
            positiveMarks = 1.0,
            negativeMarks = 0.0,
            hasNegativeMarking = false,
            totalQuestions = 100,
            maxMarks = 100.0,
            durationMinutes = 180,
            passCriteriaNote = "One CA mock = one 100-mark paper. 30% Case-Based MCQs + 70% Descriptive. >=40% paper, >=50% aggregate, >=60% exemption.",
            scoringMode = MockScoringMode.MARKS_ENTRY
        ),
        questionTypes = listOf(QuestionType.CASE_BASED_MCQ, QuestionType.DESCRIPTIVE, QuestionType.NUMERICAL),
        revisionRule = RevisionRule(
            intervalsDays = listOf(1, 3, 7, 14, 30),
            recommendedMethods = listOf("Numerical Problems", "Case Studies", "Writing Practice", "Active Recall")
        ),
        subjects = listOf(
            SyllabusSubjectSeed("Financial Reporting", categoryGroup = "Group I", paperCode = "Paper 1", officialWeightagePercent = 33.3, weightageSource = WeightageSource.OFFICIAL_NOTIFICATION, units = listOf(
                SyllabusUnitSeed("Ind AS Mastery", listOf(SyllabusChapterSeed("Complex Reporting", listOf(
                    SyllabusTopicSeed("Financial Instruments (Ind AS 109), Leases (116) & Revenue (115)", difficulty = TopicDifficulty.CRITICAL),
                    SyllabusTopicSeed("Business Combinations (Ind AS 103) & Consolidation (110)", difficulty = TopicDifficulty.CRITICAL)
                ))))
            )),
            SyllabusSubjectSeed("Advanced Financial Management", categoryGroup = "Group I", paperCode = "Paper 2", officialWeightagePercent = 33.3, weightageSource = WeightageSource.OFFICIAL_NOTIFICATION, units = listOf(
                SyllabusUnitSeed("Valuation & Derivatives", listOf(SyllabusChapterSeed("Markets & Risk", listOf(
                    SyllabusTopicSeed("Forex Risk, Derivatives, Portfolio Management & Mergers", difficulty = TopicDifficulty.CRITICAL)
                ))))
            )),
            SyllabusSubjectSeed("Advanced Auditing, Assurance and Professional Ethics", categoryGroup = "Group I", paperCode = "Paper 3", officialWeightagePercent = 33.4, weightageSource = WeightageSource.OFFICIAL_NOTIFICATION, units = listOf(
                SyllabusUnitSeed("Assurance & Ethics", listOf(SyllabusChapterSeed("SAs, SQC & Code of Ethics", listOf(
                    SyllabusTopicSeed("Professional Ethics Clauses, Group Audits, Bank/NBFC & ESG Assurance", difficulty = TopicDifficulty.CRITICAL)
                ))))
            ))
        ),
        supportsCaGroups = true,
        supportsPaperExemptions = true,
        strategySummary = "Ind AS working notes, AFM formula drills, Professional Ethics clause recall, and ICAI RTP/MTP/Suggested Answer benchmarking."
    )

    val CA_FINAL_G2 = ExamConfig(
        examId = "ca_final_g2",
        name = "CA Final — Group II",
        shortName = "CA Final G2",
        category = ExamCategory.CHARTERED_ACCOUNTANCY,
        level = ExamLevel.FINAL,
        applicableYear = 2026,
        syllabusVersion = "ICAI-FINAL-2026.1",
        patternStatus = PatternVerificationStatus.PROVISIONAL,
        authorityName = "ICAI",
        officialNotificationUrl = "https://www.icai.org/",
        officialSyllabusUrl = "https://boslive.icai.org/",
        markingScheme = MarkingScheme(
            positiveMarks = 1.0,
            negativeMarks = 0.0,
            hasNegativeMarking = false,
            totalQuestions = 100,
            maxMarks = 100.0,
            durationMinutes = 180,
            passCriteriaNote = "One CA mock = one 100-mark paper. Paper 6 (IBS) is Open-Book Case Study (4h). >=40% paper, >=50% aggregate, >=60% exemption.",
            scoringMode = MockScoringMode.MARKS_ENTRY
        ),
        questionTypes = listOf(QuestionType.CASE_BASED_MCQ, QuestionType.DESCRIPTIVE, QuestionType.NUMERICAL),
        revisionRule = RevisionRule(
            intervalsDays = listOf(1, 3, 7, 14, 30),
            recommendedMethods = listOf("Case Studies", "Numerical Problems", "Writing Practice", "Active Recall")
        ),
        subjects = listOf(
            SyllabusSubjectSeed("Direct Tax Laws and International Taxation", categoryGroup = "Group II", paperCode = "Paper 4", officialWeightagePercent = 33.3, weightageSource = WeightageSource.OFFICIAL_NOTIFICATION, units = listOf(
                SyllabusUnitSeed("DT & International Tax", listOf(SyllabusChapterSeed("Direct Tax & Treaties", listOf(
                    SyllabusTopicSeed("PGBP, MAT/AMT, Assessment Procedures & Tax Amendments", difficulty = TopicDifficulty.CRITICAL),
                    SyllabusTopicSeed("Transfer Pricing, DTAA, Non-Resident Taxation & BEPS", difficulty = TopicDifficulty.CRITICAL)
                ))))
            )),
            SyllabusSubjectSeed("Indirect Tax Laws", categoryGroup = "Group II", paperCode = "Paper 5", officialWeightagePercent = 33.3, weightageSource = WeightageSource.OFFICIAL_NOTIFICATION, units = listOf(
                SyllabusUnitSeed("GST & Customs", listOf(SyllabusChapterSeed("Advanced IDT", listOf(
                    SyllabusTopicSeed("GST Place of Supply, Valuation, ITC, Appeals & Amendments", difficulty = TopicDifficulty.HIGH),
                    SyllabusTopicSeed("Customs Valuation, Duty Drawback & FTP", difficulty = TopicDifficulty.MODERATE)
                ))))
            )),
            SyllabusSubjectSeed("Integrated Business Solutions", categoryGroup = "Group II", paperCode = "Paper 6", officialWeightagePercent = 33.4, weightageSource = WeightageSource.OFFICIAL_NOTIFICATION, units = listOf(
                SyllabusUnitSeed("Multidisciplinary Open-Book", listOf(SyllabusChapterSeed("Integrated Case Studies", listOf(
                    SyllabusTopicSeed("Cross-Paper Case Studies (FR + AFM + Audit + DT + IDT + Law)", listOf("Index Preparation", "Case Study Indexing"), TopicDifficulty.CRITICAL)
                ))))
            ))
        ),
        supportsCaGroups = true,
        supportsPaperExemptions = true,
        strategySummary = "Statutory amendment tracking in DT/IDT, open-book reference indexing for IBS, and timed case-study writing."
    )

    val CA_FINAL_SPOM = ExamConfig(
        examId = "ca_final_spom",
        name = "CA Final — Self-Paced Online Modules",
        shortName = "CA SPOM",
        category = ExamCategory.CHARTERED_ACCOUNTANCY,
        level = ExamLevel.SELF_PACED,
        applicableYear = 2026,
        syllabusVersion = "ICAI-SPOM-2026.1",
        patternStatus = PatternVerificationStatus.PROVISIONAL,
        authorityName = "ICAI",
        officialNotificationUrl = "https://www.icai.org/",
        officialSyllabusUrl = "https://boslive.icai.org/",
        markingScheme = MarkingScheme(
            positiveMarks = 2.0,
            negativeMarks = 0.0,
            hasNegativeMarking = false,
            totalQuestions = 50,
            maxMarks = 100.0,
            durationMinutes = 180,
            passCriteriaNote = "One SPOM module = 100 marks. Mandatory 50% qualifying score (no negative marking).",
            scoringMode = MockScoringMode.MARKS_ENTRY
        ),
        questionTypes = listOf(QuestionType.SELF_PACED_ONLINE, QuestionType.CASE_BASED_MCQ),
        revisionRule = RevisionRule(intervalsDays = listOf(1, 3, 7, 14, 30)),
        subjects = listOf(
            SyllabusSubjectSeed("Set A: Corporate and Economic Laws", paperCode = "Set A", officialWeightagePercent = 40.0, weightageSource = WeightageSource.OFFICIAL_NOTIFICATION, units = listOf(
                SyllabusUnitSeed("Mandatory Set A", listOf(SyllabusChapterSeed("Corporate & Economic Statutes", listOf(
                    SyllabusTopicSeed("Companies Act (Board, Compromises, Winding Up), SEBI, FEMA & IBC", difficulty = TopicDifficulty.HIGH)
                ))))
            )),
            SyllabusSubjectSeed("Set B: Strategic Cost and Performance Management", paperCode = "Set B", officialWeightagePercent = 40.0, weightageSource = WeightageSource.OFFICIAL_NOTIFICATION, units = listOf(
                SyllabusUnitSeed("Mandatory Set B", listOf(SyllabusChapterSeed("Strategic Costing", listOf(
                    SyllabusTopicSeed("Lean System, Cost Management Techniques, Pricing & Performance Evaluation", difficulty = TopicDifficulty.HIGH)
                ))))
            )),
            SyllabusSubjectSeed("Set C & Set D Electives", paperCode = "Sets C & D", officialWeightagePercent = 20.0, weightageSource = WeightageSource.OFFICIAL_NOTIFICATION, units = listOf(
                SyllabusUnitSeed("Elective Modules", listOf(SyllabusChapterSeed("Chosen Elective Specialization", listOf(
                    SyllabusTopicSeed("Set C Risk/Forensic/Valuation & Set D Multidisciplinary Module", difficulty = TopicDifficulty.MODERATE)
                ))))
            ))
        ),
        supportsPaperExemptions = true,
        strategySummary = "Complete ICAI LMS mandatory hours and drill case-based MCQs to clear Sets A–D (>=50% qualifying threshold)."
    )

    val ALL: List<ExamConfig> = listOf(
        CA_FOUNDATION,
        CA_INTERMEDIATE_G1,
        CA_INTERMEDIATE_G2,
        CA_FINAL_G1,
        CA_FINAL_G2,
        CA_FINAL_SPOM
    )
}
