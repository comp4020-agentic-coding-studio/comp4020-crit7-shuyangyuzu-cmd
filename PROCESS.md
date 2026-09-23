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
