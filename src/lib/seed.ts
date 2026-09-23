import { eq } from "drizzle-orm";
import type { BetterSQLite3Database } from "drizzle-orm/better-sqlite3";
import { courses, sessions } from "./schema";

type SessionSeed = {
  kind: "lecture" | "tutorial";
  label: string;
  dayOfWeek: number;
  startMinutes: number;
  endMinutes: number;
};

type CourseSeed = {
  code: string;
  title: string;
  sessions: SessionSeed[];
};

// Seven fictional demo courses, hand-picked to cover every scenario the
// demo-data requirement names (see PLAN.md and the Phase 2 report):
// - COMP1010 vs COMP2100 share an identical lecture time -> an unavoidable
//   clash: no tutorial choice can route around two compulsory lectures that
//   overlap.
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
const DEMO_COURSES: CourseSeed[] = [
  {
    code: "COMP1010",
    title: "Introduction to Programming (demo)",
    sessions: [
      { kind: "lecture", label: "Lecture", dayOfWeek: 0, startMinutes: 600, endMinutes: 650 },
      { kind: "tutorial", label: "Tutorial A", dayOfWeek: 0, startMinutes: 840, endMinutes: 890 },
      { kind: "tutorial", label: "Tutorial B", dayOfWeek: 2, startMinutes: 540, endMinutes: 590 },
    ],
  },
  {
    code: "COMP2100",
    title: "Software Engineering (demo)",
    sessions: [
      { kind: "lecture", label: "Lecture", dayOfWeek: 0, startMinutes: 600, endMinutes: 650 },
      { kind: "tutorial", label: "Tutorial A", dayOfWeek: 1, startMinutes: 600, endMinutes: 650 },
      { kind: "tutorial", label: "Tutorial B", dayOfWeek: 3, startMinutes: 600, endMinutes: 650 },
    ],
  },
  {
    code: "COMP3120",
    title: "Algorithms (demo)",
    sessions: [
      { kind: "lecture", label: "Lecture", dayOfWeek: 1, startMinutes: 540, endMinutes: 590 },
      { kind: "tutorial", label: "Tutorial A", dayOfWeek: 2, startMinutes: 540, endMinutes: 590 },
      { kind: "tutorial", label: "Tutorial B", dayOfWeek: 4, startMinutes: 540, endMinutes: 590 },
    ],
  },
  {
    code: "COMP4444",
    title: "Distributed Systems (demo)",
    sessions: [
      { kind: "lecture", label: "Lecture", dayOfWeek: 3, startMinutes: 780, endMinutes: 830 },
      { kind: "tutorial", label: "Tutorial A", dayOfWeek: 0, startMinutes: 900, endMinutes: 950 },
      { kind: "tutorial", label: "Tutorial B", dayOfWeek: 4, startMinutes: 660, endMinutes: 710 },
    ],
  },
  {
    code: "MATH1013",
    title: "Mathematics and Applications 1 (demo)",
    sessions: [
      { kind: "lecture", label: "Lecture 1", dayOfWeek: 1, startMinutes: 660, endMinutes: 710 },
      { kind: "lecture", label: "Lecture 2", dayOfWeek: 3, startMinutes: 660, endMinutes: 710 },
      { kind: "tutorial", label: "Tutorial A", dayOfWeek: 2, startMinutes: 780, endMinutes: 830 },
      { kind: "tutorial", label: "Tutorial B", dayOfWeek: 4, startMinutes: 780, endMinutes: 830 },
    ],
  },
  {
    code: "PHYS1201",
    title: "Foundations of Physics (demo)",
    sessions: [
      { kind: "lecture", label: "Lecture", dayOfWeek: 0, startMinutes: 540, endMinutes: 590 },
      { kind: "tutorial", label: "Tutorial A", dayOfWeek: 1, startMinutes: 840, endMinutes: 890 },
      { kind: "tutorial", label: "Tutorial B", dayOfWeek: 3, startMinutes: 840, endMinutes: 890 },
    ],
  },
  {
    code: "ENGN2222",
    title: "Electronic Circuits and Systems (demo)",
    sessions: [
      { kind: "lecture", label: "Lecture", dayOfWeek: 4, startMinutes: 710, endMinutes: 760 },
      { kind: "tutorial", label: "Tutorial A", dayOfWeek: 0, startMinutes: 660, endMinutes: 710 },
      { kind: "tutorial", label: "Tutorial B", dayOfWeek: 2, startMinutes: 900, endMinutes: 950 },
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
          },
        })
        .run();
    }
  }
}
