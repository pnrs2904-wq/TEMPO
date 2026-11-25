package com.tempo.focus.data.model
 
enum class SessionStatus(val value: String, val displayName: String) {
    ACTIVE("active", "Active"),
    PAUSED("paused", "Paused"),
    COMPLETED("completed", "Completed"),
    ENDED_EARLY("ended_early", "Ended Early"),
    CANCELLED("cancelled", "Cancelled"),
    UNKNOWN("unknown", "Unknown");

    companion object {
        fun fromString(value: String): SessionStatus {
            return entries.find { it.value.equals(value, ignoreCase = true) || it.name.equals(value, ignoreCase = true) }
                ?: UNKNOWN
        }
    }
}
