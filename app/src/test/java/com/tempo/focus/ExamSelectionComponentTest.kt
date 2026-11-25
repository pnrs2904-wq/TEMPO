package com.tempo.focus

import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.rememberScrollState
import androidx.compose.foundation.verticalScroll
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.test.assertIsDisplayed
import androidx.compose.ui.test.junit4.createComposeRule
import androidx.compose.ui.test.onNodeWithTag
import androidx.compose.ui.test.onNodeWithText
import androidx.compose.ui.test.performClick
import androidx.compose.ui.test.performScrollTo
import androidx.compose.ui.test.performTextInput
import com.tempo.focus.domain.exams.CaGroupSelection
import com.tempo.focus.domain.exams.ExamCategory
import com.tempo.focus.ui.components.ExamMetadataScope
import com.tempo.focus.ui.components.ExamSelectionComponent
import com.tempo.focus.ui.components.ScopedExamMetadata
import com.tempo.focus.ui.theme.TempoTheme
import org.junit.Assert.assertEquals
import org.junit.Assert.assertFalse
import org.junit.Assert.assertNotNull
import org.junit.Assert.assertTrue
import org.junit.Rule
import org.junit.Test
import org.junit.runner.RunWith
import org.robolectric.RobolectricTestRunner
import org.robolectric.annotation.Config

@RunWith(RobolectricTestRunner::class)
@Config(qualifiers = "w412dp-h915dp", sdk = [36])
class ExamSelectionComponentTest {

    @get:Rule
    val composeTestRule = createComposeRule()

    @Test
    fun `ExamMetadataScope strictly isolates subjects and topics per exam and CA group`() {
        val neetScope = ExamMetadataScope.resolve("neet_ug")
        val neetSubjectNames = neetScope.subjects.map { it.name }
        assertEquals(ExamCategory.MEDICAL, neetScope.category)
        assertTrue(neetSubjectNames.contains("Physics"))
        assertTrue(neetSubjectNames.contains("Botany"))
        assertTrue(neetScope.totalTopics > 0)
        assertFalse(neetSubjectNames.any { it.contains("Legal", ignoreCase = true) || it.contains("Taxation", ignoreCase = true) })

        val clatScope = ExamMetadataScope.resolve("clat_ug")
        val clatSubjectNames = clatScope.subjects.map { it.name }
        assertEquals(ExamCategory.LAW, clatScope.category)
        assertTrue(clatSubjectNames.any { it.contains("Legal", ignoreCase = true) })
        assertFalse(clatSubjectNames.contains("Physics"))
        assertFalse(clatSubjectNames.contains("Botany"))

        val caG1 = ExamMetadataScope.resolve("ca_inter_g1", CaGroupSelection.GROUP_1)
        val caG2 = ExamMetadataScope.resolve("ca_inter_g1", CaGroupSelection.GROUP_2)
        val caBoth = ExamMetadataScope.resolve("ca_inter_g1", CaGroupSelection.BOTH)
        assertEquals(3, caG1.totalSubjects)
        assertEquals(3, caG2.totalSubjects)
        assertEquals(6, caBoth.totalSubjects)
        assertTrue(caG1.subjects.map { it.name }.intersect(caG2.subjects.map { it.name }.toSet()).isEmpty())
    }

    @Test
    fun `ExamMetadataScope search matches exams by name and by scoped subject metadata`() {
        val lawMatches = ExamMetadataScope.searchExams("CLAT")
        assertTrue(lawMatches.any { it.examId == "clat_ug" })
        assertTrue(lawMatches.any { it.examId == "clat_pg" })

        val botanyMatches = ExamMetadataScope.searchExams("Botany")
        assertTrue(botanyMatches.any { it.examId == "neet_ug" })
        assertFalse(botanyMatches.any { it.examId == "clat_ug" })
    }

    @Test
    fun `switching category from Medical to Law updates scoped subjects and emits Law ScopedExamMetadata`() {
        var lastEmittedScope: ScopedExamMetadata? = null

        composeTestRule.setContent {
            TempoTheme {
                var activeExamId by remember { mutableStateOf("neet_ug") }
                Column(modifier = Modifier.verticalScroll(rememberScrollState())) {
                    ExamSelectionComponent(
                        selectedExamId = activeExamId,
                        onExamSelected = { scoped ->
                            activeExamId = scoped.exam.examId
                            lastEmittedScope = scoped
                        },
                        requireConfirmation = true
                    )
                }
            }
        }

        composeTestRule.waitForIdle()
        // Initial NEET UG scoped preview contains Physics & Botany
        composeTestRule.onNodeWithTag("exam_selection_component").assertIsDisplayed()
        composeTestRule.onNodeWithTag("scoped_subject_item_physics").performScrollTo().assertIsDisplayed()

        // Switch to Law category
        composeTestRule.onNodeWithTag("exam_category_chip_law").performClick()
        composeTestRule.waitForIdle()

        // Select CLAT UG and confirm switch
        composeTestRule.onNodeWithTag("exam_option_clat_ug").performScrollTo().performClick()
        composeTestRule.waitForIdle()
        composeTestRule.onNodeWithTag("confirm_switch_exam_button").assertIsDisplayed().performClick()
        composeTestRule.waitForIdle()

        assertNotNull(lastEmittedScope)
        assertEquals("clat_ug", lastEmittedScope!!.exam.examId)
        assertEquals(ExamCategory.LAW, lastEmittedScope!!.category)
        assertTrue(lastEmittedScope!!.subjects.any { it.name.contains("Legal", ignoreCase = true) })
        assertFalse(lastEmittedScope!!.subjects.any { it.name.equals("Physics", ignoreCase = true) })
    }

    @Test
    fun `switching to CA category and toggling CA Group I vs Group II isolates papers in preview`() {
        var selectedGroup by mutableStateOf(CaGroupSelection.GROUP_1)

        composeTestRule.setContent {
            TempoTheme {
                var activeExamId by remember { mutableStateOf("ca_inter_g1") }
                Column(modifier = Modifier.verticalScroll(rememberScrollState())) {
                    ExamSelectionComponent(
                        selectedExamId = activeExamId,
                        selectedCaGroup = selectedGroup,
                        onExamSelected = { activeExamId = it.exam.examId },
                        onCaGroupSelected = { selectedGroup = it },
                        requireConfirmation = false
                    )
                }
            }
        }

        composeTestRule.waitForIdle()
        // Group I active: should show CA Group selector and Group I paper (Advanced Accounting)
        composeTestRule.onNodeWithTag("ca_group_selector_section").performScrollTo().assertIsDisplayed()
        composeTestRule.onNodeWithTag("scoped_metadata_preview").performScrollTo().assertIsDisplayed()
        composeTestRule.onNodeWithText("Advanced Accounting", substring = true).performScrollTo().assertIsDisplayed()

        // Switch to Group II
        composeTestRule.onNodeWithTag("ca_group_chip_group_2").performScrollTo().performClick()
        composeTestRule.waitForIdle()

        assertEquals(CaGroupSelection.GROUP_2, selectedGroup)
        composeTestRule.onNodeWithText("Cost and Management Accounting", substring = true).performScrollTo().assertIsDisplayed()
        composeTestRule.onNodeWithText("Advanced Accounting", substring = true).assertDoesNotExist()
    }

    @Test
    fun `search filters across all categories and clear resets view`() {
        composeTestRule.setContent {
            TempoTheme {
                Column(modifier = Modifier.verticalScroll(rememberScrollState())) {
                    ExamSelectionComponent(
                        selectedExamId = "neet_ug",
                        onExamSelected = {},
                        requireConfirmation = false
                    )
                }
            }
        }

        composeTestRule.waitForIdle()
        composeTestRule.onNodeWithTag("exam_search_input").performTextInput("Judiciary")
        composeTestRule.waitForIdle()

        composeTestRule.onNodeWithTag("exam_option_state_judiciary").performScrollTo().assertIsDisplayed()

        composeTestRule.onNodeWithTag("exam_search_clear_button").performClick()
        composeTestRule.waitForIdle()
        composeTestRule.onNodeWithTag("exam_option_neet_ug").performScrollTo().assertIsDisplayed()
    }
}
