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
