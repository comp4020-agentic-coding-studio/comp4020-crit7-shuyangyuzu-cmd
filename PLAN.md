# Plan — ANU course selection & timetable planner

This is my own planning document, not the course spec: the spec is fixed and
published on the course site and read into `CLAUDE.md`/`PROCESS.md` as needed;
this file is where I record the scope and acceptance criteria I'm building
against, and the order I intend to build them in. It's a working document —
later phases may update it as I learn things.

## The real problem

This is my own experience with ANU's systems, not a claim about how everyone
uses them. Today, to compare courses I have to check Programs and Courses for
a course, then actually enrol in it on ANUHub before Timetable will show me
its lecture and tutorial times. That means:

- courses I'm only comparing can push me over the real enrolment cap, so I
  have to unenrol just to keep looking;
- once I've worked out a timetable, I still have to go back to ANUHub to
  actually enrol or withdraw;
- clashes only surface late, one tutorial click at a time;
- I have no way to say "lock these courses, cap it at N, block these days,
  prefer fewer days on campus" and have something compare combinations for me.

## Prototype scope

**In scope**

- One semester, one demo student, 6–8 demo courses.
- Each course has one or more fixed lectures (compulsory) and several
  optional tutorials, of which exactly one is chosen per course.
- All courses and session times are clearly labelled as demo data — the app
  never claims to be an ANU official service.
- Enrolling/withdrawing only writes to this app's own database; nothing calls
  ANUHub or any real ANU system.
- Core flow: **candidate courses → set conditions → generate conflict-free
  plans → compare timetables → confirm enrolment → save and adjust**.
- Candidate list is not capped by any real enrolment quota.
- "Required" means *I've locked this course for this planning session*, not a
  verified degree requirement.
- Enrolment target is a choice of 3 or 4 courses.
- Time conditions split into hard constraints (a day I can't attend at all)
  and soft preferences (fewer days on campus, avoid a given day where
  possible).
- Candidate list, preferences, and the confirmed enrolment must all persist.

**Out of scope**

- Login / multiple users.
- Multi-semester planning.
- Real seat competition or capacity limits.
- Degree/program requirement checking.
- Inter-building travel time between back-to-back sessions.

## Rules that shape the whole build

- Adjacent sessions (one ends exactly when the next starts) are **not** a
  conflict.
- A hard constraint must always be satisfied; a soft preference only affects
  how candidate plans are *ranked*, never whether one is offered at all.
- When there's no feasible plan (too many required courses, too few
  candidates, or a conflict nothing can route around), the app must say why
  in a way I can act on — never invent a reason.
- If the number of plans shown is capped for display, that has to be said
  explicitly — a capped list must never look like "no other options exist."
- A single tutorial clash is never reported as "this course can't be taken";
  it's reported as a tutorial-level conflict, distinct from a course actually
  having no feasible slot.
- Candidate courses, a previewed/generated plan, and the confirmed enrolment
  are three distinct states and the UI must not blur them into each other.
- Replacing a confirmed plan is transactional: if it fails partway, the
  previous confirmed plan stays intact.

## Acceptance criteria

### The course's fixed spec

| Spec line | Automatable? | How |
|---|---|---|
| App loads at its `*.fly.dev` URL by the cutoff | Manual (deploy check) | `curl`/browser check against the live URL at phase 6; not a `vitest` assertion. |
| Models a slice of a real ANU system, wired end to end | Judged | Whether the slice is real and deep enough is a crit call, not a test. |
| Core flow persists across a reload | Automatable | HTTP-level test in the style of `guestbook.test.ts`: add a candidate / confirm a plan, then read it back. |
| Repo shows the process (commits, `PROCESS.md`, `reflections/crit-7.md`) | Checked by tooling + judged | `pnpm check:evidence` checks the mechanics (citations resolve, files exist); whether the account is honest and useful is a human read. |
| I can account for how I directed, grounded and corrected the work | Judged | Crit conversation; `PROCESS.md` is my evidence trail for it. |

### My own scope

| Requirement | Automatable? | How |
|---|---|---|
| Candidate list has no enrolment cap | Yes | Add more candidates than the enrolment target; assert it's allowed. |
| One tutorial choice required per course before it counts as scheduled | Yes | Data-layer test. |
| "Some tutorials clash but alternatives exist" vs "no feasible slot at all" are distinguished | Yes | Generator test against fixture data with both shapes. |
| Enrolment target of 3 or 4 is respected | Yes | Generator test. |
| Hard constraint always holds; soft preference only reorders | Yes | Generator test: a blackout day must eliminate every plan that violates it; a soft preference must only change ordering among the surviving plans. |
| Adjacent sessions aren't a conflict | Yes | Boundary-case generator test (end == start). |
| No-feasible-plan case gives an accurate, specific reason | Partly | That a reason is returned (not silence) is testable; whether the wording reads as honest and non-invented is a judgement call. |
| Capped result count is disclosed | Yes | Assert the UI/response says so when more solutions exist than are shown. |
| Replacing a confirmed plan is transactional | Partly | Happy-path persistence is testable; a genuine failure-injection test is a stretch goal, not guaranteed. |
| Candidate / previewed / confirmed states stay visibly distinct | Judged, partly testable | That the three are separate data states is testable; whether the *UI* reads clearly is a crit call. |
| Desktop and mobile layouts, loading/empty/error states, keyboard operability, form labels | Manual | Carried forward in `CLAUDE.md`: a human look at both viewports, not a test. |
| Demo-data disclaimer is visible; no ANUHub network calls anywhere in the code | Partly | Presence of a fixed disclaimer string is testable like `readme.test.ts`; absence of any ANUHub call is a code-review fact, not something a test proves. |

## Data design (planning only — no schema yet)

Entities:

- **Course** — `id`, `code`, `title`. Demo data, e.g. 6–8 rows.
- **Session** — belongs to a `Course`; `kind` (`lecture` | `tutorial`),
  `label`, `dayOfWeek`, `startTime`, `endTime`. Every `lecture` session for a
  course is compulsory; `tutorial` sessions are mutually exclusive
  alternatives — exactly one is chosen per course in a plan.
- **CandidateCourse** — a `Course` on my candidate list, plus whether I've
  marked it `required` for this planning session.
- **PlanPreference** — a single settings row: desired course count (3 or 4),
  blackout days (hard), ordered/weighted soft preferences (e.g. minimise days
  on campus, avoid a given day).
- **ConfirmedEnrollment** — one row per confirmed course, each pointing at
  the `Course` and the chosen tutorial `Session`. This is the only table that
  represents "I've actually enrolled," and replacing its contents is a single
  transaction.

There's deliberately no `Student` table and no persisted "generated plan"
table: the scope is one demo student, so identity doesn't need modelling, and
a plan is a computed comparison over candidates + preferences, not something
that needs to survive a reload on its own — only the *confirmed* result does.

Relationships: `Course 1—N Session`; `Course 1—1 CandidateCourse`;
`ConfirmedEnrollment N—1 Course` and `N—1 Session` (the chosen tutorial).

Planned API surface (interfaces, not implementations):

- `GET /api/courses` — demo courses with their sessions.
- `GET/POST/DELETE/PATCH /api/candidates` — candidate list membership and the
  `required` flag.
- `GET/PUT /api/preferences` — course count target, blackout days, soft
  preferences.
- `POST /api/plans/generate` — reads current candidates + preferences,
  returns ranked feasible combinations (or an explained empty result).
- `GET /api/enrollment` — the current confirmed plan.
- `POST /api/enrollment/confirm` — replaces the confirmed plan transactionally.
- `DELETE /api/enrollment/:courseId` — withdraw one course from the confirmed
  plan.

## Implementation order

1. **Database & demo data** — schema, migration, seed data with a deliberate
   avoidable tutorial clash, an unavoidable lecture clash, and combinations
   that satisfy different day preferences; read/write endpoints with input
   validation.
2. **Candidates & manual timetable** — browse all courses/sessions without
   enrolling first; add/remove candidates, mark required, pick a tutorial,
   see it on a weekly grid; early conflict feedback that doesn't conflate a
   tutorial clash with "course unavailable."
3. **Conditions & auto-generation** — course count, required courses,
   blackout days, soft preferences; the generator itself; accurate
   no-solution explanations; disclosed result caps.
4. **Comparison & confirmation** — weekly-grid comparison of plans, confirm /
   withdraw / adjust in one place, transactional replace, state survives a
   reload.
5. **Whole-app pass & deploy** — both viewports, loading/empty/error states,
   keyboard access, form labels; `pnpm check`; deploy to the existing Fly app;
   verify the live core flow and persistence; finish `PROCESS.md` and
   `reflections/crit-7.md`; check off the spec.

## Plan generation & ranking (decided in phase 3, implemented in phase 4)

Settled while working on phase 3 (candidates & manual timetable), against the
real 7-course demo dataset — not implemented yet; this is the contract phase
4's generator has to satisfy.

- The generator runs a **full search** over the current demo-data scale (7
  courses, at most 3 tutorials each): enumerate every combination of
  candidates at the target course count, and every tutorial choice within
  each, and keep every combination with no conflict (lecture-vs-lecture,
  lecture-vs-tutorial, or tutorial-vs-tutorial). This is exhaustive, not a
  sampled or early-exiting search, so the *count* of feasible plans reported
  is always the true count at this data scale.
- Feasible plans are then sorted by the ranking rule below and **truncated to
  the top 50**; the UI paginates that top 50 at **10 per page**. The response
  and the UI both state the true total number of feasible plans found and
  that the list is capped at 50 — a capped list is never presented as "no
  other plans exist" (carries forward the rule already in this file).
- **Ranking** applies only the soft preferences I've actually turned on —
  an unchecked preference contributes nothing to ordering, it doesn't rank as
  "worst." Applied in this fixed order, each a tie-break on the previous:
  1. If "avoid these days" is set: total minutes scheduled on those days
     (lower is better) — a plan with less time on an avoided day ranks
     first, even if it can't avoid the day entirely (blackout days are the
     hard constraint that rules a day out completely; "avoid" is soft).
  2. If "minimise days on campus" is set: number of distinct days with any
     session at all (lower is better).
  3. Anything still tied keeps a **stable sort** (original enumeration
     order), so re-running generation against the same inputs always
     produces the same order — no arbitrary reshuffling of equally-good
     plans between runs.

## Open questions / risks

- With 6–8 courses and a handful of tutorials each, brute-force enumeration
  of tutorial combinations per candidate subset is small enough that no
  search library is needed — confirmed against the real 7-course demo data in
  phase 3 (`spec/demo-data.test.ts` already brute-forces feasibility the same
  way).
