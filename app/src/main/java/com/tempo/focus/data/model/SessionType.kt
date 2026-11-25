package com.tempo.focus.data.model

enum class SessionType(val displayName: String) {
    STUDY("Study"),
    REVISION("Revision"),
    PRACTICE_QUESTIONS("Practice Questions"),
    MOCK_TEST("Mock Test");

    companion object {
        fun fromString(value: String): SessionType {
            return entries.find { it.displayName.equals(value, ignoreCase = true) || it.name.equals(value, ignoreCase = true) }
                ?: STUDY
        }
    }
}
