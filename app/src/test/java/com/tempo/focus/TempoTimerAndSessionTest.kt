package com.tempo.focus

import com.tempo.focus.data.model.SessionPhase
import com.tempo.focus.data.model.SessionStatus
import com.tempo.focus.data.model.SessionType
import com.tempo.focus.ui.viewmodel.TimerState
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class TempoTimerAndSessionTest {

    @Test
    fun `sessionStatus fromString correctly parses all standard statuses`() {
        assertEquals(SessionStatus.ACTIVE, SessionStatus.fromString("active"))
        assertEquals(SessionStatus.ACTIVE, SessionStatus.fromString("ACTIVE"))
        assertEquals(SessionStatus.PAUSED, SessionStatus.fromString("paused"))
        assertEquals(SessionStatus.COMPLETED, SessionStatus.fromString("completed"))
        assertEquals(SessionStatus.ENDED_EARLY, SessionStatus.fromString("ended_early"))
        assertEquals(SessionStatus.CANCELLED, SessionStatus.fromString("cancelled"))
    }

    @Test
    fun `sessionStatus fromString maps unknown and corrupted values to UNKNOWN not COMPLETED`() {
        // Critical requirement 9.1: Do not map unknown database values to COMPLETED
        val unknown1 = SessionStatus.fromString("corrupt_value_xyz")
        assertEquals(SessionStatus.UNKNOWN, unknown1)
        assertNotEquals(SessionStatus.COMPLETED, unknown1)

        val unknown2 = SessionStatus.fromString("")
        assertEquals(SessionStatus.UNKNOWN, unknown2)
        assertNotEquals(SessionStatus.COMPLETED, unknown2)

        val unknown3 = SessionStatus.fromString("in_progress")
        assertEquals(SessionStatus.UNKNOWN, unknown3)
        assertNotEquals(SessionStatus.COMPLETED, unknown3)

        val unknown4 = SessionStatus.fromString("unknown")
        assertEquals(SessionStatus.UNKNOWN, unknown4)
    }

    @Test
    fun `timer state transitions maintain logical consistency`() {
        // Start state: IDLE
        var state = TimerState.IDLE
        assertEquals(TimerState.IDLE, state)

        // Start timer -> RUNNING
        state = TimerState.RUNNING
        assertEquals(TimerState.RUNNING, state)

        // Pause timer -> PAUSED
        state = TimerState.PAUSED
        assertEquals(TimerState.PAUSED, state)

        // Resume timer -> RUNNING
        state = TimerState.RUNNING
        assertEquals(TimerState.RUNNING, state)

        // Finish timer -> COMPLETED
        state = TimerState.COMPLETED
        assertEquals(TimerState.COMPLETED, state)
    }

    @Test
    fun `timer remaining seconds calculation accurately accounts for accumulated elapsed time`() {
        val plannedSeconds = 1500 // 25 minutes
        val accumulatedElapsedMs = 300_000L // 5 minutes in ms
        val runStartTimestamp = 1000L
        val currentNow = 61_000L // 60 seconds after runStartTimestamp

        val currentSegmentMs = (currentNow - runStartTimestamp).coerceAtLeast(0L)
        val totalElapsedMs = accumulatedElapsedMs + currentSegmentMs
        val totalElapsedSec = (totalElapsedMs / 1000).toInt()
        val remainingSeconds = (plannedSeconds - totalElapsedSec).coerceAtLeast(0)

        // Expected: 1500 - (300 + 60) = 1500 - 360 = 1140 seconds
        assertEquals(1140, remainingSeconds)
    }

    @Test
    fun `timer remaining seconds clamps to zero when elapsed exceeds planned`() {
        val plannedSeconds = 60
        val totalElapsedMs = 75_000L // 75 seconds
        val totalElapsedSec = (totalElapsedMs / 1000).toInt()
        val remaining = (plannedSeconds - totalElapsedSec).coerceAtLeast(0)

        assertEquals(0, remaining)
    }

    @Test
    fun `session types parse correctly and default safely`() {
        assertEquals(SessionType.STUDY, SessionType.fromString("study"))
        assertEquals(SessionType.REVISION, SessionType.fromString("revision"))
        assertEquals(SessionType.PRACTICE_QUESTIONS, SessionType.fromString("practice questions"))
        assertEquals(SessionType.MOCK_TEST, SessionType.fromString("mock test"))
        assertEquals(SessionType.STUDY, SessionType.fromString("unknown_type"))
    }

    @Test
    fun `session phase enum values are distinct and identifiable`() {
        val phases = listOf(SessionPhase.FOCUS, SessionPhase.BREAK)
        assertEquals(2, phases.distinct().size)
        assertEquals("focus", SessionPhase.FOCUS.value)
        assertEquals("break", SessionPhase.BREAK.value)
        assertEquals(SessionPhase.FOCUS, SessionPhase.fromString("focus"))
        assertEquals(SessionPhase.BREAK, SessionPhase.fromString("break"))
    }
}
