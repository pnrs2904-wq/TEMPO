package com.tempo.focus.ui.theme

import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.darkColorScheme
import androidx.compose.material3.lightColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.ui.graphics.Color

enum class TempoThemeMode(val value: String, val label: String) {
    AUTO("auto", "Auto"),
    PAPER("paper", "Paper"),
    NIGHT("night", "Night"),
    HIGH_CONTRAST("high_contrast", "High Contrast");

    companion object {
        fun fromValue(raw: String?): TempoThemeMode {
            return entries.firstOrNull { it.value.equals(raw, ignoreCase = true) } ?: AUTO
        }
    }
}

private val DarkColorScheme = darkColorScheme(
    primary = EnergyTerracottaDark,
    onPrimary = DarkBackground,
    primaryContainer = EnergyTerracotta,
    onPrimaryContainer = DarkTextPrimary,
    secondary = EnergyOchreDark,
    onSecondary = DarkBackground,
    secondaryContainer = DarkSurfaceVariant,
    onSecondaryContainer = DarkTextPrimary,
    tertiary = EnergyBlueDark,
    onTertiary = DarkBackground,
    background = DarkBackground,
    onBackground = DarkTextPrimary,
    surface = DarkSurface,
    onSurface = DarkTextPrimary,
    surfaceVariant = DarkSurfaceVariant,
    onSurfaceVariant = DarkTextSecondary,
    outline = DarkBorder,
    outlineVariant = DarkBorderLight
)

private val LightColorScheme = lightColorScheme(
    primary = EnergyTerracotta,
    onPrimary = Color.White,
    primaryContainer = EnergyTerracottaLight,
    onPrimaryContainer = EnergyTerracotta,
    secondary = EnergyOchre,
    onSecondary = Color.White,
    secondaryContainer = EnergyOchreLight,
    onSecondaryContainer = EnergyOchre,
    tertiary = EnergyBlue,
    onTertiary = Color.White,
    background = PaperBackground,
    onBackground = CharcoalPrimary,
    surface = PaperSurface,
    onSurface = CharcoalPrimary,
    surfaceVariant = PaperSurfaceVariant,
    onSurfaceVariant = CharcoalSecondary,
    outline = PaperBorder,
    outlineVariant = PaperBorderLight
)

private val HighContrastColorScheme = lightColorScheme(
    primary = Color(0xFF000000),
    onPrimary = Color(0xFFFFFFFF),
    primaryContainer = Color(0xFFE6E6E6),
    onPrimaryContainer = Color(0xFF000000),
    secondary = Color(0xFF0B3D91),
    onSecondary = Color(0xFFFFFFFF),
    secondaryContainer = Color(0xFFD9E6FF),
    onSecondaryContainer = Color(0xFF000000),
    tertiary = Color(0xFF7A1C00),
    onTertiary = Color(0xFFFFFFFF),
    background = Color(0xFFFFFFFF),
    onBackground = Color(0xFF000000),
    surface = Color(0xFFFFFFFF),
    onSurface = Color(0xFF000000),
    surfaceVariant = Color(0xFFF0F0F0),
    onSurfaceVariant = Color(0xFF1A1A1A),
    outline = Color(0xFF000000),
    outlineVariant = Color(0xFF333333),
    error = Color(0xFF9B0000),
    onError = Color(0xFFFFFFFF)
)

@Composable
fun TempoTheme(
    themeMode: TempoThemeMode = TempoThemeMode.AUTO,
    darkTheme: Boolean = isSystemInDarkTheme(),
    content: @Composable () -> Unit
) {
    val colorScheme = when (themeMode) {
        TempoThemeMode.AUTO -> if (darkTheme) DarkColorScheme else LightColorScheme
        TempoThemeMode.PAPER -> LightColorScheme
        TempoThemeMode.NIGHT -> DarkColorScheme
        TempoThemeMode.HIGH_CONTRAST -> HighContrastColorScheme
    }

    MaterialTheme(
        colorScheme = colorScheme,
        typography = Typography,
        content = content
    )
}

// Keep backwards-compatible alias if any old test uses it
@Composable
fun MyApplicationTheme(
    darkTheme: Boolean = isSystemInDarkTheme(),
    dynamicColor: Boolean = false,
    content: @Composable () -> Unit
) {
    TempoTheme(
        themeMode = if (darkTheme) TempoThemeMode.NIGHT else TempoThemeMode.PAPER,
        darkTheme = darkTheme,
        content = content
    )
}
