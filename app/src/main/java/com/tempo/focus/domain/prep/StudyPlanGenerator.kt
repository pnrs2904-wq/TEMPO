package com.tempo.focus.domain.prep

import com.tempo.focus.domain.exams.ExamConfig
import com.tempo.focus.domain.exams.TopicDifficulty
import com.tempo.focus.domain.exams.TopicStatus
import com.tempo.focus.domain.exams.WeightageSource
import java.time.DayOfWeek
import java.time.LocalDate
import java.time.temporal.ChronoUnit
import kotlin.math.roundToInt

data class TopicPlanInput(
    val topicId: String,
    val subject: String,
    val topicName: String,
    val status: TopicStatus,
    val difficulty: TopicDifficulty,
    val nextRevisionEpochDay: Long?
)

data class SubjectAllocation(
    val subject: String,
    val allocatedMinutesPerWeek: Int,
    val sharePercent: Double,
    val remainingTopics: Int,
    val weakSubjectBoostApplied: Boolean,
    val weightageSource: WeightageSource,
    val rationale: String
)

data class DailyPlanItem(
    val subject: String,
    val topicName: String,
    val taskType: String, // "Syllabus Study", "Revision", "Mock Practice", "Backlog Recovery"
    val allocatedMinutes: Int,
    val weightageSource: WeightageSource,
    val isBacklogRecovery: Boolean = false
)

data class WeeklyDaySchedule(
    val dayOfWeek: DayOfWeek,
    val date: LocalDate,
    val totalMinutes: Int,
    val tasks: List<DailyPlanItem>
)

data class MonthlyMilestone(
    val monthLabel: String,
    val targetTopicsToComplete: Int,
    val recommendedMocks: Int,
    val focusDirective: String
)

data class AdaptiveStudyPlan(
    val examId: String,
    val examName: String,
    val daysUntilExam: Long?,
    val dailyTargetMinutes: Int,
    val studyDaysPerWeek: Int,
    val subjectAllocations: List<SubjectAllocation>,
    val todayTasks: List<DailyPlanItem>,
    val weeklySchedule: List<WeeklyDaySchedule>,
    val monthlyMilestones: List<MonthlyMilestone>,
    val revisionBacklogCount: Int,
    val backlogRecoveryMinutesPerDay: Int,
    val nextRecommendedMockDay: String
)

object StudyPlanGenerator {

    fun generatePlan(
        exam: ExamConfig,
        topics: List<TopicPlanInput>,
        today: LocalDate,
        examDate: LocalDate?,
        dailyAvailableHours: Double,
        studyDaysPerWeek: Int,
        subjectMockAccuracies: Map<String, Double> = emptyMap(),
        missedMinutesRecently: Int = 0
    ): AdaptiveStudyPlan {
        val safeDailyMinutes = (dailyAvailableHours.coerceIn(0.5, 14.0) * 60.0).roundToInt()
        val safeStudyDays = studyDaysPerWeek.coerceIn(1, 7)
        val weeklyBudgetMinutes = safeDailyMinutes * safeStudyDays
        val daysLeft = examDate?.let { ChronoUnit.DAYS.between(today, it).coerceAtLeast(0L) }
        val todayEpoch = today.toEpochDay()

        val overdueRevisions = topics.filter {
            it.nextRevisionEpochDay != null && it.nextRevisionEpochDay <= todayEpoch
        }
        val revisionBacklogCount = overdueRevisions.size

        // Reserve 20%-35% for revision/backlog recovery if backlog exists or exam is within 30 days
        val revisionRatio = when {
            revisionBacklogCount >= 5 || (daysLeft != null && daysLeft <= 21) -> 0.35
            revisionBacklogCount > 0 -> 0.25
            else -> 0.15
        }
        val backlogRecoveryPerDay = if (missedMinutesRecently > 0 || revisionBacklogCount > 0) {
            minOf((safeDailyMinutes * 0.25).roundToInt(), (missedMinutesRecently / 3) + (revisionBacklogCount * 10)).coerceAtLeast(15)
        } else {
            0
        }

        // Compute weighted subject priorities (never naive equal split)
        val groupedBySubject = topics.groupBy { it.subject }
        val seedMap = exam.subjects.associateBy { it.name }
        val allSubjects = (groupedBySubject.keys + seedMap.keys).distinct()

        data class RawWeight(
            val subject: String,
            val score: Double,
            val remaining: Int,
            val weakBoost: Boolean,
            val source: WeightageSource,
            val rationale: String
        )

        val rawWeights = allSubjects.map { subject ->
            val subjectTopics = groupedBySubject[subject].orEmpty()
            val remainingTopics = subjectTopics.filter {
                it.status != TopicStatus.COMPLETED && it.status != TopicStatus.MASTERED
            }
            val seed = seedMap[subject]
            val baseWeight = seed?.officialWeightagePercent ?: (100.0 / allSubjects.size.coerceAtLeast(1))
            val source = seed?.weightageSource ?: WeightageSource.ALGORITHMIC_RECOMMENDATION

            // Remaining syllabus load & difficulty factor
            val difficultyLoad = remainingTopics.sumOf { it.difficulty.weightMultiplier }
                .coerceAtLeast(if (remainingTopics.isEmpty()) 0.35 else 1.0)

            // Diagnostic mock accuracy weakness boost
            val accuracy = subjectMockAccuracies[subject]
            val weakBoost = accuracy != null && accuracy < 65.0
            val weaknessMultiplier = when {
                accuracy == null -> 1.0
                accuracy < 50.0 -> 1.45
                accuracy < 65.0 -> 1.25
                accuracy >= 85.0 -> 0.85
                else -> 1.0
            }

            // Revision pressure in this subject
            val subjectRevisionsDue = subjectTopics.count {
                it.nextRevisionEpochDay != null && it.nextRevisionEpochDay <= todayEpoch
            }
            val revisionMultiplier = 1.0 + (subjectRevisionsDue * 0.12).coerceAtMost(0.45)

            val composite = (baseWeight * 0.6 + difficultyLoad * 8.0) * weaknessMultiplier * revisionMultiplier
            val effectiveSource = if (weakBoost || subjectRevisionsDue > 0) {
                WeightageSource.ALGORITHMIC_RECOMMENDATION
            } else {
                source
            }

            val reasons = buildList {
                if (seed?.officialWeightagePercent != null) {
                    add("${seed.officialWeightagePercent.roundToInt()}% ${seed.weightageSource.label.lowercase()}")
                }
                if (remainingTopics.isNotEmpty()) {
                    add("${remainingTopics.size} pending")
                }
                if (weakBoost && accuracy != null) {
                    add("boosted (mock accuracy ${accuracy.roundToInt()}%)")
                }
                if (subjectRevisionsDue > 0) {
                    add("$subjectRevisionsDue revision due")
                }
            }

            RawWeight(
                subject = subject,
                score = composite.coerceAtLeast(1.0),
                remaining = remainingTopics.size,
                weakBoost = weakBoost,
                source = effectiveSource,
                rationale = reasons.joinToString(" • ").ifBlank { "Balanced maintenance allocation" }
            )
        }

        val totalWeight = rawWeights.sumOf { it.score }.coerceAtLeast(1.0)
        val studyMinutesPool = (weeklyBudgetMinutes * (1.0 - revisionRatio)).roundToInt().coerceAtLeast(30)

        val allocations = rawWeights.map { rw ->
            val share = (rw.score / totalWeight) * 100.0
            val minutes = ((rw.score / totalWeight) * studyMinutesPool).roundToInt().coerceAtLeast(15)
            SubjectAllocation(
                subject = rw.subject,
                allocatedMinutesPerWeek = minutes,
                sharePercent = (share * 10.0).roundToInt() / 10.0,
                remainingTopics = rw.remaining,
                weakSubjectBoostApplied = rw.weakBoost,
                weightageSource = rw.source,
                rationale = rw.rationale
            )
        }.sortedByDescending { it.allocatedMinutesPerWeek }

        // Build daily & 7-day timetable
        val weeklySchedule = (0 until 7).map { offset ->
            val date = today.plusDays(offset.toLong())
            val isRestDay = offset >= safeStudyDays
            if (isRestDay) {
                WeeklyDaySchedule(
                    dayOfWeek = date.dayOfWeek,
                    date = date,
                    totalMinutes = 0,
                    tasks = emptyList()
                )
            } else {
                val tasks = mutableListOf<DailyPlanItem>()
                var remainingDayMin = safeDailyMinutes

                // 1. Backlog recovery / overdue revision slot
                if (offset == 0 && overdueRevisions.isNotEmpty()) {
                    val revTopic = overdueRevisions.first()
                    val revMin = minOf(remainingDayMin, backlogRecoveryPerDay.coerceAtLeast(25))
                    tasks.add(
                        DailyPlanItem(
                            subject = revTopic.subject,
                            topicName = revTopic.topicName,
                            taskType = if (missedMinutesRecently > 0) "Backlog Recovery" else "Revision",
                            allocatedMinutes = revMin,
                            weightageSource = WeightageSource.ALGORITHMIC_RECOMMENDATION,
                            isBacklogRecovery = true
                        )
                    )
                    remainingDayMin -= revMin
                } else if (overdueRevisions.size > offset) {
                    val revTopic = overdueRevisions[offset]
                    val revMin = minOf(remainingDayMin, 30)
                    tasks.add(
                        DailyPlanItem(
                            subject = revTopic.subject,
                            topicName = revTopic.topicName,
                            taskType = "Revision",
                            allocatedMinutes = revMin,
                            weightageSource = WeightageSource.ALGORITHMIC_RECOMMENDATION,
                            isBacklogRecovery = false
                        )
                    )
                    remainingDayMin -= revMin
                }

                // 2. Weekly Mock Test slot on the final study day
                if (offset == safeStudyDays - 1 && remainingDayMin >= 60) {
                    val mockDuration = minOf(remainingDayMin, exam.markingScheme.durationMinutes)
                    tasks.add(
                        DailyPlanItem(
                            subject = exam.shortName,
                            topicName = "Timed Mock & Error Analysis",
                            taskType = "Mock Practice",
                            allocatedMinutes = mockDuration,
                            weightageSource = WeightageSource.OFFICIAL_NOTIFICATION
                        )
                    )
                    remainingDayMin -= mockDuration
                }

                // 3. Fill remaining time with top weighted subjects (rotating cleanly across days)
                if (allocations.isNotEmpty() && remainingDayMin >= 20) {
                    val primaryAlloc = allocations[offset % allocations.size]
                    val secondaryAlloc = allocations[(offset + 1) % allocations.size]

                    val primaryMin = if (secondaryAlloc.subject != primaryAlloc.subject && remainingDayMin >= 50) {
                        (remainingDayMin * 0.6).roundToInt()
                    } else {
                        remainingDayMin
                    }

                    val primaryTopic = groupedBySubject[primaryAlloc.subject]
                        ?.firstOrNull { it.status != TopicStatus.MASTERED && it.status != TopicStatus.COMPLETED }
                        ?.topicName ?: "Core ${primaryAlloc.subject} Practice"

                    tasks.add(
                        DailyPlanItem(
                            subject = primaryAlloc.subject,
                            topicName = primaryTopic,
                            taskType = "Syllabus Study",
                            allocatedMinutes = primaryMin,
                            weightageSource = primaryAlloc.weightageSource
                        )
                    )
                    remainingDayMin -= primaryMin

                    if (secondaryAlloc.subject != primaryAlloc.subject && remainingDayMin >= 15) {
                        val secondaryTopic = groupedBySubject[secondaryAlloc.subject]
                            ?.firstOrNull { it.status != TopicStatus.MASTERED && it.status != TopicStatus.COMPLETED }
                            ?.topicName ?: "Core ${secondaryAlloc.subject} Drills"

                        tasks.add(
                            DailyPlanItem(
                                subject = secondaryAlloc.subject,
                                topicName = secondaryTopic,
                                taskType = "Syllabus Study",
                                allocatedMinutes = remainingDayMin,
                                weightageSource = secondaryAlloc.weightageSource
                            )
                        )
                    }
                }

                WeeklyDaySchedule(
                    dayOfWeek = date.dayOfWeek,
                    date = date,
                    totalMinutes = tasks.sumOf { it.allocatedMinutes },
                    tasks = tasks
                )
            }
        }

        // Monthly milestones (up to 3 upcoming phases)
        val totalRemaining = topics.count { it.status != TopicStatus.COMPLETED && it.status != TopicStatus.MASTERED }
        val monthsHorizon = when {
            daysLeft == null -> 3
            daysLeft <= 30 -> 1
            daysLeft <= 60 -> 2
            else -> 3
        }
        val monthlyMilestones = (1..monthsHorizon).map { m ->
            val topicsTarget = if (monthsHorizon == 1) totalRemaining else ((totalRemaining.toDouble() / monthsHorizon).roundToInt()).coerceAtLeast(1)
            val mocksCount = when {
                daysLeft != null && daysLeft <= 35 -> 8
                m == monthsHorizon -> 6
                else -> 4
            }
            val directive = when {
                m == 1 && revisionBacklogCount > 0 -> "Clear $revisionBacklogCount overdue revisions & prioritize weakest subjects"
                m == monthsHorizon -> "Full-length timed mocks, error-log elimination & rapid revision cycles"
                else -> "Steady syllabus completion with spaced active-recall checkpoints"
            }
            MonthlyMilestone(
                monthLabel = "Phase $m (Days ${(m - 1) * 30 + 1}–${m * 30})",
                targetTopicsToComplete = topicsTarget,
                recommendedMocks = mocksCount,
                focusDirective = directive
            )
        }

        val mockDayLabel = weeklySchedule
            .firstOrNull { day -> day.tasks.any { it.taskType == "Mock Practice" } }
            ?.dayOfWeek?.name?.lowercase()?.replaceFirstChar { it.uppercase() }
            ?: "Sunday"

        return AdaptiveStudyPlan(
            examId = exam.examId,
            examName = exam.name,
            daysUntilExam = daysLeft,
            dailyTargetMinutes = safeDailyMinutes,
            studyDaysPerWeek = safeStudyDays,
            subjectAllocations = allocations,
            todayTasks = weeklySchedule.firstOrNull()?.tasks.orEmpty(),
            weeklySchedule = weeklySchedule,
            monthlyMilestones = monthlyMilestones,
            revisionBacklogCount = revisionBacklogCount,
            backlogRecoveryMinutesPerDay = backlogRecoveryPerDay,
            nextRecommendedMockDay = mockDayLabel
        )
    }
}
