package com.tempo.focus.service

import android.content.BroadcastReceiver
import android.content.Context
import android.content.Intent
import com.tempo.focus.data.preferences.UserPreferencesRepository
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.flow.first
import kotlinx.coroutines.launch

/**
 * Fires when an exact/inexact background timer alarm triggers.
 * Verifies the persisted [com.tempo.focus.data.preferences.ActiveSessionState] is still RUNNING
 * and genuinely due before showing a completion notification so paused/cancelled timers never alert.
 */
class TimerCompletionReceiver : BroadcastReceiver() {

    override fun onReceive(context: Context, intent: Intent) {
        if (intent.action != TimerAlarmScheduler.ACTION_TIMER_COMPLETE) return

        val pendingResult = goAsync()
        val appContext = context.applicationContext
        CoroutineScope(Dispatchers.IO).launch {
            try {
                val prefs = UserPreferencesRepository(appContext)
                val active = prefs.activeSessionFlow.first()
                if (active != null && active.timerState == "RUNNING") {
                    val elapsedMs = active.accumulatedElapsedMs +
                        (System.currentTimeMillis() - active.startTimestamp).coerceAtLeast(0L)
                    val remainingSec = active.plannedSeconds - (elapsedMs / 1000L)
                    if (remainingSec <= 1L) {
                        val settings = prefs.userSettingsFlow.first()
                        val isFocus = active.phase == "focus"
                        SoundPlayer.playCompletionTone(appContext, settings.soundEnabled)
                        NotificationHelper.showSessionCompletedNotification(
                            context = appContext,
                            isFocusSession = isFocus,
                            subject = active.subject
                        )
                    }
                }
            } catch (_: Throwable) {
                // Never crash a BroadcastReceiver
            } finally {
                pendingResult.finish()
            }
        }
    }
}
