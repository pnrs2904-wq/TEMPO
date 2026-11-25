package com.tempo.focus.domain

/**
 * Pure Kotlin focus round cycle engine inspired by Pomotroid (MIT).
 * Zero Android dependencies so it runs directly on plain JVM and exports parity fixtures to Web.
 */
enum class RoundStage(val value: String, val label: String) {
    FOCUS("focus", "Focus"),
    SHORT_BREAK("short_break", "Short Break"),
    LONG_BREAK("long_break", "Long Break");

    companion object {
        fun fromValue(value: String?): RoundStage =
            entries.find { it.value.equals(value, ignoreCase = true) } ?: FOCUS
    }
}

data class RoundCycleConfig(
    val roundsBeforeLongBreak: Int = DEFAULT_ROUNDS_BEFORE_LONG_BREAK,
    val longBreakMinutes: Int = DEFAULT_LONG_BREAK_MINUTES,
    val autoStartNextRound: Boolean = false,
    val tickSoundFocus: Boolean = false,
    val tickSoundBreak: Boolean = false
) {
    val safeRoundsBeforeLongBreak: Int get() = roundsBeforeLongBreak.coerceIn(2, 8)
    val safeLongBreakMinutes: Int get() = longBreakMinutes.coerceIn(5, 45)

    companion object {
        const val DEFAULT_ROUNDS_BEFORE_LONG_BREAK = 4
        const val DEFAULT_LONG_BREAK_MINUTES = 15
    }
}

data class RoundCycleState(
    val currentRound: Int = 1,
    val totalRoundsInCycle: Int = RoundCycleConfig.DEFAULT_ROUNDS_BEFORE_LONG_BREAK,
    val stage: RoundStage = RoundStage.FOCUS,
    val completedFocusRounds: Int = 0
)

data class NextBreakRecommendation(
    val stage: RoundStage,
    val durationMinutes: Int,
    val isLongBreak: Boolean,
    val nextRoundAfterBreak: Int
)

object RoundCycleEngine {

    /**
     * Determines whether the break following a completed focus session is a SHORT_BREAK or LONG_BREAK.
     * After N completed focus rounds (default 4), a LONG_BREAK (default 15m) is offered.
     */
    fun breakAfterFocusCompletion(
        currentState: RoundCycleState,
        shortBreakMinutes: Int,
        config: RoundCycleConfig = RoundCycleConfig()
    ): NextBreakRecommendation {
        val cycleLen = config.safeRoundsBeforeLongBreak
        val completedCount = currentState.completedFocusRounds + 1
        val isLong = completedCount % cycleLen == 0
        return if (isLong) {
            NextBreakRecommendation(
                stage = RoundStage.LONG_BREAK,
                durationMinutes = config.safeLongBreakMinutes,
                isLongBreak = true,
                nextRoundAfterBreak = 1
            )
        } else {
            NextBreakRecommendation(
                stage = RoundStage.SHORT_BREAK,
                durationMinutes = shortBreakMinutes.coerceIn(3, 20),
                isLongBreak = false,
                nextRoundAfterBreak = (currentState.currentRound % cycleLen) + 1
            )
        }
    }

    /**
     * Advances the round cycle after a focus session completes and enters the break stage.
     */
    fun onFocusCompleted(
        currentState: RoundCycleState,
        config: RoundCycleConfig = RoundCycleConfig()
    ): RoundCycleState {
        val cycleLen = config.safeRoundsBeforeLongBreak
        val completed = currentState.completedFocusRounds + 1
        val nextStage = if (completed % cycleLen == 0) RoundStage.LONG_BREAK else RoundStage.SHORT_BREAK
        return RoundCycleState(
            currentRound = currentState.currentRound.coerceIn(1, cycleLen),
            totalRoundsInCycle = cycleLen,
            stage = nextStage,
            completedFocusRounds = completed
        )
    }

    /**
     * Advances the round cycle after a break completes (or is skipped) back to FOCUS.
     */
    fun onBreakCompleted(
        currentState: RoundCycleState,
        config: RoundCycleConfig = RoundCycleConfig()
    ): RoundCycleState {
        val cycleLen = config.safeRoundsBeforeLongBreak
        val nextRound = if (currentState.stage == RoundStage.LONG_BREAK) {
            1
        } else {
            (currentState.currentRound % cycleLen) + 1
        }
        return RoundCycleState(
            currentRound = nextRound,
            totalRoundsInCycle = cycleLen,
            stage = RoundStage.FOCUS,
            completedFocusRounds = currentState.completedFocusRounds
        )
    }

    /**
     * Resets the round cycle cleanly to Round 1 / Focus.
     */
    fun restartCycle(config: RoundCycleConfig = RoundCycleConfig()): RoundCycleState =
        RoundCycleState(
            currentRound = 1,
            totalRoundsInCycle = config.safeRoundsBeforeLongBreak,
            stage = RoundStage.FOCUS,
            completedFocusRounds = 0
        )
}
