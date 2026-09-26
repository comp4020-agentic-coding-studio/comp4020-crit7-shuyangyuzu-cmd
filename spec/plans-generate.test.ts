import { beforeAll, describe, expect, inject, it } from "vitest";
import { type GenCourse, type GenPreferences, generatePlansFromCandidates } from "../src/lib/generator";

const baseUrl = inject("baseUrl");

type SessionRow = { id: number; kind: "lecture" | "tutorial"; label: string; dayOfWeek: number; startMinutes: number; endMinutes: number; location: string };
type CourseRow = { id: number; code: string; title: string; sessions: SessionRow[] };
type CandidateRow = { courseId: number; required: number; course: CourseRow };
type PreferencesRow = { desiredCourseCount: number; blackoutDays: number[]; softPreferences: { minimizeDaysOnCampus: boolean; avoidDays: number[] } };

const json = (path: string, method: string, body?: unknown) =>
  fetch(new URL(path, baseUrl), {
    method,
    headers: { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });

const generate = (body: unknown) => json("/api/plans/generate", "POST", body);

// Owns MATH1013 and STAT1008 in the shared candidate table (see the ownership
// convention in spec/candidates.test.ts's trailing comment) and its own
// baseline plan_preferences row — every test below sets or reads preferences
// through that baseline rather than assuming what another spec file left
// behind, since fileParallelism is off but file *order* is not something this
// suite otherwise relies on.
describe("POST /api/plans/generate", () => {
  let math1013: CourseRow;
  let stat1008: CourseRow;

  beforeAll(async () => {
    const courses = (await fetch(new URL("/api/courses", baseUrl)).then((r) => r.json())) as CourseRow[];
    math1013 = courses.find((c) => c.code === "MATH1013")!;
    stat1008 = courses.find((c) => c.code === "STAT1008")!;
    await json("/api/candidates", "POST", { courseId: math1013.id });
    await json("/api/candidates", "POST", { courseId: stat1008.id });
    await json("/api/preferences", "PUT", {
      desiredCourseCount: 3,
      blackoutDays: [],
      softPreferences: { minimizeDaysOnCampus: false, avoidDays: [] },
    });
  });

  it("rejects a body that isn't a JSON object", async () => {
    const res = await fetch(new URL("/api/plans/generate", baseUrl), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: "not json",
    });
    expect(res.status).toBe(400);
  });

  it("rejects an unrecognised mode", async () => {
    const res = await generate({ mode: "something-else" });
    expect(res.status).toBe(400);
  });

  describe("mode: preview (operation A)", () => {
    it("rejects a non-array courseIds", async () => {
      const res = await generate({ mode: "preview", courseIds: "not-an-array" });
      expect(res.status).toBe(400);
    });

    it("rejects courseIds containing a non-integer", async () => {
      const res = await generate({ mode: "preview", courseIds: [1.5] });
      expect(res.status).toBe(400);
    });

    it("rejects a courseId that isn't one of the current candidates — never trusts the client's course list", async () => {
      const res = await generate({ mode: "preview", courseIds: [999999] });
      expect(res.status).toBe(400);
    });

    it("reports an empty preview honestly rather than running a search", async () => {
      const res = await generate({ mode: "preview", courseIds: [] });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.ok).toBe(false);
      expect(body.reason).toMatch(/preview is empty/i);
    });

    it("is not limited by the 3/4 desiredCourseCount rule — a single fixed course searches freely", async () => {
      const res = await generate({ mode: "preview", courseIds: [stat1008.id] });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.ok).toBe(true);
      expect(body.totalFeasible).toBe(1);
    });

    it("collapses STAT1008's two same-time sections into one pending time option, never defaulting to a section", async () => {
      const res = await generate({ mode: "preview", courseIds: [stat1008.id] });
      const body = await res.json();
      expect(body.plans).toHaveLength(1);
      expect(body.plans[0].courses[0]).toMatchObject({ code: "STAT1008", sectionId: null, pending: true });
      expect(body.plans[0].pendingCount).toBe(1);
    });

    it("finds both of MATH1013's tutorial-time options and reports the true count, each auto-resolved to its one section", async () => {
      const res = await generate({ mode: "preview", courseIds: [math1013.id] });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.ok).toBe(true);
      expect(body.totalFeasible).toBe(2);
      expect(body.plans).toHaveLength(2);
      expect(body.capped).toBe(false);
      for (const plan of body.plans) {
        expect(plan.courses[0]).toMatchObject({ code: "MATH1013", pending: false });
        expect(typeof plan.courses[0].sectionId).toBe("number");
      }
    });

    it("combines MATH1013 and STAT1008 without a clash, since their tutorial times fall on different days", async () => {
      const res = await generate({ mode: "preview", courseIds: [math1013.id, stat1008.id] });
      expect(res.status).toBe(200);
      const body = await res.json();
      expect(body.ok).toBe(true);
      expect(body.totalFeasible).toBe(2);
      for (const plan of body.plans) {
        expect(plan.courses.map((c: { code: string }) => c.code).sort()).toEqual(["MATH1013", "STAT1008"]);
      }
    });

    it("never modifies confirmed enrolment or the candidate list", async () => {
      const beforeEnrollment = await fetch(new URL("/api/enrollment", baseUrl)).then((r) => r.json());
      const beforeCandidates = await fetch(new URL("/api/candidates", baseUrl)).then((r) => r.json());
      const res = await generate({ mode: "preview", courseIds: [math1013.id, stat1008.id] });
      expect(res.status).toBe(200);
      const afterEnrollment = await fetch(new URL("/api/enrollment", baseUrl)).then((r) => r.json());
      const afterCandidates = await fetch(new URL("/api/candidates", baseUrl)).then((r) => r.json());
      expect(afterEnrollment).toEqual(beforeEnrollment);
      expect(afterCandidates).toEqual(beforeCandidates);
    });
  });

  describe("mode: candidates (operation B)", () => {
    // Rather than predicting the exact live candidate/required state (other
    // spec files own their own candidates and don't all clean up after
    // themselves), this asks the same pure generator function — imported
    // directly — for the answer using exactly the same live courses,
    // candidates and preferences the route itself just read, and checks the
    // route's JSON response against that. This verifies the route's wiring
    // (does it read the real candidate/required split, the real preferences,
    // and hand them to the generator unmodified) without assuming anything
    // about what other files left in the shared table.
    it("matches exactly what the pure generator computes from the same live candidates, courses and preferences", async () => {
      const [courses, candidates, preferences] = await Promise.all([
        fetch(new URL("/api/courses", baseUrl)).then((r) => r.json()) as Promise<CourseRow[]>,
        fetch(new URL("/api/candidates", baseUrl)).then((r) => r.json()) as Promise<CandidateRow[]>,
        fetch(new URL("/api/preferences", baseUrl)).then((r) => r.json()) as Promise<PreferencesRow>,
      ]);

      const genCourses: GenCourse[] = courses.map((c) => ({
        id: c.id,
        code: c.code,
        sessions: c.sessions.map((s) => ({ id: s.id, kind: s.kind, dayOfWeek: s.dayOfWeek, startMinutes: s.startMinutes, endMinutes: s.endMinutes })),
      }));
      const requiredCourseIds = candidates.filter((c) => c.required === 1).map((c) => c.courseId);
      const optionalCourseIds = candidates.filter((c) => c.required === 0).map((c) => c.courseId);
      const genPreferences: GenPreferences = preferences;

      const expected = generatePlansFromCandidates(requiredCourseIds, optionalCourseIds, preferences.desiredCourseCount, genCourses, genPreferences);

      const res = await generate({ mode: "candidates" });
      expect(res.status).toBe(200);
      const body = await res.json();

      if (!expected.ok) {
        expect(body.ok).toBe(false);
        expect(body.reason).toBe(expected.reason);
      } else {
        expect(body.ok).toBe(true);
        expect(body.totalFeasible).toBe(expected.totalFeasible);
        expect(body.capped).toBe(expected.totalFeasible > expected.plans.length);
        expect(body.plans).toEqual(expected.plans);
      }
    });

    it("never modifies confirmed enrolment or the candidate list", async () => {
      const beforeEnrollment = await fetch(new URL("/api/enrollment", baseUrl)).then((r) => r.json());
      const beforeCandidates = await fetch(new URL("/api/candidates", baseUrl)).then((r) => r.json());
      const res = await generate({ mode: "candidates" });
      expect(res.status).toBe(200);
      const afterEnrollment = await fetch(new URL("/api/enrollment", baseUrl)).then((r) => r.json());
      const afterCandidates = await fetch(new URL("/api/candidates", baseUrl)).then((r) => r.json());
      expect(afterEnrollment).toEqual(beforeEnrollment);
      expect(afterCandidates).toEqual(beforeCandidates);
    });
  });
});
