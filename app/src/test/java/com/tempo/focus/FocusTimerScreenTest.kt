package com.tempo.focus

import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.assertIsEnabled
import androidx.compose.ui.test.assertIsNotEnabled
import androidx.compose.ui.test.assertTextEquals
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.performClick
import com.tempo.focus.data.model.SessionPhase
import com.tempo.focus.ui.components.calculateSessionProgress
import com.tempo.focus.ui.screens.FocusTimerContent
import com.tempo.focus.ui.screens.SessionTrackingSummary
import com.tempo.focus.ui.theme.TempoTheme
import com.tempo.focus.ui.viewmodel.FeedbackInputState
import com.tempo.focus.ui.viewmodel.TimerState
import com.tempo.focus.ui.viewmodel.TimerUiState
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(qualifiers = "w412dp-h915dp", sdk = [36])
class FocusTimerScreenTest {

    @get:Rule
    val composeTestRule = createComposeRule()

    @Test
    fun `idle state renders countdown dial session tracking and start control`() {
        var startClicked = false

        composeTestRule.setContent {
            TempoTheme {
                FocusTimerContent(
                    uiState = TimerUiState(
                        state = TimerState.IDLE,
                        phase = SessionPhase.FOCUS,
                        plannedSeconds = 25 * 60,
                        remainingSeconds = 25 * 60
                    ),
                    feedbackInput = FeedbackInputState(),
                    trackingSummary = SessionTrackingSummary(
                        completedSessionsToday = 3,
                        todayFocusMinutes = 75,
                        dailyGoalMinutes = 120,
                        currentStreakDays = 4
                    ),
                    onStart = { startClicked = true },
                    onPause = {},
                    onResume = {},
                    onStop = {},
                    onReset = {},
                    onStartBreak = {},
                    onSubjectChange = {},
                    onSessionTypeSelect = {},
                    onEnergySelect = {},
                    onQualitySelect = {},
                    onDifficultySelect = {},
                    onDurationFeedbackSelect = {},
                    onDistractionsChange = {},
                    onNotesChange = {},
                    onSaveFeedback = {},
                    onSkipFeedback = {},
                    onDismissBreakOffer = {}
                )
            }
        }

        composeTestRule.waitForIdle()
        composeTestRule.onNodeWithTag("focus_timer_screen").assertIsDisplayed()
        composeTestRule.onNodeWithTag("session_tracking_card").assertIsDisplayed()
        composeTestRule.onNodeWithTag("circular_countdown_dial").assertIsDisplayed()
        composeTestRule.onNodeWithTag("timer_remaining_text").assertTextEquals("25:00")
        composeTestRule.onNodeWithTag("start_focus_button").assertIsDisplayed().assertIsEnabled()
        composeTestRule.onNodeWithTag("stop_session_button").assertIsDisplayed().assertIsNotEnabled()
        composeTestRule.onNodeWithTag("reset_session_button").assertIsDisplayed().assertIsNotEnabled()

        composeTestRule.onNodeWithTag("start_focus_button").performClick()
        composeTestRule.waitForIdle()
        assertTrue(startClicked)
    }

    @Test
    fun `running state enables pause stop and reset confirmation flow`() {
        var pauseClicked = false
        var stopClicked = false
        var resetConfirmed = false

        composeTestRule.setContent {
            TempoTheme {
                FocusTimerContent(
                    uiState = TimerUiState(
                        state = TimerState.RUNNING,
                        phase = SessionPhase.FOCUS,
                        plannedSeconds = 1500,
                        remainingSeconds = 750,
                        isSetupLocked = true
                    ),
                    feedbackInput = FeedbackInputState(),
                    trackingSummary = SessionTrackingSummary(),
                    onStart = {},
                    onPause = { pauseClicked = true },
                    onResume = {},
                    onStop = { stopClicked = true },
                    onReset = { resetConfirmed = true },
                    onStartBreak = {},
                    onSubjectChange = {},
                    onSessionTypeSelect = {},
                    onEnergySelect = {},
                    onQualitySelect = {},
                    onDifficultySelect = {},
                    onDurationFeedbackSelect = {},
                    onDistractionsChange = {},
                    onNotesChange = {},
                    onSaveFeedback = {},
                    onSkipFeedback = {},
                    onDismissBreakOffer = {}
                )
            }
        }

        composeTestRule.waitForIdle()
        composeTestRule.onNodeWithTag("timer_remaining_text").assertTextEquals("12:30")
        composeTestRule.onNodeWithTag("timer_progress_text").assertTextEquals("50% complete")

        composeTestRule.onNodeWithTag("pause_session_button").assertIsEnabled().performClick()
        composeTestRule.onNodeWithTag("stop_session_button").assertIsEnabled().performClick()
        composeTestRule.onNodeWithTag("reset_session_button").assertIsEnabled().performClick()
        composeTestRule.waitForIdle()

        composeTestRule.onNodeWithTag("confirm_reset_button").assertIsDisplayed().performClick()
        composeTestRule.waitForIdle()

        assertTrue(pauseClicked)
        assertTrue(stopClicked)
        assertTrue(resetConfirmed)
    }

    @Test
    fun `calculateSessionProgress returns accurate bounded ratios`() {
        assertEquals(0f, calculateSessionProgress(1500, 1500), 0.001f)
        assertEquals(0.5f, calculateSessionProgress(750, 1500), 0.001f)
        assertEquals(1f, calculateSessionProgress(0, 1500), 0.001f)
        assertEquals(0f, calculateSessionProgress(100, 0), 0.001f)
    }
}
