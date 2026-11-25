package com.tempo.focus.ui.screens

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.animateContentSize
import androidx.compose.foundation.background
import androidx.compose.foundation.border
import androidx.compose.foundation.clickable
import androidx.compose.foundation.horizontalScroll
import androidx.compose.foundation.isSystemInDarkTheme
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.AutoAwesome
import androidx.compose.material.icons.filled.Info
import androidx.compose.material3.Card
import androidx.compose.material3.CardDefaults
import androidx.compose.material3.FilterChip
import androidx.compose.material3.FilterChipDefaults
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import com.tempo.focus.data.model.EnergyLevel
import com.tempo.focus.data.model.SessionType
import com.tempo.focus.ui.theme.CharcoalPrimary
import com.tempo.focus.ui.theme.CharcoalSecondary
import com.tempo.focus.ui.theme.DarkTextPrimary
import com.tempo.focus.ui.theme.DarkTextSecondary
import com.tempo.focus.ui.theme.EnergyOchre
import com.tempo.focus.ui.theme.EnergyOchreDark
import com.tempo.focus.ui.theme.EnergyOchreLight
import com.tempo.focus.ui.viewmodel.TempoViewModel

/**
 * Compatibility entry point delegating to [FocusTimer].
 */
@Composable
fun FocusTimerScreen(viewModel: TempoViewModel) {
    FocusTimer(viewModel = viewModel)
}

@Composable
fun SessionSetupCard(
    isLocked: Boolean,
    subject: String,
    onSubjectChange: (String) -> Unit,
    sessionType: SessionType,
    onSessionTypeSelect: (SessionType) -> Unit,
    selectedEnergy: Int,
    onEnergySelect: (Int) -> Unit,
    recommendationMinutes: Int,
    recommendationReason: String,
    recommendationOverrodeFeedback: Boolean = false,
    recommendationOverrideExplanation: String? = null,
    recommendationSubjectSessionsLogged: Int? = null,
    examSubjects: List<String> = emptyList(),
    workingSteps: List<String> = emptyList()
) {
    Card(
        modifier = Modifier
            .fillMaxWidth()
            .testTag("session_setup_card"),
        shape = RoundedCornerShape(16.dp),
        colors = CardDefaults.cardColors(
            containerColor = MaterialTheme.colorScheme.surface
        ),
        border = CardDefaults.outlinedCardBorder()
    ) {
        Column(
            modifier = Modifier
                .fillMaxWidth()
                .padding(18.dp)
        ) {
            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween,
                verticalAlignment = Alignment.CenterVertically
            ) {
                Text(
                    text = "Session Setup",
                    style = MaterialTheme.typography.titleMedium,
                    fontFamily = FontFamily.Serif,
                    fontWeight = FontWeight.Bold
                )

                if (isLocked) {
                    Text(
                        text = "Locked during session",
                        style = MaterialTheme.typography.bodySmall,
                        color = MaterialTheme.colorScheme.outline
                    )
                }
            }

            Spacer(modifier = Modifier.height(16.dp))

            // 1. Energy Selector (1 to 5)
            Text(
                text = "CURRENT ENERGY LEVEL",
                style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                letterSpacing = 1.sp
            )

            Spacer(modifier = Modifier.height(8.dp))

            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.SpaceBetween
            ) {
                EnergyLevel.ALL.forEach { energy ->
                    val isSelected = energy.level == selectedEnergy
                    val chipColor = energy.accentColor

                    Box(
                        contentAlignment = Alignment.Center,
                        modifier = Modifier
                            .size(52.dp)
                            .clip(RoundedCornerShape(12.dp))
                            .background(
                                if (isSelected) chipColor else MaterialTheme.colorScheme.surfaceVariant
                            )
                            .border(
                                width = if (isSelected) 2.dp else 1.dp,
                                color = if (isSelected) chipColor else MaterialTheme.colorScheme.outlineVariant,
                                shape = RoundedCornerShape(12.dp)
                            )
                            .clickable(enabled = !isLocked) {
                                onEnergySelect(energy.level)
                            }
                            .testTag("energy_level_${energy.level}")
                    ) {
                        Text(
                            text = "${energy.level}",
                            style = MaterialTheme.typography.titleMedium,
                            fontWeight = FontWeight.Bold,
                            color = if (isSelected) Color.White else MaterialTheme.colorScheme.onSurfaceVariant
                        )
                    }
                }
            }

            // Energy explanation
            val currentEnergyObj = EnergyLevel.fromLevel(selectedEnergy)
            Spacer(modifier = Modifier.height(8.dp))
            Row(verticalAlignment = Alignment.CenterVertically) {
                Box(
                    modifier = Modifier
                        .size(8.dp)
                        .clip(CircleShape)
                        .background(currentEnergyObj.accentColor)
                )
                Spacer(modifier = Modifier.width(8.dp))
                Text(
                    text = "${currentEnergyObj.title}: ${currentEnergyObj.description}",
                    style = MaterialTheme.typography.bodySmall,
                    color = MaterialTheme.colorScheme.onSurfaceVariant
                )
            }

            Spacer(modifier = Modifier.height(18.dp))

            val isSubjectFallback = recommendationReason.startsWith("Not enough")
            val infoTextColor = if (isSystemInDarkTheme()) DarkTextSecondary else CharcoalSecondary
            val displayReason = if (isSubjectFallback && recommendationSubjectSessionsLogged != null && recommendationSubjectSessionsLogged in 1..2) {
                val subName = subject.trim().ifEmpty { "subject" }
                "Not enough $subName history yet ($recommendationSubjectSessionsLogged of 3 sessions logged) — using your overall pattern at this energy level"
            } else {
                recommendationReason
            }

            // Recommended Duration Display
            Box(
                modifier = Modifier
                    .fillMaxWidth()
                    .clip(RoundedCornerShape(12.dp))
                    .background(currentEnergyObj.accentColor.copy(alpha = 0.12f))
                    .padding(horizontal = 14.dp, vertical = 10.dp)
            ) {
                Column {
                    Row(
                        modifier = Modifier.fillMaxWidth(),
                        horizontalArrangement = Arrangement.SpaceBetween,
                        verticalAlignment = Alignment.CenterVertically
                    ) {
                        Column {
                            Text(
                                text = "Recommended Focus",
                                style = MaterialTheme.typography.labelSmall,
                                color = MaterialTheme.colorScheme.onSurfaceVariant
                            )
                            Text(
                                text = "$recommendationMinutes minutes",
                                style = MaterialTheme.typography.titleMedium,
                                fontWeight = FontWeight.Bold,
                                color = currentEnergyObj.accentColor
                            )
                        }

                        if (!isSubjectFallback) {
                            Box(
                                modifier = Modifier
                                    .clip(RoundedCornerShape(8.dp))
                                    .background(MaterialTheme.colorScheme.surface)
                                    .padding(horizontal = 8.dp, vertical = 4.dp)
                            ) {
                                Text(
                                    text = displayReason,
                                    style = MaterialTheme.typography.bodySmall,
                                    color = MaterialTheme.colorScheme.onSurfaceVariant,
                                    fontSize = 11.sp
                                )
                            }
                        }
                    }

                    if (isSubjectFallback) {
                        Spacer(modifier = Modifier.height(6.dp))
                        Row(
                            verticalAlignment = Alignment.CenterVertically,
                            modifier = Modifier.padding(top = 2.dp)
                        ) {
                            Icon(
                                imageVector = Icons.Default.Info,
                                contentDescription = null,
                                modifier = Modifier.size(16.dp),
                                tint = infoTextColor
                            )
                            Spacer(modifier = Modifier.width(6.dp))
                            Text(
                                text = displayReason,
                                style = MaterialTheme.typography.bodySmall,
                                color = infoTextColor,
                                fontSize = 11.5.sp,
                                lineHeight = 15.sp
                            )
                        }
                    }

                    if (workingSteps.isNotEmpty()) {
                        var showWorking by remember { mutableStateOf(false) }
                        Spacer(modifier = Modifier.height(6.dp))
                        Text(
                            text = if (showWorking) "Hide working" else "Show working",
                            style = MaterialTheme.typography.labelSmall,
                            fontWeight = FontWeight.Bold,
                            color = MaterialTheme.colorScheme.primary,
                            modifier = Modifier
                                .clip(RoundedCornerShape(6.dp))
                                .clickable { showWorking = !showWorking }
                                .padding(vertical = 2.dp)
                                .testTag("show_working_toggle")
                        )
                        AnimatedVisibility(visible = showWorking) {
                            Column(
                                modifier = Modifier
                                    .fillMaxWidth()
                                    .padding(top = 4.dp)
                                    .testTag("working_steps_container"),
                                verticalArrangement = Arrangement.spacedBy(2.dp)
                            ) {
                                workingSteps.forEach { step ->
                                    Text(
                                        text = "• $step",
                                        style = MaterialTheme.typography.labelSmall,
                                        color = infoTextColor,
                                        lineHeight = 14.sp
                                    )
                                }
                            }
                        }
                    }
                }
            }

            if (recommendationOverrodeFeedback) {
                Spacer(modifier = Modifier.height(10.dp))
                var isWhyExpanded by remember { mutableStateOf(false) }

                val ochreBg = if (isSystemInDarkTheme()) EnergyOchre.copy(alpha = 0.18f) else EnergyOchreLight
                val ochreBorder = if (isSystemInDarkTheme()) EnergyOchreDark.copy(alpha = 0.4f) else EnergyOchre.copy(alpha = 0.35f)
                val ochreContentColor = if (isSystemInDarkTheme()) EnergyOchreDark else EnergyOchre
                val textColor = if (isSystemInDarkTheme()) DarkTextPrimary else CharcoalPrimary
                val secondaryTextColor = if (isSystemInDarkTheme()) DarkTextSecondary else CharcoalSecondary

                Box(
                    modifier = Modifier
                        .fillMaxWidth()
                        .clip(RoundedCornerShape(10.dp))
                        .background(ochreBg)
                        .border(1.dp, ochreBorder, RoundedCornerShape(10.dp))
                        .padding(horizontal = 12.dp, vertical = 10.dp)
                        .animateContentSize()
                        .testTag("override_feedback_note")
                ) {
                    Column {
                        Row(
                            verticalAlignment = Alignment.CenterVertically,
                            modifier = Modifier.fillMaxWidth()
                        ) {
                            Icon(
                                imageVector = Icons.Default.AutoAwesome,
                                contentDescription = null,
                                tint = ochreContentColor,
                                modifier = Modifier.size(16.dp)
                            )
                            Spacer(modifier = Modifier.width(8.dp))
                            Text(
                                text = "You said sessions felt short, but recent focus quality suggests holding steady.",
                                style = MaterialTheme.typography.bodySmall,
                                color = textColor,
                                fontSize = 11.5.sp,
                                lineHeight = 15.sp,
                                modifier = Modifier.weight(1f)
                            )
                            Spacer(modifier = Modifier.width(8.dp))
                            Text(
                                text = if (isWhyExpanded) "Hide" else "Why?",
                                style = MaterialTheme.typography.labelSmall,
                                fontWeight = FontWeight.Bold,
                                color = ochreContentColor,
                                modifier = Modifier
                                    .clip(RoundedCornerShape(4.dp))
                                    .clickable { isWhyExpanded = !isWhyExpanded }
                                    .padding(horizontal = 6.dp, vertical = 2.dp)
                                    .testTag("override_why_button")
                            )
                        }

                        if (isWhyExpanded) {
                            Spacer(modifier = Modifier.height(6.dp))
                            val gateReason = recommendationOverrideExplanation?.replaceFirstChar { it.uppercase() }
                                ?: "Difficulty or focus quality in your recent sessions suggested holding steady."
                            Text(
                                text = gateReason,
                                style = MaterialTheme.typography.bodySmall,
                                color = secondaryTextColor,
                                fontSize = 11.sp,
                                lineHeight = 15.sp,
                                modifier = Modifier
                                    .padding(start = 24.dp)
                                    .testTag("override_gate_detail")
                            )
                        }
                    }
                }
            }

            Spacer(modifier = Modifier.height(18.dp))

            // 2. Subject input (optional, max 60 chars)
            OutlinedTextField(
                value = subject,
                onValueChange = onSubjectChange,
                enabled = !isLocked,
                modifier = Modifier
                    .fillMaxWidth()
                    .testTag("subject_input_field"),
                label = { Text("What are you working on?") },
                placeholder = { Text("e.g. Hydrology, Revision, Practice Questions") },
                singleLine = true,
                shape = RoundedCornerShape(12.dp),
                colors = OutlinedTextFieldDefaults.colors(
                    focusedBorderColor = MaterialTheme.colorScheme.primary,
                    unfocusedBorderColor = MaterialTheme.colorScheme.outline
                ),
                supportingText = {
                    Text(
                        text = "${subject.length}/60",
                        modifier = Modifier.fillMaxWidth(),
                        textAlign = TextAlign.End
                    )
                }
            )

            if (examSubjects.isNotEmpty() && !isLocked) {
                Row(
                    modifier = Modifier
                        .fillMaxWidth()
                        .horizontalScroll(rememberScrollState()),
                    horizontalArrangement = Arrangement.spacedBy(6.dp)
                ) {
                    examSubjects.forEach { examSub ->
                        FilterChip(
                            selected = subject.equals(examSub, ignoreCase = true),
                            onClick = { onSubjectChange(examSub.take(60)) },
                            label = {
                                Text(
                                    text = examSub,
                                    style = MaterialTheme.typography.labelSmall,
                                    maxLines = 1
                                )
                            }
                        )
                    }
                }
            }

            Spacer(modifier = Modifier.height(12.dp))

            // 3. Session Type Selector
            Text(
                text = "SESSION TYPE",
                style = MaterialTheme.typography.labelSmall,
                color = MaterialTheme.colorScheme.onSurfaceVariant,
                letterSpacing = 1.sp
            )

            Spacer(modifier = Modifier.height(6.dp))

            Row(
                modifier = Modifier.fillMaxWidth(),
                horizontalArrangement = Arrangement.spacedBy(8.dp)
            ) {
                SessionType.entries.forEach { type ->
                    val isSelected = type == sessionType
                    FilterChip(
                        selected = isSelected,
                        onClick = { if (!isLocked) onSessionTypeSelect(type) },
                        enabled = !isLocked,
                        label = {
                            Text(
                                text = type.displayName,
                                style = MaterialTheme.typography.bodySmall
                            )
                        },
                        colors = FilterChipDefaults.filterChipColors(
                            selectedContainerColor = MaterialTheme.colorScheme.secondaryContainer,
                            selectedLabelColor = MaterialTheme.colorScheme.onSecondaryContainer
                        ),
                        modifier = Modifier.testTag("session_type_${type.name.lowercase()}")
                    )
                }
            }
        }
    }
}
