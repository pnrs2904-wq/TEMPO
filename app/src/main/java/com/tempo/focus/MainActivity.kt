package com.tempo.focus

import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.enableEdgeToEdge
import com.tempo.focus.service.NotificationHelper
import com.tempo.focus.ui.TempoApp
import com.tempo.focus.ui.theme.TempoTheme

class MainActivity : ComponentActivity() {
    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        enableEdgeToEdge()
        NotificationHelper.createNotificationChannel(this)

        setContent {
            TempoTheme {
                TempoApp()
            }
        }
    }
}

