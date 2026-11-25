package com.tempo.focus.ui

import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.padding
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.NavigationBar
import androidx.compose.material3.NavigationBarItem
import androidx.compose.material3.NavigationBarItemDefaults
import androidx.compose.material3.Scaffold
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.remember
import androidx.compose.ui.Modifier
import androidx.compose.ui.platform.testTag
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import androidx.lifecycle.compose.collectAsStateWithLifecycle
import androidx.lifecycle.viewmodel.compose.viewModel
import androidx.navigation.NavGraph.Companion.findStartDestination
import androidx.navigation.NavHostController
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.currentBackStackEntryAsState
import androidx.navigation.compose.rememberNavController
import com.tempo.focus.domain.exams.ExamRegistry
import com.tempo.focus.ui.navigation.TempoDestination
import com.tempo.focus.ui.screens.ExamDashboardScreen
import com.tempo.focus.ui.screens.ExamPrepHubScreen
import com.tempo.focus.ui.screens.FocusTimer
import com.tempo.focus.ui.screens.GoalsScreen
import com.tempo.focus.ui.screens.HistoryScreen
import com.tempo.focus.ui.screens.PatternsScreen
import com.tempo.focus.ui.screens.SettingsScreen
import com.tempo.focus.ui.viewmodel.ExamPrepViewModel
import com.tempo.focus.ui.viewmodel.TempoViewModel

@Composable
fun TempoApp(
    viewModel: TempoViewModel = viewModel(),
    examPrepViewModel: ExamPrepViewModel = viewModel(),
    navController: NavHostController = rememberNavController()
) {
    val navBackStackEntry by navController.currentBackStackEntryAsState()
    val currentRoute = navBackStackEntry?.destination?.route ?: TempoDestination.TIMER.route
    val advancedExamMode by examPrepViewModel.advancedExamMode.collectAsStateWithLifecycle()
    val selectedExam by examPrepViewModel.selectedExam.collectAsStateWithLifecycle()
    val selectedCaGroup by examPrepViewModel.selectedCaGroup.collectAsStateWithLifecycle()
    val studyPlan by examPrepViewModel.studyPlan.collectAsStateWithLifecycle()

    val visibleDestinations = if (advancedExamMode) {
        TempoDestination.advancedModeTabs
    } else {
        TempoDestination.simpleModeTabs
    }

    val examSubjectNames = remember(selectedExam, selectedCaGroup) {
        ExamRegistry.getEffectiveSubjects(selectedExam, selectedCaGroup).map { it.name }
    }

    val navigateToRoute: (String) -> Unit = { route ->
        if (currentRoute != route) {
            navController.navigate(route) {
                popUpTo(navController.graph.findStartDestination().id) {
                    saveState = true
                }
                launchSingleTop = true
                restoreState = true
            }
        }
    }

    // If user toggles Simple/Advanced mode while on a route not in the active bottom bar, return cleanly to Timer.
    LaunchedEffect(advancedExamMode, currentRoute) {
        if (visibleDestinations.none { it.route == currentRoute }) {
            navigateToRoute(TempoDestination.TIMER.route)
        }
    }

    Scaffold(
        modifier = Modifier.fillMaxSize(),
        containerColor = MaterialTheme.colorScheme.background,
        bottomBar = {
            NavigationBar(
                containerColor = MaterialTheme.colorScheme.surface,
                tonalElevation = 2.dp
            ) {
                visibleDestinations.forEach { destination ->
                    val isSelected = currentRoute == destination.route
                    NavigationBarItem(
                        selected = isSelected,
                        onClick = { navigateToRoute(destination.route) },
                        icon = {
                            Icon(
                                imageVector = destination.icon,
                                contentDescription = destination.title
                            )
                        },
                        label = {
                            Text(
                                text = destination.title,
                                fontSize = 11.sp,
                                maxLines = 1
                            )
                        },
                        colors = NavigationBarItemDefaults.colors(
                            selectedIconColor = MaterialTheme.colorScheme.primary,
                            selectedTextColor = MaterialTheme.colorScheme.primary,
                            indicatorColor = MaterialTheme.colorScheme.primaryContainer,
                            unselectedIconColor = MaterialTheme.colorScheme.onSurfaceVariant,
                            unselectedTextColor = MaterialTheme.colorScheme.onSurfaceVariant
                        ),
                        modifier = Modifier.testTag(destination.testTag)
                    )
                }
            }
        }
    ) { innerPadding ->
        NavHost(
            navController = navController,
            startDestination = TempoDestination.TIMER.route,
            modifier = Modifier.padding(innerPadding)
        ) {
            composable(TempoDestination.DASHBOARD.route) {
                ExamDashboardScreen(
                    tempoViewModel = viewModel,
                    examPrepViewModel = examPrepViewModel,
                    onStartTimerClick = { navigateToRoute(TempoDestination.TIMER.route) },
                    onOpenPrepHub = { navigateToRoute(TempoDestination.PREP.route) }
                )
            }
            composable(TempoDestination.TIMER.route) {
                FocusTimer(
                    viewModel = viewModel,
                    activeExam = selectedExam,
                    examSubjects = examSubjectNames,
                    daysUntilExam = studyPlan.daysUntilExam,
                    advancedMode = advancedExamMode,
                    onOpenDashboard = { navigateToRoute(TempoDestination.DASHBOARD.route) },
                    onEnableAdvancedMode = { examPrepViewModel.setAdvancedExamMode(true) }
                )
            }
            composable(TempoDestination.PREP.route) {
                ExamPrepHubScreen(
                    examPrepViewModel = examPrepViewModel,
                    onSubjectClearedOnExamSwitch = { viewModel.updateSubject("") }
                )
            }
            composable(TempoDestination.GOALS.route) {
                GoalsScreen(viewModel = viewModel)
            }
            composable(TempoDestination.HISTORY.route) {
                HistoryScreen(viewModel = viewModel)
            }
            composable(TempoDestination.PATTERNS.route) {
                PatternsScreen(viewModel = viewModel)
            }
            composable(TempoDestination.SETTINGS.route) {
                SettingsScreen(
                    viewModel = viewModel,
                    examPrepViewModel = examPrepViewModel
                )
            }
        }
    }
}
