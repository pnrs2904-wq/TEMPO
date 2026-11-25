package com.tempo.focus.domain.exams

object MedicalExams {

    val NEET_UG = ExamConfig(
        examId = "neet_ug",
        name = "NEET UG",
        shortName = "NEET UG",
        category = ExamCategory.MEDICAL,
        level = ExamLevel.UNDERGRADUATE,
        applicableYear = 2026,
        syllabusVersion = "NTA-NMC-2026.1",
        patternStatus = PatternVerificationStatus.PROVISIONAL,
        authorityName = "National Testing Agency (NTA) / NMC",
        officialNotificationUrl = "https://neet.nta.nic.in/",
        officialSyllabusUrl = "https://www.nmc.org.in/",
        markingScheme = MarkingScheme(
            positiveMarks = 4.0,
            negativeMarks = 1.0,
            hasNegativeMarking = true,
            totalQuestions = 180,
            maxMarks = 720.0,
            durationMinutes = 180,
            sectionalTimeLimits = listOf(
                SectionTimeLimit("Physics", 45, null, 180.0),
                SectionTimeLimit("Chemistry", 45, null, 180.0),
                SectionTimeLimit("Botany", 45, null, 180.0),
                SectionTimeLimit("Zoology", 45, null, 180.0)
            ),
            passCriteriaNote = "+4 for correct, -1 for incorrect. 180 compulsory MCQs across 3 hours (OMR)."
        ),
        questionTypes = listOf(
            QuestionType.MCQ,
            QuestionType.OMR_SIMULATION,
            QuestionType.NUMERICAL
        ),
        revisionRule = RevisionRule(
            intervalsDays = listOf(1, 3, 7, 14, 30),
            recommendedMethods = listOf("Active Recall", "MCQs", "Flashcards", "Reading")
        ),
        subjects = listOf(
            SyllabusSubjectSeed(
                name = "Physics",
                officialWeightagePercent = 25.0,
                weightageSource = WeightageSource.OFFICIAL_NOTIFICATION,
                units = listOf(
                    SyllabusUnitSeed(
                        name = "Mechanics",
                        chapters = listOf(
                            SyllabusChapterSeed(
                                name = "Kinematics & Laws of Motion",
                                topics = listOf(
                                    SyllabusTopicSeed("Laws of Motion", listOf("Newton's Laws", "Friction", "Circular Dynamics"), TopicDifficulty.HIGH, "High-yield NCERT core", ncertLinked = true),
                                    SyllabusTopicSeed("Work, Energy and Power", listOf("Work-Energy Theorem", "Conservation of Energy", "Collisions"), TopicDifficulty.HIGH, "Frequent numericals", ncertLinked = true),
                                    SyllabusTopicSeed("Rotational Motion", listOf("Moment of Inertia", "Torque", "Angular Momentum"), TopicDifficulty.CRITICAL, ncertLinked = true)
                                )
                            )
                        )
                    ),
                    SyllabusUnitSeed(
                        name = "Electricity & Magnetism",
                        chapters = listOf(
                            SyllabusChapterSeed(
                                name = "Electrostatics & Current Electricity",
                                topics = listOf(
                                    SyllabusTopicSeed("Electrostatics & Capacitance", listOf("Gauss Law", "Electric Potential", "Capacitors"), TopicDifficulty.HIGH, ncertLinked = true),
                                    SyllabusTopicSeed("Current Electricity", listOf("Kirchhoff's Laws", "Wheatstone Bridge", "Meter Bridge"), TopicDifficulty.HIGH, ncertLinked = true),
                                    SyllabusTopicSeed("Magnetic Effects & EMI", listOf("Biot-Savart Law", "Faraday's Law", "AC Circuits"), TopicDifficulty.HIGH, ncertLinked = true)
                                )
                            )
                        )
                    ),
                    SyllabusUnitSeed(
                        name = "Optics & Modern Physics",
                        chapters = listOf(
                            SyllabusChapterSeed(
                                name = "Optics & Atoms",
                                topics = listOf(
                                    SyllabusTopicSeed("Ray & Wave Optics", listOf("Lenses", "Prism", "YDSE", "Diffraction"), TopicDifficulty.HIGH, ncertLinked = true),
                                    SyllabusTopicSeed("Modern Physics & Semiconductors", listOf("Photoelectric Effect", "Bohr Model", "Logic Gates"), TopicDifficulty.MODERATE, "High scoring unit", ncertLinked = true)
                                )
                            )
                        )
                    )
                )
            ),
            SyllabusSubjectSeed(
                name = "Chemistry",
                officialWeightagePercent = 25.0,
                weightageSource = WeightageSource.OFFICIAL_NOTIFICATION,
                units = listOf(
                    SyllabusUnitSeed(
                        name = "Physical Chemistry",
                        chapters = listOf(
                            SyllabusChapterSeed(
                                name = "Core Physical Principles",
                                topics = listOf(
                                    SyllabusTopicSeed("Atomic Structure & Chemical Bonding", listOf("Quantum Numbers", "VSEPR", "MOT"), TopicDifficulty.HIGH, ncertLinked = true),
                                    SyllabusTopicSeed("Thermodynamics & Equilibrium", listOf("Enthalpy", "Gibbs Energy", "Ionic Equilibrium"), TopicDifficulty.HIGH, ncertLinked = true),
                                    SyllabusTopicSeed("Electrochemistry & Kinetics", listOf("Nernst Equation", "First Order Kinetics"), TopicDifficulty.HIGH, ncertLinked = true)
                                )
                            )
                        )
                    ),
                    SyllabusUnitSeed(
                        name = "Organic Chemistry",
                        chapters = listOf(
                            SyllabusChapterSeed(
                                name = "Reaction Mechanisms",
                                topics = listOf(
                                    SyllabusTopicSeed("General Organic Chemistry & Hydrocarbons", listOf("Inductive/Resonance", "Isomerism", "Alkenes"), TopicDifficulty.CRITICAL, ncertLinked = true),
                                    SyllabusTopicSeed("Aldehydes, Ketones, Carboxylic Acids & Amines", listOf("Named Reactions", "Distinction Tests"), TopicDifficulty.HIGH, ncertLinked = true)
                                )
                            )
                        )
                    ),
                    SyllabusUnitSeed(
                        name = "Inorganic Chemistry",
                        chapters = listOf(
                            SyllabusChapterSeed(
                                name = "Periodic & Coordination Chemistry",
                                topics = listOf(
                                    SyllabusTopicSeed("p-Block & d/f-Block Elements", listOf("Oxidation States", "Trends"), TopicDifficulty.MODERATE, ncertLinked = true),
                                    SyllabusTopicSeed("Coordination Compounds", listOf("CFT", "IUPAC Naming", "Isomerism"), TopicDifficulty.HIGH, ncertLinked = true)
                                )
                            )
                        )
                    )
                )
            ),
            SyllabusSubjectSeed(
                name = "Botany",
                officialWeightagePercent = 25.0,
                weightageSource = WeightageSource.OFFICIAL_NOTIFICATION,
                units = listOf(
                    SyllabusUnitSeed(
                        name = "Plant Diversity & Physiology",
                        chapters = listOf(
                            SyllabusChapterSeed(
                                name = "Cell & Plant Systems",
                                topics = listOf(
                                    SyllabusTopicSeed("Cell: The Unit of Life & Cell Cycle", listOf("Organelles", "Mitosis", "Meiosis"), TopicDifficulty.MODERATE, ncertLinked = true),
                                    SyllabusTopicSeed("Photosynthesis & Respiration in Plants", listOf("C3/C4 Cycles", "Glycolysis", "Krebs Cycle"), TopicDifficulty.HIGH, ncertLinked = true),
                                    SyllabusTopicSeed("Genetics & Molecular Basis of Inheritance", listOf("Mendelian Genetics", "DNA Replication", "Operon"), TopicDifficulty.CRITICAL, "Highest historical yield", ncertLinked = true)
                                )
                            )
                        )
                    )
                )
            ),
            SyllabusSubjectSeed(
                name = "Zoology",
                officialWeightagePercent = 25.0,
                weightageSource = WeightageSource.OFFICIAL_NOTIFICATION,
                units = listOf(
                    SyllabusUnitSeed(
                        name = "Human Physiology & Biotech",
                        chapters = listOf(
                            SyllabusChapterSeed(
                                name = "Systems & Applications",
                                topics = listOf(
                                    SyllabusTopicSeed("Human Physiology (Circulation, Neural, Endocrine)", listOf("Cardiac Cycle", "Nerve Impulse", "Hormones"), TopicDifficulty.CRITICAL, ncertLinked = true),
                                    SyllabusTopicSeed("Human Reproduction & Health", listOf("Gametogenesis", "Menstrual Cycle", "Immunity"), TopicDifficulty.HIGH, ncertLinked = true),
                                    SyllabusTopicSeed("Biotechnology: Principles & Applications", listOf("PCR", "Recombinant DNA", "Bt Crops"), TopicDifficulty.MODERATE, ncertLinked = true)
                                )
                            )
                        )
                    )
                )
            )
        ),
        resources = listOf(
            ExamResource("NCERT Class XI & XII Textbooks", "Primary Syllabus", "https://ncert.nic.in/", "Core source for Biology, Inorganic Chemistry, and conceptual Physics"),
            ExamResource("NTA NEET Official Portal", "Official Notification", "https://neet.nta.nic.in/", "Check official information bulletin and syllabus notices")
        ),
        supportsNcertTracking = true,
        strategySummary = "NCERT line-by-line mastery, formula & diagram recall, timed OMR mocks, and strict negative-marking discipline (-1 penalty)."
    )

    val NEET_PG = ExamConfig(
        examId = "neet_pg",
        name = "NEET PG",
        shortName = "NEET PG",
        category = ExamCategory.MEDICAL,
        level = ExamLevel.POSTGRADUATE,
        applicableYear = 2026,
        syllabusVersion = "NBEMS-GMER-2026.1",
        patternStatus = PatternVerificationStatus.PROVISIONAL,
        authorityName = "National Board of Examinations in Medical Sciences (NBEMS)",
        officialNotificationUrl = "https://natboard.edu.in/",
        officialSyllabusUrl = "https://www.nmc.org.in/",
        markingScheme = MarkingScheme(
            positiveMarks = 4.0,
            negativeMarks = 1.0,
            hasNegativeMarking = true,
            totalQuestions = 200,
            maxMarks = 800.0,
            durationMinutes = 210,
            sectionalTimeLimits = listOf(
                SectionTimeLimit("Section A", 40, 42, 160.0),
                SectionTimeLimit("Section B", 40, 42, 160.0),
                SectionTimeLimit("Section C", 40, 42, 160.0),
                SectionTimeLimit("Section D", 40, 42, 160.0),
                SectionTimeLimit("Section E", 40, 42, 160.0)
            ),
            passCriteriaNote = "200 MCQs in 5 time-bound sections (42 min each). +4 correct, -1 incorrect."
        ),
        questionTypes = listOf(
            QuestionType.CASE_BASED_MCQ,
            QuestionType.IMAGE_BASED,
            QuestionType.MCQ
        ),
        revisionRule = RevisionRule(
            intervalsDays = listOf(1, 3, 7, 14, 30),
            recommendedMethods = listOf("MCQs", "Active Recall", "Case Studies", "Flashcards")
        ),
        subjects = listOf(
            SyllabusSubjectSeed(
                name = "Pre-clinical (Anatomy, Physiology, Biochemistry)",
                categoryGroup = "Pre-clinical",
                officialWeightagePercent = 22.0,
                weightageSource = WeightageSource.HISTORICAL_ANALYSIS,
                units = listOf(
                    SyllabusUnitSeed(
                        name = "Pre-clinical Foundation",
                        chapters = listOf(
                            SyllabusChapterSeed(
                                name = "Integrated Pre-clinical",
                                topics = listOf(
                                    SyllabusTopicSeed("Anatomy (Neuroanatomy, Embryology & Gross)", listOf("Brachial Plexus", "Cranial Nerves", "Pharyngeal Arches"), TopicDifficulty.HIGH),
                                    SyllabusTopicSeed("Physiology (CVS, Renal, CNS & Endocrine)", listOf("Cardiac Output", "Acid-Base Balance", "Endocrine Feedback"), TopicDifficulty.MODERATE),
                                    SyllabusTopicSeed("Biochemistry (Metabolism & Genetics)", listOf("Inborn Errors", "Vitamins", "Molecular Biology"), TopicDifficulty.MODERATE)
                                )
                            )
                        )
                    )
                )
            ),
            SyllabusSubjectSeed(
                name = "Para-clinical (Pathology, Pharmacology, Microbiology, FMT, PSM)",
                categoryGroup = "Para-clinical",
                officialWeightagePercent = 33.0,
                weightageSource = WeightageSource.HISTORICAL_ANALYSIS,
                units = listOf(
                    SyllabusUnitSeed(
                        name = "Para-clinical Core",
                        chapters = listOf(
                            SyllabusChapterSeed(
                                name = "Diagnostics & Therapeutics",
                                topics = listOf(
                                    SyllabusTopicSeed("Pathology (General, Hematology & Systemic)", listOf("Neoplasia", "Anemias", "Immunopathology"), TopicDifficulty.CRITICAL),
                                    SyllabusTopicSeed("Pharmacology (ANS, CVS, Antimicrobials, CNS)", listOf("Drug Mechanisms", "Adverse Effects", "Clinical Indications"), TopicDifficulty.CRITICAL),
                                    SyllabusTopicSeed("Microbiology (Bacteriology, Virology, Parasitology)", listOf("Culture Media", "Opportunistic Infections"), TopicDifficulty.HIGH),
                                    SyllabusTopicSeed("Community Medicine (PSM) & Forensic Medicine", listOf("Biostatistics", "Epidemiology", "National Health Programs", "Toxicology"), TopicDifficulty.HIGH)
                                )
                            )
                        )
                    )
                )
            ),
            SyllabusSubjectSeed(
                name = "Clinical (Medicine, Surgery, OBG, Pediatrics, Ortho, Ophthal, ENT, Psych, Derm, Radio, Anesth)",
                categoryGroup = "Clinical",
                officialWeightagePercent = 45.0,
                weightageSource = WeightageSource.HISTORICAL_ANALYSIS,
                units = listOf(
                    SyllabusUnitSeed(
                        name = "Major Clinical Specialties",
                        chapters = listOf(
                            SyllabusChapterSeed(
                                name = "High-Yield Clinical Integration",
                                topics = listOf(
                                    SyllabusTopicSeed("General Medicine & Pediatrics", listOf("ECG Vignettes", "Cardiology", "Neonatology", "Immunization"), TopicDifficulty.CRITICAL),
                                    SyllabusTopicSeed("General Surgery & Orthopedics", listOf("Trauma/ATLS", "GI Surgery", "Bone Tumors & Fractures"), TopicDifficulty.CRITICAL),
                                    SyllabusTopicSeed("Obstetrics & Gynecology", listOf("High-Risk Pregnancy", "Labor Management", "Gynec Oncology"), TopicDifficulty.CRITICAL),
                                    SyllabusTopicSeed("Short Subjects (Ophthal, ENT, Derm, Psych, Radio, Anesth)", listOf("Imaging Signs", "Fundus & Slit-Lamp", "Skin Lesions", "Airway Management"), TopicDifficulty.HIGH)
                                )
                            )
                        )
                    )
                )
            )
        ),
        resources = listOf(
            ExamResource("NBEMS Official Information Bulletin", "Official Notification", "https://natboard.edu.in/", "Time-bound section rules and MBBS GMER syllabus guidelines")
        ),
        supportsClinicalCaseTracking = true,
        strategySummary = "Clinical case-vignette solving, image-based recall, time-bound 42-minute section drills, grand tests, and incorrect-question reattempts."
    )

    val ALL: List<ExamConfig> = listOf(NEET_UG, NEET_PG)
}
