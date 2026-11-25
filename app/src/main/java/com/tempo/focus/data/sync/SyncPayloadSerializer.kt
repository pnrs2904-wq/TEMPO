package com.tempo.focus.data.sync

import com.tempo.focus.data.db.MockTestEntity
import com.tempo.focus.data.db.QuestionAttemptEntity
import com.tempo.focus.data.db.RevisionEventEntity
import com.tempo.focus.data.db.SessionEntity
import com.tempo.focus.data.db.SyncOutboxEntity
import com.tempo.focus.data.db.TopicProgressEntity
import com.tempo.focus.data.db.UserExamPlanEntity
import org.json.JSONObject

object SyncPayloadSerializer {

    fun sessionToOutbox(session: SessionEntity): SyncOutboxEntity {
        val json = JSONObject().apply {
            put("id", session.syncId)
            put("localId", session.id)
            put("timestamp", session.timestamp)
            put("phase", session.phase)
            put("energy", session.energy)
            put("subject", session.subject)
            put("sessionType", session.sessionType)
            put("plannedMinutes", session.plannedMinutes)
            put("actualSeconds", session.actualSeconds)
            put("status", session.status)
            if (session.focusQuality != null) put("focusQuality", session.focusQuality)
            if (session.difficulty != null) put("difficulty", session.difficulty)
            if (session.durationFeedback != null) put("durationFeedback", session.durationFeedback)
            if (session.distractions != null) put("distractions", session.distractions)
            if (session.notes != null) put("notes", session.notes)
            put("createdAt", session.createdAt)
            put("updatedAt", session.updatedAt)
            if (session.deletedAt != null) put("deletedAt", session.deletedAt) else put("deletedAt", JSONObject.NULL)
        }
        return SyncOutboxEntity(
            entityKey = "sessions:${session.syncId}",
            tableName = "sessions",
            recordId = session.syncId,
            payloadJson = json.toString(),
            updatedAt = session.updatedAt,
            deletedAt = session.deletedAt,
            status = "pending"
        )
    }

    fun examPlanToOutbox(plan: UserExamPlanEntity): SyncOutboxEntity {
        val json = JSONObject().apply {
            put("id", plan.id)
            put("examId", plan.examId)
            put("applicableYear", plan.applicableYear)
            put("syllabusVersion", plan.syllabusVersion)
            put("selectedCaGroup", plan.selectedCaGroup)
            if (plan.examDateEpochDay != null) put("examDateEpochDay", plan.examDateEpochDay) else put("examDateEpochDay", JSONObject.NULL)
            put("dailyHours", plan.dailyHours)
            put("studyDaysPerWeek", plan.studyDaysPerWeek)
            put("targetScorePercent", plan.targetScorePercent)
            put("updatedAt", plan.updatedAt)
            if (plan.deletedAt != null) put("deletedAt", plan.deletedAt) else put("deletedAt", JSONObject.NULL)
        }
        return SyncOutboxEntity(
            entityKey = "user_exam_plans:${plan.id}",
            tableName = "user_exam_plans",
            recordId = plan.id,
            payloadJson = json.toString(),
            updatedAt = plan.updatedAt,
            deletedAt = plan.deletedAt,
            status = "pending"
        )
    }

    fun topicToOutbox(topic: TopicProgressEntity): SyncOutboxEntity {
        val json = JSONObject().apply {
            put("id", topic.id)
            put("examId", topic.examId)
            put("syllabusVersion", topic.syllabusVersion)
            put("subject", topic.subject)
            put("unit", topic.unit)
            put("chapter", topic.chapter)
            put("topicName", topic.topicName)
            put("subtopics", topic.subtopics)
            put("status", topic.status)
            put("difficulty", topic.difficulty)
            put("ncertCompleted", topic.ncertCompleted)
            put("formulaRevisionDone", topic.formulaRevisionDone)
            put("diagramRevisionDone", topic.diagramRevisionDone)
            put("rtpMtpCompleted", topic.rtpMtpCompleted)
            put("revisionCount", topic.revisionCount)
            if (topic.lastStudiedEpochDay != null) put("lastStudiedEpochDay", topic.lastStudiedEpochDay) else put("lastStudiedEpochDay", JSONObject.NULL)
            if (topic.nextRevisionEpochDay != null) put("nextRevisionEpochDay", topic.nextRevisionEpochDay) else put("nextRevisionEpochDay", JSONObject.NULL)
            put("isCustom", topic.isCustom)
            put("updatedAt", topic.updatedAt)
            if (topic.deletedAt != null) put("deletedAt", topic.deletedAt) else put("deletedAt", JSONObject.NULL)
        }
        return SyncOutboxEntity(
            entityKey = "user_topic_progress:${topic.id}",
            tableName = "user_topic_progress",
            recordId = topic.id,
            payloadJson = json.toString(),
            updatedAt = topic.updatedAt,
            deletedAt = topic.deletedAt,
            status = "pending"
        )
    }

    fun revisionToOutbox(event: RevisionEventEntity): SyncOutboxEntity {
        val json = JSONObject().apply {
            put("id", event.id)
            put("examId", event.examId)
            put("topicId", event.topicId)
            put("topicName", event.topicName)
            put("subject", event.subject)
            put("revisionTimestamp", event.revisionTimestamp)
            put("revisionEpochDay", event.revisionEpochDay)
            put("revisionNumber", event.revisionNumber)
            put("recallRating", event.recallRating)
            if (event.accuracyPercent != null) put("accuracyPercent", event.accuracyPercent) else put("accuracyPercent", JSONObject.NULL)
            put("difficulty", event.difficulty)
            put("nextRevisionEpochDay", event.nextRevisionEpochDay)
            put("method", event.method)
            if (event.notes != null) put("notes", event.notes) else put("notes", JSONObject.NULL)
            put("updatedAt", event.updatedAt)
            if (event.deletedAt != null) put("deletedAt", event.deletedAt) else put("deletedAt", JSONObject.NULL)
        }
        return SyncOutboxEntity(
            entityKey = "revision_events:${event.id}",
            tableName = "revision_events",
            recordId = event.id,
            payloadJson = json.toString(),
            updatedAt = event.updatedAt,
            deletedAt = event.deletedAt,
            status = "pending"
        )
    }

    fun mockToOutbox(mock: MockTestEntity): SyncOutboxEntity {
        val json = JSONObject().apply {
            put("id", mock.id)
            put("examId", mock.examId)
            put("attemptYear", mock.attemptYear)
            put("mockName", mock.mockName)
            put("dateTimestamp", mock.dateTimestamp)
            put("totalQuestions", mock.totalQuestions)
            put("attemptedQuestions", mock.attemptedQuestions)
            put("correctAnswers", mock.correctAnswers)
            put("incorrectAnswers", mock.incorrectAnswers)
            put("unansweredQuestions", mock.unansweredQuestions)
            put("positiveMarksPerQ", mock.positiveMarksPerQ)
            put("negativeMarksPerQ", mock.negativeMarksPerQ)
            put("totalScore", mock.totalScore)
            put("maxMarks", mock.maxMarks)
            put("percentage", mock.percentage)
            put("accuracyPercent", mock.accuracyPercent)
            put("durationMinutes", mock.durationMinutes)
            put("avgSecondsPerQuestion", mock.avgSecondsPerQuestion)
            if (mock.weakestSubject != null) put("weakestSubject", mock.weakestSubject) else put("weakestSubject", JSONObject.NULL)
            if (mock.weakestSubjectAccuracy != null) put("weakestSubjectAccuracy", mock.weakestSubjectAccuracy) else put("weakestSubjectAccuracy", JSONObject.NULL)
            put("isQuickEntry", mock.isQuickEntry)
            if (mock.notes != null) put("notes", mock.notes) else put("notes", JSONObject.NULL)
            put("updatedAt", mock.updatedAt)
            if (mock.deletedAt != null) put("deletedAt", mock.deletedAt) else put("deletedAt", JSONObject.NULL)
        }
        return SyncOutboxEntity(
            entityKey = "mock_tests:${mock.id}",
            tableName = "mock_tests",
            recordId = mock.id,
            payloadJson = json.toString(),
            updatedAt = mock.updatedAt,
            deletedAt = mock.deletedAt,
            status = "pending"
        )
    }

    fun questionAttemptToOutbox(attempt: QuestionAttemptEntity): SyncOutboxEntity {
        val json = JSONObject().apply {
            put("id", attempt.id)
            put("mockTestId", attempt.mockTestId)
            put("examId", attempt.examId)
            put("questionNumber", attempt.questionNumber)
            put("subject", attempt.subject)
            put("topicName", attempt.topicName)
            put("difficulty", attempt.difficulty)
            if (attempt.selectedAnswer != null) put("selectedAnswer", attempt.selectedAnswer) else put("selectedAnswer", JSONObject.NULL)
            put("correctAnswer", attempt.correctAnswer)
            put("isCorrect", attempt.isCorrect)
            put("timeSpentSeconds", attempt.timeSpentSeconds)
            if (attempt.errorCategory != null) put("errorCategory", attempt.errorCategory) else put("errorCategory", JSONObject.NULL)
            put("updatedAt", attempt.updatedAt)
            if (attempt.deletedAt != null) put("deletedAt", attempt.deletedAt) else put("deletedAt", JSONObject.NULL)
        }
        return SyncOutboxEntity(
            entityKey = "question_attempts:${attempt.id}",
            tableName = "question_attempts",
            recordId = attempt.id,
            payloadJson = json.toString(),
            updatedAt = attempt.updatedAt,
            deletedAt = attempt.deletedAt,
            status = "pending"
        )
    }
}
