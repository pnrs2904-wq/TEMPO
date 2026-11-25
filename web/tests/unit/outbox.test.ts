/** The on-device queue that makes offline recording safe. Runs against an in-memory IndexedDB. */
import "fake-indexeddb/auto";
import { describe, expect, it } from "vitest";
import { clearOutbox, loadSessions, outboxIds, saveSessions, wipeDevice } from "@/lib/client/db";
import { createSession as s } from "./helpers";

describe("offline session recording", () => {
  it("queues every locally recorded session until the server has acknowledged it", async () => {
    const a = s({ id: crypto.randomUUID() });
    const b = s({ id: crypto.randomUUID() });
    await saveSessions([a, b]);
    expect((await loadSessions()).length).toBe(2);
    expect((await outboxIds()).sort()).toEqual([a.id, b.id].sort());

    await clearOutbox([{ id: a.id, updatedAt: a.updatedAt }]);
    expect(await outboxIds()).toEqual([b.id]);
  });

  it("keeps a session queued if it was edited while a sync was in flight", async () => {
    await wipeDevice();
    const a = s({ id: crypto.randomUUID(), updatedAt: 1000 });
    await saveSessions([a]);
    const sent = { id: a.id, updatedAt: a.updatedAt };
    await saveSessions([{ ...a, notes: "edited during sync", updatedAt: 2000 }]);
    await clearOutbox([sent]);
    expect(await outboxIds()).toEqual([a.id]);
  });

  it("sessions pulled from the server are stored without being queued again", async () => {
    await wipeDevice();
    await saveSessions([s({ id: crypto.randomUUID() })], { fromServer: true });
    expect((await loadSessions()).length).toBe(1);
    expect(await outboxIds()).toEqual([]);
  });

  it("erasing the device removes sessions and the queue", async () => {
    await saveSessions([s({ id: crypto.randomUUID() })]);
    await wipeDevice();
    expect(await loadSessions()).toEqual([]);
    expect(await outboxIds()).toEqual([]);
  });
});
