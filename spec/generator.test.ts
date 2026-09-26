import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  type GenCourse,
  type GenPreferences,
  generatePlansFromCandidates,
  generateTimesForFixedCourses,
} from "../src/lib/generator";

const noPrefs: GenPreferences = { blackoutDays: [], softPreferences: { minimizeDaysOnCampus: false, avoidDays: [] } };

let nextId = 1;
function tutorial(dayOfWeek: number, startMinutes: number, endMinutes: number) {
  return { id: nextId++, kind: "tutorial" as const, dayOfWeek, startMinutes, endMinutes };
}
function lecture(dayOfWeek: number, startMinutes: number, endMinutes: number) {
  return { id: nextId++, kind: "lecture" as const, dayOfWeek, startMinutes, endMinutes };
}
function course(code: string, sessions: GenCourse["sessions"]): GenCourse {
  return { id: nextId++, code, sessions };
}

describe("generator", () => {
  it("is DB-independent: never imports src/lib/db or the confirm/withdraw enrollment functions", () => {
    const source = readFileSync(new URL("../src/lib/generator.ts", import.meta.url), "utf8");
    expect(source).not.toMatch(/from ["'].\/db["']/);
    expect(source).not.toMatch(/confirmEnrollment|withdrawEnrollment/);
  });

  describe("generateTimesForFixedCourses (operation A)", () => {
    it("rejects an empty preview with a specific reason, not a generic search failure", () => {
      const outcome = generateTimesForFixedCourses([], [], noPrefs);
      expect(outcome.ok).toBe(false);
      expect(outcome.ok === false && outcome.reason).toMatch(/preview is empty/i);
    });

    it("finds the one feasible tutorial-time combination for a simple fixed set", () => {
      const a = course("AAA1000", [lecture(0, 0, 60), tutorial(0, 600, 660)]);
      const b = course("BBB1000", [lecture(1, 0, 60), tutorial(1, 600, 660)]);
      const outcome = generateTimesForFixedCourses([a.id, b.id], [a, b], noPrefs);
      expect(outcome.ok).toBe(true);
      if (!outcome.ok) return;
      expect(outcome.totalFeasible).toBe(1);
      expect(outcome.plans).toHaveLength(1);
      expect(outcome.plans[0].courses.map((c) => c.code).sort()).toEqual(["AAA1000", "BBB1000"]);
    });

    it("is not limited by the 3/4 desiredCourseCount rule — a 2-course or 5-course fixed set both search freely", () => {
      const courses = [
        course("A", [tutorial(0, 0, 60)]),
        course("B", [tutorial(1, 0, 60)]),
        course("C", [tutorial(2, 0, 60)]),
        course("D", [tutorial(3, 0, 60)]),
        course("E", [tutorial(4, 0, 60)]),
      ];
      const outcome = generateTimesForFixedCourses(
        courses.map((c) => c.id),
        courses,
        noPrefs,
      );
      expect(outcome.ok).toBe(true);
      if (outcome.ok) expect(outcome.plans[0].courses).toHaveLength(5);
    });

    it("treats an avoidable tutorial clash correctly: only the non-clashing pairing is feasible", () => {
      // Mirrors the seed data's COMP1010/COMP3120 shape: course A offers two
      // tutorial times, one of which clashes with course B's only time.
      const a = course("A", [tutorial(0, 540, 590), tutorial(1, 540, 590)]);
      const b = course("B", [tutorial(0, 540, 590)]);
      const outcome = generateTimesForFixedCourses([a.id, b.id], [a, b], noPrefs);
      expect(outcome.ok).toBe(true);
      if (!outcome.ok) return;
      expect(outcome.totalFeasible).toBe(1);
      const plan = outcome.plans[0];
      const aChoice = plan.courses.find((c) => c.code === "A")!;
      expect(aChoice.dayOfWeek).toBe(1);
    });

    it("reports an unavoidable tutorial clash by naming both course codes, not a generic failure", () => {
      // Mirrors COMP2100/STAT1008: every tutorial pairing between these two
      // courses overlaps, whichever option is chosen on either side.
      const a = course("A", [tutorial(0, 800, 850), tutorial(0, 830, 880)]);
      const b = course("B", [tutorial(0, 820, 870)]);
      const outcome = generateTimesForFixedCourses([a.id, b.id], [a, b], noPrefs);
      expect(outcome.ok).toBe(false);
      expect(outcome.ok === false && outcome.reason).toMatch(/A and B clash on every tutorial-time combination/);
    });

    it("falls back to an honest generic message for a genuine 3-way infeasibility with no single unavoidable pair", () => {
      // A, B, C each have two tutorial options; every *pair* of courses has at
      // least one compatible combination (so no pairwise diagnostic fires),
      // but no single choice across all three avoids a clash anywhere.
      const p = { dayOfWeek: 0, startMinutes: 0, endMinutes: 60 };
      const q = { dayOfWeek: 0, startMinutes: 30, endMinutes: 90 };
      const r = { dayOfWeek: 1, startMinutes: 0, endMinutes: 60 };
      const a = course("A", [tutorial(p.dayOfWeek, p.startMinutes, p.endMinutes), tutorial(r.dayOfWeek, r.startMinutes, r.endMinutes)]);
      const b = course("B", [tutorial(q.dayOfWeek, q.startMinutes, q.endMinutes), tutorial(r.dayOfWeek, r.startMinutes, r.endMinutes)]);
      const c = course("C", [tutorial(p.dayOfWeek, p.startMinutes, p.endMinutes), tutorial(q.dayOfWeek, q.startMinutes, q.endMinutes)]);
      const outcome = generateTimesForFixedCourses([a.id, b.id, c.id], [a, b, c], noPrefs);
      expect(outcome.ok).toBe(false);
      if (outcome.ok) return;
      expect(outcome.reason).not.toMatch(/clash on every tutorial-time combination/);
      expect(outcome.reason).toMatch(/no feasible plan was found/i);
    });

    it("never blocks on a lecture-vs-lecture (or lecture-vs-tutorial) overlap, even an identical lecture time", () => {
      const a = course("A", [lecture(0, 0, 90), tutorial(2, 0, 60)]);
      const b = course("B", [lecture(0, 0, 90), tutorial(3, 0, 60)]);
      const outcome = generateTimesForFixedCourses([a.id, b.id], [a, b], noPrefs);
      expect(outcome.ok).toBe(true);
    });

    it("treats two exactly back-to-back tutorials as compatible, not a conflict", () => {
      const a = course("A", [tutorial(0, 60, 120)]);
      const b = course("B", [tutorial(0, 120, 180)]);
      const outcome = generateTimesForFixedCourses([a.id, b.id], [a, b], noPrefs);
      expect(outcome.ok).toBe(true);
      if (outcome.ok) expect(outcome.totalFeasible).toBe(1);
    });

    it("names a course with no tutorial sessions at all as the specific reason", () => {
      const a = course("A", [lecture(0, 0, 60)]);
      const outcome = generateTimesForFixedCourses([a.id], [a], noPrefs);
      expect(outcome.ok).toBe(false);
      expect(outcome.ok === false && outcome.reason).toMatch(/^A has no tutorial time options at all/);
    });

    it("names a course whose only tutorial option falls on a blackout day", () => {
      const a = course("A", [tutorial(0, 0, 60)]);
      const prefs: GenPreferences = { blackoutDays: [0], softPreferences: { minimizeDaysOnCampus: false, avoidDays: [] } };
      const outcome = generateTimesForFixedCourses([a.id], [a], prefs);
      expect(outcome.ok).toBe(false);
      expect(outcome.ok === false && outcome.reason).toMatch(/A has no tutorial time that avoids your blackout days/);
    });

    it("collapses two same-day/start/end tutorial sections into one pending time option, never defaulting to a section", () => {
      const a = course("A", [tutorial(0, 100, 150), tutorial(0, 100, 150)]);
      const outcome = generateTimesForFixedCourses([a.id], [a], noPrefs);
      expect(outcome.ok).toBe(true);
      if (!outcome.ok) return;
      expect(outcome.totalFeasible).toBe(1);
      expect(outcome.plans[0].courses[0]).toMatchObject({ sectionId: null, pending: true });
      expect(outcome.plans[0].pendingCount).toBe(1);
    });

    it("auto-resolves a single-section time option (not pending)", () => {
      const a = course("A", [tutorial(0, 100, 150)]);
      const outcome = generateTimesForFixedCourses([a.id], [a], noPrefs);
      expect(outcome.ok).toBe(true);
      if (!outcome.ok) return;
      expect(outcome.plans[0].courses[0].pending).toBe(false);
      expect(outcome.plans[0].courses[0].sectionId).toBe(a.sessions[0].id);
    });

    it("ranks by avoid-day tutorial minutes first, even when that plan has more days on campus", () => {
      // Plan 1: A on the avoided day (Monday), B on Tuesday -> 60 avoid-minutes, 2 days on campus.
      // Plan 2: both A and B on Tuesday at non-overlapping times -> 0 avoid-minutes, 1 day on campus.
      // If days-on-campus were compared first, plan 2 (1 day) would still win,
      // so this alone doesn't isolate ordering — instead compare a case where
      // avoid-minutes and days-on-campus disagree.
      const a = course("A", [tutorial(0, 0, 60), tutorial(1, 0, 60)]); // Monday or Tuesday
      const b = course("B", [tutorial(1, 60, 120)]); // Tuesday only, back-to-back with A's Tuesday option
      const prefs: GenPreferences = {
        blackoutDays: [],
        softPreferences: { minimizeDaysOnCampus: true, avoidDays: [1] }, // avoid Tuesday
      };
      const outcome = generateTimesForFixedCourses([a.id, b.id], [a, b], prefs);
      expect(outcome.ok).toBe(true);
      if (!outcome.ok) return;
      // Both feasible combos: A=Monday (1 day on campus overall since B is always Tuesday -> 2 days) vs A=Tuesday (1 day on campus, but both on the avoided day).
      const top = outcome.plans[0];
      const aChoice = top.courses.find((c) => c.code === "A")!;
      expect(aChoice.dayOfWeek).toBe(0); // Monday: fewer avoid-day minutes wins over fewer days-on-campus
    });

    it("ranks by days-on-campus when minimizeDaysOnCampus is enabled and avoidDays is empty", () => {
      const a = course("A", [tutorial(0, 0, 60), tutorial(1, 0, 60)]);
      const b = course("B", [tutorial(0, 60, 120)]); // back-to-back with A's Monday option
      const prefs: GenPreferences = { blackoutDays: [], softPreferences: { minimizeDaysOnCampus: true, avoidDays: [] } };
      const outcome = generateTimesForFixedCourses([a.id, b.id], [a, b], prefs);
      expect(outcome.ok).toBe(true);
      if (!outcome.ok) return;
      const top = outcome.plans[0];
      expect(top.daysOnCampusCount).toBe(1);
    });

    it("breaks ties by a stable course-code/time key when no enabled preference distinguishes two plans", () => {
      const a = course("A", [tutorial(0, 0, 60), tutorial(1, 0, 60)]);
      const outcome = generateTimesForFixedCourses([a.id], [a], noPrefs);
      expect(outcome.ok).toBe(true);
      if (!outcome.ok) return;
      expect(outcome.totalFeasible).toBe(2);
      // Monday (day 0) sorts before Tuesday (day 1) in the tie-break key.
      expect(outcome.plans[0].courses[0].dayOfWeek).toBe(0);
      expect(outcome.plans[1].courses[0].dayOfWeek).toBe(1);
    });

    it("counts the true total exhaustively even when only a fraction is returned", () => {
      const a = course("A", [tutorial(0, 0, 50), tutorial(0, 100, 150), tutorial(0, 200, 250)]);
      const b = course("B", [tutorial(0, 300, 350), tutorial(0, 400, 450)]);
      const outcome = generateTimesForFixedCourses([a.id, b.id], [a, b], noPrefs);
      expect(outcome.ok).toBe(true);
      if (outcome.ok) expect(outcome.totalFeasible).toBe(6);
    });

    it("reports the true total feasible count and truncates the returned list to the top 50", () => {
      const slot = (k: number) => tutorial(0, k * 100, k * 100 + 50);
      const courses = [
        course("A", [slot(0), slot(1), slot(2)]),
        course("B", [slot(3), slot(4), slot(5)]),
        course("C", [slot(6), slot(7), slot(8)]),
        course("D", [slot(9), slot(10), slot(11)]),
      ];
      const outcome = generateTimesForFixedCourses(
        courses.map((c) => c.id),
        courses,
        noPrefs,
      );
      expect(outcome.ok).toBe(true);
      if (!outcome.ok) return;
      expect(outcome.totalFeasible).toBe(81);
      expect(outcome.plans).toHaveLength(50);
    });
  });

  describe("generatePlansFromCandidates (operation B)", () => {
    it("always includes every required course and fills the rest from optional candidates up to the target", () => {
      const required = course("REQ1", [tutorial(0, 0, 60)]);
      const opt1 = course("OPT1", [tutorial(1, 0, 60)]);
      const opt2 = course("OPT2", [tutorial(2, 0, 60)]);
      const opt3 = course("OPT3", [tutorial(3, 0, 60)]);
      const all = [required, opt1, opt2, opt3];
      const outcome = generatePlansFromCandidates([required.id], [opt1.id, opt2.id, opt3.id], 3, all, noPrefs);
      expect(outcome.ok).toBe(true);
      if (!outcome.ok) return;
      for (const plan of outcome.plans) {
        expect(plan.courses).toHaveLength(3);
        expect(plan.courses.some((c) => c.code === "REQ1")).toBe(true);
      }
      // C(3,2) = 3 optional subsets, each with exactly one feasible time combo.
      expect(outcome.totalFeasible).toBe(3);
    });

    it("rejects more required courses than the target with a specific reason, before searching", () => {
      const a = course("A", [tutorial(0, 0, 60)]);
      const b = course("B", [tutorial(1, 0, 60)]);
      const outcome = generatePlansFromCandidates([a.id, b.id], [], 1, [a, b], noPrefs);
      expect(outcome.ok).toBe(false);
      expect(outcome.ok === false && outcome.reason).toMatch(/required.*target|target.*required/i);
    });

    it("reports insufficient optional candidates to reach the target", () => {
      const required = course("REQ1", [tutorial(0, 0, 60)]);
      const opt1 = course("OPT1", [tutorial(1, 0, 60)]);
      const outcome = generatePlansFromCandidates([required.id], [opt1.id], 3, [required, opt1], noPrefs);
      expect(outcome.ok).toBe(false);
      expect(outcome.ok === false && outcome.reason).toMatch(/more.*needed to reach your target/i);
    });

    it("excludes a non-required candidate with no usable tutorial option from the pool, without failing outright", () => {
      const required = course("REQ1", [tutorial(0, 0, 60)]);
      const noTutorials = course("NOOPT", [lecture(0, 0, 60)]);
      const opt1 = course("OPT1", [tutorial(1, 0, 60)]);
      const opt2 = course("OPT2", [tutorial(2, 0, 60)]);
      const all = [required, noTutorials, opt1, opt2];
      const outcome = generatePlansFromCandidates([required.id], [noTutorials.id, opt1.id, opt2.id], 2, all, noPrefs);
      expect(outcome.ok).toBe(true);
      if (!outcome.ok) return;
      for (const plan of outcome.plans) {
        expect(plan.courses.some((c) => c.code === "NOOPT")).toBe(false);
      }
    });

    it("fails specifically when a required course has no tutorial option at all", () => {
      const required = course("REQ1", [lecture(0, 0, 60)]);
      const opt1 = course("OPT1", [tutorial(1, 0, 60)]);
      const outcome = generatePlansFromCandidates([required.id], [opt1.id], 2, [required, opt1], noPrefs);
      expect(outcome.ok).toBe(false);
      expect(outcome.ok === false && outcome.reason).toMatch(/Required course REQ1 has no tutorial time options at all/);
    });

    it("fails specifically when two required courses clash on every combination", () => {
      const req1 = course("REQ1", [tutorial(0, 800, 850), tutorial(0, 830, 880)]);
      const req2 = course("REQ2", [tutorial(0, 820, 870)]);
      const opt1 = course("OPT1", [tutorial(1, 0, 60)]);
      const outcome = generatePlansFromCandidates([req1.id, req2.id], [opt1.id], 3, [req1, req2, opt1], noPrefs);
      expect(outcome.ok).toBe(false);
      expect(outcome.ok === false && outcome.reason).toMatch(/Required courses REQ1 and REQ2 clash on every tutorial-time combination/);
    });

    it("searches only the required set when required count equals the target", () => {
      const req1 = course("REQ1", [tutorial(0, 0, 60)]);
      const req2 = course("REQ2", [tutorial(1, 0, 60)]);
      const opt1 = course("OPT1", [tutorial(2, 0, 60)]);
      const outcome = generatePlansFromCandidates([req1.id, req2.id], [opt1.id], 2, [req1, req2, opt1], noPrefs);
      expect(outcome.ok).toBe(true);
      if (!outcome.ok) return;
      expect(outcome.plans.every((p) => p.courses.length === 2)).toBe(true);
      expect(outcome.plans.every((p) => !p.courses.some((c) => c.code === "OPT1"))).toBe(true);
    });

    it("gives an honest generic no-solution message when nothing reaches the target, without fabricating a cause", () => {
      // Two optional candidates that are mutually exclusive (identical time),
      // needing both to reach the target of 2 from a required-free set of 1.
      const opt1 = course("OPT1", [tutorial(0, 0, 60)]);
      const opt2 = course("OPT2", [tutorial(0, 0, 60)]);
      const outcome = generatePlansFromCandidates([], [opt1.id, opt2.id], 2, [opt1, opt2], noPrefs);
      expect(outcome.ok).toBe(false);
      if (outcome.ok) return;
      expect(outcome.reason).toMatch(/no combination of your candidate courses reaches your target/i);
    });
  });
});
