import { describe, expect, it } from "vitest";
import { mergeSession, mergeSessions, sessionSchema, validateSessionIntegrity } from "@/domain/sync";
import type { Session } from "@/domain/types";
import { createSession as s, uuid } from "./helpers";

const T = Date.UTC(2026, 10, 10, 4, 0, 0);
const pair = (a: Partial<Session>, b: Partial<Session>): [Session, Session] => {
  const base = s({ id: uuid(), timestamp: T });
  return [{ ...base, ...a }, { ...base, ...b }];
};

describe("offline sessions synchronise safely", () => {
  it("a finished session is never reopened by a stale copy with a newer timestamp", () => {
    const [done, stale] = pair(
      { status: "completed", actualSeconds: 1500, updatedAt: T + 1000 },
      { status: "paused", actualSeconds: 400, updatedAt: T + 999_999 },
    );
    expect(mergeSession(done, stale).status).toBe("completed");
    expect(mergeSession(stale, done).status).toBe("completed");
    expect(mergeSession(stale, done).actualSeconds).toBe(1500);
  });

  it("an ended-early session is not promoted to completed by an unfinished copy", () => {
    const [early, active] = pair(
      { status: "ended_early", actualSeconds: 300, updatedAt: T + 10 },
      { status: "active", actualSeconds: 0, updatedAt: T + 20 },
    );
    expect(mergeSession(early, active).status).toBe("ended_early");
  });

  it("later write wins between two copies in the same state", () => {
    const [older, newer] = pair({ notes: "first", updatedAt: T + 1 }, { notes: "second", updatedAt: T + 2 });
    expect(mergeSession(older, newer).notes).toBe("second");
    expect(mergeSession(newer, older).notes).toBe("second");
  });

  it("feedback entered on one device is kept when the other device's copy wins", () => {
    const [phone, laptop] = pair(
      { focusQuality: 4, durationFeedback: "too_short", updatedAt: T + 5 },
      { focusQuality: null, durationFeedback: null, notes: "from laptop", updatedAt: T + 9 },
    );
    const merged = mergeSession(phone, laptop);
    expect(merged).toMatchObject({ focusQuality: 4, durationFeedback: "too_short", notes: "from laptop", updatedAt: T + 9 });
  });

  it("merge is commutative and idempotent", () => {
    const [a, b] = pair(
      { status: "completed", focusQuality: 3, updatedAt: T + 7 },
      { status: "ended_early", actualSeconds: 100, difficulty: 2, updatedAt: T + 7 },
    );
    const ab = mergeSession(a, b);
    expect(mergeSession(b, a)).toEqual(ab);
    expect(mergeSession(ab, a)).toEqual(ab);
    expect(mergeSession(ab, ab)).toEqual(ab);
  });

  it("a deletion wins unless the other copy is newer", () => {
    const [deleted, edited] = pair({ deletedAt: T + 50, updatedAt: T + 50 }, { notes: "edit", updatedAt: T + 40 });
    expect(mergeSession(deleted, edited).deletedAt).toBe(T + 50);
    const [deleted2, edited2] = pair({ deletedAt: T + 50, updatedAt: T + 50 }, { notes: "edit", updatedAt: T + 60 });
    expect(mergeSession(deleted2, edited2).deletedAt).toBeNull();
  });

  it("syncing the same batch twice changes nothing and creates no duplicates", () => {
    const local = [s({ timestamp: T }), s({ timestamp: T + 1 })];
    const once = mergeSessions(local, local);
    expect(once).toHaveLength(2);
    expect(mergeSessions(once, local)).toEqual(once);
  });

  it("sessions recorded offline on two devices are both kept", () => {
    const merged = mergeSessions([s({ timestamp: T })], [s({ timestamp: T + 5 })]);
    expect(merged).toHaveLength(2);
  });

  it("refuses to merge different sessions", () => {
    expect(() => mergeSession(s(), s())).toThrow();
  });
});

describe("server-side validation of synced sessions", () => {
  const now = T + 3600_000;
  const valid = () => s({ timestamp: T, id: "3f2c1a9e-8b7d-4c6f-9a1b-2c3d4e5f6a7b" });

  it("accepts a well-formed session", () => {
    expect(sessionSchema.safeParse(valid()).success).toBe(true);
    expect(validateSessionIntegrity(valid(), now)).toBeNull();
  });

  it("rejects a session marked completed that did not run its full length", () => {
    const fake = { ...valid(), status: "completed" as const, actualSeconds: 60 };
    expect(validateSessionIntegrity(fake, now)).toMatch(/full planned duration/);
  });

  it("rejects more study time than has passed on the clock", () => {
    const fake = { ...valid(), plannedMinutes: 120, actualSeconds: 7200, status: "completed" as const };
    expect(validateSessionIntegrity(fake, T + 60_000)).toMatch(/time elapsed/);
  });

  it("rejects sessions dated in the future and times beyond the plan", () => {
    expect(validateSessionIntegrity({ ...valid(), timestamp: now + 3600_000 }, now)).toMatch(/future/);
    expect(validateSessionIntegrity({ ...valid(), actualSeconds: 1501, status: "ended_early" as const }, now)).toMatch(/exceeds the planned/);
  });

  it("rejects unknown fields, wrong types and out-of-range values without coercion", () => {
    expect(sessionSchema.safeParse({ ...valid(), userId: "someone-else" }).success).toBe(false);
    expect(sessionSchema.safeParse({ ...valid(), energy: "3" }).success).toBe(false);
    expect(sessionSchema.safeParse({ ...valid(), energy: 6 }).success).toBe(false);
    expect(sessionSchema.safeParse({ ...valid(), status: "done" }).success).toBe(false);
    expect(sessionSchema.safeParse({ ...valid(), id: "not-a-uuid" }).success).toBe(false);
    expect(sessionSchema.safeParse({ ...valid(), notes: "x".repeat(241) }).success).toBe(false);
    expect(sessionSchema.safeParse({ ...valid(), tz: "Mars/Olympus" }).success).toBe(false);
    expect(sessionSchema.safeParse({ ...valid(), localDate: "2026-02-30" }).success).toBe(false);
  });
});
