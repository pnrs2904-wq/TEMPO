package com.tempo.focus.ui.navigation

import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Dashboard
import androidx.compose.material.icons.filled.History
import androidx.compose.material.icons.filled.Insights
import androidx.compose.material.icons.filled.MenuBook
import androidx.compose.material.icons.filled.Settings
import androidx.compose.material.icons.filled.Timer
import androidx.compose.material.icons.filled.TrackChanges
import androidx.compose.ui.graphics.vector.ImageVector

enum class TempoDestination(
    val route: String,
    val title: String,
    val icon: ImageVector,
    val testTag: String
) {
    DASHBOARD("dashboard", "Dashboard", Icons.Default.Dashboard, "nav_dashboard"),
    TIMER("timer", "Timer", Icons.Default.Timer, "nav_timer"),
    PREP("prep", "Prep", Icons.Default.MenuBook, "nav_prep"),
    GOALS("goals", "Goals", Icons.Default.TrackChanges, "nav_goals"),
    HISTORY("history", "History", Icons.Default.History, "nav_history"),
    PATTERNS("patterns", "Patterns", Icons.Default.Insights, "nav_patterns"),
    SETTINGS("settings", "Settings", Icons.Default.Settings, "nav_settings");

    companion object {
        val advancedModeTabs = listOf(DASHBOARD, TIMER, PREP, HISTORY, SETTINGS)
        val simpleModeTabs = listOf(TIMER, GOALS, HISTORY, PATTERNS, SETTINGS)
    }
}
