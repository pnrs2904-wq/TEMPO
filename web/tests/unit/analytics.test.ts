import { describe, expect, it } from "vitest";
import {
  averageSessionMinutes, completionStats, dailySeries, dayPartPattern, energyVsFocusQuality, focusMinutesOn, focusSeconds,
  isCompleted, mockTestTrend, subjectPerformance, weeklySeries,
} from "@/domain/analytics";
import { generateCsv, generateJson, CSV_HEADER } from "@/domain/export";
import { createSession as s } from "./helpers";

const T = Date.UTC(2026, 10, 10, 4, 0, 0); // Tue 10 Nov 2026, 09:30 IST

describe("incomplete sessions are never counted as completed", () => {
  const all = [
    s({ timestamp: T, status: "completed", plannedMinutes: 25 }),
    s({ timestamp: T, status: "ended_early", plannedMinutes: 25, actualSeconds: 600 }),
    s({ timestamp: T, status: "cancelled", plannedMinutes: 25, actualSeconds: 300 }),
    s({ timestamp: T, status: "paused", plannedMinutes: 25, actualSeconds: 700 }),
    s({ timestamp: T, status: "active", plannedMinutes: 25, actualSeconds: 0 }),
    s({ timestamp: T, status: "unknown", plannedMinutes: 25 }),
    s({ timestamp: T, status: "completed", phase: "break", plannedMinutes: 5 }),
  ];

  it("counts exactly one completed focus session", () => {
    expect(all.filter(isCompleted)).toHaveLength(1);
    expect(completionStats(all)).toEqual({ completed: 1, endedEarly: 1, rate: 0.5 });
    expect(dailySeries(all, "2026-11-10", "2026-11-10")[0]).toMatchObject({ completed: 1, endedEarly: 1 });
  });

  it("an ended-early session adds its real minutes but not a completion", () => {
    // 25 min completed + 10 min ended early; cancelled, paused, active, unknown and breaks add nothing.
    expect(focusSeconds(all)).toBe(1500 + 600);
    expect(focusMinutesOn(all, "2026-11-10")).toBe(35);
  });

  it("average session length uses completed sessions only", () => {
    expect(averageSessionMinutes(all)).toBe(25);
    expect(averageSessionMinutes(all.filter((x) => x.status !== "completed"))).toBeNull();
  });

  it("completion rate is null, not 0 or 100, when nothing has been attempted", () => {
    expect(completionStats([]).rate).toBeNull();
  });

  it("deleted sessions are ignored everywhere", () => {
    const gone = { ...s({ timestamp: T }), deletedAt: T + 1 };
    expect(focusSeconds([gone])).toBe(0);
    expect(completionStats([gone]).completed).toBe(0);
  });
});

describe("session durations are calculated accurately", () => {
  it("sums seconds before converting, so short sessions are not lost to rounding", () => {
    // Three 50-second stretches are 2.5 minutes, not 0 (Android floored each session separately).
    const three = [1, 2, 3].map(() => s({ timestamp: T, status: "ended_early", actualSeconds: 50 }));
    expect(focusMinutesOn(three, "2026-11-10")).toBe(2);
  });
});

describe("personal analytics", () => {
  const sessions = [
    s({ timestamp: T, subject: "Polity", energy: 4, focusQuality: 5, plannedMinutes: 40, tz: "Asia/Kolkata" }),
    s({ timestamp: T + 3600_000, subject: "polity ", energy: 4, focusQuality: 3, plannedMinutes: 20, tz: "Asia/Kolkata" }),
    s({ timestamp: T + 86_400_000, subject: "Economy", energy: 2, focusQuality: 2, status: "ended_early", actualSeconds: 300, tz: "Asia/Kolkata" }),
    s({ timestamp: T + 86_400_000 + 12 * 3600_000, subject: "Economy", energy: 2, tz: "Asia/Kolkata" }),
  ];

  it("subject-wise performance merges spelling variants and sorts by time", () => {
    const perf = subjectPerformance(sessions);
    expect(perf.map((p) => p.subject)).toEqual(["Polity", "Economy"]);
    expect(perf[0]).toMatchObject({ minutes: 60, sessions: 2, completionRate: 1, avgFocusQuality: 4 });
    expect(perf[1]).toMatchObject({ minutes: 30, sessions: 2, completionRate: 0.5, avgFocusQuality: 2 });
  });

  it("energy versus focus quality averages only rated sessions", () => {
    const pts = energyVsFocusQuality(sessions);
    expect(pts[3]).toMatchObject({ energy: 4, avgFocusQuality: 4, rated: 2, sessions: 2 });
    expect(pts[1]).toMatchObject({ energy: 2, avgFocusQuality: 2, rated: 1, sessions: 2 });
    expect(pts[0].avgFocusQuality).toBeNull();
  });

  it("daily and weekly series fill empty days with zero", () => {
    const daily = dailySeries(sessions, "2026-11-09", "2026-11-12");
    expect(daily.map((d) => d.minutes)).toEqual([0, 60, 30, 0]);
    const weekly = weeklySeries(sessions, "2026-11-15", 3);
    expect(weekly.map((w) => w.weekStart)).toEqual(["2026-10-26", "2026-11-02", "2026-11-09"]);
    expect(weekly[2]).toMatchObject({ minutes: 90, activeDays: 2 });
    expect(weekly[0].minutes).toBe(0);
  });

  it("day-part pattern uses local time of the session", () => {
    const parts = dayPartPattern(sessions);
    expect(parts[1]).toMatchObject({ part: "Morning (9-13)", sessions: 3 }); // 09:30, 10:30, 09:30 IST
    expect(parts[4].sessions).toBe(1); // 21:30 IST
  });

  it("mock test trend reports percentages in date order", () => {
    const mocks = [
      { ...s({ timestamp: T + 5000, sessionType: "Mock Test", subject: "Prelims GS" }), mockScore: 96, mockMaxScore: 200 },
      { ...s({ timestamp: T, sessionType: "Mock Test", subject: "Prelims GS" }), mockScore: 80, mockMaxScore: 200 },
      s({ timestamp: T, sessionType: "Mock Test" }), // no score logged
    ];
    expect(mockTestTrend(mocks).map((m) => m.percent)).toEqual([40, 48]);
  });
});

describe("export (ExportHelper port)", () => {
  it("export helper generates valid JSON and CSV", () => {
    const one = s({ timestamp: T, feedback: "about_right", tz: "Asia/Kolkata" });
    const json = JSON.parse(generateJson([one]));
    expect(json[0]).toMatchObject({ phase: "focus", plannedMinutes: 25, isoDate: "2026-11-10T09:30:00+05:30" });
    const csv = generateCsv([one]);
    expect(csv.startsWith(CSV_HEADER)).toBe(true);
    expect(csv).toContain(",focus,3,Math,Study,25,");
  });

  it("exportHelper handles RFC4180 escaping for commas quotes and newlines", () => {
    const tricky = s({ subject: 'Polity, "Part III"', notes: "line one\nline two" });
    const csv = generateCsv([tricky]);
    expect(csv).toContain('"Polity, ""Part III"""');
    expect(csv).toContain('"line one\nline two"');
  });

  it("exportHelper preserves Unicode characters Telugu script and emojis", () => {
    const u = s({ subject: "తెలుగు సాహిత్యం", notes: "बहुत अच्छा 📚" });
    expect(generateCsv([u])).toContain("తెలుగు సాహిత్యం");
    expect(JSON.parse(generateJson([u]))[0].notes).toBe("बहुत अच्छा 📚");
  });

  it("neutralises spreadsheet formulas in exported text", () => {
    expect(generateCsv([s({ notes: "=HYPERLINK(\"http://x\")" })])).toContain("\"'=HYPERLINK(");
  });
});
