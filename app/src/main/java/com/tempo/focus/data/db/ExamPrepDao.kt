package com.tempo.focus.data.db

import androidx.room.Dao
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.Query
import androidx.room.Update
import kotlinx.coroutines.flow.Flow

@Dao
interface ExamPrepDao {

    // Exam Plans
    @Query("SELECT * FROM user_exam_plans WHERE examId = :examId AND deletedAt IS NULL LIMIT 1")
    fun observeExamPlan(examId: String): Flow<UserExamPlanEntity?>

    @Query("SELECT * FROM user_exam_plans WHERE examId = :examId AND deletedAt IS NULL LIMIT 1")
    suspend fun getExamPlan(examId: String): UserExamPlanEntity?

    @Query("SELECT * FROM user_exam_plans WHERE id = :id LIMIT 1")
    suspend fun getExamPlanById(id: String): UserExamPlanEntity?

    @Query("SELECT * FROM user_exam_plans WHERE deletedAt IS NULL")
    suspend fun getAllExamPlans(): List<UserExamPlanEntity>

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun upsertExamPlan(plan: UserExamPlanEntity)

    // Syllabus & Topic Progress (Strictly exam-scoped)
    @Query("SELECT * FROM user_topic_progress WHERE examId = :examId AND deletedAt IS NULL ORDER BY subject ASC, unit ASC, chapter ASC, topicName ASC")
    fun observeTopicsForExam(examId: String): Flow<List<TopicProgressEntity>>

    @Query("SELECT * FROM user_topic_progress WHERE examId = :examId AND deletedAt IS NULL")
    suspend fun getTopicsForExam(examId: String): List<TopicProgressEntity>

    @Query("SELECT * FROM user_topic_progress WHERE deletedAt IS NULL")
    suspend fun getAllTopics(): List<TopicProgressEntity>

    @Query("SELECT COUNT(*) FROM user_topic_progress WHERE examId = :examId AND deletedAt IS NULL")
    suspend fun countTopicsForExam(examId: String): Int

    @Query("SELECT * FROM user_topic_progress WHERE id = :topicId LIMIT 1")
    suspend fun getTopicById(topicId: String): TopicProgressEntity?

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertTopics(topics: List<TopicProgressEntity>)

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertTopic(topic: TopicProgressEntity)

    @Update
    suspend fun updateTopic(topic: TopicProgressEntity)

    @Query("UPDATE user_topic_progress SET deletedAt = :deletedAt, updatedAt = :deletedAt WHERE id = :topicId")
    suspend fun softDeleteTopicById(topicId: String, deletedAt: Long = System.currentTimeMillis())

    @Query("DELETE FROM user_topic_progress WHERE id = :topicId")
    suspend fun deleteTopicById(topicId: String)

    // Revision Events (Chronological history + same-day duplicate prevention)
    @Query("SELECT * FROM revision_events WHERE examId = :examId AND deletedAt IS NULL ORDER BY revisionTimestamp DESC")
    fun observeRevisionsForExam(examId: String): Flow<List<RevisionEventEntity>>

    @Query("SELECT * FROM revision_events WHERE deletedAt IS NULL ORDER BY revisionTimestamp DESC")
    suspend fun getAllRevisions(): List<RevisionEventEntity>

    @Query("SELECT * FROM revision_events WHERE id = :id LIMIT 1")
    suspend fun getRevisionById(id: String): RevisionEventEntity?

    @Query("SELECT * FROM revision_events WHERE topicId = :topicId AND deletedAt IS NULL ORDER BY revisionTimestamp DESC")
    suspend fun getRevisionsForTopic(topicId: String): List<RevisionEventEntity>

    @Query("SELECT COUNT(*) FROM revision_events WHERE topicId = :topicId AND revisionEpochDay = :epochDay AND deletedAt IS NULL")
    suspend fun countRevisionsOnDay(topicId: String, epochDay: Long): Int

    @Insert(onConflict = OnConflictStrategy.IGNORE)
    suspend fun insertRevisionEvent(event: RevisionEventEntity): Long

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun upsertRevisionEvent(event: RevisionEventEntity)

    // Mock Tests & Question-Level Attempts
    @Query("SELECT * FROM mock_tests WHERE examId = :examId AND deletedAt IS NULL ORDER BY dateTimestamp DESC")
    fun observeMocksForExam(examId: String): Flow<List<MockTestEntity>>

    @Query("SELECT * FROM mock_tests WHERE examId = :examId AND deletedAt IS NULL ORDER BY dateTimestamp DESC")
    suspend fun getMocksForExam(examId: String): List<MockTestEntity>

    @Query("SELECT * FROM mock_tests WHERE deletedAt IS NULL ORDER BY dateTimestamp DESC")
    suspend fun getAllMocks(): List<MockTestEntity>

    @Query("SELECT * FROM mock_tests WHERE id = :mockId LIMIT 1")
    suspend fun getMockById(mockId: String): MockTestEntity?

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertMockTest(mockTest: MockTestEntity)

    @Query("UPDATE mock_tests SET deletedAt = :deletedAt, updatedAt = :deletedAt WHERE id = :mockId")
    suspend fun softDeleteMockById(mockId: String, deletedAt: Long = System.currentTimeMillis())

    @Query("DELETE FROM mock_tests WHERE id = :mockId")
    suspend fun deleteMockById(mockId: String)

    @Query("SELECT * FROM question_attempts WHERE examId = :examId AND deletedAt IS NULL ORDER BY questionNumber ASC")
    fun observeQuestionAttemptsForExam(examId: String): Flow<List<QuestionAttemptEntity>>

    @Query("SELECT * FROM question_attempts WHERE mockTestId = :mockTestId AND deletedAt IS NULL ORDER BY questionNumber ASC")
    suspend fun getQuestionAttemptsForMock(mockTestId: String): List<QuestionAttemptEntity>

    @Query("SELECT * FROM question_attempts WHERE deletedAt IS NULL")
    suspend fun getAllQuestionAttempts(): List<QuestionAttemptEntity>

    @Query("SELECT * FROM question_attempts WHERE id = :id LIMIT 1")
    suspend fun getQuestionAttemptById(id: String): QuestionAttemptEntity?

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertQuestionAttempts(attempts: List<QuestionAttemptEntity>)

    // Full clear (only on explicit user-confirmed data reset)
    @Query("DELETE FROM question_attempts")
    suspend fun clearAllQuestionAttempts()

    @Query("DELETE FROM mock_tests")
    suspend fun clearAllMocks()

    @Query("DELETE FROM revision_events")
    suspend fun clearAllRevisions()

    @Query("DELETE FROM user_topic_progress")
    suspend fun clearAllTopics()

    @Query("DELETE FROM user_exam_plans")
    suspend fun clearAllExamPlans()
}
