import { describe, expect, it } from "vitest";
import { addDays, dateRange, daysBetween, isDateKey, isoWithOffset, localDateKey, minutesOfDay, offsetMinutes, weekStart, weekdayIndex } from "@/domain/time";
import { calculateStreak } from "@/domain/streak";
import { focusMinutesInWeekOf, focusMinutesOn } from "@/domain/analytics";
import { createSession as s } from "./helpers";

describe("timezone-safe session calculations", () => {
  // 2026-11-14 20:00 UTC is already 15 Nov in India and still 14 Nov in New York.
  const ts = Date.UTC(2026, 10, 14, 20, 0, 0);

  it("assigns the calendar day by the session's own timezone", () => {
    expect(localDateKey(ts, "Asia/Kolkata")).toBe("2026-11-15");
    expect(localDateKey(ts, "UTC")).toBe("2026-11-14");
    expect(localDateKey(ts, "America/New_York")).toBe("2026-11-14");
  });

  it("a session just after midnight IST belongs to the new day, one just before to the old", () => {
    const midnightIst = Date.UTC(2026, 10, 14, 18, 30, 0); // 00:00 IST on 15 Nov
    expect(localDateKey(midnightIst - 1000, "Asia/Kolkata")).toBe("2026-11-14");
    expect(localDateKey(midnightIst, "Asia/Kolkata")).toBe("2026-11-15");
    expect(minutesOfDay(midnightIst, "Asia/Kolkata")).toBe(0);
    expect(minutesOfDay(midnightIst - 60_000, "Asia/Kolkata")).toBe(1439);
  });

  it("handles half-hour and quarter-hour offsets", () => {
    expect(offsetMinutes(ts, "Asia/Kolkata")).toBe(330);
    expect(offsetMinutes(ts, "Asia/Kathmandu")).toBe(345);
    expect(isoWithOffset(Date.UTC(2026, 10, 15, 4, 0, 0), "Asia/Kolkata")).toBe("2026-11-15T09:30:00+05:30");
    expect(isoWithOffset(Date.UTC(2026, 0, 1, 0, 0, 0), "America/New_York")).toBe("2025-12-31T19:00:00-05:00");
  });

  it("daily totals do not move when the device timezone changes later", () => {
    const session = s({ timestamp: ts, tz: "Asia/Kolkata" });
    // The stored day is fixed at 15 Nov whatever zone the totals are later computed in.
    expect(focusMinutesOn([session], "2026-11-15")).toBe(25);
    expect(focusMinutesOn([session], "2026-11-14")).toBe(0);
  });

  it("date-key arithmetic is immune to daylight saving changes", () => {
    // US spring-forward (8 Mar 2026) and fall-back (1 Nov 2026) days are 23h and 25h long.
    expect(addDays("2026-03-07", 1)).toBe("2026-03-08");
    expect(addDays("2026-03-08", 1)).toBe("2026-03-09");
    expect(daysBetween("2026-10-31", "2026-11-02")).toBe(2);
    expect(dateRange("2026-03-06", "2026-03-10")).toHaveLength(5);
    expect(addDays("2024-02-28", 1)).toBe("2024-02-29");
    expect(addDays("2026-12-31", 1)).toBe("2027-01-01");
  });

  it("a DST day in the session's zone still maps instants to the right date", () => {
    const beforeJump = Date.UTC(2026, 2, 8, 6, 59, 0); // 01:59 EST
    const afterJump = Date.UTC(2026, 2, 8, 7, 1, 0); // 03:01 EDT
    expect(localDateKey(beforeJump, "America/New_York")).toBe("2026-03-08");
    expect(localDateKey(afterJump, "America/New_York")).toBe("2026-03-08");
    expect(offsetMinutes(beforeJump, "America/New_York")).toBe(-300);
    expect(offsetMinutes(afterJump, "America/New_York")).toBe(-240);
  });

  it("weeks start on Monday", () => {
    expect(weekdayIndex("2026-11-15")).toBe(6); // Sunday
    expect(weekStart("2026-11-15")).toBe("2026-11-09");
    expect(weekStart("2026-11-09")).toBe("2026-11-09");
    const sessions = [
      s({ timestamp: Date.UTC(2026, 10, 9, 3), tz: "Asia/Kolkata" }),
      s({ timestamp: Date.UTC(2026, 10, 15, 3), tz: "Asia/Kolkata" }),
      s({ timestamp: Date.UTC(2026, 10, 16, 3), tz: "Asia/Kolkata" }), // next week
      // Sunday 23:30 IST is still this week even though it is Sunday 18:00 UTC.
      s({ timestamp: Date.UTC(2026, 10, 15, 18, 0), tz: "Asia/Kolkata" }),
    ];
    expect(focusMinutesInWeekOf(sessions, "2026-11-15")).toBe(75);
  });

  it("validates date keys", () => {
    expect(isDateKey("2026-11-15")).toBe(true);
    expect(isDateKey("2026-02-30")).toBe(false);
    expect(isDateKey("15-11-2026")).toBe(false);
    expect(isDateKey(null)).toBe(false);
  });

  it("falls back to UTC for an unknown timezone instead of throwing", () => {
    expect(localDateKey(ts, "Mars/Olympus")).toBe("2026-11-14");
  });
});

describe("streak (StreakCalculator port)", () => {
  const day = (d: number, status: "completed" | "ended_early" = "completed") =>
    s({ timestamp: Date.UTC(2026, 8, d, 0, 0, 0), status });

  it("streak calculation computes correct streak", () => {
    expect(calculateStreak([day(15), day(14), day(13)], "2026-09-15")).toEqual({
      currentStreak: 3, bestStreak: 3, totalActiveDays: 3, hasSessionToday: true,
    });
  });
  it("yesterday keeps the streak alive; a gap of two days ends it", () => {
    expect(calculateStreak([day(14), day(13)], "2026-09-15").currentStreak).toBe(2);
    expect(calculateStreak([day(13), day(12)], "2026-09-15").currentStreak).toBe(0);
    expect(calculateStreak([day(13), day(12)], "2026-09-15").bestStreak).toBe(2);
  });
  it("only completed focus sessions count", () => {
    expect(calculateStreak([day(15, "ended_early")], "2026-09-15").currentStreak).toBe(0);
    expect(calculateStreak([s({ timestamp: Date.UTC(2026, 8, 15), phase: "break" })], "2026-09-15").totalActiveDays).toBe(0);
  });
  it("a late-night IST session counts for the Indian calendar day", () => {
    const late = s({ timestamp: Date.UTC(2026, 8, 14, 19, 0, 0), tz: "Asia/Kolkata" }); // 00:30 IST on the 15th
    expect(calculateStreak([late], "2026-09-15").hasSessionToday).toBe(true);
  });
});
