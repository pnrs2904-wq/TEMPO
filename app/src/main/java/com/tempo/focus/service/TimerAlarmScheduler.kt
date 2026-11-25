package com.tempo.focus.service

import android.app.AlarmManager
import android.app.PendingIntent
import android.content.Context
import android.content.Intent
import android.os.Build

/**
 * Schedules a background completion alarm for an active Tempo focus or break session.
 * Uses [AlarmManager.setExactAndAllowWhileIdle] when exact alarm scheduling is granted,
 * and falls back cleanly to [AlarmManager.setAndAllowWhileIdle] without throwing SecurityException.
 */
object TimerAlarmScheduler {

    const val ACTION_TIMER_COMPLETE = "com.tempo.focus.action.TIMER_COMPLETE"
    const val EXTRA_SESSION_ID = "extra_session_id"
    const val EXTRA_IS_FOCUS = "extra_is_focus"
    const val EXTRA_SUBJECT = "extra_subject"
    private const val REQUEST_CODE = 4001

    fun scheduleCompletionAlarm(
        context: Context,
        triggerAtMillis: Long,
        sessionId: Long?,
        isFocus: Boolean,
        subject: String
    ) {
        val alarmManager = context.getSystemService(Context.ALARM_SERVICE) as? AlarmManager ?: return
        val pendingIntent = buildPendingIntent(context, sessionId, isFocus, subject)

        try {
            val canExact = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                alarmManager.canScheduleExactAlarms()
            } else {
                true
            }
            if (canExact) {
                alarmManager.setExactAndAllowWhileIdle(
                    AlarmManager.RTC_WAKEUP,
                    triggerAtMillis,
                    pendingIntent
                )
            } else {
                alarmManager.setAndAllowWhileIdle(
                    AlarmManager.RTC_WAKEUP,
                    triggerAtMillis,
                    pendingIntent
                )
            }
        } catch (_: SecurityException) {
            try {
                alarmManager.setAndAllowWhileIdle(
                    AlarmManager.RTC_WAKEUP,
                    triggerAtMillis,
                    pendingIntent
                )
            } catch (_: Throwable) {
                // Best-effort alarm fallback; wall-clock restoration still completes on app resume
            }
        }
    }

    fun cancelCompletionAlarm(context: Context) {
        val alarmManager = context.getSystemService(Context.ALARM_SERVICE) as? AlarmManager ?: return
        val intent = Intent(context, TimerCompletionReceiver::class.java).apply {
            action = ACTION_TIMER_COMPLETE
        }
        val pendingIntent = PendingIntent.getBroadcast(
            context,
            REQUEST_CODE,
            intent,
            PendingIntent.FLAG_NO_CREATE or PendingIntent.FLAG_IMMUTABLE
        ) ?: return
        alarmManager.cancel(pendingIntent)
        pendingIntent.cancel()
    }

    private fun buildPendingIntent(
        context: Context,
        sessionId: Long?,
        isFocus: Boolean,
        subject: String
    ): PendingIntent {
        val intent = Intent(context, TimerCompletionReceiver::class.java).apply {
            action = ACTION_TIMER_COMPLETE
            putExtra(EXTRA_SESSION_ID, sessionId ?: -1L)
            putExtra(EXTRA_IS_FOCUS, isFocus)
            putExtra(EXTRA_SUBJECT, subject)
        }
        return PendingIntent.getBroadcast(
            context,
            REQUEST_CODE,
            intent,
            PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE
        )
    }
}
