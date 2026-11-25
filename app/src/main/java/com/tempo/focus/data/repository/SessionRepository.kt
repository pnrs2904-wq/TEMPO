package com.tempo.focus.data.repository

import androidx.room.withTransaction
import com.tempo.focus.data.db.AppDatabase
import com.tempo.focus.data.db.SessionDao
import com.tempo.focus.data.db.SessionEntity
import com.tempo.focus.data.db.SyncDao
import com.tempo.focus.data.sync.SyncPayloadSerializer
import kotlinx.coroutines.flow.Flow

class SessionRepository(
    private val sessionDao: SessionDao,
    private val syncDao: SyncDao? = null,
    private val database: AppDatabase? = null,
    private val onLocalChangeEnqueued: (() -> Unit)? = null
) {
    val allSessions: Flow<List<SessionEntity>> = sessionDao.getAllSessions()
    val uniqueSubjects: Flow<List<String>> = sessionDao.getUniqueSubjects()

    suspend fun getAllSessionsList(): List<SessionEntity> {
        return sessionDao.getAllSessionsList()
    }

    suspend fun getRecentFocusSessionsByEnergy(energy: Int, limit: Int = 3): List<SessionEntity> {
        return sessionDao.getRecentFocusSessionsByEnergy(energy, limit)
    }

    suspend fun getRecentFocusSessionsByEnergyAndSubject(energy: Int, subject: String, limit: Int = 3): List<SessionEntity> {
        return sessionDao.getRecentFocusSessionsByEnergyAndSubject(energy, subject, limit)
    }

    suspend fun getFocusSessionsByEnergy(energy: Int): List<SessionEntity> {
        return sessionDao.getFocusSessionsByEnergy(energy)
    }

    suspend fun insertSession(session: SessionEntity): Long {
        val id = if (database != null && syncDao != null) {
            database.withTransaction {
                val insertedId = sessionDao.insertSession(session)
                syncDao.upsertOutbox(SyncPayloadSerializer.sessionToOutbox(session.copy(id = insertedId)))
                insertedId
            }
        } else {
            val insertedId = sessionDao.insertSession(session)
            syncDao?.upsertOutbox(SyncPayloadSerializer.sessionToOutbox(session.copy(id = insertedId)))
            insertedId
        }
        onLocalChangeEnqueued?.invoke()
        return id
    }

    suspend fun updateSession(session: SessionEntity) {
        if (database != null && syncDao != null) {
            database.withTransaction {
                sessionDao.updateSession(session)
                syncDao.upsertOutbox(SyncPayloadSerializer.sessionToOutbox(session))
            }
        } else {
            sessionDao.updateSession(session)
            syncDao?.upsertOutbox(SyncPayloadSerializer.sessionToOutbox(session))
        }
        onLocalChangeEnqueued?.invoke()
    }

    suspend fun getSessionById(id: Long): SessionEntity? {
        return sessionDao.getSessionById(id)
    }

    suspend fun deleteSessionById(id: Long) {
        val now = System.currentTimeMillis()
        if (database != null && syncDao != null) {
            database.withTransaction {
                val existing = sessionDao.getSessionById(id)
                if (existing != null) {
                    val tombstoned = existing.copy(deletedAt = now, updatedAt = now)
                    sessionDao.softDeleteSessionById(id, now)
                    syncDao.upsertOutbox(SyncPayloadSerializer.sessionToOutbox(tombstoned))
                }
            }
        } else {
            sessionDao.softDeleteSessionById(id, now)
        }
        onLocalChangeEnqueued?.invoke()
    }

    suspend fun clearAll() {
        if (database != null && syncDao != null) {
            database.withTransaction {
                sessionDao.clearAllSessions()
                syncDao.clearAllOutbox()
                syncDao.clearAllCursors()
            }
        } else {
            sessionDao.clearAllSessions()
        }
    }
}
