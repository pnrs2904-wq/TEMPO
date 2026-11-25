package com.tempo.focus.ui.components

import androidx.compose.animation.animateColorAsState
import androidx.compose.animation.core.Spring
import androidx.compose.animation.core.animateFloatAsState
import androidx.compose.animation.core.spring
import androidx.compose.animation.core.tween
import androidx.compose.foundation.Canvas
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Coffee
import androidx.compose.material.icons.filled.FlashOn
import androidx.compose.material.icons.filled.Pause
import androidx.compose.material.icons.filled.PlayArrow
import androidx.compose.material.icons.filled.Refresh
import androidx.compose.material.icons.filled.Stop
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Text
import androidx.compose.material3.minimumInteractiveComponentSize
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.geometry.Offset
import androidx.compose.ui.geometry.Size
import androidx.compose.ui.graphics.Brush
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.StrokeCap
import androidx.compose.ui.graphics.drawscope.Stroke
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.res.stringResource
import androidx.compose.ui.semantics.contentDescription
import androidx.compose.ui.semantics.semantics
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.Dp
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.tempo.focus.R
import com.tempo.focus.data.model.EnergyLevel
import com.tempo.focus.data.model.SessionPhase
import com.tempo.focus.ui.theme.EnergyBlue
import com.tempo.focus.ui.viewmodel.TimerState
import kotlinx.coroutines.delay
import kotlin.math.PI
import kotlin.math.cos
import kotlin.math.roundToInt
import kotlin.math.sin

/**
 * Format remaining seconds into a standard MM:SS string (or HH:MM:SS if >= 1 hour).
 */
fun formatTimerDisplay(totalSeconds: Int): String {
    val nonNegative = totalSeconds.coerceAtLeast(0)
    val hours = nonNegative / 3600
    val minutes = (nonNegative % 3600) / 60
    val seconds = nonNegative % 60
    return if (hours > 0) {
        String.format("%02d:%02d:%02d", hours, minutes, seconds)
    } else {
        String.format("%02d:%02d", minutes, seconds)
    }
}

/**
 * Calculate normalized elapsed session progress in [0f, 1f].
 */
fun calculateSessionProgress(remainingSeconds: Int, totalSeconds: Int): Float {
    if (totalSeconds <= 0) return 0f
    return ((totalSeconds - remainingSeconds).toFloat() / totalSeconds.toFloat()).coerceIn(0f, 1f)
}

/**
 * A modular circular countdown timer component implemented with Jetpack Compose.
 *
 * Displays:
 * - Phase status pill (Focus Session / Rest Break)
 * - Circular progress indicator with tactile dial marks and animated progress arc
 * - Remaining countdown time (MM:SS) and live session completion percentage
 * - Consistent, accessible Start / Pause / Resume, Stop, and Reset controls
 */
@Composable
fun CircularCountdownTimer(
    remainingSeconds: Int,
    totalSeconds: Int,
    timerState: TimerState,
    onStart: () -> Unit,
    onPause: () -> Unit,
    onReset: () -> Unit,
    modifier: Modifier = Modifier,
    onResume: () -> Unit = onStart,
    onEndEarly: (() -> Unit)? = null,
    onStartBreak: (() -> Unit)? = null,
    phase: SessionPhase = SessionPhase.FOCUS,
    energyLevel: Int = 3,
    accentColor: Color = if (phase == SessionPhase.FOCUS) EnergyLevel.colorFor(energyLevel) else EnergyBlue,
    dialSize: Dp = 220.dp,
    strokeWidth: Dp = 10.dp,
    showContainerCard: Boolean = true
) {
    val animatedAccent by animateColorAsState(
        targetValue = accentColor,
        animationSpec = tween(durationMillis = 300),
        label = "timer_accent_color"
    )

    val content = @Composable {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(vertical = 18.dp, horizontal = 16.dp),
            horizontalAlignment = Alignment.CenterHorizontally
        ) {
            PhaseStatusBadge(phase = phase, accentColor = animatedAccent)

            Spacer(modifier = Modifier.height(14.dp))

            CircularCountdownDial(
                remainingSeconds = remainingSeconds,
                totalSeconds = totalSeconds,
                timerState = timerState,
                phase = phase,
                accentColor = animatedAccent,
                dialSize = dialSize,
                strokeWidth = strokeWidth
            )

            Spacer(modifier = Modifier.height(18.dp))

            CircularTimerControls(
                timerState = timerState,
                phase = phase,
                remainingSeconds = remainingSeconds,
                totalSeconds = totalSeconds,
                onStart = onStart,
                onPause = onPause,
                onResume = onResume,
                onStop = onEndEarly ?: onPause,
                onReset = onReset,
                onStartBreak = onStartBreak
            )
        }
    }

    if (showContainerCard) {
        Card(
            modifier = modifier
                .fillMaxWidth()
                .testTag("timer_card"),
            shape = RoundedCornerShape(24.dp),
            colors = CardDefaults.cardColors(
                containerColor = MaterialTheme.colorScheme.surface
            ),
            elevation = CardDefaults.cardElevation(defaultElevation = 1.dp),
            border = CardDefaults.outlinedCardBorder()
        ) {
            content()
        }
    } else {
        Box(modifier = modifier.fillMaxWidth()) {
            content()
        }
    }
}

/**
 * Circular countdown dial with subtle ambient aura, calibrated dial ticks,
 * smooth animated progress sweep, endpoint indicator dot, and serif digits.
 */
@Composable
fun CircularCountdownDial(
    remainingSeconds: Int,
    totalSeconds: Int,
    timerState: TimerState,
    modifier: Modifier = Modifier,
    phase: SessionPhase = SessionPhase.FOCUS,
    accentColor: Color = MaterialTheme.colorScheme.primary,
    dialSize: Dp = 220.dp,
    strokeWidth: Dp = 10.dp
) {
    val targetProgress = calculateSessionProgress(remainingSeconds, totalSeconds)
    val animatedProgress by animateFloatAsState(
        targetValue = targetProgress,
        animationSpec = spring(
            dampingRatio = Spring.DampingRatioNoBouncy,
            stiffness = Spring.StiffnessMediumLow
        ),
        label = "countdown_progress_anim"
    )

    val trackColor = MaterialTheme.colorScheme.outlineVariant.copy(alpha = 0.45f)
    val tickColor = MaterialTheme.colorScheme.onSurfaceVariant.copy(alpha = 0.22f)
    val surfaceColor = MaterialTheme.colorScheme.surface
    val timeFormatted = formatTimerDisplay(remainingSeconds)
    val percentComplete = (targetProgress * 100f).roundToInt()

    val statusLabel = when (timerState) {
        TimerState.IDLE -> stringResource(R.string.focus_timer_status_ready)
        TimerState.RUNNING -> if (phase == SessionPhase.FOCUS) {
            stringResource(R.string.focus_timer_status_focusing)
        } else {
            stringResource(R.string.focus_timer_status_resting)
        }
        TimerState.PAUSED -> stringResource(R.string.focus_timer_status_paused)
        TimerState.COMPLETED -> stringResource(R.string.focus_timer_status_finished)
        TimerState.ENDED_EARLY -> stringResource(R.string.focus_timer_status_stopped)
    }

    val progressCaption = when {
        timerState == TimerState.RUNNING || timerState == TimerState.PAUSED -> "$percentComplete% complete"
        timerState == TimerState.COMPLETED -> "100% complete"
        totalSeconds > 0 -> "${totalSeconds / 60} min session"
        else -> ""
    }

    Box(
        contentAlignment = Alignment.Center,
        modifier = modifier
            .size(dialSize)
            .testTag("circular_countdown_dial")
            .semantics {
                contentDescription = "$timeFormatted remaining, $statusLabel, $percentComplete percent complete"
            }
    ) {
        Canvas(modifier = Modifier.fillMaxSize()) {
            val strokeWidthPx = strokeWidth.toPx()
            val inset = strokeWidthPx * 1.4f
            val arcDiameter = size.minDimension - (inset * 2f)
            val radius = arcDiameter / 2f
            val center = Offset(size.width / 2f, size.height / 2f)
            val topLeft = Offset(center.x - radius, center.y - radius)

            // Soft radial atmosphere behind the active dial
            drawCircle(
                brush = Brush.radialGradient(
                    colors = listOf(
                        accentColor.copy(alpha = if (timerState == TimerState.RUNNING) 0.14f else 0.06f),
                        Color.Transparent
                    ),
                    center = center,
                    radius = radius * 1.08f
                ),
                radius = radius * 1.08f,
                center = center
            )

            // Subtle calibrated dial ticks (12 major ticks around inner ring)
            val innerTickRadius = radius - strokeWidthPx * 1.15f
            for (i in 0 until 12) {
                val angleRad = ((i * 30.0) - 90.0) * (PI / 180.0)
                val tickLength = if (i % 3 == 0) 7.dp.toPx() else 4.dp.toPx()
                val start = Offset(
                    x = center.x + (innerTickRadius - tickLength) * cos(angleRad).toFloat(),
                    y = center.y + (innerTickRadius - tickLength) * sin(angleRad).toFloat()
                )
                val end = Offset(
                    x = center.x + innerTickRadius * cos(angleRad).toFloat(),
                    y = center.y + innerTickRadius * sin(angleRad).toFloat()
                )
                drawLine(
                    color = tickColor,
                    start = start,
                    end = end,
                    strokeWidth = if (i % 3 == 0) 2.dp.toPx() else 1.2.dp.toPx(),
                    cap = StrokeCap.Round
                )
            }

            // Background full track
            drawArc(
                color = trackColor,
                startAngle = -90f,
                sweepAngle = 360f,
                useCenter = false,
                topLeft = topLeft,
                size = Size(arcDiameter, arcDiameter),
                style = Stroke(width = strokeWidthPx, cap = StrokeCap.Round)
            )

            // Active progress sweep
            if (animatedProgress > 0.001f) {
                val sweep = 360f * animatedProgress
                drawArc(
                    color = accentColor,
                    startAngle = -90f,
                    sweepAngle = sweep,
                    useCenter = false,
                    topLeft = topLeft,
                    size = Size(arcDiameter, arcDiameter),
                    style = Stroke(width = strokeWidthPx, cap = StrokeCap.Round)
                )

                // Crisp endpoint indicator bead on the progress tip
                val tipAngleRad = (-90.0 + sweep) * (PI / 180.0)
                val tipCenter = Offset(
                    x = center.x + radius * cos(tipAngleRad).toFloat(),
                    y = center.y + radius * sin(tipAngleRad).toFloat()
                )
                drawCircle(
                    color = accentColor,
                    radius = strokeWidthPx * 0.65f,
                    center = tipCenter
                )
                drawCircle(
                    color = surfaceColor,
                    radius = strokeWidthPx * 0.28f,
                    center = tipCenter
                )
            }
        }

        // Central countdown digits, status, and progress percentage
        Column(
            horizontalAlignment = Alignment.CenterHorizontally,
            modifier = Modifier.padding(horizontal = 24.dp)
        ) {
            Text(
                text = timeFormatted,
                style = MaterialTheme.typography.displayLarge.copy(
                    fontSize = if (timeFormatted.length > 5) 40.sp else 54.sp,
                    fontWeight = FontWeight.Medium,
                    fontFeatureSettings = "tnum"
                ),
                fontFamily = FontFamily.Serif,
                color = MaterialTheme.colorScheme.onSurface,
                modifier = Modifier.testTag("timer_remaining_text")
            )

            Spacer(modifier = Modifier.height(2.dp))

            Text(
                text = statusLabel,
                style = MaterialTheme.typography.labelLarge,
                color = accentColor,
                fontWeight = FontWeight.SemiBold,
                letterSpacing = 0.5.sp,
                modifier = Modifier.testTag("timer_status_label")
            )

            if (progressCaption.isNotEmpty()) {
                Text(
                    text = progressCaption,
                    style = MaterialTheme.typography.labelSmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                    modifier = Modifier
                        .padding(top = 3.dp)
                        .testTag("timer_progress_text")
                )
            }
        }
    }
}

/**
 * Phase indicator badge for Focus vs Break.
 */
@Composable
private fun PhaseStatusBadge(
    phase: SessionPhase,
    accentColor: Color
) {
    Row(
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.Center,
        modifier = Modifier
            .clip(RoundedCornerShape(50))
            .background(accentColor.copy(alpha = 0.14f))
            .padding(horizontal = 14.dp, vertical = 6.dp)
            .testTag("phase_status_badge")
    ) {
        Icon(
            imageVector = if (phase == SessionPhase.FOCUS) Icons.Default.FlashOn else Icons.Default.Coffee,
            contentDescription = null,
            tint = accentColor,
            modifier = Modifier.size(16.dp)
        )
        Spacer(modifier = Modifier.width(6.dp))
        Text(
            text = if (phase == SessionPhase.FOCUS) {
                stringResource(R.string.focus_timer_phase_focus)
            } else {
                stringResource(R.string.focus_timer_phase_break)
            },
            style = MaterialTheme.typography.labelMedium,
            fontWeight = FontWeight.Bold,
            letterSpacing = 1.2.sp,
            color = accentColor
        )
    }
}

/**
 * Balanced control dock exposing Start / Pause / Resume, Stop, and Reset buttons
 * with accessible >= 48dp touch targets and clear visual hierarchy.
 */
@Composable
fun CircularTimerControls(
    timerState: TimerState,
    phase: SessionPhase,
    onStart: () -> Unit,
    onPause: () -> Unit,
    onResume: () -> Unit,
    onReset: () -> Unit,
    modifier: Modifier = Modifier,
    remainingSeconds: Int = 0,
    totalSeconds: Int = 0,
    onStop: (() -> Unit)? = null,
    onEndEarly: (() -> Unit)? = null,
    onStartBreak: (() -> Unit)? = null
) {
    val effectiveStop = onStop ?: onEndEarly
    val isActiveSession = timerState == TimerState.RUNNING || timerState == TimerState.PAUSED
    val canReset = isActiveSession ||
        timerState == TimerState.COMPLETED ||
        timerState == TimerState.ENDED_EARLY ||
        (totalSeconds > 0 && remainingSeconds != totalSeconds)

    if ((timerState == TimerState.COMPLETED || timerState == TimerState.ENDED_EARLY) &&
        phase == SessionPhase.FOCUS && onStartBreak != null
    ) {
        Row(
            modifier = modifier.fillMaxWidth(),
            horizontalArrangement = Arrangement.spacedBy(10.dp, Alignment.CenterHorizontally),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Button(
                onClick = onStartBreak,
                modifier = Modifier
                    .weight(1.2f)
                    .height(52.dp)
                    .minimumInteractiveComponentSize()
                    .testTag("start_break_button"),
                shape = RoundedCornerShape(14.dp),
                colors = ButtonDefaults.buttonColors(containerColor = EnergyBlue),
                contentPadding = PaddingValues(horizontal = 16.dp, vertical = 0.dp)
            ) {
                Icon(
                    imageVector = Icons.Default.Coffee,
                    contentDescription = stringResource(R.string.focus_timer_cd_break),
                    modifier = Modifier.size(20.dp)
                )
                Spacer(modifier = Modifier.width(8.dp))
                Text(
                    text = stringResource(R.string.focus_timer_action_take_break),
                    style = MaterialTheme.typography.titleSmall,
                    fontWeight = FontWeight.SemiBold,
                    maxLines = 1
                )
            }

            OutlinedButton(
                onClick = onReset,
                modifier = Modifier
                    .weight(0.9f)
                    .height(52.dp)
                    .minimumInteractiveComponentSize()
                    .testTag("reset_session_button"),
                shape = RoundedCornerShape(14.dp),
                contentPadding = PaddingValues(horizontal = 14.dp, vertical = 0.dp)
            ) {
                Icon(
                    imageVector = Icons.Default.Refresh,
                    contentDescription = stringResource(R.string.focus_timer_cd_reset),
                    modifier = Modifier.size(18.dp)
                )
                Spacer(modifier = Modifier.width(6.dp))
                Text(
                    text = stringResource(R.string.focus_timer_action_reset),
                    style = MaterialTheme.typography.titleSmall,
                    maxLines = 1
                )
            }
        }
        return
    }

    // Unified 3-button control dock: Reset | Start/Pause/Resume | Stop
    Row(
        modifier = modifier.fillMaxWidth(),
        horizontalArrangement = Arrangement.spacedBy(10.dp, Alignment.CenterHorizontally),
        verticalAlignment = Alignment.CenterVertically
    ) {
        // 1. Reset Button
        OutlinedButton(
            onClick = onReset,
            enabled = canReset,
            modifier = Modifier
                .weight(0.9f)
                .height(52.dp)
                .minimumInteractiveComponentSize()
                .testTag("reset_session_button"),
            shape = RoundedCornerShape(14.dp),
            contentPadding = PaddingValues(horizontal = 10.dp, vertical = 0.dp)
        ) {
            Icon(
                imageVector = Icons.Default.Refresh,
                contentDescription = stringResource(R.string.focus_timer_cd_reset),
                modifier = Modifier.size(18.dp)
            )
            Spacer(modifier = Modifier.width(4.dp))
            Text(
                text = stringResource(R.string.focus_timer_action_reset),
                style = MaterialTheme.typography.labelLarge,
                maxLines = 1
            )
        }

        // 2. Primary Action: Start / Pause / Resume
        when (timerState) {
            TimerState.RUNNING -> {
                Button(
                    onClick = onPause,
                    modifier = Modifier
                        .weight(1.3f)
                        .height(52.dp)
                        .minimumInteractiveComponentSize()
                        .testTag("pause_session_button"),
                    shape = RoundedCornerShape(14.dp),
                    colors = ButtonDefaults.buttonColors(
                        containerColor = MaterialTheme.colorScheme.secondary
                    ),
                    contentPadding = PaddingValues(horizontal = 14.dp, vertical = 0.dp)
                ) {
                    Icon(
                        imageVector = Icons.Default.Pause,
                        contentDescription = stringResource(R.string.focus_timer_cd_pause),
                        modifier = Modifier.size(20.dp)
                    )
                    Spacer(modifier = Modifier.width(6.dp))
                    Text(
                        text = stringResource(R.string.focus_timer_action_pause),
                        style = MaterialTheme.typography.titleSmall,
                        fontWeight = FontWeight.SemiBold,
                        maxLines = 1
                    )
                }
            }

            TimerState.PAUSED -> {
                Button(
                    onClick = onResume,
                    modifier = Modifier
                        .weight(1.3f)
                        .height(52.dp)
                        .minimumInteractiveComponentSize()
                        .testTag("resume_session_button"),
                    shape = RoundedCornerShape(14.dp),
                    colors = ButtonDefaults.buttonColors(
                        containerColor = MaterialTheme.colorScheme.primary
                    ),
                    contentPadding = PaddingValues(horizontal = 14.dp, vertical = 0.dp)
                ) {
                    Icon(
                        imageVector = Icons.Default.PlayArrow,
                        contentDescription = stringResource(R.string.focus_timer_cd_resume),
                        modifier = Modifier.size(20.dp)
                    )
                    Spacer(modifier = Modifier.width(6.dp))
                    Text(
                        text = stringResource(R.string.focus_timer_action_resume),
                        style = MaterialTheme.typography.titleSmall,
                        fontWeight = FontWeight.SemiBold,
                        maxLines = 1
                    )
                }
            }

            TimerState.IDLE, TimerState.COMPLETED, TimerState.ENDED_EARLY -> {
                Button(
                    onClick = onStart,
                    modifier = Modifier
                        .weight(1.3f)
                        .height(52.dp)
                        .minimumInteractiveComponentSize()
                        .testTag("start_focus_button"),
                    shape = RoundedCornerShape(14.dp),
                    colors = ButtonDefaults.buttonColors(
                        containerColor = MaterialTheme.colorScheme.primary
                    ),
                    contentPadding = PaddingValues(horizontal = 14.dp, vertical = 0.dp)
                ) {
                    Icon(
                        imageVector = Icons.Default.PlayArrow,
                        contentDescription = stringResource(R.string.focus_timer_cd_start),
                        modifier = Modifier.size(20.dp)
                    )
                    Spacer(modifier = Modifier.width(6.dp))
                    Text(
                        text = stringResource(R.string.focus_timer_action_start),
                        style = MaterialTheme.typography.titleSmall,
                        fontWeight = FontWeight.SemiBold,
                        maxLines = 1
                    )
                }
            }
        }

        // 3. Stop Button (ends active session early & records progress)
        if (effectiveStop != null) {
            OutlinedButton(
                onClick = effectiveStop,
                enabled = isActiveSession,
                modifier = Modifier
                    .weight(0.9f)
                    .height(52.dp)
                    .minimumInteractiveComponentSize()
                    .testTag("stop_session_button"),
                shape = RoundedCornerShape(14.dp),
                contentPadding = PaddingValues(horizontal = 10.dp, vertical = 0.dp)
            ) {
                Icon(
                    imageVector = Icons.Default.Stop,
                    contentDescription = stringResource(R.string.focus_timer_cd_stop),
                    tint = if (isActiveSession) {
                        MaterialTheme.colorScheme.error
                    } else {
                        MaterialTheme.colorScheme.onSurface.copy(alpha = 0.38f)
                    },
                    modifier = Modifier.size(18.dp)
                )
                Spacer(modifier = Modifier.width(4.dp))
                Text(
                    text = stringResource(R.string.focus_timer_action_stop),
                    style = MaterialTheme.typography.labelLarge,
                    color = if (isActiveSession) {
                        MaterialTheme.colorScheme.error
                    } else {
                        MaterialTheme.colorScheme.onSurface.copy(alpha = 0.38f)
                    },
                    maxLines = 1
                )
            }
        }
    }
}

/**
 * Basic standalone circular countdown timer component.
 *
 * Can be used in any screen or module with basic boolean flags for running/paused.
 */
@Composable
fun BasicCircularCountdownTimer(
    remainingSeconds: Int,
    totalSeconds: Int,
    isRunning: Boolean,
    isPaused: Boolean,
    onStart: () -> Unit,
    onPause: () -> Unit,
    onReset: () -> Unit,
    modifier: Modifier = Modifier,
    onResume: () -> Unit = onStart,
    onStop: (() -> Unit)? = onPause,
    accentColor: Color = MaterialTheme.colorScheme.primary
) {
    val derivedState = when {
        isRunning -> TimerState.RUNNING
        isPaused -> TimerState.PAUSED
        remainingSeconds <= 0 && totalSeconds > 0 -> TimerState.COMPLETED
        else -> TimerState.IDLE
    }

    CircularCountdownTimer(
        remainingSeconds = remainingSeconds,
        totalSeconds = totalSeconds,
        timerState = derivedState,
        onStart = onStart,
        onPause = onPause,
        onResume = onResume,
        onEndEarly = onStop,
        onReset = onReset,
        modifier = modifier,
        accentColor = accentColor
    )
}

/**
 * Standalone stateful circular countdown timer component that manages its own
 * countdown loop. Ideal for quick drop-in usage or isolated previews.
 */
@Composable
fun StandaloneCircularCountdownTimer(
    initialSeconds: Int = 25 * 60,
    modifier: Modifier = Modifier,
    accentColor: Color = MaterialTheme.colorScheme.primary,
    onSessionComplete: () -> Unit = {}
) {
    var remainingSeconds by remember(initialSeconds) { mutableIntStateOf(initialSeconds) }
    var isRunning by remember { mutableStateOf(false) }
    var isPaused by remember { mutableStateOf(false) }

    LaunchedEffect(isRunning) {
        while (isRunning && remainingSeconds > 0) {
            delay(1000L)
            remainingSeconds -= 1
            if (remainingSeconds <= 0) {
                isRunning = false
                isPaused = false
                onSessionComplete()
            }
        }
    }

    BasicCircularCountdownTimer(
        remainingSeconds = remainingSeconds,
        totalSeconds = initialSeconds,
        isRunning = isRunning,
        isPaused = isPaused,
        onStart = {
            if (remainingSeconds <= 0) {
                remainingSeconds = initialSeconds
            }
            isRunning = true
            isPaused = false
        },
        onPause = {
            isRunning = false
            isPaused = true
        },
        onResume = {
            isRunning = true
            isPaused = false
        },
        onStop = {
            isRunning = false
            isPaused = true
        },
        onReset = {
            isRunning = false
            isPaused = false
            remainingSeconds = initialSeconds
        },
        modifier = modifier,
        accentColor = accentColor
    )
}
