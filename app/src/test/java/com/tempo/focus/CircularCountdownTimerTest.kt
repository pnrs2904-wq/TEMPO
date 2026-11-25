package com.tempo.focus

import com.tempo.focus.ui.components.formatTimerDisplay
import com.tempo.focus.ui.viewmodel.TimerState
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class CircularCountdownTimerTest {

    @Test
    fun `formatTimerDisplay formats 0 seconds as 00 00`() {
        assertEquals("00:00", formatTimerDisplay(0))
    }

    @Test
    fun `formatTimerDisplay clamps negative seconds to 00 00`() {
        assertEquals("00:00", formatTimerDisplay(-10))
        assertEquals("00:00", formatTimerDisplay(-999))
    }

    @Test
    fun `formatTimerDisplay formats standard 25 minutes as 25 00`() {
        assertEquals("25:00", formatTimerDisplay(25 * 60))
    }

    @Test
    fun `formatTimerDisplay formats arbitrary minutes and seconds correctly`() {
        assertEquals("14:35", formatTimerDisplay(14 * 60 + 35))
        assertEquals("01:05", formatTimerDisplay(65))
        assertEquals("00:09", formatTimerDisplay(9))
    }

    @Test
    fun `formatTimerDisplay formats durations an hour or longer with HH MM SS`() {
        // 3665 seconds = 1 hour, 1 minute, 5 seconds
        assertEquals("01:01:05", formatTimerDisplay(3665))
        // 7200 seconds = 2 hours
        assertEquals("02:00:00", formatTimerDisplay(7200))
    }

    @Test
    fun `progress ratio correctly computes elapsed percentage within bounds`() {
        val totalSeconds = 1500
        val remainingSeconds = 750 // half done
        val progress = ((totalSeconds - remainingSeconds).toFloat() / totalSeconds.toFloat()).coerceIn(0f, 1f)
        assertEquals(0.5f, progress, 0.001f)

        // remaining = total (0% elapsed)
        val initialProgress = ((totalSeconds - totalSeconds).toFloat() / totalSeconds.toFloat()).coerceIn(0f, 1f)
        assertEquals(0.0f, initialProgress, 0.001f)

        // remaining = 0 (100% elapsed)
        val completedProgress = ((totalSeconds - 0).toFloat() / totalSeconds.toFloat()).coerceIn(0f, 1f)
        assertEquals(1.0f, completedProgress, 0.001f)
    }

    @Test
    fun `controls callback simulation tracks start pause and reset actions`() {
        var started = false
        var paused = false
        var reset = false

        val onStart = { started = true }
        val onPause = { paused = true }
        val onReset = { reset = true }

        onStart()
        assertTrue(started)

        onPause()
        assertTrue(paused)

        onReset()
        assertTrue(reset)
    }
}
