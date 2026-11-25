package com.tempo.focus.data.db

import android.content.Context
import androidx.room.Database
import androidx.room.Room
import androidx.room.RoomDatabase
import androidx.room.migration.Migration
import androidx.sqlite.db.SupportSQLiteDatabase

@Database(
    entities = [
        SessionEntity::class,
        UserExamPlanEntity::class,
        TopicProgressEntity::class,
        RevisionEventEntity::class,
        MockTestEntity::class,
        QuestionAttemptEntity::class,
        SyncOutboxEntity::class,
        SyncCursorEntity::class
    ],
    version = 4,
    exportSchema = false
)
abstract class AppDatabase : RoomDatabase() {
    abstract fun sessionDao(): SessionDao
    abstract fun examPrepDao(): ExamPrepDao
    abstract fun syncDao(): SyncDao

    companion object {
        @Volatile
        private var INSTANCE: AppDatabase? = null

        val MIGRATION_1_2 = object : Migration(1, 2) {
            override fun migrate(db: SupportSQLiteDatabase) {
                db.execSQL("CREATE INDEX IF NOT EXISTS `index_sessions_timestamp` ON `sessions` (`timestamp`)")
                db.execSQL("CREATE INDEX IF NOT EXISTS `index_sessions_phase_energy` ON `sessions` (`phase`, `energy`)")
                db.execSQL("CREATE INDEX IF NOT EXISTS `index_sessions_subject` ON `sessions` (`subject`)")
            }
        }

        val MIGRATION_2_3 = object : Migration(2, 3) {
            override fun migrate(db: SupportSQLiteDatabase) {
                db.execSQL(
                    """
                    CREATE TABLE IF NOT EXISTS `user_exam_plans` (
                        `id` TEXT NOT NULL,
                        `examId` TEXT NOT NULL,
                        `applicableYear` INTEGER NOT NULL,
                        `syllabusVersion` TEXT NOT NULL,
                        `selectedCaGroup` TEXT NOT NULL,
                        `examDateEpochDay` INTEGER,
                        `dailyHours` REAL NOT NULL,
                        `studyDaysPerWeek` INTEGER NOT NULL,
                        `targetScorePercent` INTEGER NOT NULL,
                        `updatedAt` INTEGER NOT NULL,
                        PRIMARY KEY(`id`)
                    )
                    """.trimIndent()
                )
                db.execSQL("CREATE UNIQUE INDEX IF NOT EXISTS `index_user_exam_plans_examId` ON `user_exam_plans` (`examId`)")

                db.execSQL(
                    """
                    CREATE TABLE IF NOT EXISTS `user_topic_progress` (
                        `id` TEXT NOT NULL,
                        `examId` TEXT NOT NULL,
                        `syllabusVersion` TEXT NOT NULL,
                        `subject` TEXT NOT NULL,
                        `unit` TEXT NOT NULL,
                        `chapter` TEXT NOT NULL,
                        `topicName` TEXT NOT NULL,
                        `subtopics` TEXT NOT NULL,
                        `status` TEXT NOT NULL,
                        `difficulty` TEXT NOT NULL,
                        `ncertCompleted` INTEGER NOT NULL,
                        `formulaRevisionDone` INTEGER NOT NULL,
                        `diagramRevisionDone` INTEGER NOT NULL,
                        `rtpMtpCompleted` INTEGER NOT NULL,
                        `revisionCount` INTEGER NOT NULL,
                        `lastStudiedEpochDay` INTEGER,
                        `nextRevisionEpochDay` INTEGER,
                        `isCustom` INTEGER NOT NULL,
                        `updatedAt` INTEGER NOT NULL,
                        PRIMARY KEY(`id`)
                    )
                    """.trimIndent()
                )
                db.execSQL("CREATE INDEX IF NOT EXISTS `index_user_topic_progress_examId` ON `user_topic_progress` (`examId`)")
                db.execSQL("CREATE INDEX IF NOT EXISTS `index_user_topic_progress_examId_subject` ON `user_topic_progress` (`examId`, `subject`)")
                db.execSQL("CREATE INDEX IF NOT EXISTS `index_user_topic_progress_examId_nextRevisionEpochDay` ON `user_topic_progress` (`examId`, `nextRevisionEpochDay`)")

                db.execSQL(
                    """
                    CREATE TABLE IF NOT EXISTS `revision_events` (
                        `id` TEXT NOT NULL,
                        `examId` TEXT NOT NULL,
                        `topicId` TEXT NOT NULL,
                        `topicName` TEXT NOT NULL,
                        `subject` TEXT NOT NULL,
                        `revisionTimestamp` INTEGER NOT NULL,
                        `revisionEpochDay` INTEGER NOT NULL,
                        `revisionNumber` INTEGER NOT NULL,
                        `recallRating` INTEGER NOT NULL,
                        `accuracyPercent` INTEGER,
                        `difficulty` INTEGER NOT NULL,
                        `nextRevisionEpochDay` INTEGER NOT NULL,
                        `method` TEXT NOT NULL,
                        `notes` TEXT,
                        PRIMARY KEY(`id`),
                        FOREIGN KEY(`topicId`) REFERENCES `user_topic_progress`(`id`) ON UPDATE NO ACTION ON DELETE CASCADE
                    )
                    """.trimIndent()
                )
                db.execSQL("CREATE INDEX IF NOT EXISTS `index_revision_events_examId` ON `revision_events` (`examId`)")
                db.execSQL("CREATE INDEX IF NOT EXISTS `index_revision_events_topicId` ON `revision_events` (`topicId`)")
                db.execSQL("CREATE UNIQUE INDEX IF NOT EXISTS `index_revision_events_topicId_revisionEpochDay` ON `revision_events` (`topicId`, `revisionEpochDay`)")

                db.execSQL(
                    """
                    CREATE TABLE IF NOT EXISTS `mock_tests` (
                        `id` TEXT NOT NULL,
                        `examId` TEXT NOT NULL,
                        `attemptYear` INTEGER NOT NULL,
                        `mockName` TEXT NOT NULL,
                        `dateTimestamp` INTEGER NOT NULL,
                        `totalQuestions` INTEGER NOT NULL,
                        `attemptedQuestions` INTEGER NOT NULL,
                        `correctAnswers` INTEGER NOT NULL,
                        `incorrectAnswers` INTEGER NOT NULL,
                        `unansweredQuestions` INTEGER NOT NULL,
                        `positiveMarksPerQ` REAL NOT NULL,
                        `negativeMarksPerQ` REAL NOT NULL,
                        `totalScore` REAL NOT NULL,
                        `maxMarks` REAL NOT NULL,
                        `percentage` REAL NOT NULL,
                        `accuracyPercent` REAL NOT NULL,
                        `durationMinutes` INTEGER NOT NULL,
                        `avgSecondsPerQuestion` REAL NOT NULL,
                        `weakestSubject` TEXT,
                        `weakestSubjectAccuracy` REAL,
                        `isQuickEntry` INTEGER NOT NULL,
                        `notes` TEXT,
                        PRIMARY KEY(`id`)
                    )
                    """.trimIndent()
                )
                db.execSQL("CREATE INDEX IF NOT EXISTS `index_mock_tests_examId` ON `mock_tests` (`examId`)")
                db.execSQL("CREATE INDEX IF NOT EXISTS `index_mock_tests_examId_dateTimestamp` ON `mock_tests` (`examId`, `dateTimestamp`)")

                db.execSQL(
                    """
                    CREATE TABLE IF NOT EXISTS `question_attempts` (
                        `id` TEXT NOT NULL,
                        `mockTestId` TEXT NOT NULL,
                        `examId` TEXT NOT NULL,
                        `questionNumber` INTEGER NOT NULL,
                        `subject` TEXT NOT NULL,
                        `topicName` TEXT NOT NULL,
                        `difficulty` TEXT NOT NULL,
                        `selectedAnswer` TEXT,
                        `correctAnswer` TEXT NOT NULL,
                        `isCorrect` INTEGER NOT NULL,
                        `timeSpentSeconds` INTEGER NOT NULL,
                        `errorCategory` TEXT,
                        PRIMARY KEY(`id`),
                        FOREIGN KEY(`mockTestId`) REFERENCES `mock_tests`(`id`) ON UPDATE NO ACTION ON DELETE CASCADE
                    )
                    """.trimIndent()
                )
                db.execSQL("CREATE INDEX IF NOT EXISTS `index_question_attempts_mockTestId` ON `question_attempts` (`mockTestId`)")
                db.execSQL("CREATE INDEX IF NOT EXISTS `index_question_attempts_examId_subject` ON `question_attempts` (`examId`, `subject`)")
            }
        }

        val MIGRATION_3_4 = object : Migration(3, 4) {
            override fun migrate(db: SupportSQLiteDatabase) {
                // Sessions: syncId + deletedAt
                db.execSQL("ALTER TABLE `sessions` ADD COLUMN `syncId` TEXT NOT NULL DEFAULT ''")
                db.execSQL("UPDATE `sessions` SET `syncId` = 'legacy-session-' || `id` WHERE `syncId` = ''")
                db.execSQL("ALTER TABLE `sessions` ADD COLUMN `deletedAt` INTEGER")
                db.execSQL("CREATE INDEX IF NOT EXISTS `index_sessions_syncId` ON `sessions` (`syncId`)")

                // Prep tables: updatedAt & deletedAt tombstones
                db.execSQL("ALTER TABLE `user_exam_plans` ADD COLUMN `deletedAt` INTEGER")
                db.execSQL("ALTER TABLE `user_topic_progress` ADD COLUMN `deletedAt` INTEGER")

                db.execSQL("ALTER TABLE `revision_events` ADD COLUMN `updatedAt` INTEGER NOT NULL DEFAULT 0")
                db.execSQL("UPDATE `revision_events` SET `updatedAt` = `revisionTimestamp` WHERE `updatedAt` = 0")
                db.execSQL("ALTER TABLE `revision_events` ADD COLUMN `deletedAt` INTEGER")

                db.execSQL("ALTER TABLE `mock_tests` ADD COLUMN `updatedAt` INTEGER NOT NULL DEFAULT 0")
                db.execSQL("UPDATE `mock_tests` SET `updatedAt` = `dateTimestamp` WHERE `updatedAt` = 0")
                db.execSQL("ALTER TABLE `mock_tests` ADD COLUMN `deletedAt` INTEGER")

                db.execSQL("ALTER TABLE `question_attempts` ADD COLUMN `updatedAt` INTEGER NOT NULL DEFAULT 0")
                db.execSQL("ALTER TABLE `question_attempts` ADD COLUMN `deletedAt` INTEGER")

                // Offline-first Sync Outbox & Dual Cursors
                db.execSQL(
                    """
                    CREATE TABLE IF NOT EXISTS `sync_outbox` (
                        `entityKey` TEXT NOT NULL,
                        `tableName` TEXT NOT NULL,
                        `recordId` TEXT NOT NULL,
                        `payloadJson` TEXT NOT NULL,
                        `updatedAt` INTEGER NOT NULL,
                        `deletedAt` INTEGER,
                        `status` TEXT NOT NULL,
                        `rejectionReason` TEXT,
                        `attemptCount` INTEGER NOT NULL,
                        PRIMARY KEY(`entityKey`)
                    )
                    """.trimIndent()
                )
                db.execSQL("CREATE INDEX IF NOT EXISTS `index_sync_outbox_status` ON `sync_outbox` (`status`)")
                db.execSQL("CREATE INDEX IF NOT EXISTS `index_sync_outbox_tableName` ON `sync_outbox` (`tableName`)")

                db.execSQL(
                    """
                    CREATE TABLE IF NOT EXISTS `sync_cursors` (
                        `streamName` TEXT NOT NULL,
                        `cursorValue` TEXT NOT NULL,
                        `lastSyncedAt` INTEGER NOT NULL,
                        PRIMARY KEY(`streamName`)
                    )
                    """.trimIndent()
                )
            }
        }

        fun getDatabase(context: Context): AppDatabase {
            return INSTANCE ?: synchronized(this) {
                val instance = Room.databaseBuilder(
                    context.applicationContext,
                    AppDatabase::class.java,
                    "tempo_database"
                )
                    .addMigrations(MIGRATION_1_2, MIGRATION_2_3, MIGRATION_3_4)
                    // Destructive migrations are prohibited on upgrade and downgrade to protect user study history.
                    .build()
                INSTANCE = instance
                instance
            }
        }
    }
}
