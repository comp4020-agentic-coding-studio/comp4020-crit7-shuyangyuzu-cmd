import { beforeAll, describe, expect, inject, it } from "vitest";

const baseUrl = inject("baseUrl");

type CourseRow = { id: number; code: string; title: string };

const json = (path: string, method: string, body?: unknown) =>
  fetch(new URL(path, baseUrl), {
    method,
    headers: { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
const del = (path: string) => fetch(new URL(path, baseUrl), { method: "DELETE", headers: { origin: baseUrl } });
const getPlannerHtml = () => fetch(new URL("/planner/", baseUrl)).then((r) => r.text());

// Pulls out the one <article class="schedule-card" data-course-id="ID">
// block so assertions about one course's controls can't accidentally match
// another course's card.
function extractScheduleCard(html: string, courseId: number): string {
  const marker = `<article class="schedule-card" data-course-id="${courseId}">`;
  const start = html.indexOf(marker);
  if (start === -1) throw new Error(`schedule card ${courseId} not found in page`);
  const end = html.indexOf("</article>", start);
  return html.slice(start, end);
}

function previewCheckboxTag(cardHtml: string): string {
  const idx = cardHtml.indexOf('class="preview-include-checkbox"');
  if (idx === -1) throw new Error("preview-include-checkbox not present in this card");
  const start = cardHtml.lastIndexOf("<input", idx);
  const end = cardHtml.indexOf(">", idx);
  return cardHtml.slice(start, end + 1);
}

// Uses COMP4444 exclusively for this file's own candidate add/patch/remove
// checks, distinct from COMP3120 (spec/courses.test.ts), PHYS1201/ENGN2222
// (spec/candidates.test.ts) and COMP2100 (spec/enrollment.test.ts's
// confirmed-enrolment-safety addition), so this file's writes to
// candidate_courses never race a row another spec file is also mutating.
describe("planner page", () => {
  let course: CourseRow;

  beforeAll(async () => {
    const list = (await fetch(new URL("/api/courses", baseUrl)).then((r) => r.json())) as CourseRow[];
    course = list.find((c) => c.code === "COMP4444")!;
  });

  it("discloses it's a prototype, not an official ANU service, that course data is fictional demo data, and that lectures never block a plan", async () => {
    const html = await getPlannerHtml();
    expect(html).toMatch(/not an official ANU service/i);
    expect(html).toMatch(/demo data/i);
    expect(html).toMatch(/same single demo student/i);
    expect(html).toMatch(/recording/i);
  });

  it("never shows candidate-management or course-browsing controls — those moved to /courses/", async () => {
    const html = await getPlannerHtml();
    expect(html).toContain('href="/courses/"');
    expect(html).not.toContain("candidate-toggle");
    expect(html).not.toContain("course-search");
    expect(html).not.toContain('class="course-card"');
  });

  it("renders the weekly grid hidden and the preview-empty note visible before any client script runs", async () => {
    const html = await getPlannerHtml();
    const gridIndex = html.indexOf('id="weekly-grid"');
    expect(gridIndex).toBeGreaterThan(-1);
    expect(html.slice(gridIndex, gridIndex + 80)).toContain("hidden");
    expect(html).toContain('id="preview-empty-note"');
  });

  it("shows a newly-added candidate as an unchecked preview entry, with no tutorial options until it's included", async () => {
    expect((await json("/api/candidates", "POST", { courseId: course.id })).status).toBe(201);

    const html = await getPlannerHtml();
    const card = extractScheduleCard(html, course.id);
    expect(card).toContain(course.code);
    expect(previewCheckboxTag(card)).not.toContain("checked");
    expect(card).not.toContain("tutorial-options");
  });

  it("shows the required badge once the candidate is marked required", async () => {
    expect((await json("/api/candidates", "PATCH", { courseId: course.id, required: true })).status).toBe(200);

    const html = await getPlannerHtml();
    const card = extractScheduleCard(html, course.id);
    expect(card).toContain("Required");
  });

  it("drops a removed candidate's schedule card", async () => {
    expect((await del(`/api/candidates?courseId=${course.id}`)).status).toBe(204);

    const html = await getPlannerHtml();
    expect(html).not.toContain(`<article class="schedule-card" data-course-id="${course.id}">`);
  });

  // Checks the confirmed-enrolment section against itself only (not a second,
  // separately-timed fetch of /api/enrollment) — spec/enrollment.test.ts can
  // concurrently change that resource between two requests in this file,
  // which would make a cross-request comparison flaky through no fault of
  // the page.
  it("shows confirmed enrolment read-only, with no confirm/withdraw controls on this page", async () => {
    const html = await getPlannerHtml();
    expect(html).toContain('id="confirmed-heading"');
    expect(html).not.toMatch(/withdraw/i);
    expect(html).not.toContain('action="/api/enrollment"');

    const hasList = html.includes('id="confirmed-list"');
    const hasEmptyMessage = html.includes("don't have a confirmed enrolment yet");
    expect(hasList || hasEmptyMessage).toBe(true);
  });

  // Phase 4: auto-schedule structural checks. These assert what's actually
  // rendered server-side (markup, hidden state, restored preference values)
  // rather than the client script's behaviour — nothing here exercises a
  // real browser, so generate/apply/pagination interaction itself is only
  // verified at the API level (spec/plans-generate.test.ts) and by manual
  // check, not here.
  describe("auto-schedule section", () => {
    it("explains the hard/soft distinction and that only tutorials count for day-based conditions", async () => {
      const html = await getPlannerHtml();
      expect(html).toContain('id="autoschedule-heading"');
      expect(html).toMatch(/hard rule/i);
      expect(html).toMatch(/tutorials only/i);
    });

    it("renders both trigger buttons, described as user-triggered and non-destructive to the confirmed enrolment", async () => {
      const html = await getPlannerHtml();
      expect(html).toContain('id="generate-preview-times-btn"');
      expect(html).toContain('id="generate-from-candidates-btn"');
      expect(html).toMatch(/never changes what's listed here|touches your confirmed enrolment/i);
    });

    it("renders the results section and plan-detail modal hidden before any client script runs", async () => {
      const html = await getPlannerHtml();
      const resultsIndex = html.indexOf('id="generate-results"');
      expect(resultsIndex).toBeGreaterThan(-1);
      expect(html.slice(resultsIndex, resultsIndex + 80)).toContain("hidden");

      const modalIndex = html.indexOf('id="plan-detail-modal"');
      expect(modalIndex).toBeGreaterThan(-1);
      expect(html.slice(modalIndex, modalIndex + 140)).toContain("hidden");
    });

    // Restores whatever this file found in place before it started, in a
    // finally block, so a run in any file order leaves plan_preferences
    // exactly as it found it — this file doesn't otherwise own that table
    // (see spec/preferences.test.ts and spec/plans-generate.test.ts).
    it("restores saved conditions (blackout/avoid days, minimize-days, desired count) after a reload", async () => {
      const original = await json("/api/preferences", "GET").then((r) => r.json());
      try {
        const res = await json("/api/preferences", "PUT", {
          desiredCourseCount: 4,
          blackoutDays: [5],
          softPreferences: { minimizeDaysOnCampus: true, avoidDays: [2] },
        });
        expect(res.status).toBe(200);

        const html = await getPlannerHtml();
        expect(html).toMatch(/class="blackout-day-checkbox" data-day="5" checked/);
        expect(html).toMatch(/class="avoid-day-checkbox" data-day="2" checked/);
        expect(html).toMatch(/id="minimize-days-checkbox"\s+checked/);
        expect(html).toMatch(/name="desired-count" value="4" checked/);
        expect(html).not.toMatch(/name="desired-count" value="3" checked/);
      } finally {
        const restore = await json("/api/preferences", "PUT", original);
        expect(restore.status).toBe(200);
      }
    });
  });
});
