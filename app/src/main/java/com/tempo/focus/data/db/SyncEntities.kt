package com.tempo.focus.data.db

import androidx.room.Dao
import androidx.room.Entity
import androidx.room.Index
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.PrimaryKey
import androidx.room.Query
import kotlinx.coroutines.flow.Flow

@Entity(
    tableName = "sync_outbox",
    indices = [
        Index(value = ["status"]),
        Index(value = ["tableName"])
    ]
)
data class SyncOutboxEntity(
    @PrimaryKey
    val entityKey: String,
    val tableName: String,
    val recordId: String,
    val payloadJson: String,
    val updatedAt: Long,
    val deletedAt: Long? = null,
    val status: String = "pending", // "pending", "rejected"
    val rejectionReason: String? = null,
    val attemptCount: Int = 0
)

@Entity(tableName = "sync_cursors")
data class SyncCursorEntity(
    @PrimaryKey
    val streamName: String, // "sessions" or "prep"
    val cursorValue: String,
    val lastSyncedAt: Long
)

@Dao
interface SyncDao {

    @Query("SELECT COUNT(*) FROM sync_outbox WHERE status = 'pending'")
    fun observePendingCount(): Flow<Int>

    @Query("SELECT * FROM sync_outbox WHERE status = 'rejected' ORDER BY updatedAt DESC")
    fun observeRejectedItems(): Flow<List<SyncOutboxEntity>>

    @Query("SELECT * FROM sync_outbox WHERE status = 'pending' ORDER BY updatedAt ASC")
    suspend fun getPendingOutbox(): List<SyncOutboxEntity>

    @Query("SELECT * FROM sync_outbox ORDER BY updatedAt ASC")
    suspend fun getAllOutbox(): List<SyncOutboxEntity>

    @Query("SELECT * FROM sync_outbox WHERE entityKey = :entityKey LIMIT 1")
    suspend fun getOutboxByKey(entityKey: String): SyncOutboxEntity?

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun upsertOutbox(item: SyncOutboxEntity)

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun upsertOutboxBatch(items: List<SyncOutboxEntity>)

    @Query("DELETE FROM sync_outbox WHERE entityKey = :entityKey")
    suspend fun deleteOutboxByKey(entityKey: String)

    @Query("UPDATE sync_outbox SET status = 'rejected', rejectionReason = :reason, attemptCount = attemptCount + 1 WHERE entityKey = :entityKey")
    suspend fun markOutboxRejected(entityKey: String, reason: String)

    @Query("UPDATE sync_outbox SET status = 'pending', rejectionReason = NULL WHERE entityKey = :entityKey")
    suspend fun retryRejectedItem(entityKey: String)

    @Query("DELETE FROM sync_outbox")
    suspend fun clearAllOutbox()

    @Query("SELECT * FROM sync_cursors WHERE streamName = :streamName LIMIT 1")
    suspend fun getCursor(streamName: String): SyncCursorEntity?

    @Query("SELECT * FROM sync_cursors")
    fun observeCursors(): Flow<List<SyncCursorEntity>>

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun upsertCursor(cursor: SyncCursorEntity)

    @Query("DELETE FROM sync_cursors")
    suspend fun clearAllCursors()
}
