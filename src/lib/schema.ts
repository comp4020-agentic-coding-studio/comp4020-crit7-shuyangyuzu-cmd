import { sql } from "drizzle-orm";
import { check, int, sqliteTable, text, unique } from "drizzle-orm/sqlite-core";

// The schema is the ground truth for the database. To change it: edit here,
// run `pnpm db:generate` to turn the diff into a migration under drizzle/,
// and commit both — the migration applies automatically when the server
// boots (see src/lib/db.ts), locally and deployed. Never edit the database
// by hand: state on the deployed volume outlives every deploy, and the
// migration trail is what keeps old state and new code compatible.
export const messages = sqliteTable("messages", {
  id: int().primaryKey({ autoIncrement: true }),
  body: text().notNull(),
  createdAt: text("created_at")
    .notNull()
    .default(sql`(datetime('now'))`),
});

export type Message = typeof messages.$inferSelect;

// Everything below models the timetable planner (see PLAN.md). One semester,
// one shared demo student: there's no student/user table, and
// planPreferences is a singleton row rather than one per user.

// Day-of-week convention used everywhere in this schema: 0 = Monday .. 6 =
// Sunday. Times are minutes since midnight (0-1439), not wall-clock strings,
// so comparisons and the "adjacent isn't a conflict" rule (end === start) are
// plain integer arithmetic.
export const courses = sqliteTable("courses", {
  id: int().primaryKey({ autoIncrement: true }),
  code: text().notNull().unique(),
  title: text().notNull(),
});

export type Course = typeof courses.$inferSelect;

export const sessions = sqliteTable(
  "sessions",
  {
    id: int().primaryKey({ autoIncrement: true }),
    courseId: int("course_id")
      .notNull()
      .references(() => courses.id, { onDelete: "cascade" }),
    // "lecture" sessions are compulsory for every course they belong to.
    // "tutorial" sessions are alternatives: a course's tutorials are the
    // options a plan chooses exactly one from.
    kind: text().notNull(),
    label: text().notNull(),
    dayOfWeek: int("day_of_week").notNull(),
    startMinutes: int("start_minutes").notNull(),
    endMinutes: int("end_minutes").notNull(),
  },
  (t) => [
    check("sessions_kind_check", sql`${t.kind} in ('lecture', 'tutorial')`),
    check("sessions_day_check", sql`${t.dayOfWeek} between 0 and 6`),
    check(
      "sessions_time_check",
      sql`${t.startMinutes} >= 0 and ${t.endMinutes} <= 1440 and ${t.startMinutes} < ${t.endMinutes}`,
    ),
    // Lets seeding upsert by (courseId, label) instead of duplicating rows
    // every time the seed runs.
    unique("sessions_course_label_unique").on(t.courseId, t.label),
  ],
);

export type Session = typeof sessions.$inferSelect;

// A course on the candidate list, plus whether it's locked ("required") for
// this planning session. Not the same as an enrolment — see
// confirmedEnrollments below.
export const candidateCourses = sqliteTable(
  "candidate_courses",
  {
    id: int().primaryKey({ autoIncrement: true }),
    courseId: int("course_id")
      .notNull()
      .references(() => courses.id, { onDelete: "cascade" }),
    required: int().notNull().default(0),
    addedAt: text("added_at")
      .notNull()
      .default(sql`(datetime('now'))`),
  },
  (t) => [unique("candidate_courses_course_unique").on(t.courseId)],
);

export type CandidateCourse = typeof candidateCourses.$inferSelect;

// Singleton settings row (id is always 1 in practice; enforced in
// src/lib/db.ts, not by a schema constraint, since SQLite has no clean way to
// cap a table at one row).
export const planPreferences = sqliteTable(
  "plan_preferences",
  {
    id: int().primaryKey({ autoIncrement: true }),
    desiredCourseCount: int("desired_course_count").notNull().default(3),
    // JSON int[] of dayOfWeek values I can't attend at all (hard constraint).
    blackoutDays: text("blackout_days")
      .notNull()
      .default(sql`'[]'`),
    // JSON { minimizeDaysOnCampus: boolean, avoidDays: number[] } — soft
    // preferences that only affect how feasible plans are ranked.
    softPreferences: text("soft_preferences")
      .notNull()
      .default(sql`'{"minimizeDaysOnCampus":false,"avoidDays":[]}'`),
  },
  (t) => [check("plan_preferences_count_check", sql`${t.desiredCourseCount} in (3, 4)`)],
);

export type PlanPreference = typeof planPreferences.$inferSelect;

// The confirmed plan: one row per enrolled course, each pinned to the
// tutorial session chosen for it. This is the only table that represents
// "actually enrolled" — a generated/previewed plan never touches it except
// through the transactional replace in src/lib/db.ts.
export const confirmedEnrollments = sqliteTable(
  "confirmed_enrollments",
  {
    id: int().primaryKey({ autoIncrement: true }),
    courseId: int("course_id")
      .notNull()
      .references(() => courses.id, { onDelete: "cascade" }),
    tutorialSessionId: int("tutorial_session_id")
      .notNull()
      .references(() => sessions.id, { onDelete: "restrict" }),
    confirmedAt: text("confirmed_at")
      .notNull()
      .default(sql`(datetime('now'))`),
  },
  (t) => [unique("confirmed_enrollments_course_unique").on(t.courseId)],
);

export type ConfirmedEnrollment = typeof confirmedEnrollments.$inferSelect;
