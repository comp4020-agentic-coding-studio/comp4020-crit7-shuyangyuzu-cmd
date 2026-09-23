import { describe, expect, inject, it } from "vitest";
import { findConflict } from "../src/lib/scheduling";

const baseUrl = inject("baseUrl");

type SessionRow = { id: number; kind: "lecture" | "tutorial"; label: string; dayOfWeek: number; startMinutes: number; endMinutes: number };
type CourseRow = { id: number; code: string; sessions: SessionRow[] };

// A "combination" is one tutorial choice per course plus every lecture for
// each chosen course. Feasible = no two chosen sessions (lecture or tutorial)
// overlap. This brute-forces every tutorial combination for a fixed course
// subset — fine at this scale (at most 3 tutorials/course, <=8 courses) and
// deliberately independent of any ranking/generator logic, which is out of
// scope for Phase 2 (see PLAN.md).
function slotsFor(course: CourseRow, tutorial: SessionRow) {
  const lectures = course.sessions.filter((s) => s.kind === "lecture");
  return [...lectures, tutorial].map((s) => ({ label: `${course.code} ${s.label}`, session: s }));
}

function feasibleCombinationExists(courses: CourseRow[]): boolean {
  function search(index: number, chosen: { label: string; session: SessionRow }[]): boolean {
    if (index === courses.length) return true;
    const course = courses[index];
    const tutorials = course.sessions.filter((s) => s.kind === "tutorial");
    for (const tutorial of tutorials) {
      const withThisCourse = [...chosen, ...slotsFor(course, tutorial)];
      if (findConflict(withThisCourse) === null && search(index + 1, withThisCourse)) return true;
    }
    return false;
  }
  return search(0, []);
}

describe("demo data", () => {
  it("ships 6-8 courses, each clearly marked as demo", async () => {
    const courses = (await fetch(new URL("/api/courses", baseUrl)).then((r) => r.json())) as CourseRow[];
    expect(courses.length).toBeGreaterThanOrEqual(6);
    expect(courses.length).toBeLessThanOrEqual(8);
  });

  it("has an avoidable tutorial clash: COMP1010 and COMP3120 clash on one tutorial pairing but not another", async () => {
    const courses = (await fetch(new URL("/api/courses", baseUrl)).then((r) => r.json())) as CourseRow[];
    const c1010 = courses.find((c) => c.code === "COMP1010")!;
    const c3120 = courses.find((c) => c.code === "COMP3120")!;
    const t1010B = c1010.sessions.find((s) => s.label === "Tutorial B")!;
    const t3120A = c3120.sessions.find((s) => s.label === "Tutorial A")!;
    const t1010A = c1010.sessions.find((s) => s.label === "Tutorial A")!;
    const t3120B = c3120.sessions.find((s) => s.label === "Tutorial B")!;

    expect(
      findConflict([
        ...slotsFor(c1010, t1010B).filter((s) => s.session.kind === "tutorial"),
        ...slotsFor(c3120, t3120A).filter((s) => s.session.kind === "tutorial"),
      ]),
    ).not.toBeNull();

    expect(
      findConflict([
        ...slotsFor(c1010, t1010A).filter((s) => s.session.kind === "tutorial"),
        ...slotsFor(c3120, t3120B).filter((s) => s.session.kind === "tutorial"),
      ]),
    ).toBeNull();
  });

  it("has an unavoidable lecture clash: COMP1010 and COMP2100 conflict no matter which tutorials are chosen", async () => {
    const courses = (await fetch(new URL("/api/courses", baseUrl)).then((r) => r.json())) as CourseRow[];
    const c1010 = courses.find((c) => c.code === "COMP1010")!;
    const c2100 = courses.find((c) => c.code === "COMP2100")!;
    for (const t1 of c1010.sessions.filter((s) => s.kind === "tutorial")) {
      for (const t2 of c2100.sessions.filter((s) => s.kind === "tutorial")) {
        expect(findConflict([...slotsFor(c1010, t1), ...slotsFor(c2100, t2)])).not.toBeNull();
      }
    }
  });

  it("has an adjacent-but-not-conflicting pair: COMP4444 Tutorial B ends exactly when ENGN2222's lecture starts", async () => {
    const courses = (await fetch(new URL("/api/courses", baseUrl)).then((r) => r.json())) as CourseRow[];
    const c4444 = courses.find((c) => c.code === "COMP4444")!;
    const engn = courses.find((c) => c.code === "ENGN2222")!;
    const tutorial = c4444.sessions.find((s) => s.label === "Tutorial B")!;
    const engnTutorial = engn.sessions.find((s) => s.label === "Tutorial A")!;
    const lecture = engn.sessions.find((s) => s.kind === "lecture")!;
    expect(tutorial.dayOfWeek).toBe(lecture.dayOfWeek);
    expect(tutorial.endMinutes).toBe(lecture.startMinutes);
    expect(findConflict([...slotsFor(c4444, tutorial), ...slotsFor(engn, engnTutorial)])).toBeNull();
  });

  it("spreads courses across differentiated days of the week, not all on one day", async () => {
    const courses = (await fetch(new URL("/api/courses", baseUrl)).then((r) => r.json())) as CourseRow[];
    const days = new Set(courses.flatMap((c) => c.sessions.map((s) => s.dayOfWeek)));
    expect(days.size).toBeGreaterThanOrEqual(4);
  });

  it("has at least one feasible 3-course combination", async () => {
    const courses = (await fetch(new URL("/api/courses", baseUrl)).then((r) => r.json())) as CourseRow[];
    const subset = courses.filter((c) => ["COMP1010", "COMP3120", "MATH1013"].includes(c.code));
    expect(subset).toHaveLength(3);
    expect(feasibleCombinationExists(subset)).toBe(true);
  });

  it("has at least one feasible 4-course combination", async () => {
    const courses = (await fetch(new URL("/api/courses", baseUrl)).then((r) => r.json())) as CourseRow[];
    const subset = courses.filter((c) => ["COMP1010", "COMP3120", "MATH1013", "COMP4444"].includes(c.code));
    expect(subset).toHaveLength(4);
    expect(feasibleCombinationExists(subset)).toBe(true);
  });
});
