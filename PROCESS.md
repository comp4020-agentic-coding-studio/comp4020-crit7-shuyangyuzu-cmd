# Process overview

*This account is drafted by the agent from my recorded instructions and the
commits it cites, at my request. I have not yet reviewed and adopted it —
treat it as a draft until this note is removed.*

## What I built

A single-semester, single-demo-student course selection and timetable
planner for ANU-style enrolment, running on demo data only: build a
candidate list, set constraints, generate and compare conflict-free
timetable options, and confirm a plan — in one place, instead of the
Programs and Courses → ANUHub → Timetable round trip.

## How I got here

### Phase 1 — requirements and plan

I picked the enrolment/timetabling slice because it's the ANU workflow that
actually costs me time every semester: I have to check Programs and Courses
for a course, then enrol in it on ANUHub, before Timetable will even show me
its lecture and tutorial times. That means courses I'm only comparing can
push me over the real enrolment cap and force me to unenrol just to keep
looking; once I've worked out a timetable I still have to go back to ANUHub
to actually act on it; clashes only surface late, one tutorial click at a
time; and I have no way to lock some courses, cap the total, block some
days, and have combinations compared for me automatically. That's my own
experience with these systems, not a claim about how everyone uses them.

Before I decided anything, the agent read the current `CLAUDE.md`, the crit 7
spec published at the course site (fetched from
`/api/crits/07-anu-system.json`), and the starter's existing code
(`src/lib/schema.ts`, `src/lib/db.ts`, `src/lib/events.ts`, `spec/*.test.ts`),
and confirmed the repo was clean at
[`2b7ee1e`](https://github.com/comp4020-agentic-coding-studio/comp4020-crit7-shuyangyuzu-cmd/commit/2b7ee1e)
— the prior week's start-of-week `CLAUDE.md` carry-forward — with the
baseline `pnpm check` still green.

I set the prototype's scope, the rules that shape the build (required-vs-
locked, hard constraints vs soft preferences, adjacent sessions not
conflicting, the three distinct candidate/preview/confirmed states, and so
on), and the phase order, and had the agent write all of that into
[`PLAN.md`](PLAN.md) rather than into a second copy of the course spec. The
agent also sorted both the course's fixed spec lines and my own scope's
requirements into what a test can check mechanically versus what only a
person can judge at the crit — that table is in `PLAN.md` too, so I don't
have to re-derive it later.

The database design in `PLAN.md` (`Course`, `Session`, `CandidateCourse`,
`PlanPreference`, `ConfirmedEnrollment`, and the API surface over them) is
planning only — no schema or migration exists yet; that's phase 2.

I also added project-specific rules to `CLAUDE.md`: the demo-data and
no-ANUHub constraints, how "required" must be worded, how hard constraints
and soft preferences must behave, how a no-feasible-plan result must be
explained rather than invented, the disclosure rule for a capped result
list, and the transactional-replace rule for confirming a plan.

Before committing, the agent re-read `PLAN.md` and the `CLAUDE.md` additions
against the actual repo state (schema, existing tests, spec) to check they
were consistent with what's really there, and ran `pnpm check` (still green,
unaffected by a docs-only change) and `pnpm check:evidence`. That check
still fails on the missing `reflections/crit-7.md` — expected, since that
file is written at the phase-6 cutoff, not now — and otherwise passes now
that this file's template comment is gone and cites a real commit.

### Phase 2 — database, migration, demo data, and backend interfaces

I approved moving into phase 2 and gave the agent detailed requirements
against `PLAN.md`'s design: how lectures/tutorials relate to a course, how
candidate/preview/confirmed state must stay separate, what must persist,
what the demo data has to cover, and that all writes must be
server-validated with nothing trusted from the client about which session
belongs to which course.

The agent turned `PLAN.md`'s data design into `src/lib/schema.ts`
(`courses`, `sessions`, `candidate_courses`, `plan_preferences`,
`confirmed_enrollments`) and generated the migration with `pnpm db:generate`.
While building it, the agent read Astro's origin-check middleware source
directly to confirm which request shapes the spec tests actually need an
`origin` header for (JSON bodies are exempt; bodyless `DELETE` needs one),
rather than guessing, and read the existing `spec/global-setup.ts` to confirm
the whole test run shares one running server and one SQLite database, which
is why the new spec files are scoped one table/feature per file.

The demo dataset (`src/lib/seed.ts`) is seven fictional courses, each titled
"(demo)", picked to hit every scenario I asked for: an unavoidable lecture
clash (COMP1010/COMP2100), an avoidable tutorial clash (COMP1010/COMP3120,
where a different tutorial pairing works), an adjacent-not-conflicting pair
(COMP4444/ENGN2222), and a spread across five different days so blackout
days and day preferences actually matter. `spec/demo-data.test.ts` brute-
forces every tutorial combination against the live `/api/courses` response
to check all of that mechanically, rather than trusting the hand-written
comment in `seed.ts` that describes it. Seeding upserts by natural key
(course `code`; session `(courseId, label)`) and never touches
`candidate_courses`, `plan_preferences` or `confirmed_enrollments`, so
rerunning it can't duplicate rows or erase anything I've saved.

`confirmEnrollment` in `src/lib/db.ts` replaces the whole confirmed plan
inside one `db.transaction()`. The delete happens first and validation is
interleaved afterward — checking each submitted course and tutorial actually
exist and belong together, and that the chosen sessions don't clash — so
that a genuine mid-transaction failure rolls back the delete and any inserts
already applied, and the previous confirmed plan survives untouched. That's
exercised directly in `spec/enrollment.test.ts` (submit an unavoidable clash,
then check the prior plan is still there afterward) rather than only argued
for in a comment.

`spec/schema-constraints.test.ts` runs against its own throwaway SQLite file
(built from the real migration, not a hand-copied schema) to exercise the
CHECK/UNIQUE/FOREIGN KEY constraints directly — kind and day-of-week checks,
start-before-end, duplicate candidate/enrolment rejection, cascade delete on
a course, and restrict-delete on a session a confirmed enrolment still
points at.

Verification the agent ran before each of the three commits below: `pnpm
typecheck` (0 errors) and `pnpm test` (`astro build` + the full vitest run —
10 spec files, 74 tests, all passing). `pnpm check:evidence` was also run
and still fails, as expected: it only fails on the missing
`reflections/crit-7.md`, which is phase-6 work I have deliberately not
started yet. I have not asked the agent to claim that check passes, and it
hasn't.

Commits for this phase, in the independent completion points I asked for:
- [`69b0880`](https://github.com/comp4020-agentic-coding-studio/comp4020-crit7-shuyangyuzu-cmd/commit/69b0880) — data model and migration
- [`bbdee95`](https://github.com/comp4020-agentic-coding-studio/comp4020-crit7-shuyangyuzu-cmd/commit/bbdee95) — demo data seed
- [`f31d7f3`](https://github.com/comp4020-agentic-coding-studio/comp4020-crit7-shuyangyuzu-cmd/commit/f31d7f3) — backend interfaces, seeding wiring, and tests

Open questions I still need to decide before phase 3: how much of the
preview/generated-plan UI should show at once when the result list is
capped (PLAN.md already requires disclosing a cap, but not the cap number
itself); and whether soft-preference ranking should be a simple weighted
sort or something I want to reason through more before the agent builds it.
Nothing in this phase was pushed to `origin`, deployed, or started on phase
3, per my instruction.

### Phase 3 — candidate courses, manual timetable, and early conflict hints

Before building anything, I had the agent re-check the phase 2 backend
against what phase 3 would need: a read endpoint for confirmed
enrolment (already there), full time-range validation on a session, not
just start-before-end (already a `CHECK` constraint in the schema), and
that both a course's lecture and its chosen tutorial participate in
conflict detection (already how `confirmEnrollment` builds its slot
list). All three held without any backend change, and `git log`
confirmed the repo was still exactly 5 commits ahead of `origin/main`
and 0 behind, with nothing to reconcile.

I settled the plan-generation rules phase 4 will need — full brute-force
search at this dataset's 7-course scale so the reported feasible-plan
count is always exact, top-50/10-per-page display, and a fixed soft-
preference tie-break order — as a documentation-only decision in
`PLAN.md`, without building any of the generator itself this phase.

For the actual phase 3 build, I asked for a candidate-courses browser and
a manual (not auto-populated) preview timetable on a new `/planner/`
page. Candidate, preview, and confirmed had to stay three visibly
separate states — nothing here was allowed to blur into "confirmed," and
removing a candidate had to clear it from the preview without ever
touching confirmed enrolment. I also asked for early conflict hints
against the current preview, worded so they never imply a course is
globally infeasible, and for the page to read honestly as a prototype:
a disclaimer that it isn't a real ANU service and that the course data
and the single demo student account are both fictional.

While building the interactive script, the agent found that an Astro
`<script>` tag using `define:vars` can't also use an ES `import` — it
split the page into a raw JSON data island (deliberately left
`is:inline`, holding the server-computed course/candidate data) and a
separate plain `<script>` that imports `sessionsOverlap`/`findConflict`
from `src/lib/scheduling.ts`, so the client-side conflict hints run the
exact same logic as the server's own conflict checks rather than a
re-implementation of it. `pnpm exec astro check` and `pnpm exec astro
build` both had to pass before this was considered done.

Adding the planner page's tests surfaced a real bug in the tests
themselves, not the app: because all spec files share one running server
and one SQLite database, and Vitest runs spec files concurrently by
default, a naive "confirmed enrolment is unchanged" check that snapshots
`/api/enrollment` before and after an unrelated candidate operation can
race `spec/enrollment.test.ts`'s own legitimate writes to that same
endpoint — which is the only file in the suite that ever calls
`POST`/`DELETE /api/enrollment`. The agent caught this itself from a
failing (not flaky-looking, straightforwardly failing) test run, moved
that specific check into `spec/enrollment.test.ts` where it can compare
before/after without racing anyone else, and reran the full suite three
times in a row to confirm the fix actually removed the race rather than
just narrowing its window.

Verification the agent ran before these commits: `pnpm exec astro check`
(0 errors, 0 warnings, 1 expected hint on the intentionally-raw JSON
script), `pnpm exec astro build`, and `pnpm exec vitest run` — 96/96
tests passing, rerun three times to check for flakiness. `pnpm
check:evidence` was also run and still fails only on the missing
`reflections/crit-7.md`, exactly as expected at this phase; I have not
asked the agent to claim that check passes.

What I have not had the agent verify directly: there's no browser-
automation tool available in this environment, so the 1920×1080 and
390×844 viewport checks this repo's `CLAUDE.md` requires were not done
by actually looking at rendered pixels. What stands in for that instead:
the CSS is structured as a 7-column weekly grid above a 640px breakpoint
and a single stacked column with wrapping text below it (so nothing
should truncate on a narrow screen), and `spec/invariants.test.ts` now
runs its full accessibility/structural check (200 response, `lang`,
title, viewport meta, a `nav` landmark, exactly one `h1`, `alt` text,
zero axe-core violations) against `/planner/` for the first time and
passes. I still need to actually open `pnpm run dev` (or `pnpm build &&
pnpm preview`) and look at `/planner/` myself at both sizes before I'd
call this phase's UI genuinely checked, not just type-checked and
lint-clean.

Commits for this phase:
- [`40e8e3e`](https://github.com/comp4020-agentic-coding-studio/comp4020-crit7-shuyangyuzu-cmd/commit/40e8e3e) — plan-generation ranking rules for phase 4 (planning only)
- [`ff1d7ad`](https://github.com/comp4020-agentic-coding-studio/comp4020-crit7-shuyangyuzu-cmd/commit/ff1d7ad) — candidate-courses browser, manual preview timetable, and conflict hints
- [`ca8164c`](https://github.com/comp4020-agentic-coding-studio/comp4020-crit7-shuyangyuzu-cmd/commit/ca8164c) — tests for state separation, persistence, and the conflict primitive

Deliberately out of scope this phase, per my instruction: the
auto-generate-plan UI and the final-confirm-enrolment UI (both phase 4),
and pushing to `origin` or deploying anything.

### Phase 3 revision — the lecture rule, session locations, and a two-page split

Using the planner page I'd just had built surfaced a real problem with the
conflict rule I'd originally specified: I'd written it as "any overlap is a
conflict," but a lecture is recorded, so a lecture overlapping anything —
even another lecture — shouldn't block a plan the way two clashing
tutorials should. I corrected the rule myself (only a tutorial overlapping
another tutorial actually blocks; a lecture overlap is at most a mild,
non-blocking note; only tutorials count toward blackout days, "avoid this
day," or "days on campus") and had the agent carry that correction through
`scheduling.ts` (a `classifyOverlap`/`isBlockingOverlap` primitive shared by
server validation and, from this point on, every client-side hint),
`schema.ts` (`sessions.kind` typed at compile time, not just DB-checked),
the demo data, and the specs that exercised the old rule. I also asked for
the still-open contracts the next two rounds would need written down in
`PLAN.md`/`CLAUDE.md` rather than left implicit: the phase-4 auto-schedule
rules, and how a same-timeslot, multiple-room tutorial should behave.

That second contract — same course, same day/start/end, more than one room
— became its own small round: a `sessions.location` column (additive
migration, existing rows unaffected) and `groupTutorialTimeOptions` in
`scheduling.ts`, which collapses sessions sharing a day/start/end into one
selectable time option and marks it "pending" only when more than one
section shares that time. I asked for this specifically so the UI could
never silently default to the first room in that situation — it has to
show the time as scheduled and the room as a separate, explicit choice.
STAT1008 in the demo data now carries exactly that case (one tutorial time,
two rooms), checked end-to-end in `spec/demo-data.test.ts` and at the unit
level in `spec/scheduling.test.ts`.

With both of those contracts settled, I asked for the actual phase-3 UI
promised in the original round: a page split, and manual scheduling as the
complete, only path this phase (no auto-generation yet). Course search/
filtering and candidate management moved to a new `/courses/` page;
`/planner/` was rebuilt around a compact left-hand schedule list next to a
large weekly grid that updates the moment anything changes — the layout
MyTimetable itself uses, not a multi-step wizard. I was explicit that this
is a page split, not a scope change: candidate, preview, and confirmed
still have to be three separate states, and moving candidate management off
`/planner/` couldn't be allowed to make the client-only preview harder to
keep separate from the persisted candidate list.

That separation raised a real question I had to settle before the agent
built anything: the preview only ever lived in memory on the old combined
page, so it reset itself for free every time the page reloaded. Once
adding a candidate and scheduling it live on two different pages, a
preview that reset itself on every navigation would be unusable — but I
also didn't want it to quietly become a second, competing source of truth
next to the server's candidate list. I decided it should survive a
navigation between just these two pages, nowhere else, and never be
allowed to disagree with the server about what's actually a candidate. The
agent implemented that as a `sessionStorage`-backed map (course → chosen
time/room, or "nothing chosen") that `/planner/` reconciles against the
freshly-loaded candidate list and course data on every load: a course
removed on `/courses/` since the preview was last saved drops out
entirely, and a room choice that no longer matches any current time option
falls back to "time chosen, room still pending" rather than pointing at
data that doesn't exist anymore. `/courses/` itself never reads or writes
this preview at all — it only manages the persisted candidate list, so
there's nothing for it to keep in sync.

While rebuilding `/planner/`, the agent also found and fixed a real bug
left over from the single-page version: its lecture-overlap notice used
the same red, blocking style as an actual tutorial clash, which
contradicts the lecture rule I'd corrected above. The rewrite runs every
overlap through `classifyOverlap` — in the per-course time-option notes,
the top-of-page conflict summary, and the weekly grid block styling alike
— so a tutorial clash reads as red and blocking and a lecture overlap
reads as a distinct, mild, blue, explicitly non-blocking note, consistently
in all three places rather than reimplemented separately in each.

Partway through this round, the agent caught and fixed its own mistake
before anything was committed: a `Write` call meant to create a new test
file for `/courses/` had reused the filename `spec/courses.test.ts`,
silently overwriting the phase-2 file that already existed under that name
for the read-only `GET /api/courses` backend tests. It found this itself
from `git status` showing the file as modified rather than newly-added
before staging anything, restored the original content from `HEAD`, and
moved its new page-level tests to `spec/courses-page.test.ts` instead —
so both sets of tests exist side by side now, and nothing was lost.

Verification the agent ran before this round's commits: `pnpm typecheck`
(0 errors, 0 warnings, the same 2 pre-existing `is:inline` hints on the
raw JSON data-island scripts as before) and `pnpm test` (`astro build`
plus the full vitest run — 13 spec files, 123 tests, all passing,
including the phase-2 `/api/courses` tests once restored). `pnpm
check:evidence` still fails only on the missing `reflections/crit-7.md`,
exactly as expected this far from the phase-6 cutoff.

What I still have not had verified directly: there is still no
browser-automation tool available in this environment, so I have not had
the agent confirm the 1920×1080 and 390×844 layouts by looking at rendered
pixels — that limitation from the previous phase-3 section hasn't gone
away. The new `.planner-layout`/`.planner-right` and `.course-filters`
rules follow the same pattern as before (a side-by-side layout above the
existing 640px breakpoint, a single stacked column with wrapping text
below it), and `spec/invariants.test.ts` now also runs its structural/
accessibility check against `/courses/` for the first time, on top of the
existing `/planner/` check. I still need to open the app myself at both
sizes before I'd call either page's UI actually checked rather than just
type-checked and structurally sound.

Commits for this round:
- [`f938546`](https://github.com/comp4020-agentic-coding-studio/comp4020-crit7-shuyangyuzu-cmd/commit/f938546) — corrected lecture-recording rule, carried through schema, demo data, and specs
- [`48732f5`](https://github.com/comp4020-agentic-coding-studio/comp4020-crit7-shuyangyuzu-cmd/commit/48732f5) — session locations and same-timeslot multi-section time options
- [`d5fdbbb`](https://github.com/comp4020-agentic-coding-studio/comp4020-crit7-shuyangyuzu-cmd/commit/d5fdbbb) — the `/courses/` + `/planner/` page split, sessionStorage preview persistence, and the lecture-overlay styling fix

Deliberately out of scope this round, per my instruction: auto-generating
plan combinations and the final confirm/withdraw UI (still phase 4), and
pushing to `origin` or deploying anything.
