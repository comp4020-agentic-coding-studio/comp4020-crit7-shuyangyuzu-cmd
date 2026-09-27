> Draft organised with AI assistance from my feedback. This revised wording
> is still pending my final review.

# Crit 7 reflection

**What was the breakthrough that moved the work forward?**

I wanted to build this planner because I find it difficult to choose between
several courses without seeing how their times fit together. In my experience,
I had to enrol through ANUHub before checking tutorial options in MyTimetable.
I also had personal travel plans around the mid-semester break, so I wanted
to compare combinations that could leave Thursday or Friday free.

The most valuable breakthrough for me was changing the timetable interface.
The first version put too much on one page. After looking at it, I asked the
agent to separate course search from timetable planning and use an
08:00–22:00 time axis, similar to the ANU timetable I already knew. I then
asked for a more compact course list and removal of the timetable's separate
vertical scrollbar. I directed these changes through screenshots and feedback;
the agent implemented them. This made the schedule easier for me to read
and compare.

**What did this work change about who I want to be as a software developer?**

I want to become a developer who starts from actual use and keeps checking
whether an interface helps people do what they need. Working features and
passing tests are useful, but a crowded page can still make a task difficult.
When using AI, I want to keep trying the result and giving specific feedback,
rather than relying only on the agent's completion reports.

Since then, the agent extended Playwright to cover the auto-scheduler: both
modes, viewing a plan without disturbing my preview, and Apply updating the
preview without touching a confirmed enrolment, at both viewports. That is
the agent's check, not mine; I have not clicked through the deployed app.
The prototype uses demo data, not real dates, and never touches ANUHub.
