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

### Phase 3 revision — a time-proportional weekly grid

The stacked, course-order weekly grid from the page split above still
didn't look like a real timetable: every block was the same height
regardless of how long the session actually was, and idle time between
sessions just wasn't there. I asked the agent to rebuild `/planner/`'s grid
specifically to match how ANU's own MyTimetable lays a week out — a fixed
08:00–22:00 axis shared by all seven days, blocks positioned and sized by
actual clock time, overlapping sessions placed in side-by-side columns
instead of covering each other, and a single-day view with day-switching on
narrow screens instead of squeezing seven columns into a phone width. I was
explicit that this round is a pure display change: nothing about the
candidate list, the preview, or the confirmed enrolment was to move.

I gave the agent eleven specific requirements (fixed axis and shared time
scale, hour/half-hour gridlines, position-and-height-from-time rather than
stacking order, no compressing idle time, no shrinking blocks to fit a
screen with ~64px/hour as a starting point and a scrollable grid body under
a sticky day-header row, the time axis and grid taking the main width with
the candidate/tutorial controls staying compact on the left, side-by-side
columns for genuinely overlapping sessions without splitting merely-adjacent
ones, keeping the existing lecture-never-blocks/tutorial-clash-only rule,
compact block text — course code, lecture/tutorial, start–end time — with
section/room detail moved to a click-triggered panel instead of inflating
block height, a single-day mobile view, and an explicit warning rather than
silent hiding for any session outside 08:00–22:00), plus three edge cases to
specifically check: a 09:30-start/90-minute session, two overlapping
sessions, and two sessions exactly back-to-back.

The agent added two pure functions to `src/lib/scheduling.ts` next to the
existing overlap/grouping logic, rather than computing positions inline in
the page's script: `computeGridPosition(start, end)`, which turns a
session's start/end minutes into a top/height in pixels against the fixed
axis (and reports `"out-of-range"` for a session entirely outside it, or
flags `clippedStart`/`clippedEnd` for one only partly outside it, instead of
silently drawing something misleading), and `packOverlappingSlots(slots)`,
which sorts a day's sessions by start time, groups them into clusters of
*transitively* overlapping sessions, and assigns each a column by greedy
first-fit within its cluster — the standard optimal algorithm for this kind
of interval layout. Two sessions that are exactly back-to-back start a new
cluster rather than sharing one, so they each keep the full column width
instead of being split side by side, matching the "adjacent isn't a
conflict" rule this file already established.

I asked specifically for the 09:30/90-minute case to be checked: with the
grid starting at 08:00 and 64px per hour, 09:30 is 90 minutes past the axis
start, so it should sit 96px down and stand 96px tall (90 minutes at 64px/
60min ≈ 96px each way). The agent added this as a named unit test in
`spec/scheduling.test.ts` asserting exactly `{ topPx: 96, heightPx: 96 }` for
`computeGridPosition(570, 660)`, alongside separate tests for: a session
starting exactly at the axis start; a session fully before and one fully
after the window (both `"out-of-range"`); a session clipped at the start of
the window and one clipped at the end (each flagged, position/height
clamped to the visible portion); two overlapping sessions getting two
separate columns; two back-to-back sessions staying in one full-width
column; three mutually-overlapping sessions getting three columns in one
cluster; and a case where a session's column is freed and reused once its
occupant has ended within an otherwise-connected cluster. All of these are
tests of the pure functions directly, not of rendered HTML, since that's
where this kind of position/column arithmetic is actually easy to get wrong
and easy to check without a browser.

`/planner/`'s markup was rebuilt around this: a sticky weekday header row, a
scrollable grid body with a shared time axis and seven day columns (each
carrying hour/half-hour gridlines sized off one shared CSS custom property
so the lines can't drift out of sync with the block math), absolutely-
positioned `<button>` session blocks whose inline `top`/`height`/`left`/
`width` come straight from the two functions above, a single shared
`#session-detail` panel that a block click populates with its full label,
kind, time range, location, and status (rather than a popover per block,
which would risk the block itself growing to fit more text), a day-tabs row
that only appears under the existing 640px breakpoint and toggles a
`mobile-active` class on one day at a time, and an `#out-of-range-warning`
banner that lists any session `computeGridPosition` reports as out-of-range
or clipped, in plain text, rather than only showing what fits. Today's
weekday is used as the initial mobile day server-side (`new Date().getDay()`
adjusted to this codebase's Monday-first convention), so the page opens on
a sensible day before any client script has run. None of `allPreviewSlots`,
`lockedSlotsExcept`, the sessionStorage load/save/reconcile logic, or the
`change` handler that drives adding/removing a candidate from the preview
and choosing a tutorial time or room changed in this round — the rewrite
only touches how the same preview data already computed there gets drawn.

Verification the agent ran before this round's commit: `pnpm typecheck`
(0 errors — the same 2 pre-existing `is:inline` hints as every prior round,
unrelated to this change) and `pnpm test` (`astro build` plus the full
vitest run — 13 spec files, 136 tests, all passing, including the new
grid-position and column-packing tests above). It also started the dev
server and used `curl` against the running `/planner/` page to confirm,
read-only, that the server-rendered HTML actually carries the numbers this
round depends on: a `--grid-height: 896px` and `--hour-px: 64px` custom
property, fifteen hour labels from 08:00 to 22:00 each exactly 64px apart,
exactly one day column and one day-tab marked `mobile-active` server-side,
and that the compiled client script for the page actually calls
`computeGridPosition`/`packOverlappingSlots` and wires up the new
`day-tab`/`session-detail` elements. None of this touched the candidate
list, the preview, or the confirmed enrolment — it was read-only against
whatever was already there.

What I still have not had verified, and am not claiming: nobody has looked
at this grid rendered in an actual browser yet. There is still no
browser-automation tool available to the agent in this environment, and I
had explicitly told it not to claim the 1920×1080/390×844 viewport check is
done unless it's actually looked at real rendering — it hasn't, so it
isn't, no matter how consistent the server-rendered numbers and the
compiled script look from the outside. The dev server is running for me to
open myself at both sizes before I call this done — in particular I still
need to actually see: whether the sticky header genuinely stays put while
scrolling a full day, whether overlapping blocks read cleanly side by side
at real block widths, whether the mobile day-switcher is comfortable to use
with a thumb, and whether the compact block text is legible at ~64px/hour
rather than just non-overflowing.

Commit for this round:
- [`8e38268`](https://github.com/comp4020-agentic-coding-studio/comp4020-crit7-shuyangyuzu-cmd/commit/8e38268) — the time-proportional weekly grid rewrite (scheduling.ts helpers, planner.astro, styles.css) and its unit tests

Deliberately out of scope this round, per my instruction: phase 4's
auto-generation is still untouched, and no candidate, preview, or confirmed-
enrolment behaviour changed — this was a rendering-only revision.

### Phase 3 revision — layout fixes after actually looking at the grid

The previous round shipped without anyone having looked at real rendering, by
its own admission. This round is me reporting back what a real look at the
running dev server actually showed, and asking the agent to fix four
specific things I found — still layout/UI only, no data-model change.

1. The grid had grown its own internal scrollbar (`.weekly-grid-scroll` was
   capped at `max-height: 75vh` with `overflow-y: auto`), so the page ended
   up with two nested vertical scrollbars — one for the page, one for the
   grid — instead of one. I asked for the internal one gone entirely: the
   grid should render at its full natural height (still 896px of body, at
   64px/hour, unchanged) and only the browser's own page scrollbar should
   move it.
2. The left-hand candidate list was too tall — every candidate showed its
   full set of tutorial time/room options at once, all the time. I asked for
   a compact, expand/collapse card list instead, with only the checkbox,
   course code, required badge, current tutorial time and a short status
   visible when collapsed, and the full option list only when expanded — and
   for the "add to preview" checkbox to never be affected by expanding or
   collapsing a card, or vice versa.
3. Checkboxes and radio buttons across the page were rendering as large,
   padded, oddly-spaced boxes instead of sitting close to their label text —
   visible in the screenshot as abnormal whitespace around every tickbox.
4. The left column (`22rem` ≈ 352px) was wider than it needed to be for a
   compact list, at the expense of the timetable, which is the part of the
   page actually worth reading. I asked for the left column narrowed to
   roughly 280–320px and the timetable to take the rest.

What the agent changed, and the calls it made where my instruction left room
for one:

- **Scroll removal (#1).** `.weekly-grid-scroll` no longer sets any
  `overflow`/`max-height` at all — it's now just a bordered wrapper, not a
  scroll container. `.weekly-grid-header` keeps `position: sticky; top: 0`,
  but it now sticks against the page's own scroll instead of a local one.
  The agent checked every ancestor between the header and `<body>` —
  `.weekly-grid-scroll`, `.planner-right`, `.planner-layout`, `main.planner`,
  `body` — confirming none of them set an `overflow` other than the default
  `visible` (that was the actual risk I'd flagged: any of them clipping or
  scrolling on their own would break the sticky behaviour or hide content
  under it). `.planner-layout` already had `align-items: flex-start` from
  the previous round, so the now-taller grid still isn't stretched to match
  the left column's height — that part didn't need a new fix, just
  re-confirming it still held once the internal scroll box was gone.
- **Compact cards (#2).** The card list is now an accordion: at most one
  card's full tutorial/room options are shown at a time, tracked by a new
  client-only `expandedCourseId` variable that never reads or writes the
  `preview`/`candidates` data. Expanding/collapsing is a separate `<button
  class="schedule-card-toggle">`, with its own `click` listener on the list
  container — a different element and a different event from the preview
  checkbox's own `change` listener, which is what actually guarantees
  neither one can affect the other, rather than just hoping they don't. One
  judgement call I made here, since my instruction didn't fully spell it
  out: when you tick a candidate into the preview, the agent now also opens
  that card automatically (there's now something to configure — a tutorial
  time), and closes it again if you untick it. Clicking the expand toggle
  itself never touches the checkbox. If I'd rather this be fully manual with
  no auto-open, that's a one-line change to point out at review time.
  Collapsed rows show the checkbox, course code, required badge, the chosen
  time (or "Choose a time" if none yet), and a short status —
  "Scheduled" / "Room pending" / "Clash" — using the same `classifyOverlap`
  rule the grid and the option list already used, just grouped by course
  instead of by slot. Expanded, each time option is one line (radio + day +
  start–end + a short status word), with the room/location on the line
  below only when relevant. "No conflict" is now that one short phrase
  instead of a full sentence repeated per option; a real clash still names
  the specific course and the specific time it clashes with, not just the
  word "Clash" — I checked this stayed true after the rewrite, since
  shortening the good case is easy to over-apply to the bad case by
  accident.
- **Checkbox/radio whitespace (#3).** The cause was exactly what I
  suspected from the screenshot: `src/styles.css`'s original, guestbook-era
  `input { flex: 1; min-width: 12rem; padding: 0.4rem 0.6rem; }` rule has no
  type selector, so it was also stretching every checkbox and radio button
  on the page into an oversized, padded box. The agent didn't touch that
  global rule — instead it added a second, more specific rule scoped to
  `main.planner input[type="checkbox"]` / `input[type="radio"]` that resets
  them back to their natural size, so the guestbook's text input (and
  anything on `main.courses`) is untouched. It also added an explicit
  `:focus-visible` outline for the same scoped selectors, since a fix that
  changes `padding`/`width` on a form control is worth double-checking still
  leaves a visible focus ring. The existing `<label>` wrapping in
  `.preview-toggle`/`.tutorial-option`/`.room-option` was already correct
  (clicking the text already toggled the input); this was purely about the
  input's own box size and its gap from the label text.
- **Left column width (#4).** `.planner-left` went from `flex: 0 0 22rem`
  to `flex: 0 0 19rem` (304px, inside the 280–320px range I asked for);
  `.planner-right` was already `flex: 1` and needed no change. Session
  block text (course code / kind / time) is unchanged — it was already the
  full course code, not an abbreviation, so a wider right column just gives
  it more breathing room, nothing about what it displays changed. The
  existing mobile single-day view and day-tabs switcher were not touched by
  this change at all — the 640px breakpoint media query is untouched.

Verification the agent ran before this round's commit: `pnpm typecheck`
(0 errors, same 2 pre-existing hints as every prior round), `pnpm test`
(13 spec files, 136 tests, all still passing — including `spec/planner.test.ts`,
whose helpers only look for the `<article class="schedule-card"
data-course-id="...">` marker and the confirmed-enrolment list, not the
card's exact inner markup, so the accordion rewrite didn't need any spec
changes), and `pnpm run build`. It also ran read-only `curl` checks against
the still-running dev server to confirm, from the actual served HTML: the
compiled CSS no longer contains `max-height: 75vh` or `overflow-y: auto`
anywhere; the only remaining `overflow` declarations in the stylesheet are
on `.session-block` (text-truncation inside a leaf block, not an ancestor of
the sticky header) and the mobile `.day-tabs` row (also not an ancestor of
it); the server-rendered `.planner-left` rule reads `flex: 0 0 19rem`; and
the server-rendered candidate cards use the new compact
`.schedule-card-summary`/`.preview-toggle-label`/`.course-code` structure
with no leftover `<h3>` or "Include in current preview" text.

What I still have not had independently verified: I'm the one who reported
the screenshot problems this round, so unlike the previous round, someone
has now actually looked at real rendering — but that was me, not the agent,
which still has no browser-automation tool available to it. The agent's own
checks above are all structural (compiled CSS, served HTML, passing tests),
not a look at actual pixels — it hasn't claimed otherwise. I still need to
open the dev server myself at both 1920×1080 and 390×844 to confirm the
scrollbar is genuinely single, the sticky header still visibly stays in
place while scrolling, the accordion cards read cleanly at the narrower
width, and the checkbox/radio fix actually looks right rather than just
computing the numbers I expected.

Commit for this round:
- [`c6889f7`](https://github.com/comp4020-agentic-coding-studio/comp4020-crit7-shuyangyuzu-cmd/commit/c6889f7) — remove nested scroll, compact candidate cards, fix input sizing, widen timetable

Deliberately out of scope this round, per my instruction: candidate data,
tutorial/room selection logic, conflict-detection rules, and confirmed-
enrolment data are all unchanged — only layout and the new client-only
expand/collapse state moved.

### Phase 4 — the optional auto-scheduler

With layout settled for now, I moved to phase 4: an optional auto-scheduler,
still not the final confirm/withdraw UI (that stays phase 5). I gave the
agent a detailed, single instruction up front covering every rule I wanted
enforced, rather than letting it improvise the contract as it went: two
separate, explicitly user-triggered modes (fill in tutorial times for
exactly the courses already in the current preview, with no 3/4-course
limit; or generate a whole plan from the candidate pool, aiming for a count
of 3 or 4 I set, always keeping courses I've marked required); the existing
hard-blackout/soft-avoid-days/soft-minimize-days-on-campus preferences,
persisted server-side and restored after a reload; tutorial-vs-tutorial as
the only blocking conflict with lectures never blocking and adjacency never
blocking, carrying forward the rule I'd corrected earlier in phase 3; a
fixed soft-preference ranking order with a stable tie-break; same-timeslot,
multiple-room tutorials collapsed into one time option that is never
silently resolved to a section on the visitor's behalf; an exhaustive (not
sampled) search at this dataset's small scale, with an accurate true count,
a top-50 cap, and 10-per-page display, both facts disclosed explicitly;
honest, specific failure messages rather than an invented reason when I
can't pin one down; server-side validation of every input on the
generate endpoint independent of anything the page itself already checked;
and a hard rule that the generate endpoint may only ever read — never write
confirmed enrolment, candidates, or anything else already saved.

I asked for the algorithm, the API, and the UI as separate commits, each
checked before it was committed, and for this file updated at the end with
an honest account of what was and wasn't verified — including saying so
plainly if browser/viewport checking wasn't actually done, which by this
point in the build is a standing limitation of the environment, not a new
one.

**Algorithm.** `src/lib/generator.ts` is a pure module with no I/O: given a
course list, a preferences object, and either a fixed course-id set
(operation A) or a required/optional candidate split plus a target count
(operation B), it enumerates every tutorial-time combination, checks each
against `classifyOverlap` for tutorial-vs-tutorial clashes only, and ranks
what's left by the fixed order I asked for (avoid-day tutorial-minutes,
then days-on-campus, then a stable course-code-and-time tie-break — each
comparison skipped entirely when its preference isn't enabled, so an
unused preference genuinely has no effect on ordering rather than acting as
a silent zero). A same-timeslot multi-section option is represented as one
combination entry with `sectionId: null, pending: true` when it has more
than one section, and only auto-resolved to a concrete `sectionId` when
there is exactly one — never picking the first one arbitrarily. The agent
wrote `spec/generator.test.ts` alongside it, covering: both modes' course-
set rules; the required-course and 3/4-count constraint for operation B;
tutorial clashes blocking a combination while adjacency and lecture overlap
never do; blackout days always excluding a plan while avoid-days/minimize-
days only reorder; the multi-section dedup and pending behaviour; the
no-feasible-plan case; an exact total count alongside the top-50 cap; and
that the ranking is stable when preferences don't distinguish two plans.

**API.** `POST /api/plans/generate` (`src/pages/api/plans/generate.ts`)
reads courses, candidates, and preferences straight from the database on
every call and hands them to the pure generator — it never trusts a
preferences object or a candidate list from the request body, only a
`mode` and, for mode `"preview"`, a `courseIds` array that is independently
checked against the real, current candidate list (a ghost or fabricated
course id in that array is rejected with a 400, not silently ignored or
trusted). Nothing in this route can write anywhere: I checked myself that
`listCourses`, `listCandidates`, and `getPreferences` are all read-only
functions, and that no `db.transaction`/insert/update call exists anywhere
in the file. `spec/plans-generate.test.ts` exercises this at the HTTP
level — malformed input, an untrusted course id, an empty preview, a
single fixed course not being limited by the 3/4 rule, the multi-section
pending case, both of a course's real tutorial options being found with an
exact count, two courses combining without a clash, and — for operation B,
where hand-coding the expected result against a shared, multi-file candidate
table would be fragile — a check that the route's JSON response matches
exactly what the same pure `generatePlansFromCandidates` function computes
directly from the same live data the test itself just read. Both modes are
also checked to leave confirmed enrolment and the candidate list completely
untouched before and after a call.

**UI.** `/planner/` gained a new "Auto-schedule (optional)" section below
the existing manual scheduler, which I was explicit had to stay fully
functional and untouched on its own. It has: a conditions panel (blackout
days, avoid days, minimize-days-on-campus, and the 3/4 target), saved to
the server on every change and restored from it on load; the two trigger
buttons, neither of which runs automatically or touches the manual preview
by itself; a results list showing the true total, an explicit note when
the list shown is the capped top 50, and per-plan course/time/days-on-
campus/pending-section summaries, paginated 10 at a time; a read-only
weekly-schedule view for one result that doesn't touch the preview; and an
"Apply to current preview" action that is the only thing that ever
replaces it — cancelling the results view leaves the manual preview
exactly as it was.

Two design calls I made, or confirmed, while this was being built, since my
original instruction left the exact mechanism open:

- **Staleness.** Rather than hunting down and flagging every place a
  candidate, a required flag, a preference, or (for operation A) the
  preview's own course set could change, the agent computes a snapshot key
  from all of those at generate time and again at render/apply time — a
  mismatch marks the result stale, disables every "Apply" button, and says
  why, without needing a manually-maintained list of invalidation sites. I
  reviewed this approach and think it's the right shape for a prototype at
  this scale: it can't miss a mutation path the way scattered manual flags
  could.
- **Plan detail view.** Rather than reusing or duplicating the pixel-
  precise weekly grid for a second surface, a generated plan's schedule is
  shown as a simple day-grouped list. I agreed with the agent's reasoning
  for this: there's no browser-automation tool available this round either,
  so a second from-scratch rendering surface would be exactly the kind of
  thing that could carry a layout bug nobody actually looks at before I do.

`spec/planner.test.ts` gained structural coverage of this page's own
server-rendered markup for the new section: the hard/soft explanation
text, both trigger buttons present, the results section and plan-detail
modal starting hidden before any script runs, and that saved conditions
actually come back checked after a reload (restoring whatever preferences
existed before that test ran, so it doesn't leave the shared preferences
table changed for any other spec file).

Verification the agent ran before each of the three commits below: `pnpm
typecheck` (0 errors, the same 2 pre-existing `is:inline` hints on the raw
JSON data-island scripts as every prior round) and `pnpm test` (`astro
build` plus the full vitest run). The final run, after all three pieces
were in place, was 15 spec files, 179 tests, all passing.

Commits for this phase:
- [`a617624`](https://github.com/comp4020-agentic-coding-studio/comp4020-crit7-shuyangyuzu-cmd/commit/a617624) — the pure generation algorithm and its unit tests
- [`de49743`](https://github.com/comp4020-agentic-coding-studio/comp4020-crit7-shuyangyuzu-cmd/commit/de49743) — the auto-schedule API route and preferences-aware HTTP tests
- [`82ffcc9`](https://github.com/comp4020-agentic-coding-studio/comp4020-crit7-shuyangyuzu-cmd/commit/82ffcc9) — the planner UI (conditions panel, both triggers, results/pagination/apply, staleness) and its structural tests

What I still have not had verified, and am not claiming: there is still no
browser-automation tool available in this environment, so nobody — agent
or me — has actually looked at this new section rendered in a browser yet.
The generate/apply/pagination/view-detail interaction is only verified at
the HTTP/API level and by the structural markup checks above; I still need
to open the dev server myself, click through both auto-schedule modes on
real data, and look at the result at both 1920×1080 and 390×844 before I'd
call this phase's UI actually checked, the same standing gap as every prior
UI round in this build.

Deliberately out of scope this phase, per my instruction: the final
confirm/withdraw UI is still phase 5 and untouched; nothing was pushed to
`origin` or deployed.

### Phase 4 correction — reusing the weekly grid for the plan-detail view

After using the auto-scheduler on real data, I decided the "plan detail
view" call recorded above was wrong. A day-grouped list is not what I asked
for, and it doesn't let me actually compare a generated plan against the
manual preview at a glance the way the rest of this app is built to —
everywhere else, "look at a week" means the same 08:00–22:00 time-axis grid.
I asked the agent to fix this specifically, as its own round before phase 5,
not folded into phase 5's own commits.

The requirement: a generated plan's schedule view must reuse the *same*
weekly grid component the manual preview already uses — same fixed
08:00–22:00 axis, same overlap-column packing (`packOverlappingSlots`), same
position math (`computeGridPosition`), same lecture-vs-tutorial overlap
styling (`classifyOverlap`) — not a second, differently-behaving grid. A
pending (multi-section, unresolved) tutorial time must still show its
scheduled day/time slot on the grid, with its location marked as not yet
chosen, never auto-picking a section. Viewing a plan must not be able to
touch the manual preview's own state in any way, and closing the plan view
must leave the manual preview exactly as it was — not "restored," but never
touched in the first place. The old day-grouped list could stay, but only as
a secondary, clearly-labelled display, not the only view.

The agent's approach, and why: rather than temporarily pointing the existing
grid-rendering code at a generated plan's data and then swapping it back
afterward — which it judged, and I agreed, was a real risk in this codebase
specifically, since the manual preview's own render path
(`savePreviewToStorage`) persists whatever the module-level preview state
currently holds to `sessionStorage` — it pulled the grid's markup out into a
shared component (`src/components/WeeklyGridSkeleton.astro`) instantiated
twice under two different ids, and pulled the block-rendering logic out into
a shared function (`renderSlotsIntoGrid(slots, gridRootEl, outOfRangeEl)`)
that takes an explicit slot list and explicit target elements rather than
reading or writing any shared module state. The plan-detail view
(`#plan-detail-grid`, its own day-tabs, its own out-of-range banner, its own
session-detail panel) is therefore a fully separate DOM subtree from the
manual preview's own grid (`#weekly-grid`) — there is no shared state for
viewing a plan to leak into, so "never touches the preview" holds by
construction, not because of a careful swap-and-restore sequence that has to
be gotten right every time. I reviewed this reasoning and think it's the
right call: a swap-based approach would have worked too, but only if nobody
ever forgot to reset the swap, which is exactly the kind of thing that goes
unnoticed until someone's real preview data quietly changes.

A generated plan's pending tutorial slot now reads "To be chosen" as its
location on the grid, and the plan-detail modal shows an explicit note
("...still need a specific room/section chosen...shown as 'To be
chosen'...") whenever the plan has any pending course, using the same
`pendingCount` the generator already reports rather than a fresh recount.
The day-grouped list survives inside a collapsed `<details>` disclosure
below the grid, labelled "Show as a day-by-day list instead (useful on a
small screen)" — kept exactly because I'd allowed it as a secondary display,
not removed.

Verification: `pnpm typecheck` (0 errors — this round also removed now-dead
frontmatter locals in `planner.astro` left over once the grid markup moved
into the shared component, and the now-unused `scheduling.ts` import that
only fed them), `pnpm build`, and `pnpm test` (`astro build` plus the full
vitest run). The existing structural checks in `spec/planner.test.ts` for
`#weekly-grid` and `#plan-detail-modal` rendering `hidden` server-side still
pass unchanged, since both wrapper elements kept their own opening-tag
attributes through the refactor. I added new, targeted structural checks to
the same file for this fix specifically: that `#plan-detail-grid` exists as
its own element (a different DOM id from `#weekly-grid`, i.e. really a
separate instance, not the same element relabelled) and carries the same
grid markup shape (day-tabs, `weekly-grid-header`, `weekly-grid-body`,
`time-axis`, day columns, the 08:00–22:00 axis labels); that the modal
discloses it's read-only and never changes the current preview, and that its
pending-section note exists, starts hidden, and mentions "To be chosen";
and that the grid appears before the collapsed list-details element in
markup order, i.e. the grid is the primary view and the list a secondary one
below it. Final run: 15 spec files, 182 tests, all passing.

What I still have not had verified, and am not claiming: there is still no
browser-automation tool available in this environment. I have not looked at
this plan-detail grid rendered in an actual browser at either 1920×1080 or
390×844, and neither has the agent — the checks above are all structural
(compiled markup, passing tests), the same standing limitation as every
other UI round in this build. I still need to generate a plan on the running
dev server myself and open its detail view at both sizes before I'd call
this fix's UI actually checked, not just type-checked and structurally
sound.

Commit for this round:
- [`d8219f7`](https://github.com/comp4020-agentic-coding-studio/comp4020-crit7-shuyangyuzu-cmd/commit/d8219f7) — grid-reuse fix (`WeeklyGridSkeleton.astro`, `planner.astro` refactor, new `spec/planner.test.ts` checks)

Deliberately out of scope this round, per my instruction: this is a display
fix only — nothing about candidate data, the manual preview's own state,
confirmed enrolment, or the generator/API from phase 4 changed; phase 5's
confirm/withdraw UI starts only after this fix is committed on its own.

### Phase 5 — confirm, view, adjust, and withdraw the confirmed enrolment

With the plan-detail grid fixed, I moved to the last piece PLAN.md scoped for
this build: turning a preview or a generated plan into the actual confirmed
enrolment, and giving myself a way to see, edit, and undo that decision —
all from `/planner/` itself, never a trip back to `/courses/` first. I gave
the agent the requirements for this phase as one instruction up front: an
explicit "review and confirm" step (never a silent auto-save the moment a
preview looks complete) that discloses this only ever writes to the
prototype's own SQLite database and never touches any real ANU system; a
diff of what confirming will actually change (added/removed/changed
courses) shown before the write happens, not after; client-side blocking
that mirrors the server's own validation (empty preview, a course with no
time chosen yet, a multi-section time left pending, more than 4 courses, a
tutorial-vs-tutorial clash) so a doomed submission is never allowed to reach
the server only to bounce; a confirmed-enrolment list visible on the page at
all times, separate from the preview and separate from the candidate list;
an explicit "edit in preview" action that loads the confirmed plan into the
current preview only when I ask it to, never automatically; and a withdraw
action that removes exactly one confirmed course, with its own explicit
confirmation, and never touches candidates or the preview. I was also
explicit, again, that "confirmed" is capped at 4 courses precisely because
it's the one state modelling actual enrolment — the candidate list and any
preview stay uncapped, per `CLAUDE.md`.

**Commit granularity.** I asked for this phase as two independent commits —
confirm, then withdraw/adjust — each buildable and tested on its own, not one
combined pass. The two features share DOM elements (the confirmed-list
`<li>` template), a render function (`renderConfirmedList()`), and CSS
classes (`.confirm-dialog` styles every dialog on the page), so a clean
line-level split of one finished diff wasn't available after the fact. The
agent handled this by building both together, then deliberately stripping
the working tree back down to a "confirm-only" state — removing the
withdraw button, the load-into-preview button and dialog, and the DOM
refs/listeners that only exist for them — re-running the full check suite
against that reduced state, and committing it first; then restoring the
full, both-features version from its own backup and re-running the full
suite again before the second commit. Both intermediate and final states
were genuinely green before being committed — the split was done by
reduction and restoration, not by committing something broken and fixing it
in the next commit.

**Confirm (5.1).** The planner page gained a "Review and confirm enrolment"
section: a disclosure paragraph stating plainly that confirming writes only
to this app's own demo database; a "Review changes" button that opens a
dialog showing the diff between the current confirmed enrolment and what
the current preview would replace it with, grouped as added / removed /
changed-tutorial, each row naming the specific course and time; and a
"Confirm enrolment" action inside that same dialog, disabled whenever the
preview itself isn't submittable yet (a course still missing a time, a
still-pending multi-section room, more than 4 courses, or a tutorial clash)
with the specific blocking reason shown, not just a disabled button. On the
backend, `confirmEnrollment` in `src/lib/db.ts` gained the same
more-than-4-courses check as a hard rejection inside the same transaction as
the pre-existing duplicate/ownership/clash checks, so a rejected replace
still leaves the previous confirmed plan exactly as it was — genuinely
exercised in `spec/enrollment.test.ts` by submitting 5 courses and then
re-reading the confirmed list to check nothing changed, not just asserting
the 400 in isolation.

**Display, load-into-preview, and withdraw (5.2/5.3).** The confirmed
enrolment now renders as its own list on the page at all times, independent
of whatever the preview or candidate list currently hold. An "Edit in
preview" action opens a dialog showing exactly what loading the confirmed
plan will do to the current preview before it happens, and handles the case
where a confirmed course is no longer a candidate at all: rather than
silently dropping it or silently re-adding it as a candidate behind my back,
it's named separately in the same dialog as "confirmed, but can't be loaded
here," and is left confirmed and untouched. Swapping a confirmed course is
this same path, not a separate mechanism: load into preview, change the
selection, then reuse the existing confirm-diff flow from 5.1. "Withdraw" on
a single confirmed course opens its own confirmation dialog naming that
course, and calls `DELETE /api/enrollment?courseId=...` — already a
narrowly-scoped, single-course removal in `withdrawEnrollment`
(`src/lib/db.ts`), untouched this round — which never touches any other
confirmed course, the candidate list, or the preview.

Verification the agent ran: for the intermediate ("confirm-only") state,
`pnpm typecheck` (0 errors, the same pre-existing `is:inline` hints as every
prior round) and `pnpm test` (185/185 passing); after restoring the full
(both-features) state, the same two checks again, `pnpm typecheck` clean and
`pnpm test` at 186/186 passing across the suite's 14 spec files. The new
assertions in `spec/enrollment.test.ts` (the >4-course rejection and its
rollback check) and `spec/planner.test.ts` (the confirm section's disclosure
and diff markup, the confirmed list rendering with a reachable confirm
control, and the load-into-preview/withdraw dialogs starting hidden
server-side) all passed as part of that same run, not as a separate,
cherry-picked pass.

What I still have not had verified, and am not claiming: there is still no
browser-automation tool available in this environment, and no dev server
was even started this round, so nobody — agent or me — has looked at this
new section rendered in a browser at all, at either 1920×1080 or 390×844.
Everything above is verified at the API level (`spec/enrollment.test.ts`)
and by structural markup checks against the server-rendered page
(`spec/planner.test.ts`), plus the agent tracing the actual code paths by
hand (that the diff dialog reads from the same preview state the confirm
button submits, that the withdraw call only ever includes one `courseId`) —
not by anyone actually clicking through the dialogs. I still need to open
the dev server myself, search for a course, confirm a plan, reload the page,
and withdraw a course by hand, at both sizes, before I'd call this phase's
UI actually checked rather than just type-checked and structurally sound —
the same standing gap as every UI round before this one in this build.

Commits for this phase:
- [`7b6bb49`](https://github.com/comp4020-agentic-coding-studio/comp4020-crit7-shuyangyuzu-cmd/commit/7b6bb49) — confirm current preview into confirmed enrolment, with disclosure, diff, and the 4-course cap
- [`a2b8a6e`](https://github.com/comp4020-agentic-coding-studio/comp4020-crit7-shuyangyuzu-cmd/commit/a2b8a6e) — display confirmed enrolment, load-into-preview (including course swap), and withdraw

Deliberately out of scope this phase, per my instruction: no degree/program
requirement checking, no multi-semester planning, and nothing pushed to
`origin` or deployed. This closes the phase order `PLAN.md` set out; what's
left before the crit is the two standing gaps named above and throughout
this document — an actual look at rendered pixels at both viewports, which
only I can do, and my own review and adoption of this file, which remains a
draft until I say otherwise.
