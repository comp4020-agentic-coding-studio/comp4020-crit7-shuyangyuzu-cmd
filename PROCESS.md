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
