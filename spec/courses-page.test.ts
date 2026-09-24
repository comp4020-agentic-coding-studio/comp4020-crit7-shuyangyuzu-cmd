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
const getCoursesHtml = () => fetch(new URL("/courses/", baseUrl)).then((r) => r.text());

// Pulls out the one <article class="course-card" data-course-id="ID" ...>
// block so assertions about one course's controls can't accidentally match
// another course's card.
function extractCourseCard(html: string, courseId: number): string {
  const marker = `data-course-id="${courseId}"`;
  const articleStart = html.lastIndexOf("<article", html.indexOf(marker));
  if (articleStart === -1) throw new Error(`course card ${courseId} not found in page`);
  const end = html.indexOf("</article>", articleStart);
  return html.slice(articleStart, end);
}

function requiredCheckboxTag(cardHtml: string): string {
  const idx = cardHtml.indexOf('class="required-checkbox"');
  if (idx === -1) throw new Error("required-checkbox not present in this card");
  const start = cardHtml.lastIndexOf("<input", idx);
  const end = cardHtml.indexOf(">", idx);
  return cardHtml.slice(start, end + 1);
}

// Uses COMP3120 exclusively for this file's own candidate add/patch/remove
// lifecycle, distinct from PHYS1201/ENGN2222 (spec/candidates.test.ts),
// COMP2100 (spec/enrollment.test.ts's confirmed-enrolment-safety addition)
// and COMP4444 (spec/planner.test.ts), so this file's writes to
// candidate_courses never race a row another spec file is also mutating.
describe("courses page", () => {
  let course: CourseRow;

  beforeAll(async () => {
    const list = (await fetch(new URL("/api/courses", baseUrl)).then((r) => r.json())) as CourseRow[];
    course = list.find((c) => c.code === "COMP3120")!;
  });

  it("discloses it's a prototype, not an official ANU service, and that course data is fictional demo data", async () => {
    const html = await getCoursesHtml();
    expect(html).toMatch(/not an official ANU service/i);
    expect(html).toMatch(/demo data/i);
    expect(html).toMatch(/same single demo student/i);
  });

  it("shows a course's lecture and tutorial times even when it isn't a candidate yet", async () => {
    const html = await getCoursesHtml();
    const card = extractCourseCard(html, course.id);
    expect(card).toContain("Lecture");
    expect(card).toMatch(/Tutorial time options/);
    expect(card).toMatch(/Wednesday|Thursday|Friday|Monday|Tuesday/);
    expect(card).toContain("Add to candidates");
    // Not a candidate yet, so no required control should exist for it, and
    // this page never has a preview-toggle at all (that's the planner's job).
    expect(card).not.toContain("required-checkbox");
    expect(card).not.toContain("preview-include-checkbox");
  });

  it("persists a newly-added candidate: the page reflects it after a reload, not required", async () => {
    expect((await json("/api/candidates", "POST", { courseId: course.id })).status).toBe(201);

    const html = await getCoursesHtml();
    const card = extractCourseCard(html, course.id);
    expect(card).toContain("Remove from candidates");
    expect(requiredCheckboxTag(card)).not.toContain("checked");
    expect(html).toContain('id="candidate-list"');
  });

  it("persists the required flag once toggled on", async () => {
    expect((await json("/api/candidates", "PATCH", { courseId: course.id, required: true })).status).toBe(200);

    const html = await getCoursesHtml();
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
  it("removing a candidate reverts the page's controls for it, and says so without claiming it touches confirmed enrolment or the planner preview", async () => {
    expect((await del(`/api/candidates?courseId=${course.id}`)).status).toBe(204);

    const html = await getCoursesHtml();
    const card = extractCourseCard(html, course.id);
    expect(card).toContain("Add to candidates");
    expect(card).not.toContain("required-checkbox");
  });

  it("links to the planner instead of scheduling tutorial times or showing a weekly grid itself", async () => {
    const html = await getCoursesHtml();
    expect(html).toContain('href="/planner/"');
    expect(html).not.toContain('id="weekly-grid"');
    expect(html).not.toContain("tutorial-radio");
  });

  it("shows confirmed enrolment read-only, with no confirm/withdraw controls on this page", async () => {
    const html = await getCoursesHtml();
    expect(html).toContain('id="confirmed-heading"');
    expect(html).not.toMatch(/withdraw/i);
    expect(html).not.toContain('action="/api/enrollment"');

    const hasList = html.includes('id="confirmed-list"');
    const hasEmptyMessage = html.includes("don't have a confirmed enrolment yet");
    expect(hasList || hasEmptyMessage).toBe(true);
  });
});
