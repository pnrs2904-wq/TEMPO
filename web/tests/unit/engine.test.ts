/**
 * Port of app/src/test/java/com/tempo/focus/TempoRecommendationTest.kt.
 * Test names match the Kotlin originals so the two suites can be compared side by side.
 */
import { describe, expect, it } from "vitest";
import { calculateRecommendation as rec, calculateSubjectAwareRecommendation as subjectRec } from "@/domain/engine";
import { historyForEnergy, recommend } from "@/domain/recommend";
import { createSession as s } from "./helpers";

describe("AdaptiveRecommendationEngine (ported from Android)", () => {
  it("rule 1 empty history uses default duration", () => {
    expect(rec(1, [])).toMatchObject({ recommendedMinutes: 15, reason: "Default duration" });
    expect(rec(2, [])).toMatchObject({ recommendedMinutes: 20 });
    expect(rec(3, [])).toMatchObject({ recommendedMinutes: 25, reason: "Default duration" });
    expect(rec(4, [])).toMatchObject({ recommendedMinutes: 35 });
    expect(rec(5, [])).toMatchObject({ recommendedMinutes: 45, reason: "Default duration" });
  });

  it("rule 2 fewer than 3 sessions uses most recent planned clamped", () => {
    const r = rec(3, [s({ plannedMinutes: 30 })]);
    expect(r.recommendedMinutes).toBe(30);
    expect(r.reason).toBe("Based on the last session");
    expect(rec(3, [s({ plannedMinutes: 90 })]).recommendedMinutes).toBe(50);
    expect(rec(3, [s({ plannedMinutes: 5 })]).recommendedMinutes).toBe(10);
  });

  it("rule 4 more too short feedback increases by 5 minutes", () => {
    const r = rec(3, [s({ feedback: "too_short" }), s({ feedback: "too_short" }), s({ feedback: "about_right" })]);
    expect(r).toMatchObject({ recommendedMinutes: 30, reason: "Based on recent adaptive feedback", adjustmentMinutes: 5 });
  });

  it("rule 4 more too long feedback decreases by 5 minutes", () => {
    const h = [
      s({ plannedMinutes: 30, feedback: "too_long" }),
      s({ plannedMinutes: 30, feedback: "too_long" }),
      s({ plannedMinutes: 30, feedback: "about_right" }),
    ];
    expect(rec(3, h)).toMatchObject({ recommendedMinutes: 25, adjustmentMinutes: -5 });
  });

  it("rule 5 high difficulty cancels proposed increase", () => {
    const h = [4, 5, 4].map((difficulty) => s({ feedback: "too_short", difficulty }));
    expect(rec(3, h)).toMatchObject({ recommendedMinutes: 25, adjustmentMinutes: 0 });
  });

  it("rule 5 high distractions cancel proposed increase", () => {
    const h = [3, 4, 3].map((distractions) => s({ feedback: "too_short", distractions }));
    expect(rec(3, h)).toMatchObject({ recommendedMinutes: 25, adjustmentMinutes: 0 });
  });

  it("rule 5 low focus quality triggers 5 min decrease when no other adjustment", () => {
    const h = [2, 1, 2].map((focusQuality) => s({ feedback: "about_right", focusQuality }));
    expect(rec(3, h)).toMatchObject({ recommendedMinutes: 20, adjustmentMinutes: -5 });
  });

  it("rule 5 very high distractions trigger 5 min decrease when no other adjustment", () => {
    const h = [4, 5, 1].map((distractions) => s({ feedback: "about_right", distractions }));
    expect(rec(3, h)).toMatchObject({ recommendedMinutes: 20, adjustmentMinutes: -5, overrodeUserFeedback: false });
  });

  it("rule 6 clamps duration to 50 max and 10 min min", () => {
    const max = [1, 2, 3].map(() => s({ energy: 5, plannedMinutes: 50, feedback: "too_short" }));
    expect(rec(5, max).recommendedMinutes).toBe(50);
    const min = [1, 2, 3].map(() => s({ energy: 1, plannedMinutes: 10, feedback: "too_long" }));
    expect(rec(1, min).recommendedMinutes).toBe(10);
  });

  it("fix 1 ended_early session is excluded from recent-3 window and does not affect baseline or votes", () => {
    const c1 = s({ feedback: "too_short", timestamp: 1000 });
    const early = s({ plannedMinutes: 50, feedback: "too_long", status: "ended_early", timestamp: 2000 });
    const c2 = s({ feedback: "too_short", timestamp: 3000 });
    const c3 = s({ feedback: "about_right", timestamp: 4000 });
    const r = rec(3, [c3, c2, early, c1]);
    expect(r).toMatchObject({ baselineMinutes: 25, adjustmentMinutes: 5, recommendedMinutes: 30 });
  });

  it("fix 2 increase cancelled by difficulty with no further decrease sets overrodeUserFeedback true", () => {
    const h = [4, 5, 4].map((difficulty) => s({ feedback: "too_short", difficulty, focusQuality: 4 }));
    const r = rec(3, h);
    expect(r).toMatchObject({ recommendedMinutes: 25, adjustmentMinutes: 0, overrodeUserFeedback: true });
    expect(r.overrideExplanation).toBe("difficulty rated 4+ on 3 of your last 3 sessions");
  });

  it("fix 2 increase cancelled by difficulty and cascades into decrease via low focus quality", () => {
    const h = [
      s({ feedback: "too_short", difficulty: 4, focusQuality: 2 }),
      s({ feedback: "too_short", difficulty: 5, focusQuality: 1 }),
      s({ feedback: "too_short", difficulty: 4, focusQuality: 2 }),
    ];
    expect(rec(3, h)).toMatchObject({ recommendedMinutes: 20, adjustmentMinutes: -5, overrodeUserFeedback: true });
  });

  it("fix 3 median of 3 different planned durations is used as baseline rather than most recent", () => {
    const h = [50, 20, 25].map((plannedMinutes) => s({ plannedMinutes, feedback: "about_right" }));
    expect(rec(3, h)).toMatchObject({ baselineMinutes: 25, recommendedMinutes: 25, adjustmentMinutes: 0, overrodeUserFeedback: false });
  });

  it("fix 4 difficulty majority 4 4 3 cancels proposed increase unlike old average", () => {
    const h = [4, 4, 3].map((difficulty) => s({ feedback: "too_short", difficulty }));
    expect(rec(3, h)).toMatchObject({ recommendedMinutes: 25, adjustmentMinutes: 0, overrodeUserFeedback: true });
  });

  it("only the three most recent completed sessions vote", () => {
    const h = [
      s({ feedback: "about_right" }), s({ feedback: "about_right" }), s({ feedback: "about_right" }),
      s({ feedback: "too_short" }), s({ feedback: "too_short" }), s({ feedback: "too_short" }),
    ];
    expect(rec(3, h).adjustmentMinutes).toBe(0);
  });

  it("never moves more than 5 minutes in one step", () => {
    const h = [1, 2, 3].map(() => s({ feedback: "too_long", focusQuality: 1, distractions: 9, difficulty: 5 }));
    expect(rec(3, h).adjustmentMinutes).toBe(-5);
  });
});

describe("SubjectAwareRecommendationEngine (ported from Android)", () => {
  it("fix 5 subject history empty falls back to energy engine with unchanged reason", () => {
    const h = [1, 2, 3].map(() => s({ subject: "Math" }));
    const a = subjectRec(3, "Physics", h);
    const b = rec(3, h);
    expect(a.recommendedMinutes).toBe(b.recommendedMinutes);
    expect(a.reason).toBe(b.reason);
  });

  it("fix 5 subject history under 3 falls back with not enough history reason", () => {
    const h = [s({ subject: "Physics" }), s({ subject: "Physics" }), s({ subject: "Math" }), s({ subject: "Math" })];
    const r = subjectRec(3, "Physics", h);
    expect(r.reason).toBe("Not enough Physics history yet — using your overall pattern at this energy level");
    expect(r.subjectSessionsLogged).toBe(2);
  });

  it("fix 5 subject history 3 or more uses subject level signal and differs from energy-only", () => {
    const math = [1, 2, 3].map(() => s({ feedback: "too_short", subject: "Math" }));
    const physics = [1, 2, 3].map(() => s({ feedback: "too_long", subject: "Physics" }));
    const combined = [math[0], physics[0], math[1], physics[1], math[2], physics[2]];
    const r = subjectRec(3, "Math", combined);
    expect(r.recommendedMinutes).toBe(30);
    expect(r.reason).toBe("Based on your Math sessions at this energy level");
    expect(rec(3, combined).reason).not.toBe(r.reason);
    // The same history gives a different answer for the other subject.
    expect(subjectRec(3, "Physics", combined).recommendedMinutes).toBe(20);
  });

  it("matches subjects case-insensitively and ignores surrounding spaces", () => {
    const h = [1, 2, 3].map(() => s({ feedback: "too_short", subject: " polity " }));
    expect(subjectRec(3, "Polity", h)).toMatchObject({ recommendedMinutes: 30, subjectSessionsLogged: 3 });
  });
});

describe("history selection and receipt (web)", () => {
  it("uses only completed focus sessions at the selected energy, newest first", () => {
    const all = [
      s({ energy: 3, timestamp: 1000, plannedMinutes: 20 }),
      s({ energy: 3, timestamp: 3000, plannedMinutes: 40 }),
      s({ energy: 4, timestamp: 4000 }),
      s({ energy: 3, timestamp: 5000, status: "ended_early" }),
      s({ energy: 3, timestamp: 6000, status: "cancelled" }),
      s({ energy: 3, timestamp: 7000, phase: "break" }),
      s({ energy: 3, timestamp: 8000, status: "unknown" }),
    ];
    const h = historyForEnergy(all, 3);
    expect(h.map((x) => x.timestamp)).toEqual([3000, 1000]);
  });

  it("leaves mock tests out of adaptive history", () => {
    const all = [1, 2, 3].map((i) => s({ sessionType: "Mock Test", plannedMinutes: 120, timestamp: i }));
    expect(recommend(all, 3, "").result.reason).toBe("Default duration");
  });

  it("receipt lines add up to the engine's recommendation", () => {
    const cases = [
      [],
      [s({ plannedMinutes: 30 })],
      [1, 2, 3].map(() => s({ feedback: "too_short" })),
      [1, 2, 3].map(() => s({ plannedMinutes: 50, energy: 3, feedback: "too_short" })),
      [4, 5, 4].map((difficulty) => s({ feedback: "too_short", difficulty, focusQuality: 1 })),
      [2, 1, 2].map((focusQuality) => s({ focusQuality })),
    ].map((x) => x.flat());
    for (const h of cases) {
      const { result, receipt } = recommend(h, 3, "Math");
      const total = receipt.reduce((a, l) => a + (l.minutes ?? 0), 0);
      expect(total).toBe(result.recommendedMinutes);
    }
  });

  it("explains an override in plain words", () => {
    const h = [4, 4, 3].map((difficulty) => s({ feedback: "too_short", difficulty }));
    const { receipt, summary } = recommend(h, 3, "");
    expect(receipt.some((l) => l.kind === "hold" && l.label.includes("difficulty rated 4+ on 2 of your last 3 sessions"))).toBe(true);
    expect(summary).toContain("Holding steady");
  });
});
