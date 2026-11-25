package com.tempo.focus.domain.prep

import com.tempo.focus.domain.exams.TopicDifficulty

data class ParsedTopicRow(
    val subject: String,
    val unit: String,
    val chapter: String,
    val topicName: String,
    val difficulty: TopicDifficulty
)

object SyllabusCsvImporter {

    /**
     * Parses CSV or line-delimited bulk syllabus entries.
     *
     * Supported formats per line:
     * 1. Subject,Unit,Chapter,Topic,Difficulty
     * 2. Subject,Topic
     * 3. Topic (assigned to [defaultSubject])
     */
    fun parse(rawInput: String, defaultSubject: String): List<ParsedTopicRow> {
        val fallbackSubject = defaultSubject.trim().ifEmpty { "General" }
        return rawInput
            .lineSequence()
            .map { it.trim() }
            .filter { it.isNotEmpty() }
            .filterNot { line ->
                val lower = line.lowercase()
                lower.startsWith("subject,") && lower.contains("topic")
            }
            .mapNotNull { line ->
                val cols = splitCsvLine(line)
                when {
                    cols.size >= 4 -> {
                        val subject = cols[0].ifBlank { fallbackSubject }
                        val unit = cols[1].ifBlank { "General Unit" }
                        val chapter = cols[2].ifBlank { "General Chapter" }
                        val topic = cols[3].trim()
                        val diff = TopicDifficulty.fromValue(cols.getOrNull(4))
                        if (topic.isBlank()) null else ParsedTopicRow(subject, unit, chapter, topic, diff)
                    }
                    cols.size == 3 -> {
                        val subject = cols[0].ifBlank { fallbackSubject }
                        val chapter = cols[1].ifBlank { "General Chapter" }
                        val topic = cols[2].trim()
                        if (topic.isBlank()) null else ParsedTopicRow(subject, "Core Unit", chapter, topic, TopicDifficulty.MODERATE)
                    }
                    cols.size == 2 -> {
                        val subject = cols[0].ifBlank { fallbackSubject }
                        val topic = cols[1].trim()
                        if (topic.isBlank()) null else ParsedTopicRow(subject, "Core Unit", "Custom Chapter", topic, TopicDifficulty.MODERATE)
                    }
                    else -> {
                        val topic = cols.firstOrNull()?.trim().orEmpty()
                        if (topic.isBlank()) null else ParsedTopicRow(fallbackSubject, "Core Unit", "Custom Chapter", topic, TopicDifficulty.MODERATE)
                    }
                }
            }
            .toList()
    }

    private fun splitCsvLine(line: String): List<String> {
        val result = mutableListOf<String>()
        val current = StringBuilder()
        var inQuotes = false
        for (ch in line) {
            when {
                ch == '"' -> inQuotes = !inQuotes
                ch == ',' && !inQuotes -> {
                    result.add(current.toString().trim())
                    current.clear()
                }
                else -> current.append(ch)
            }
        }
        result.add(current.toString().trim())
        return result
    }
}
