import { eq } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { courses, sessions } from "./schema";

type SessionSeed = {
  kind: "lecture" | "tutorial";
  label: string;
  dayOfWeek: number;
  startMinutes: number;
  endMinutes: number;
  location: string;
};

type CourseSeed = {
  code: string;
  title: string;
  sessions: SessionSeed[];
};

// Eight fictional demo courses, hand-picked to cover every scenario the
// demo-data requirement names (see PLAN.md and the Phase 2/3 reports). Under
// this prototype's rule (a lecture can always be watched as a recording, so
// only a tutorial-vs-tutorial overlap actually blocks a plan — see
// src/lib/scheduling.ts's classifyOverlap), the scenarios are:
// - COMP1010 and COMP2100 share an identical lecture time -> a *non*-
//   blocking lecture overlap: both courses remain freely combinable, shown
//   only as a mild "available via recording" hint, never an error.
// - COMP2100 and STAT1008 have an unavoidable tutorial clash: STAT1008 has a
//   single tutorial time (with two same-time sections — see the "same
//   timeslot, different section" note below) that overlaps both of
//   COMP2100's tutorial options, so no tutorial choice on either side
//   routes around it.
// - COMP1010's "Tutorial B" clashes with COMP3120's "Tutorial A", but each
//   course has another tutorial that avoids it -> an avoidable clash.
// - COMP4444's "Tutorial B" ends at the exact minute ENGN2222's lecture
//   starts -> adjacent, not a conflict.
// - courses touch different day spreads so a blackout day or an avoid-day
//   preference actually changes which combinations survive.
// A feasible 4-course (and thus 3-course) combination exists: COMP1010
// (Tutorial A) + COMP3120 (Tutorial B) + MATH1013 (Tutorial B) + COMP4444
// (Tutorial B) has no overlapping sessions at all — checked mechanically in
// spec/demo-data.test.ts, not just asserted here.
//
// STAT1008's tutorial is offered as two sections in the same room-time slot
// ("Tutorial A" and "Tutorial A (Room 2)" below share one dayOfWeek/start/end
// but have different locations) — the demo data for the "same course, same
// timeslot, different section/room" case that groupTutorialTimeOptions
// (src/lib/scheduling.ts) collapses into a single selectable time option.
// Building/room names below are invented labels for this prototype, not real
// ANU locations.
const DEMO_COURSES: CourseSeed[] = [
  {
    code: "COMP1010",
    title: "Introduction to Programming (demo)",
    sessions: [
      { kind: "lecture", label: "Lecture", dayOfWeek: 0, startMinutes: 600, endMinutes: 650, location: "Building A, Lecture Theatre 1" },
      { kind: "tutorial", label: "Tutorial A", dayOfWeek: 0, startMinutes: 840, endMinutes: 890, location: "Building A, Room 2.14" },
      { kind: "tutorial", label: "Tutorial B", dayOfWeek: 2, startMinutes: 540, endMinutes: 590, location: "Building A, Room 2.15" },
    ],
  },
  {
    code: "COMP2100",
    title: "Software Engineering (demo)",
    sessions: [
      // Shares COMP1010's exact Monday lecture time on purpose: a lecture
      // overlap is never blocking under this prototype's rule, so the two
      // courses stay freely combinable — only a mild "available via
      // recording" hint, never an error.
      { kind: "lecture", label: "Lecture", dayOfWeek: 0, startMinutes: 600, endMinutes: 650, location: "Building B, Lecture Theatre 2" },
      // Both tutorials are Monday, chosen so each one overlaps STAT1008's
      // only tutorial time option below - an unavoidable tutorial clash
      // between these two courses regardless of which tutorial is chosen.
      { kind: "tutorial", label: "Tutorial A", dayOfWeek: 0, startMinutes: 800, endMinutes: 850, location: "Building B, Room 3.01" },
      { kind: "tutorial", label: "Tutorial B", dayOfWeek: 0, startMinutes: 830, endMinutes: 880, location: "Building B, Room 3.02" },
    ],
  },
  {
    code: "COMP3120",
    title: "Algorithms (demo)",
    sessions: [
      { kind: "lecture", label: "Lecture", dayOfWeek: 1, startMinutes: 540, endMinutes: 590, location: "Building C, Lecture Theatre 1" },
      { kind: "tutorial", label: "Tutorial A", dayOfWeek: 2, startMinutes: 540, endMinutes: 590, location: "Building C, Room 1.10" },
      { kind: "tutorial", label: "Tutorial B", dayOfWeek: 4, startMinutes: 540, endMinutes: 590, location: "Building C, Room 1.11" },
    ],
  },
  {
    code: "COMP4444",
    title: "Distributed Systems (demo)",
    sessions: [
      { kind: "lecture", label: "Lecture", dayOfWeek: 3, startMinutes: 780, endMinutes: 830, location: "Building D, Lecture Theatre 3" },
      { kind: "tutorial", label: "Tutorial A", dayOfWeek: 0, startMinutes: 900, endMinutes: 950, location: "Building D, Room 4.02" },
      { kind: "tutorial", label: "Tutorial B", dayOfWeek: 4, startMinutes: 660, endMinutes: 710, location: "Building D, Room 4.03" },
    ],
  },
  {
    code: "MATH1013",
    title: "Mathematics and Applications 1 (demo)",
    sessions: [
      { kind: "lecture", label: "Lecture 1", dayOfWeek: 1, startMinutes: 660, endMinutes: 710, location: "Building E, Lecture Theatre 1" },
      { kind: "lecture", label: "Lecture 2", dayOfWeek: 3, startMinutes: 660, endMinutes: 710, location: "Building E, Lecture Theatre 1" },
      { kind: "tutorial", label: "Tutorial A", dayOfWeek: 2, startMinutes: 780, endMinutes: 830, location: "Building E, Room 5.01" },
      { kind: "tutorial", label: "Tutorial B", dayOfWeek: 4, startMinutes: 780, endMinutes: 830, location: "Building E, Room 5.02" },
    ],
  },
  {
    code: "PHYS1201",
    title: "Foundations of Physics (demo)",
    sessions: [
      { kind: "lecture", label: "Lecture", dayOfWeek: 0, startMinutes: 540, endMinutes: 590, location: "Building F, Lecture Theatre 2" },
      { kind: "tutorial", label: "Tutorial A", dayOfWeek: 1, startMinutes: 840, endMinutes: 890, location: "Building F, Room 6.01" },
      { kind: "tutorial", label: "Tutorial B", dayOfWeek: 3, startMinutes: 840, endMinutes: 890, location: "Building F, Room 6.02" },
    ],
  },
  {
    code: "ENGN2222",
    title: "Electronic Circuits and Systems (demo)",
    sessions: [
      { kind: "lecture", label: "Lecture", dayOfWeek: 4, startMinutes: 710, endMinutes: 760, location: "Building G, Lecture Theatre 1" },
      { kind: "tutorial", label: "Tutorial A", dayOfWeek: 0, startMinutes: 660, endMinutes: 710, location: "Building G, Room 7.01" },
      { kind: "tutorial", label: "Tutorial B", dayOfWeek: 2, startMinutes: 900, endMinutes: 950, location: "Building G, Room 7.02" },
    ],
  },
  {
    code: "STAT1008",
    title: "Introduction to Statistics (demo)",
    sessions: [
      { kind: "lecture", label: "Lecture", dayOfWeek: 1, startMinutes: 780, endMinutes: 830, location: "Building H, Lecture Theatre 1" },
      // The only tutorial *time option* this course offers. It's placed
      // (Monday, 820-870) so it overlaps *both* of COMP2100's tutorials
      // above, making that pair an unavoidable tutorial clash for
      // spec/demo-data.test.ts to check mechanically. Offered as two
      // same-time sections in different rooms — groupTutorialTimeOptions
      // collapses these into one time option with a "pick a section" state.
      { kind: "tutorial", label: "Tutorial A", dayOfWeek: 0, startMinutes: 820, endMinutes: 870, location: "Building H, Room 8.01" },
      { kind: "tutorial", label: "Tutorial A (Room 2)", dayOfWeek: 0, startMinutes: 820, endMinutes: 870, location: "Building H, Room 8.02" },
    ],
  },
];

// Idempotent: upserts by natural key (course `code`; session `(courseId,
// label)`), so re-running never duplicates rows. Never touches
// candidate_courses, plan_preferences or confirmed_enrollments — those hold
// the visitor's own state, not demo fixtures.
export function seedDemoData(db: BetterSQLite3Database): void {
  for (const course of DEMO_COURSES) {
    db.insert(courses)
      .values({ code: course.code, title: course.title })
      .onConflictDoUpdate({ target: courses.code, set: { title: course.title } })
      .run();
    const row = db.select().from(courses).where(eq(courses.code, course.code)).get();
    if (!row) throw new Error(`seed: failed to upsert course ${course.code}`);
    for (const session of course.sessions) {
      db.insert(sessions)
        .values({ courseId: row.id, ...session })
        .onConflictDoUpdate({
          target: [sessions.courseId, sessions.label],
          set: {
            kind: session.kind,
            dayOfWeek: session.dayOfWeek,
            startMinutes: session.startMinutes,
            endMinutes: session.endMinutes,
            location: session.location,
          },
        })
        .run();
    }
  }
}
