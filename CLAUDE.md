# Your harness

This file is yours, and it arrives empty on purpose. The rules you hold the
agent to are part of what gets marked, so they should be rules you decided on.

Nothing about the starter is recorded here. What the repo ships is explained
where it lives --- `fly.toml`, the `Dockerfile`, the CI workflow and
`spec/README.md` each say what they fix --- and the
[course website](https://comp.anu.edu.au/courses/comp4020-agentic-coding-studio/)
publishes this deliverable's brief and spec. Read them before you plan or build;
what the agent needs to carry from any of it is your call.

## Rules carried forward from Assignment 2

These are the process rules from last week's harness that still apply to any
deliverable, regardless of what this week's prototype is about. The rules that
were specific to Assignment 2's own fictional case (SlopU, the Office of
Everything, its brand and page structure) are dropped here — this repo builds
an unrelated ANU system, not that one.

- When writing `PROCESS.md` or other first-person project evidence, use "I"
  and "my"; never refer to me as "the student." Assisted drafting must
  distinguish my directions from actions or checks performed by an agent.
- Never convert a subjective reaction into a factual claim.
- No invented citations, studies, statistics or laws. If a point wants the
  authority of research, it doesn't get to invent one: either it stands on
  plain reasoning, or it waits for a pass that does real research and cites
  it properly.
- Automated checks confirm consistency, not quality. `spec/` can verify
  mechanical facts about the deployed app. Whether the work is actually good
  is a human call at the crit. Don't write a test to launder a subjective
  judgement into a green check.
- Look at both viewports before calling a page done. Inspect rendered pages
  at 1920×1080 and at 390×844 — a page that reads well on one and breaks on
  the other isn't finished.
- Process assistance is authorised at my explicit request: the agent may
  organise an English `PROCESS.md` draft using my recorded instructions and
  verified commit evidence. Do not invent personal experiences, decisions,
  prompts, research, screenshots or checks; name agent-performed verification
  as such. Keep the draft's review status visible until I have reviewed and
  adopted it. A green evidence check verifies citations, not authorship,
  reflective quality or permission to submit.
- Stopping a server means stopping the one process you started, by PID, never
  a name-matched sweep. A prior session ran `taskkill /IM node.exe /F` to stop
  a preview server it had started and killed every Node process on the
  machine instead. When starting any long-running server (`pnpm preview`,
  `pnpm dev`, or similar), record the exact PID or tool-owned background-task
  ID it started under. Before stopping it, confirm that recorded PID is still
  the same process, and stop only that exact PID or task ID — never
  `taskkill /IM node.exe`, `pkill node`, `killall node`, or any other command
  that matches by process name rather than by the one PID you recorded. If
  you can't confirm which PID is yours, ask rather than guessing with a
  broader command.

## This project: ANU course selection & timetable planner

Scope, acceptance criteria and data design live in `PLAN.md`, not here. These
are the constraints on how the agent builds it, decided when the topic was
agreed.

- Everything is demo data for one semester and one demo student: courses,
  session times, and enrolments must be clearly presented as a prototype, and
  nothing in the app may claim to be ANUHub, Programs and Courses, or any
  other real ANU service.
- Enrolling or withdrawing only ever writes to this app's own SQLite
  database. Never add a call to any external ANU system — there's nothing to
  integrate with, and the whole point is that this app doesn't touch ANUHub.
- No login, no multi-semester planning, no real seat-competition modelling,
  no degree/program requirement checking. If a feature would need one of
  these to make sense, it's out of scope, not a shortcut to build around.
- "Required" always means *I've locked this course for this planning
  session*. Never word UI text, copy, or test assertions as if it verifies a
  degree requirement — say "locked" or "required for this plan," not
  "required for your degree."
- The candidate list has no enrolment cap; the enrolment *target* (the number
  of courses the generator tries to fill) is a choice of 3 or 4, set by me,
  not hardcoded to one value.
- Hard constraints (a day I can't attend) must always be satisfied — a plan
  that violates one is never offered. Soft preferences only change the order
  candidate plans are shown in; they must never eliminate an otherwise-valid
  plan.
- A lecture can always be caught up on as a recording (revised after real use
  of the planner page — an earlier draft of this rule treated any overlap as
  blocking, which was wrong for this prototype): a lecture overlapping
  anything, including another lecture, is never a blocking conflict, and
  never eliminates a plan or counts toward a blackout day, an "avoid this
  day" preference, or "days on campus." Only a tutorial overlapping another
  tutorial blocks a plan, and only tutorial sessions count toward day-based
  constraints and preferences. A lecture overlap may still surface as a mild,
  non-blocking "available via recording" note in the UI. This is a
  demo-prototype simplification, not a claim about any real ANU course's
  actual recording policy — see `PLAN.md` for the worked scheduling
  examples.
- Two sessions that are exactly back-to-back (one ends when the next starts)
  are not a conflict. Travel time between buildings is not modelled.
- When a tutorial time option groups more than one section/room (same
  course, same day/start/end, different location), the UI must never
  silently default to the first section — it must show that time as
  scheduled but the section as pending, allow it in a preview, and block
  final confirmation until a concrete section is chosen. The server must
  validate that a submitted session id actually belongs to the course and
  timeslot being confirmed.
- Once auto-generation exists (phase 4+), confirming or withdrawing a course
  must remain directly reachable from the planner page itself — never a
  feature that forces a trip back to the course-browsing page first.
- When required courses, blackout days, or thin candidates leave no feasible
  plan, say so with a specific, accurate reason grounded in what actually
  conflicts — never fabricate or generalise a reason. A single clashing
  tutorial is reported as a tutorial-level conflict on that course, never as
  "this course can't be taken" when another tutorial would work.
- If the list of generated plans shown is capped for display, the UI must say
  so explicitly. A capped list must never be presented the same way as "no
  other plans exist."
- Candidate courses, a previewed/generated plan, and the confirmed enrolment
  are three distinct states, in the data model and in the UI. Don't let a
  generated preview silently become "confirmed," and don't let removing a
  candidate silently touch a confirmed enrolment.
- Replacing the confirmed enrolment is one transaction: if it fails partway,
  the previous confirmed plan must remain exactly as it was, not partially
  overwritten.
- Git discipline for this build: at least one commit per phase in `PLAN.md`'s
  implementation order, with an independent commit for any separately
  significant feature or fix within a phase. Run verification proportionate
  to the change before each commit rather than saving it all for one commit
  at the end. Don't push to `origin` or change repo visibility except when I
  explicitly ask for it in that turn.
