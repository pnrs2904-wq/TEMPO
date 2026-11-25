package com.tempo.focus.data.model

import androidx.compose.ui.graphics.Color
import com.tempo.focus.ui.theme.EnergyBlue
import com.tempo.focus.ui.theme.EnergyOchre
import com.tempo.focus.ui.theme.EnergyTerracotta

data class EnergyLevel(
    val level: Int,
    val title: String,
    val shortLabel: String,
    val description: String,
    val defaultFocusMinutes: Int,
    val defaultBreakMinutes: Int,
    val accentColor: Color
) {
    companion object {
        val ALL: List<EnergyLevel> = listOf(
            EnergyLevel(
                level = 1,
                title = "Very low energy",
                shortLabel = "Very low",
                description = "Minimal cognitive load, gentle start",
                defaultFocusMinutes = 15,
                defaultBreakMinutes = 8,
                accentColor = EnergyBlue
            ),
            EnergyLevel(
                level = 2,
                title = "Low energy",
                shortLabel = "Low",
                description = "Steady low-intensity work",
                defaultFocusMinutes = 20,
                defaultBreakMinutes = 7,
                accentColor = EnergyBlue
            ),
            EnergyLevel(
                level = 3,
                title = "Moderate energy",
                shortLabel = "Moderate",
                description = "Balanced, standard focus pace",
                defaultFocusMinutes = 25,
                defaultBreakMinutes = 5,
                accentColor = EnergyOchre
            ),
            EnergyLevel(
                level = 4,
                title = "High energy",
                shortLabel = "High",
                description = "Deep work, complex problem solving",
                defaultFocusMinutes = 35,
                defaultBreakMinutes = 6,
                accentColor = EnergyTerracotta
            ),
            EnergyLevel(
                level = 5,
                title = "Very high energy",
                shortLabel = "Very high",
                description = "Peak mental clarity, sprint mode",
                defaultFocusMinutes = 45,
                defaultBreakMinutes = 8,
                accentColor = EnergyTerracotta
            )
        )

        fun fromLevel(level: Int): EnergyLevel {
            return ALL.find { it.level == level } ?: ALL[2] // Default to level 3 (Moderate)
        }

        fun defaultFocusMinutesFor(level: Int): Int {
            return fromLevel(level).defaultFocusMinutes
        }

        fun defaultBreakMinutesFor(level: Int): Int {
            return fromLevel(level).defaultBreakMinutes
        }

        fun colorFor(level: Int): Color {
            return fromLevel(level).accentColor
        }
    }
}
