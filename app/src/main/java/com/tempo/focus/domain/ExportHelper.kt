package com.tempo.focus.domain

import android.content.Context
import android.content.Intent
import com.tempo.focus.data.db.MockTestEntity
import com.tempo.focus.data.db.RevisionEventEntity
import com.tempo.focus.data.db.SessionEntity
import com.tempo.focus.data.db.TopicProgressEntity
import com.tempo.focus.data.db.UserExamPlanEntity
import java.text.SimpleDateFormat
import java.util.Date
import java.util.Locale

object ExportHelper {

    private fun formatIsoDate(timestamp: Long): String {
        val df = SimpleDateFormat("yyyy-MM-dd'T'HH:mm:ssXXX", Locale.US)
        return df.format(Date(timestamp))
    }

    fun generateJson(sessions: List<SessionEntity>): String {
        val sb = StringBuilder()
        sb.append("[\n")
        sessions.forEachIndexed { index, s ->
            sb.append("  {\n")
            sb.append("    \"id\": ${s.id},\n")
            sb.append("    \"syncId\": \"${escapeJson(s.syncId)}\",\n")
            sb.append("    \"timestamp\": ${s.timestamp},\n")
            sb.append("    \"isoDate\": \"${formatIsoDate(s.timestamp)}\",\n")
            sb.append("    \"phase\": \"${escapeJson(s.phase)}\",\n")
            sb.append("    \"energy\": ${s.energy},\n")
            sb.append("    \"subject\": \"${escapeJson(s.subject)}\",\n")
            sb.append("    \"sessionType\": \"${escapeJson(s.sessionType)}\",\n")
            sb.append("    \"plannedMinutes\": ${s.plannedMinutes},\n")
            sb.append("    \"actualSeconds\": ${s.actualSeconds},\n")
            sb.append("    \"status\": \"${escapeJson(s.status)}\",\n")
            sb.append("    \"focusQuality\": ${s.focusQuality ?: "null"},\n")
            sb.append("    \"difficulty\": ${s.difficulty ?: "null"},\n")
            sb.append("    \"durationFeedback\": ${s.durationFeedback?.let { "\"${escapeJson(it)}\"" } ?: "null"},\n")
            sb.append("    \"distractions\": ${s.distractions ?: "null"},\n")
            sb.append("    \"notes\": ${s.notes?.let { "\"${escapeJson(it)}\"" } ?: "null"}\n")
            sb.append("  }")
            if (index < sessions.size - 1) sb.append(",")
            sb.append("\n")
        }
        sb.append("]")
        return sb.toString()
    }

    fun generateFullJson(
        sessions: List<SessionEntity>,
        examPlans: List<UserExamPlanEntity>,
        topics: List<TopicProgressEntity>,
        revisions: List<RevisionEventEntity>,
        mocks: List<MockTestEntity>
    ): String {
        val sb = StringBuilder()
        sb.append("{\n")
        sb.append("  \"schemaVersion\": 4,\n")
        sb.append("  \"exportedAt\": \"${formatIsoDate(System.currentTimeMillis())}\",\n")
        sb.append("  \"sessions\": ").append(generateJson(sessions).replace("\n", "\n  ")).append(",\n")

        sb.append("  \"examPlans\": [\n")
        examPlans.forEachIndexed { i, p ->
            sb.append("    {\"id\":\"${escapeJson(p.id)}\",\"examId\":\"${escapeJson(p.examId)}\",\"applicableYear\":${p.applicableYear},\"syllabusVersion\":\"${escapeJson(p.syllabusVersion)}\",\"selectedCaGroup\":\"${escapeJson(p.selectedCaGroup)}\",\"examDateEpochDay\":${p.examDateEpochDay ?: "null"},\"dailyHours\":${p.dailyHours},\"studyDaysPerWeek\":${p.studyDaysPerWeek},\"targetScorePercent\":${p.targetScorePercent},\"updatedAt\":${p.updatedAt}}")
            if (i < examPlans.size - 1) sb.append(",")
            sb.append("\n")
        }
        sb.append("  ],\n")

        sb.append("  \"topics\": [\n")
        topics.forEachIndexed { i, t ->
            sb.append("    {\"id\":\"${escapeJson(t.id)}\",\"examId\":\"${escapeJson(t.examId)}\",\"subject\":\"${escapeJson(t.subject)}\",\"unit\":\"${escapeJson(t.unit)}\",\"chapter\":\"${escapeJson(t.chapter)}\",\"topicName\":\"${escapeJson(t.topicName)}\",\"status\":\"${escapeJson(t.status)}\",\"difficulty\":\"${escapeJson(t.difficulty)}\",\"revisionCount\":${t.revisionCount},\"lastStudiedEpochDay\":${t.lastStudiedEpochDay ?: "null"},\"nextRevisionEpochDay\":${t.nextRevisionEpochDay ?: "null"},\"isCustom\":${t.isCustom}}")
            if (i < topics.size - 1) sb.append(",")
            sb.append("\n")
        }
        sb.append("  ],\n")

        sb.append("  \"revisions\": [\n")
        revisions.forEachIndexed { i, r ->
            sb.append("    {\"id\":\"${escapeJson(r.id)}\",\"examId\":\"${escapeJson(r.examId)}\",\"topicId\":\"${escapeJson(r.topicId)}\",\"topicName\":\"${escapeJson(r.topicName)}\",\"subject\":\"${escapeJson(r.subject)}\",\"revisionEpochDay\":${r.revisionEpochDay},\"revisionNumber\":${r.revisionNumber},\"recallRating\":${r.recallRating},\"accuracyPercent\":${r.accuracyPercent ?: "null"},\"difficulty\":${r.difficulty},\"nextRevisionEpochDay\":${r.nextRevisionEpochDay},\"method\":\"${escapeJson(r.method)}\"}")
            if (i < revisions.size - 1) sb.append(",")
            sb.append("\n")
        }
        sb.append("  ],\n")

        sb.append("  \"mocks\": [\n")
        mocks.forEachIndexed { i, m ->
            sb.append("    {\"id\":\"${escapeJson(m.id)}\",\"examId\":\"${escapeJson(m.examId)}\",\"mockName\":\"${escapeJson(m.mockName)}\",\"dateTimestamp\":${m.dateTimestamp},\"totalQuestions\":${m.totalQuestions},\"correctAnswers\":${m.correctAnswers},\"incorrectAnswers\":${m.incorrectAnswers},\"totalScore\":${m.totalScore},\"maxMarks\":${m.maxMarks},\"percentage\":${m.percentage},\"accuracyPercent\":${m.accuracyPercent},\"durationMinutes\":${m.durationMinutes}}")
            if (i < mocks.size - 1) sb.append(",")
            sb.append("\n")
        }
        sb.append("  ]\n")
        sb.append("}")
        return sb.toString()
    }

    fun generateCsv(sessions: List<SessionEntity>): String {
        val sb = StringBuilder()
        sb.append("id,timestamp,iso_date,phase,energy,subject,session_type,planned_minutes,actual_seconds,status,focus_quality,difficulty,duration_feedback,distractions,notes\n")
        sessions.forEach { s ->
            sb.append(s.id).append(",")
            sb.append(s.timestamp).append(",")
            sb.append(formatIsoDate(s.timestamp)).append(",")
            sb.append(escapeCsv(s.phase)).append(",")
            sb.append(s.energy).append(",")
            sb.append(escapeCsv(s.subject)).append(",")
            sb.append(escapeCsv(s.sessionType)).append(",")
            sb.append(s.plannedMinutes).append(",")
            sb.append(s.actualSeconds).append(",")
            sb.append(escapeCsv(s.status)).append(",")
            sb.append(s.focusQuality?.toString() ?: "").append(",")
            sb.append(s.difficulty?.toString() ?: "").append(",")
            sb.append(escapeCsv(s.durationFeedback ?: "")).append(",")
            sb.append(s.distractions?.toString() ?: "").append(",")
            sb.append(escapeCsv(s.notes ?: "")).append("\n")
        }
        return sb.toString()
    }

    fun generateFullCsv(
        sessions: List<SessionEntity>,
        topics: List<TopicProgressEntity>,
        revisions: List<RevisionEventEntity>,
        mocks: List<MockTestEntity>
    ): String {
        val sb = StringBuilder()
        sb.append("# SESSIONS\n")
        sb.append(generateCsv(sessions))
        sb.append("\n# SYLLABUS_TOPICS\n")
        sb.append("id,exam_id,subject,unit,chapter,topic_name,status,difficulty,revision_count,last_studied_epoch_day,next_revision_epoch_day\n")
        topics.forEach { t ->
            sb.append(escapeCsv(t.id)).append(",")
                .append(escapeCsv(t.examId)).append(",")
                .append(escapeCsv(t.subject)).append(",")
                .append(escapeCsv(t.unit)).append(",")
                .append(escapeCsv(t.chapter)).append(",")
                .append(escapeCsv(t.topicName)).append(",")
                .append(escapeCsv(t.status)).append(",")
                .append(escapeCsv(t.difficulty)).append(",")
                .append(t.revisionCount).append(",")
                .append(t.lastStudiedEpochDay?.toString() ?: "").append(",")
                .append(t.nextRevisionEpochDay?.toString() ?: "").append("\n")
        }
        sb.append("\n# REVISIONS\n")
        sb.append("id,exam_id,topic_name,subject,revision_epoch_day,revision_number,recall_rating,accuracy_percent,next_revision_epoch_day,method\n")
        revisions.forEach { r ->
            sb.append(escapeCsv(r.id)).append(",")
                .append(escapeCsv(r.examId)).append(",")
                .append(escapeCsv(r.topicName)).append(",")
                .append(escapeCsv(r.subject)).append(",")
                .append(r.revisionEpochDay).append(",")
                .append(r.revisionNumber).append(",")
                .append(r.recallRating).append(",")
                .append(r.accuracyPercent?.toString() ?: "").append(",")
                .append(r.nextRevisionEpochDay).append(",")
                .append(escapeCsv(r.method)).append("\n")
        }
        sb.append("\n# MOCK_TESTS\n")
        sb.append("id,exam_id,mock_name,date_iso,total_score,max_marks,percentage,accuracy_percent,duration_minutes\n")
        mocks.forEach { m ->
            sb.append(escapeCsv(m.id)).append(",")
                .append(escapeCsv(m.examId)).append(",")
                .append(escapeCsv(m.mockName)).append(",")
                .append(formatIsoDate(m.dateTimestamp)).append(",")
                .append(m.totalScore).append(",")
                .append(m.maxMarks).append(",")
                .append(m.percentage).append(",")
                .append(m.accuracyPercent).append(",")
                .append(m.durationMinutes).append("\n")
        }
        return sb.toString()
    }

    fun shareExport(context: Context, content: String, title: String, mimeType: String) {
        val sendIntent = Intent().apply {
            action = Intent.ACTION_SEND
            putExtra(Intent.EXTRA_TEXT, content)
            putExtra(Intent.EXTRA_TITLE, title)
            putExtra(Intent.EXTRA_SUBJECT, title)
            type = mimeType
        }
        val shareIntent = Intent.createChooser(sendIntent, title)
        shareIntent.addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        context.startActivity(shareIntent)
    }

    private fun escapeJson(value: String): String {
        return value.replace("\\", "\\\\")
            .replace("\"", "\\\"")
            .replace("\b", "\\b")
            .replace("\n", "\\n")
            .replace("\r", "\\r")
            .replace("\t", "\\t")
    }

    private fun escapeCsv(value: String): String {
        if (value.contains(",") || value.contains("\"") || value.contains("\n") || value.contains("\r")) {
            return "\"" + value.replace("\"", "\"\"") + "\""
        }
        return value
    }
}
