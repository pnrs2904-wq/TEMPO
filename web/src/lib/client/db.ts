/**
 * On-device storage (IndexedDB). This is the app's primary database: every session is written
 * here first and the app is fully usable with no network and no account.
 *   sessions : every session, keyed by id
 *   outbox   : ids of sessions changed since the last successful sync
 *   meta     : small key/value records (sync cursor, study plan)
 */
import { openDB, type IDBPDatabase } from "idb";
import type { Session } from "@/domain/types";
import type { PrepEnvelope, PrepTable } from "@/domain/prep/types";

const DB_NAME = "tempo";
const DB_VERSION = 2;

let dbPromise: Promise<IDBPDatabase> | null = null;

function db(): Promise<IDBPDatabase> {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(d) {
        if (!d.objectStoreNames.contains("sessions")) d.createObjectStore("sessions", { keyPath: "id" });
        if (!d.objectStoreNames.contains("outbox")) d.createObjectStore("outbox");
        if (!d.objectStoreNames.contains("meta")) d.createObjectStore("meta");
        // v2 (Tempo 3.0): exam preparation records, keyed "table:id", plus their sync outbox.
        if (!d.objectStoreNames.contains("prep")) d.createObjectStore("prep");
        if (!d.objectStoreNames.contains("prepOutbox")) d.createObjectStore("prepOutbox");
      },
    });
  }
  return dbPromise;
}

export async function loadSessions(): Promise<Session[]> {
  return (await db()).getAll("sessions");
}

/** Saves sessions and, unless they came from the server, queues them for sync. In one transaction. */
export async function saveSessions(sessions: Session[], opts: { fromServer?: boolean } = {}): Promise<void> {
  if (sessions.length === 0) return;
  const tx = (await db()).transaction(["sessions", "outbox"], "readwrite");
  for (const s of sessions) {
    tx.objectStore("sessions").put(s);
    if (!opts.fromServer) tx.objectStore("outbox").put(s.updatedAt, s.id);
  }
  await tx.done;
}

export async function outboxIds(): Promise<string[]> {
  return (await (await db()).getAllKeys("outbox")) as string[];
}

/** Removes ids from the outbox only if they have not been edited again since they were sent. */
export async function clearOutbox(sent: { id: string; updatedAt: number }[]): Promise<void> {
  const tx = (await db()).transaction("outbox", "readwrite");
  for (const { id, updatedAt } of sent) {
    const queued = (await tx.store.get(id)) as number | undefined;
    if (queued !== undefined && queued <= updatedAt) tx.store.delete(id);
  }
  await tx.done;
}

export async function getMeta<T>(key: string): Promise<T | undefined> {
  return (await db()).get("meta", key);
}

export async function setMeta(key: string, value: unknown): Promise<void> {
  await (await db()).put("meta", value, key);
}

const prepKey = (table: PrepTable, id: string) => `${table}:${id}`;

export async function loadPrep(): Promise<PrepEnvelope[]> {
  return (await db()).getAll("prep");
}

/** Saves exam-prep records in one transaction and queues them for sync unless they came from the server. */
export async function savePrep(records: PrepEnvelope[], opts: { fromServer?: boolean } = {}): Promise<void> {
  if (records.length === 0) return;
  const tx = (await db()).transaction(["prep", "prepOutbox"], "readwrite");
  for (const r of records) {
    tx.objectStore("prep").put(r, prepKey(r.table, r.row.id));
    if (!opts.fromServer) tx.objectStore("prepOutbox").put(r.row.updatedAt, prepKey(r.table, r.row.id));
  }
  await tx.done;
}

export async function prepOutboxKeys(): Promise<string[]> {
  return (await (await db()).getAllKeys("prepOutbox")) as string[];
}

export async function clearPrepOutbox(sent: PrepEnvelope[]): Promise<void> {
  const tx = (await db()).transaction("prepOutbox", "readwrite");
  for (const r of sent) {
    const key = prepKey(r.table, r.row.id);
    const queued = (await tx.store.get(key)) as number | undefined;
    if (queued !== undefined && queued <= r.row.updatedAt) tx.store.delete(key);
  }
  await tx.done;
}

/** Erases everything stored on this device. */
export async function wipeDevice(): Promise<void> {
  const d = await db();
  const tx = d.transaction(["sessions", "outbox", "meta", "prep", "prepOutbox"], "readwrite");
  await Promise.all(["sessions", "outbox", "meta", "prep", "prepOutbox"].map((n) => tx.objectStore(n as "meta").clear()));
  await tx.done;
}
