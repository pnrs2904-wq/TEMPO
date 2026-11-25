package com.tempo.focus.domain.sync

/**
 * Pure Kotlin offline-first sync merge & outbox resolution engine.
 * Shared specification between Android (Room) and Web (IndexedDB):
 * - Later updatedAt (ms) wins.
 * - On an exact timestamp tie (incoming.updatedAt == local.updatedAt), a deletion tombstone (deletedAt != null) wins.
 * - Outbox entries are cleared ONLY when the server accepted the record at acceptedUpdatedAt >= outbox.updatedAt.
 */
data class SyncRecordMeta(
    val table: String,
    val id: String,
    val updatedAt: Long,
    val deletedAt: Long? = null
) {
    val isTombstone: Boolean get() = deletedAt != null
}

enum class MergeWinner {
    LOCAL,
    INCOMING
}

data class OutboxItemMeta(
    val table: String,
    val id: String,
    val updatedAt: Long
)

data class ServerAcceptedRecord(
    val table: String,
    val id: String,
    val acceptedUpdatedAt: Long
)

data class ServerRejectedRecord(
    val table: String,
    val id: String,
    val reason: String
)

data class OutboxResolution(
    val idsToClear: Set<Pair<String, String>>,
    val retainedBecauseNewerLocalEdit: Set<Pair<String, String>>,
    val rejectedWithReason: Map<Pair<String, String>, String>
)

object SyncMergeEngine {

    /**
     * Resolves a conflict between [local] and [incoming] record metadata.
     * Rule:
     * 1. If local == null -> INCOMING wins.
     * 2. If incoming.updatedAt > local.updatedAt -> INCOMING wins.
     * 3. If local.updatedAt > incoming.updatedAt -> LOCAL wins.
     * 4. Tie (incoming.updatedAt == local.updatedAt):
     *    - If incoming is tombstone and local is live -> INCOMING wins (tombstone wins a tie).
     *    - If local is tombstone and incoming is live -> LOCAL wins (tombstone wins a tie).
     *    - Otherwise -> LOCAL wins (idempotent stability).
     */
    fun resolveWinner(local: SyncRecordMeta?, incoming: SyncRecordMeta): MergeWinner {
        if (local == null) return MergeWinner.INCOMING
        return when {
            incoming.updatedAt > local.updatedAt -> MergeWinner.INCOMING
            local.updatedAt > incoming.updatedAt -> MergeWinner.LOCAL
            incoming.isTombstone && !local.isTombstone -> MergeWinner.INCOMING
            local.isTombstone && !incoming.isTombstone -> MergeWinner.LOCAL
            else -> MergeWinner.LOCAL
        }
    }

    /**
     * Determines which outbox items can be safely cleared after a POST /api/sync response.
     * Only clears entries whose server-accepted timestamp covers the current outbox updatedAt
     * so concurrent local edits made while a sync was in flight are NEVER lost.
     */
    fun resolveOutboxAfterSync(
        outbox: List<OutboxItemMeta>,
        accepted: List<ServerAcceptedRecord>,
        rejected: List<ServerRejectedRecord>
    ): OutboxResolution {
        val acceptedMap = accepted.associateBy({ it.table to it.id }, { it.acceptedUpdatedAt })
        val rejectedMap = rejected.associateBy({ it.table to it.id }, { it.reason })

        val toClear = mutableSetOf<Pair<String, String>>()
        val retainedNewer = mutableSetOf<Pair<String, String>>()
        val rejectedOut = mutableMapOf<Pair<String, String>, String>()

        for (item in outbox) {
            val key = item.table to item.id
            val rejectionReason = rejectedMap[key]
            if (rejectionReason != null) {
                rejectedOut[key] = rejectionReason
                continue
            }
            val acceptedTs = acceptedMap[key]
            if (acceptedTs != null) {
                if (acceptedTs >= item.updatedAt) {
                    toClear.add(key)
                } else {
                    retainedNewer.add(key)
                }
            }
        }

        return OutboxResolution(
            idsToClear = toClear,
            retainedBecauseNewerLocalEdit = retainedNewer,
            rejectedWithReason = rejectedOut
        )
    }
}
