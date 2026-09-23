import { describe, expect, inject, it } from "vitest";

// Read-only: GET /api/courses is the browse-before-you-commit surface the
// whole prototype is built around (PLAN.md's "real problem").
const baseUrl = inject("baseUrl");

type CourseRow = { code: string; title: string; sessions: { kind: string }[] };

describe("courses", () => {
  it("lists the demo courses, each with at least one lecture and one tutorial", async () => {
    const res = await fetch(new URL("/api/courses", baseUrl));
    expect(res.status).toBe(200);
    const courses = (await res.json()) as CourseRow[];

    expect(courses.length).toBeGreaterThanOrEqual(6);
    expect(courses.length).toBeLessThanOrEqual(8);

    const codes = courses.map((c) => c.code);
    expect(new Set(codes).size).toBe(codes.length);

    for (const course of courses) {
      expect(course.sessions.some((s) => s.kind === "lecture")).toBe(true);
      expect(course.sessions.some((s) => s.kind === "tutorial")).toBe(true);
    }
  });

  it("labels every demo course as demo data, not a real ANU offering", async () => {
    const courses = (await fetch(new URL("/api/courses", baseUrl)).then((r) => r.json())) as CourseRow[];
    for (const course of courses) {
      expect(course.title.toLowerCase()).toContain("(demo)");
    }
  });
});
