import { beforeAll, describe, expect, inject, it } from "vitest";

const baseUrl = inject("baseUrl");

type CourseRow = { id: number; code: string; title: string };

// JSON bodies skip Astro's origin check (it only gates form-like content
// types); DELETE has no body, so it needs the same-origin header instead —
// see spec/guestbook.test.ts for the same pattern.
const json = (path: string, method: string, body?: unknown) =>
  fetch(new URL(path, baseUrl), {
    method,
    headers: { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
const del = (path: string) => fetch(new URL(path, baseUrl), { method: "DELETE", headers: { origin: baseUrl } });

describe("candidates", () => {
  let course: CourseRow;
  let other: CourseRow;

  beforeAll(async () => {
    const list = (await fetch(new URL("/api/courses", baseUrl)).then((r) => r.json())) as CourseRow[];
    course = list.find((c) => c.code === "PHYS1201")!;
    other = list.find((c) => c.code === "ENGN2222")!;
  });

  it("rejects a non-integer courseId", async () => {
    const res = await json("/api/candidates", "POST", { courseId: "not-a-number" });
    expect(res.status).toBe(400);
  });

  it("404s adding a course that doesn't exist", async () => {
    const res = await json("/api/candidates", "POST", { courseId: 999999 });
    expect(res.status).toBe(404);
  });

  it("adds a course to the candidate list, not required by default", async () => {
    const res = await json("/api/candidates", "POST", { courseId: course.id });
    expect(res.status).toBe(201);
    const body = (await res.json()) as { required: number; course: CourseRow };
    expect(body.course.code).toBe("PHYS1201");
    expect(body.required).toBe(0);
  });

  it("shows up in the candidate list", async () => {
    const list = (await fetch(new URL("/api/candidates", baseUrl)).then((r) => r.json())) as { course: CourseRow }[];
    expect(list.some((c) => c.course.code === "PHYS1201")).toBe(true);
  });

  it("409s adding the same course twice", async () => {
    const res = await json("/api/candidates", "POST", { courseId: course.id });
    expect(res.status).toBe(409);
  });

  it("has no enrolment cap: a second candidate can be added alongside the first", async () => {
    const res = await json("/api/candidates", "POST", { courseId: other.id });
    expect(res.status).toBe(201);
  });

  it("marks a candidate required without needing a degree-requirement check", async () => {
    const res = await json("/api/candidates", "PATCH", { courseId: course.id, required: true });
    expect(res.status).toBe(200);
    const body = (await res.json()) as { required: number };
    expect(body.required).toBe(1);
  });

  it("404s marking a non-candidate required", async () => {
    const res = await json("/api/candidates", "PATCH", { courseId: 999999, required: true });
    expect(res.status).toBe(404);
  });

  it("rejects a PATCH missing the required flag", async () => {
    const res = await json("/api/candidates", "PATCH", { courseId: course.id });
    expect(res.status).toBe(400);
  });

  it("removes a candidate", async () => {
    const res = await del(`/api/candidates?courseId=${course.id}`);
    expect(res.status).toBe(204);
    const list = (await fetch(new URL("/api/candidates", baseUrl)).then((r) => r.json())) as { course: CourseRow }[];
    expect(list.some((c) => c.course.code === "PHYS1201")).toBe(false);
  });

  it("404s removing a candidate that isn't on the list", async () => {
    const res = await del(`/api/candidates?courseId=${course.id}`);
    expect(res.status).toBe(404);
  });
});

// The "never touches confirmed enrolment" property is verified in
// spec/enrollment.test.ts instead of here: that file is the suite's sole
// caller of POST/DELETE /api/enrollment, so it's the only place a
// before/after snapshot of it can be compared without racing another spec
// file's legitimate writes to the same shared resource.
