import { beforeAll, describe, expect, inject, it } from "vitest";

const baseUrl = inject("baseUrl");

type SessionRow = { id: number; kind: string; label: string };
type CourseRow = { id: number; code: string; sessions: SessionRow[] };
type EnrollmentRow = { courseId: number; tutorialSessionId: number; course: { code: string } };

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
    const chosen = [
      choice("COMP1010", "Tutorial A"),
      choice("COMP3120", "Tutorial B"),
      choice("MATH1013", "Tutorial B"),
      choice("COMP4444", "Tutorial B"),
    ];
    const res = await json("/api/enrollment", "POST", { choices: chosen });
    expect(res.status).toBe(200);
    const body = (await res.json()) as EnrollmentRow[];
    expect(body.map((row) => row.course.code).sort()).toEqual(["COMP1010", "COMP3120", "COMP4444", "MATH1013"]);

    // A reload rebuilds the planner page from exactly this same GET
    // (src/pages/planner.astro reads listConfirmedEnrollments() fresh on
    // every request, no caching) — so "reload persists exactly what was
    // confirmed" rests on the *exact* tutorialSessionId round-tripping per
    // course, not just the course list matching.
    const reloaded = await getEnrollment();
    const bySessionId = new Map(chosen.map((c) => [c.courseId, c.tutorialSessionId]));
    for (const row of reloaded) {
      expect(row.tutorialSessionId).toBe(bySessionId.get(row.courseId));
    }
  });

  // COMP1010 and COMP2100 share an identical lecture time but that's no
  // longer a rejection case (a lecture overlap is never blocking — see
  // src/lib/scheduling.ts's classifyOverlap and PLAN.md). COMP2100 and
  // STAT1008 are the demo pair with a genuine, unavoidable tutorial clash
  // instead, so this is still a real transactional-rollback check: the
  // rejection here is a real tutorial-vs-tutorial conflict, not a stale rule.
  it("rejects an unavoidable tutorial clash and leaves the previous plan intact", async () => {
    const res = await json("/api/enrollment", "POST", {
      choices: [choice("COMP2100", "Tutorial A"), choice("STAT1008", "Tutorial A")],
    });
    expect(res.status).toBe(400);
    const err = (await res.json()) as { error: string };
    expect(err.error).toMatch(/clashes with/);

    const after = await getEnrollment();
    expect(after.map((row) => row.course.code).sort()).toEqual(["COMP1010", "COMP3120", "COMP4444", "MATH1013"]);
  });

  // Lecture-vs-lecture overlap is explicitly allowed now: COMP1010 and
  // COMP2100 share an identical lecture time, and that alone must not block
  // adding COMP2100 alongside the existing plan's COMP1010. Tutorial choices
  // here (COMP1010 Tutorial B is Wednesday, COMP2100 Tutorial A is Monday)
  // are deliberately picked to not clash with each other, so this test
  // isolates the lecture-vs-lecture rule rather than accidentally also
  // depending on a tutorial pairing being compatible.
  it("accepts a lecture-vs-lecture overlap: COMP1010 and COMP2100 share an identical lecture time but both can be confirmed", async () => {
    const res = await json("/api/enrollment", "POST", {
      choices: [choice("COMP1010", "Tutorial B"), choice("COMP2100", "Tutorial A")],
    });
    expect(res.status).toBe(200);
    const body = (await res.json()) as EnrollmentRow[];
    expect(body.map((row) => row.course.code).sort()).toEqual(["COMP1010", "COMP2100"]);

    // Restore the plan the remaining tests in this file expect, since this
    // confirm replaced it.
    const restore = await json("/api/enrollment", "POST", {
      choices: [
        choice("COMP1010", "Tutorial A"),
        choice("COMP3120", "Tutorial B"),
        choice("MATH1013", "Tutorial B"),
        choice("COMP4444", "Tutorial B"),
      ],
    });
    expect(restore.status).toBe(200);
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

  // Stands in for "a multi-section tutorial time left pending (no room/
  // section chosen yet)": the planner UI never lets that state reach this
  // endpoint at all (the confirm button is disabled until every course has a
  // concrete session id), so this checks the same thing the API route
  // actually guards against — a choice with no tutorialSessionId.
  it("rejects a choice with no tutorialSessionId, standing in for a still-pending section", async () => {
    const res = await json("/api/enrollment", "POST", {
      choices: [{ courseId: courses.COMP1010.id }],
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

  // The candidate list and a manual/generated preview have no course-count
  // cap; only the confirmed enrolment itself is capped at 4 (PLAN.md). The
  // rejection fires before the transaction opens anything, so this can't
  // disturb the plan the later tests in this file expect.
  it("rejects a confirm submission of more than 4 courses", async () => {
    const res = await json("/api/enrollment", "POST", {
      choices: [
        choice("COMP1010", "Tutorial A"),
        choice("COMP2100", "Tutorial A"),
        choice("COMP3120", "Tutorial A"),
        choice("COMP4444", "Tutorial A"),
        choice("MATH1013", "Tutorial A"),
      ],
    });
    expect(res.status).toBe(400);
    const err = (await res.json()) as { error: string };
    expect(err.error).toMatch(/at most 4/i);
  });

  it("still holds exactly the pre-existing plan after every rejected attempt above", async () => {
    const after = await getEnrollment();
    expect(after.map((row) => row.course.code)).toEqual(["ENGN2222"]);
  });

  // Verified here, not in spec/candidates.test.ts or spec/planner.test.ts:
  // this file is the sole caller of POST/DELETE /api/enrollment in the whole
  // suite, so only here can a before/after snapshot of it be compared for
  // exact equality without racing another file's legitimate writes to it
  // (fileParallelism runs spec files concurrently against one shared server).
  // COMP1010 is used here only for its candidate_courses row, never as a
  // candidate by any other file, so this doesn't race their candidate rows.
  it("adding, requiring and removing a candidate leaves confirmed enrolment untouched", async () => {
    const before = await getEnrollment();

    expect((await json("/api/candidates", "POST", { courseId: courses.COMP1010.id })).status).toBe(201);
    expect((await json("/api/candidates", "PATCH", { courseId: courses.COMP1010.id, required: true })).status).toBe(
      200,
    );
    expect((await del(`/api/candidates?courseId=${courses.COMP1010.id}`)).status).toBe(204);

    expect(await getEnrollment()).toEqual(before);
  });
});
