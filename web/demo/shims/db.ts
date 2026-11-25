/**
 * Stand-in for src/lib/client/db.ts in the single-file build: same functions, stored in
 * localStorage when the browser allows it and in memory when it does not.
 */
import type { PrepEnvelope } from "@/domain/prep/types";
import type { Session } from "@/domain/types";

const KEY = "tempo.html.v2";
interface Shape { sessions: Record<string, Session>; outbox: Record<string, number>; meta: Record<string, unknown>; prep: Record<string, PrepEnvelope>; prepOutbox: Record<string, number> }
const empty = (): Shape => ({ sessions: {}, outbox: {}, meta: {}, prep: {}, prepOutbox: {} });
let mem: Shape | null = null;

function read(): Shape {
  if (mem) return mem;
  try {
    const raw = localStorage.getItem(KEY);
    mem = raw ? { ...empty(), ...(JSON.parse(raw) as Shape) } : empty();
  } catch {
    mem = empty();
  }
  return mem;
}
function write() {
  try {
    localStorage.setItem(KEY, JSON.stringify(mem));
  } catch {
    /* storage unavailable: data lasts until the page is closed */
  }
}

export async function loadSessions(): Promise<Session[]> { return Object.values(read().sessions); }
export async function saveSessions(sessions: Session[], opts: { fromServer?: boolean } = {}): Promise<void> {
  const d = read();
  for (const s of sessions) { d.sessions[s.id] = s; if (!opts.fromServer) d.outbox[s.id] = s.updatedAt; }
  write();
}
export async function outboxIds(): Promise<string[]> { return Object.keys(read().outbox); }
export async function clearOutbox(sent: { id: string; updatedAt: number }[]): Promise<void> {
  const d = read();
  for (const { id, updatedAt } of sent) if (d.outbox[id] !== undefined && d.outbox[id] <= updatedAt) delete d.outbox[id];
  write();
}
export async function getMeta<T>(key: string): Promise<T | undefined> { return read().meta[key] as T | undefined; }
export async function setMeta(key: string, value: unknown): Promise<void> { read().meta[key] = value; write(); }
export async function wipeDevice(): Promise<void> {
  const keep = read().meta.sampleOffered;
  mem = { ...empty(), meta: { sampleOffered: keep } };
  write();
}

const prepKey = (r: PrepEnvelope) => `${r.table}:${r.row.id}`;
export async function loadPrep(): Promise<PrepEnvelope[]> { return Object.values(read().prep); }
export async function savePrep(records: PrepEnvelope[], opts: { fromServer?: boolean } = {}): Promise<void> {
  const d = read();
  for (const r of records) { d.prep[prepKey(r)] = r; if (!opts.fromServer) d.prepOutbox[prepKey(r)] = r.row.updatedAt; }
  write();
}
export async function prepOutboxKeys(): Promise<string[]> { return Object.keys(read().prepOutbox); }
export async function clearPrepOutbox(sent: PrepEnvelope[]): Promise<void> {
  const d = read();
  for (const r of sent) { const k = prepKey(r); if (d.prepOutbox[k] !== undefined && d.prepOutbox[k] <= r.row.updatedAt) delete d.prepOutbox[k]; }
  write();
}
