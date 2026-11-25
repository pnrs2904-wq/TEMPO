package com.tempo.focus.domain

import com.tempo.focus.data.db.SessionEntity
import java.time.Instant
import java.time.LocalDate
import java.time.ZoneId

data class StreakInfo(
    val currentStreak: Int,
    val bestStreak: Int,
    val totalActiveDays: Int,
    val hasSessionToday: Boolean
)

object StreakCalculator {

    fun calculateStreak(
        sessions: List<SessionEntity>,
        zoneId: ZoneId = ZoneId.systemDefault(),
        currentDate: LocalDate = LocalDate.now(zoneId)
    ): StreakInfo {
        // Only completed focus sessions count toward the study streak
        val completedFocusDates = sessions
            .filter { it.phase == "focus" && it.status == "completed" }
            .map { Instant.ofEpochMilli(it.timestamp).atZone(zoneId).toLocalDate() }
            .toSet()

        if (completedFocusDates.isEmpty()) {
            return StreakInfo(
                currentStreak = 0,
                bestStreak = 0,
                totalActiveDays = 0,
                hasSessionToday = false
            )
        }

        val hasToday = completedFocusDates.contains(currentDate)
        val hasYesterday = completedFocusDates.contains(currentDate.minusDays(1))

        // Calculate current streak
        var currentStreak = 0
        var checkDate = if (hasToday) currentDate else if (hasYesterday) currentDate.minusDays(1) else null

        while (checkDate != null && completedFocusDates.contains(checkDate)) {
            currentStreak++
            checkDate = checkDate.minusDays(1)
        }

        // Calculate all-time best streak
        val sortedDates = completedFocusDates.sorted()
        var bestStreak = 0
        var tempStreak = 0
        var prevDate: LocalDate? = null

        for (date in sortedDates) {
            if (prevDate == null || date == prevDate.plusDays(1)) {
                tempStreak++
            } else {
                tempStreak = 1
            }
            if (tempStreak > bestStreak) {
                bestStreak = tempStreak
            }
            prevDate = date
        }

        return StreakInfo(
            currentStreak = currentStreak,
            bestStreak = bestStreak,
            totalActiveDays = completedFocusDates.size,
            hasSessionToday = hasToday
        )
    }
}
