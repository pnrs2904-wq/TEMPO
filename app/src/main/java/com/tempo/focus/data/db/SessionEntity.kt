package com.tempo.focus.data.db

import androidx.room.Entity
import androidx.room.Index
import androidx.room.PrimaryKey
import java.util.UUID

@Entity(
    tableName = "sessions",
    indices = [
        Index(value = ["timestamp"]),
        Index(value = ["phase", "energy"]),
        Index(value = ["subject"]),
        Index(value = ["syncId"])
    ]
)
data class SessionEntity(
    @PrimaryKey(autoGenerate = true)
    val id: Long = 0,
    val timestamp: Long, // Start time in epoch millis
    val phase: String, // "focus" or "break"
    val energy: Int, // 1..5
    val subject: String, // max 60 chars
    val sessionType: String, // "Study", "Revision", "Practice Questions", "Mock Test"
    val plannedMinutes: Int,
    val actualSeconds: Int,
    val status: String, // "completed" or "ended_early"
    val focusQuality: Int? = null, // 1..5
    val difficulty: Int? = null, // 1..5
    val durationFeedback: String? = null, // "not_sure", "too_short", "about_right", "too_long"
    val distractions: Int? = null, // non-negative int
    val notes: String? = null, // max 240 chars
    val createdAt: Long = System.currentTimeMillis(),
    val updatedAt: Long = System.currentTimeMillis(),
    val syncId: String = UUID.randomUUID().toString(),
    val deletedAt: Long? = null
)
