package com.tempo.focus.data.model

enum class DurationFeedback(val value: String, val displayName: String) {
    NOT_SURE("not_sure", "Not sure / prefer not to say"),
    TOO_SHORT("too_short", "Too short"),
    ABOUT_RIGHT("about_right", "About right"),
    TOO_LONG("too_long", "Too long");

    companion object {
        fun fromValue(value: String?): DurationFeedback? {
            if (value == null) return null
            return entries.find { it.value.equals(value, ignoreCase = true) || it.name.equals(value, ignoreCase = true) }
        }
    }
}
