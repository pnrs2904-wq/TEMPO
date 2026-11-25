package com.tempo.focus.service

import android.app.NotificationManager
import android.content.Context
import android.media.AudioManager
import android.media.ToneGenerator
import android.os.Build
import android.os.Handler
import android.os.Looper
import android.os.VibrationEffect
import android.os.Vibrator
import android.os.VibratorManager
import android.util.Log

object SoundPlayer {

    private const val TAG = "TempoSoundPlayer"

    private fun isDoNotDisturbActive(context: Context): Boolean {
        return try {
            val nm = context.getSystemService(Context.NOTIFICATION_SERVICE) as? NotificationManager
            val filter = nm?.currentInterruptionFilter ?: NotificationManager.INTERRUPTION_FILTER_ALL
            filter != NotificationManager.INTERRUPTION_FILTER_ALL
        } catch (_: Throwable) {
            false
        }
    }

    fun playCompletionTone(context: Context, soundEnabled: Boolean) {
        if (!soundEnabled || isDoNotDisturbActive(context)) return

        try {
            val toneGenerator = ToneGenerator(AudioManager.STREAM_NOTIFICATION, 85)
            toneGenerator.startTone(ToneGenerator.TONE_PROP_BEEP2, 350)
            Handler(Looper.getMainLooper()).postDelayed({
                try {
                    toneGenerator.release()
                } catch (_: Throwable) {
                }
            }, 500L)
        } catch (e: Exception) {
            Log.e(TAG, "Error playing completion tone", e)
        }

        try {
            val vibrator = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
                val vibratorManager = context.getSystemService(Context.VIBRATOR_MANAGER_SERVICE) as? VibratorManager
                vibratorManager?.defaultVibrator
            } else {
                @Suppress("DEPRECATION")
                context.getSystemService(Context.VIBRATOR_SERVICE) as? Vibrator
            }

            if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
                val timings = longArrayOf(0, 200, 100, 300)
                val amplitudes = intArrayOf(0, 200, 0, 255)
                vibrator?.vibrate(VibrationEffect.createWaveform(timings, amplitudes, -1))
            } else {
                @Suppress("DEPRECATION")
                vibrator?.vibrate(400)
            }
        } catch (e: Exception) {
            Log.e(TAG, "Error vibrating device", e)
        }
    }

    /**
     * Subtle synthesized tick for focus/break cadence when opted in by the user.
     * Uses Android's built-in ToneGenerator (no third-party audio files) and respects DND.
     */
    fun playTick(context: Context, enabled: Boolean) {
        if (!enabled || isDoNotDisturbActive(context)) return
        try {
            val toneGenerator = ToneGenerator(AudioManager.STREAM_MUSIC, 18)
            toneGenerator.startTone(ToneGenerator.TONE_PROP_ACK, 20)
            Handler(Looper.getMainLooper()).postDelayed({
                try {
                    toneGenerator.release()
                } catch (_: Throwable) {
                }
            }, 60L)
        } catch (_: Throwable) {
            // Optional audio tick must never disrupt timer execution
        }
    }
}
