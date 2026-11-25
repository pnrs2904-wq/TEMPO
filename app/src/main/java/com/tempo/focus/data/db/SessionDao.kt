package com.tempo.focus.data.db

import androidx.room.Dao
import androidx.room.Insert
import androidx.room.OnConflictStrategy
import androidx.room.Query
import androidx.room.Update
import kotlinx.coroutines.flow.Flow

@Dao
interface SessionDao {
    @Query("SELECT * FROM sessions WHERE deletedAt IS NULL ORDER BY timestamp DESC")
    fun getAllSessions(): Flow<List<SessionEntity>>

    @Query("SELECT * FROM sessions WHERE deletedAt IS NULL ORDER BY timestamp DESC")
    suspend fun getAllSessionsList(): List<SessionEntity>

    @Query("SELECT * FROM sessions ORDER BY timestamp DESC")
    suspend fun getAllSessionsIncludingDeleted(): List<SessionEntity>

    @Query("SELECT * FROM sessions WHERE id = :id LIMIT 1")
    suspend fun getSessionById(id: Long): SessionEntity?

    @Query("SELECT * FROM sessions WHERE syncId = :syncId LIMIT 1")
    suspend fun getSessionBySyncId(syncId: String): SessionEntity?

    @Query("SELECT * FROM sessions WHERE deletedAt IS NULL AND phase = 'focus' AND energy = :energy ORDER BY timestamp DESC")
    suspend fun getFocusSessionsByEnergy(energy: Int): List<SessionEntity>

    @Query("SELECT * FROM sessions WHERE deletedAt IS NULL AND phase = 'focus' AND energy = :energy ORDER BY timestamp DESC LIMIT :limit")
    suspend fun getRecentFocusSessionsByEnergy(energy: Int, limit: Int = 3): List<SessionEntity>

    @Query("SELECT * FROM sessions WHERE deletedAt IS NULL AND phase = 'focus' AND status = 'completed' AND energy = :energy AND LOWER(subject) = LOWER(:subject) ORDER BY timestamp DESC LIMIT :limit")
    suspend fun getRecentFocusSessionsByEnergyAndSubject(energy: Int, subject: String, limit: Int = 3): List<SessionEntity>

    @Query("SELECT DISTINCT subject FROM sessions WHERE deletedAt IS NULL AND subject != '' ORDER BY subject ASC")
    fun getUniqueSubjects(): Flow<List<String>>

    @Insert(onConflict = OnConflictStrategy.REPLACE)
    suspend fun insertSession(session: SessionEntity): Long

    @Update
    suspend fun updateSession(session: SessionEntity)

    @Query("UPDATE sessions SET deletedAt = :deletedAt, updatedAt = :deletedAt WHERE id = :id")
    suspend fun softDeleteSessionById(id: Long, deletedAt: Long = System.currentTimeMillis())

    @Query("DELETE FROM sessions WHERE id = :id")
    suspend fun deleteSessionById(id: Long)

    @Query("DELETE FROM sessions")
    suspend fun clearAllSessions()
}
