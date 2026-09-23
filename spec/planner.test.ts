import { beforeAll, describe, expect, inject, it } from "vitest";

const baseUrl = inject("baseUrl");

type CourseRow = { id: number; code: string; title: string };

// JSON bodies skip Astro's origin check; bodyless DELETE needs an origin
// header instead — same pattern as spec/candidates.test.ts.
const json = (path: string, method: string, body?: unknown) =>
  fetch(new URL(path, baseUrl), {
    method,
    headers: { "content-type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
const del = (path: string) => fetch(new URL(path, baseUrl), { method: "DELETE", headers: { origin: baseUrl } });
const getPlannerHtml = () => fetch(new URL("/planner/", baseUrl)).then((r) => r.text());

// Pulls out the one <article class="course-card" data-course-id="ID"> block
// so assertions about one course's controls can't accidentally match another
// course's card.
function extractCourseCard(html: string, courseId: number): string {
  const marker = `<article class="course-card" data-course-id="${courseId}">`;
  const start = html.indexOf(marker);
  if (start === -1) throw new Error(`course card ${courseId} not found in page`);
  const end = html.indexOf("</article>", start);
  return html.slice(start, end);
}

function requiredCheckboxTag(cardHtml: string): string {
  const idx = cardHtml.indexOf('class="required-checkbox"');
  if (idx === -1) throw new Error("required-checkbox not present in this card");
  const start = cardHtml.lastIndexOf("<input", idx);
  const end = cardHtml.indexOf(">", idx);
  return cardHtml.slice(start, end + 1);
}

function previewCheckboxTag(cardHtml: string): string {
  const idx = cardHtml.indexOf('class="preview-include-checkbox"');
  if (idx === -1) throw new Error("preview-include-checkbox not present in this card");
  const start = cardHtml.lastIndexOf("<input", idx);
  const end = cardHtml.indexOf(">", idx);
  return cardHtml.slice(start, end + 1);
}

// Uses COMP3120 exclusively for this file's own candidate add/patch/remove
// lifecycle, distinct from PHYS1201/ENGN2222 (spec/candidates.test.ts) and
// COMP2100 (that file's confirmed-enrolment-safety addition), so this file's
// writes to candidate_courses never race a row another spec file is also
// mutating.
describe("planner page", () => {
  let course: CourseRow;

  beforeAll(async () => {
    const list = (await fetch(new URL("/api/courses", baseUrl)).then((r) => r.json())) as CourseRow[];
    course = list.find((c) => c.code === "COMP3120")!;
  });

  it("discloses it's a prototype, not an official ANU service, and that course data is fictional demo data", async () => {
    const html = await getPlannerHtml();
    expect(html).toMatch(/not an official ANU service/i);
    expect(html).toMatch(/demo data/i);
    expect(html).toMatch(/same single demo student/i);
  });

  it("shows a course's lecture and tutorial times even when it isn't a candidate yet", async () => {
    const html = await getPlannerHtml();
    const card = extractCourseCard(html, course.id);
    expect(card).toContain("Lecture");
    expect(card).toContain("Tutorial A");
    expect(card).toContain("Add to candidates");
    // Not a candidate yet, so no required/preview controls should exist for it.
    expect(card).not.toContain("required-checkbox");
    expect(card).not.toContain("preview-include-checkbox");
  });

  it("persists a newly-added candidate: the page reflects it after a reload, not required and not pre-loaded into the preview", async () => {
    expect((await json("/api/candidates", "POST", { courseId: course.id })).status).toBe(201);

    const html = await getPlannerHtml();
    const card = extractCourseCard(html, course.id);
    expect(card).toContain("Remove from candidates");
    expect(requiredCheckboxTag(card)).not.toContain("checked");
    // The preview must never be auto-populated from the candidate list.
    expect(previewCheckboxTag(card)).not.toContain("checked");
    expect(html).toContain('id="candidate-list"');
    expect(extractCourseCard(html, course.id)).toBeTruthy();
  });

  it("persists the required flag once toggled on", async () => {
    expect((await json("/api/candidates", "PATCH", { courseId: course.id, required: true })).status).toBe(200);

    const html = await getPlannerHtml();
    const card = extractCourseCard(html, course.id);
    expect(requiredCheckboxTag(card)).toContain("checked");
    expect(card).toContain("Required");
    expect(card).toContain("this planning session only");
  });

  // The "confirmed enrolment is untouched" property itself is verified in
  // spec/enrollment.test.ts (see the comment there): a before/after snapshot
  // of /api/enrollment compared here would race that file's legitimate
  // concurrent writes to the same shared resource, since it's the suite's
  // sole caller of POST/DELETE /api/enrollment.
  it("removing a candidate reverts the page's controls for it", async () => {
    expect((await del(`/api/candidates?courseId=${course.id}`)).status).toBe(204);

    const html = await getPlannerHtml();
    const card = extractCourseCard(html, course.id);
    expect(card).toContain("Add to candidates");
    expect(card).not.toContain("required-checkbox");
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

  it("keeps the preview section empty on first load regardless of how many candidates or confirmed courses exist", async () => {
    const html = await getPlannerHtml();
    expect(html).toContain('id="preview-empty-note"');
    const previewPanelIndex = html.indexOf('id="preview-panel"');
    expect(previewPanelIndex).toBeGreaterThan(-1);
    // hidden is a bare boolean attribute Astro only emits when true.
    expect(html.slice(previewPanelIndex, previewPanelIndex + 60)).toContain("hidden");
  });
});
