package com.tempo.focus.data.db

import androidx.room.Entity
import androidx.room.ForeignKey
import androidx.room.Index
import androidx.room.PrimaryKey
import java.util.UUID

@Entity(
    tableName = "user_exam_plans",
    indices = [
        Index(value = ["examId"], unique = true)
    ]
)
data class UserExamPlanEntity(
    @PrimaryKey
    val id: String = UUID.randomUUID().toString(),
    val examId: String,
    val applicableYear: Int,
    val syllabusVersion: String,
    val selectedCaGroup: String = "both", // group_1, group_2, both
    val examDateEpochDay: Long? = null,
    val dailyHours: Double = 4.0,
    val studyDaysPerWeek: Int = 6,
    val targetScorePercent: Int = 75,
    val updatedAt: Long = System.currentTimeMillis(),
    val deletedAt: Long? = null
)

@Entity(
    tableName = "user_topic_progress",
    indices = [
        Index(value = ["examId"]),
        Index(value = ["examId", "subject"]),
        Index(value = ["examId", "nextRevisionEpochDay"])
    ]
)
data class TopicProgressEntity(
    @PrimaryKey
    val id: String = UUID.randomUUID().toString(),
    val examId: String,
    val syllabusVersion: String,
    val subject: String,
    val unit: String,
    val chapter: String,
    val topicName: String,
    val subtopics: String = "", // comma-separated subtopics
    val status: String = "not_started", // not_started, learning, practising, completed, revision_due, mastered
    val difficulty: String = "moderate", // foundational, moderate, high, critical
    val ncertCompleted: Boolean = false,
    val formulaRevisionDone: Boolean = false,
    val diagramRevisionDone: Boolean = false,
    val rtpMtpCompleted: Boolean = false,
    val revisionCount: Int = 0,
    val lastStudiedEpochDay: Long? = null,
    val nextRevisionEpochDay: Long? = null,
    val isCustom: Boolean = false,
    val updatedAt: Long = System.currentTimeMillis(),
    val deletedAt: Long? = null
)

@Entity(
    tableName = "revision_events",
    foreignKeys = [
        ForeignKey(
            entity = TopicProgressEntity::class,
            parentColumns = ["id"],
            childColumns = ["topicId"],
            onDelete = ForeignKey.CASCADE
        )
    ],
    indices = [
        Index(value = ["examId"]),
        Index(value = ["topicId"]),
        Index(value = ["topicId", "revisionEpochDay"], unique = true)
    ]
)
data class RevisionEventEntity(
    @PrimaryKey
    val id: String = UUID.randomUUID().toString(),
    val examId: String,
    val topicId: String,
    val topicName: String,
    val subject: String,
    val revisionTimestamp: Long = System.currentTimeMillis(),
    val revisionEpochDay: Long,
    val revisionNumber: Int,
    val recallRating: Int, // 1..5
    val accuracyPercent: Int? = null, // 0..100
    val difficulty: Int = 3, // 1..5
    val nextRevisionEpochDay: Long,
    val method: String = "active_recall",
    val notes: String? = null,
    val updatedAt: Long = System.currentTimeMillis(),
    val deletedAt: Long? = null
)

@Entity(
    tableName = "mock_tests",
    indices = [
        Index(value = ["examId"]),
        Index(value = ["examId", "dateTimestamp"])
    ]
)
data class MockTestEntity(
    @PrimaryKey
    val id: String = UUID.randomUUID().toString(),
    val examId: String,
    val attemptYear: Int,
    val mockName: String,
    val dateTimestamp: Long = System.currentTimeMillis(),
    val totalQuestions: Int,
    val attemptedQuestions: Int,
    val correctAnswers: Int,
    val incorrectAnswers: Int,
    val unansweredQuestions: Int,
    val positiveMarksPerQ: Double,
    val negativeMarksPerQ: Double,
    val totalScore: Double,
    val maxMarks: Double,
    val percentage: Double,
    val accuracyPercent: Double,
    val durationMinutes: Int,
    val avgSecondsPerQuestion: Double = 0.0,
    val weakestSubject: String? = null,
    val weakestSubjectAccuracy: Double? = null,
    val isQuickEntry: Boolean = true,
    val notes: String? = null,
    val updatedAt: Long = System.currentTimeMillis(),
    val deletedAt: Long? = null
)

@Entity(
    tableName = "question_attempts",
    foreignKeys = [
        ForeignKey(
            entity = MockTestEntity::class,
            parentColumns = ["id"],
            childColumns = ["mockTestId"],
            onDelete = ForeignKey.CASCADE
        )
    ],
    indices = [
        Index(value = ["mockTestId"]),
        Index(value = ["examId", "subject"])
    ]
)
data class QuestionAttemptEntity(
    @PrimaryKey
    val id: String = UUID.randomUUID().toString(),
    val mockTestId: String,
    val examId: String,
    val questionNumber: Int,
    val subject: String,
    val topicName: String,
    val difficulty: String = "moderate",
    val selectedAnswer: String?,
    val correctAnswer: String,
    val isCorrect: Boolean,
    val timeSpentSeconds: Int = 60,
    val errorCategory: String? = null,
    val updatedAt: Long = System.currentTimeMillis(),
    val deletedAt: Long? = null
)
