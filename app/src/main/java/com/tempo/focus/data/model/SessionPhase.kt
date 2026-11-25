package com.tempo.focus.data.model

enum class SessionPhase(val value: String, val displayName: String) {
    FOCUS("focus", "Focus"),
    BREAK("break", "Break");

    companion object {
        fun fromString(value: String): SessionPhase {
            return entries.find { it.value.equals(value, ignoreCase = true) || it.name.equals(value, ignoreCase = true) }
                ?: FOCUS
        }
    }
}
