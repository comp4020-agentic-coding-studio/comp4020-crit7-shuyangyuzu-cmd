import { beforeAll, describe, expect, inject, it } from "vitest";

const baseUrl = inject("baseUrl");

type SessionRow = { id: number; kind: string; label: string };
type CourseRow = { id: number; code: string; sessions: SessionRow[] };
type EnrollmentRow = { course: { code: string } };

const json = (path: string, method: string, body?: unknown) =>
  fetch(new URL(path, baseUrl), {
    method,
    headers: { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
const del = (path: string) => fetch(new URL(path, baseUrl), { method: "DELETE", headers: { origin: baseUrl } });
const getEnrollment = () => fetch(new URL("/api/enrollment", baseUrl)).then((r) => r.json() as Promise<EnrollmentRow[]>);

// Ordered on purpose: confirmEnrollment replaces the *whole* confirmed plan,
// so this file tells one continuous story (confirm, fail, fail differently,
// withdraw) rather than independent cases — each "rejects ..." test is also
// a rollback check, since PLAN.md requires the previous plan to survive a
// failed replace intact.
describe("enrollment", () => {
  let courses: Record<string, CourseRow>;
  const session = (code: string, label: string): SessionRow => {
    const found = courses[code].sessions.find((s) => s.label === label);
    if (!found) throw new Error(`no session "${label}" on ${code}`);
    return found;
  };
  const choice = (code: string, tutorialLabel: string) => ({
    courseId: courses[code].id,
    tutorialSessionId: session(code, tutorialLabel).id,
  });

  beforeAll(async () => {
    const list = (await fetch(new URL("/api/courses", baseUrl)).then((r) => r.json())) as CourseRow[];
    courses = Object.fromEntries(list.map((c) => [c.code, c]));
  });

  it("confirms a feasible 4-course plan", async () => {
    const res = await json("/api/enrollment", "POST", {
      choices: [
        choice("COMP1010", "Tutorial A"),
        choice("COMP3120", "Tutorial B"),
        choice("MATH1013", "Tutorial B"),
        choice("COMP4444", "Tutorial B"),
      ],
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as EnrollmentRow[];
    expect(body.map((row) => row.course.code).sort()).toEqual(["COMP1010", "COMP3120", "COMP4444", "MATH1013"]);
  });

  it("rejects an unavoidable lecture clash and leaves the previous plan intact", async () => {
    const res = await json("/api/enrollment", "POST", {
      choices: [choice("COMP1010", "Tutorial A"), choice("COMP2100", "Tutorial A")],
    });
    expect(res.status).toBe(400);
    const err = (await res.json()) as { error: string };
    expect(err.error).toMatch(/clashes with/);

    const after = await getEnrollment();
    expect(after.map((row) => row.course.code).sort()).toEqual(["COMP1010", "COMP3120", "COMP4444", "MATH1013"]);
  });

  it("rejects a clashing tutorial pairing but accepts the alternate tutorial for the same two courses", async () => {
    const clashing = await json("/api/enrollment", "POST", {
      choices: [choice("COMP1010", "Tutorial B"), choice("COMP3120", "Tutorial A")],
    });
    expect(clashing.status).toBe(400);
    expect((await getEnrollment())).toHaveLength(4);

    const ok = await json("/api/enrollment", "POST", {
      choices: [choice("COMP1010", "Tutorial A"), choice("COMP3120", "Tutorial B")],
    });
    expect(ok.status).toBe(200);
  });

  it("treats two sessions that are exactly back-to-back as compatible, not a conflict", async () => {
    const res = await json("/api/enrollment", "POST", {
      choices: [choice("COMP4444", "Tutorial B"), choice("ENGN2222", "Tutorial A")],
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as EnrollmentRow[];
    expect(body.map((row) => row.course.code).sort()).toEqual(["COMP4444", "ENGN2222"]);
  });

  it("withdraws a single confirmed course without touching the rest", async () => {
    const res = await del(`/api/enrollment?courseId=${courses.COMP4444.id}`);
    expect(res.status).toBe(204);
    const after = await getEnrollment();
    expect(after.map((row) => row.course.code)).toEqual(["ENGN2222"]);
  });

  it("404s withdrawing a course that isn't confirmed", async () => {
    const res = await del(`/api/enrollment?courseId=${courses.COMP2100.id}`);
    expect(res.status).toBe(404);
  });

  it("rejects a tutorial session id that belongs to a different course", async () => {
    const res = await json("/api/enrollment", "POST", {
      choices: [{ courseId: courses.COMP1010.id, tutorialSessionId: session("COMP2100", "Tutorial A").id }],
    });
    expect(res.status).toBe(400);
  });

  it("rejects a lecture session id used as a tutorial choice", async () => {
    const res = await json("/api/enrollment", "POST", {
      choices: [{ courseId: courses.COMP1010.id, tutorialSessionId: session("COMP1010", "Lecture").id }],
    });
    expect(res.status).toBe(400);
  });

  it("404s an unknown course id", async () => {
    const res = await json("/api/enrollment", "POST", {
      choices: [{ courseId: 999999, tutorialSessionId: session("COMP1010", "Tutorial A").id }],
    });
    expect(res.status).toBe(404);
  });

  it("rejects the same course appearing twice in one submission", async () => {
    const res = await json("/api/enrollment", "POST", {
      choices: [choice("COMP1010", "Tutorial A"), choice("COMP1010", "Tutorial A")],
    });
    expect(res.status).toBe(400);
  });

  it("rejects an empty choice list", async () => {
    const res = await json("/api/enrollment", "POST", { choices: [] });
    expect(res.status).toBe(400);
  });

  it("still holds exactly the pre-existing plan after every rejected attempt above", async () => {
    const after = await getEnrollment();
    expect(after.map((row) => row.course.code)).toEqual(["ENGN2222"]);
  });
});
