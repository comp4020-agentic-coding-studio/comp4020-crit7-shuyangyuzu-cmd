import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import Database from "better-sqlite3";
import { and, desc, eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { ConflictError, NotFoundError, ValidationError } from "./errors";
import { type KindedSlot, findConflict } from "./scheduling";
import {
  type CandidateCourse,
  type ConfirmedEnrollment,
  type Course,
  type Message,
  type PlanPreference,
  type Session,
  candidateCourses,
  confirmedEnrollments,
  courses,
  messages,
  planPreferences,
  sessions,
} from "./schema";
import { seedDemoData } from "./seed";

// One SQLite file is the app's whole persistent state. In production
// fly.toml points DATABASE_PATH at the machine's volume (/data), which is
// how state survives a reload and a redeploy; locally it defaults to an
// untracked file in .data/.
const path = process.env.DATABASE_PATH ?? "./.data/app.db";
mkdirSync(dirname(path), { recursive: true });

const client = new Database(path);
client.pragma("journal_mode = WAL");
// Off by default in SQLite. Needed for real: course/session cascade deletes
// and the "a confirmed tutorial can't outlive its session" restrict rule
// only actually fire with this on.
client.pragma("foreign_keys = ON");

export const db = drizzle(client);

// Migrations run at boot, on whatever machine holds the volume — the
// recommended shape for SQLite on Fly, where there's no separate machine to
// run them from. The flow: edit src/lib/schema.ts, `pnpm db:generate`,
// commit the migration it writes to drizzle/.
migrate(db, { migrationsFolder: "./drizzle" });

// Demo courses/sessions only. Idempotent upsert by natural key — never
// touches candidate_courses, plan_preferences or confirmed_enrollments, so a
// redeploy or a restart never clobbers a visitor's saved state.
seedDemoData(db);

export type { Message, Course, Session, CandidateCourse, PlanPreference, ConfirmedEnrollment };
export { NotFoundError, ValidationError, ConflictError };

export function listMessages(): Message[] {
  return db.select().from(messages).orderBy(desc(messages.id)).limit(50).all();
}

export function addMessage(body: string): Message {
  return db.insert(messages).values({ body }).returning().get();
}

// --- Courses -----------------------------------------------------------

export type CourseWithSessions = Course & { sessions: Session[] };

export function listCourses(): CourseWithSessions[] {
  const allCourses = db.select().from(courses).orderBy(courses.code).all();
  const allSessions = db.select().from(sessions).all();
  const byCourse = new Map<number, Session[]>();
  for (const session of allSessions) {
    const list = byCourse.get(session.courseId) ?? [];
    list.push(session);
    byCourse.set(session.courseId, list);
  }
  return allCourses.map((course) => ({ ...course, sessions: byCourse.get(course.id) ?? [] }));
}

// --- Candidate courses ---------------------------------------------------

export type CandidateWithCourse = CandidateCourse & { course: Course };

export function listCandidates(): CandidateWithCourse[] {
  return db
    .select({ candidate: candidateCourses, course: courses })
    .from(candidateCourses)
    .innerJoin(courses, eq(candidateCourses.courseId, courses.id))
    .orderBy(candidateCourses.addedAt)
    .all()
    .map(({ candidate, course }) => ({ ...candidate, course }));
}

export function addCandidate(courseId: number): CandidateWithCourse {
  const course = db.select().from(courses).where(eq(courses.id, courseId)).get();
  if (!course) throw new NotFoundError(`No course with id ${courseId}`);
  const existing = db.select().from(candidateCourses).where(eq(candidateCourses.courseId, courseId)).get();
  if (existing) throw new ConflictError(`${course.code} is already a candidate`);
  const candidate = db.insert(candidateCourses).values({ courseId }).returning().get();
  return { ...candidate, course };
}

export function removeCandidate(courseId: number): void {
  const existing = db.select().from(candidateCourses).where(eq(candidateCourses.courseId, courseId)).get();
  if (!existing) throw new NotFoundError(`Course ${courseId} is not a candidate`);
  // Deliberately only deletes from candidate_courses. A confirmed enrolment
  // for this course, if any, is untouched — removing a candidate must never
  // silently change what's confirmed (PLAN.md's three-states rule).
  db.delete(candidateCourses).where(eq(candidateCourses.courseId, courseId)).run();
}

export function setCandidateRequired(courseId: number, required: boolean): CandidateWithCourse {
  const course = db.select().from(courses).where(eq(courses.id, courseId)).get();
  if (!course) throw new NotFoundError(`No course with id ${courseId}`);
  const existing = db.select().from(candidateCourses).where(eq(candidateCourses.courseId, courseId)).get();
  if (!existing) throw new NotFoundError(`${course.code} is not a candidate`);
  const candidate = db
    .update(candidateCourses)
    .set({ required: required ? 1 : 0 })
    .where(eq(candidateCourses.courseId, courseId))
    .returning()
    .get();
  return { ...candidate, course };
}

// --- Preferences ---------------------------------------------------------

export type PreferencesView = {
  desiredCourseCount: number;
  blackoutDays: number[];
  softPreferences: { minimizeDaysOnCampus: boolean; avoidDays: number[] };
};

function toPreferencesView(row: PlanPreference): PreferencesView {
  return {
    desiredCourseCount: row.desiredCourseCount,
    blackoutDays: JSON.parse(row.blackoutDays),
    softPreferences: JSON.parse(row.softPreferences),
  };
}

// Validates, dedupes and sorts a list of day-of-week numbers (0=Monday..
// 6=Sunday). Shared by blackoutDays and softPreferences.avoidDays since both
// are the same shape of input.
function validateDayList(value: unknown, field: string): number[] {
  if (!Array.isArray(value)) {
    throw new ValidationError(`${field} must be an array of day numbers (0-6)`);
  }
  const days = value.map((day) => {
    if (!Number.isInteger(day) || day < 0 || day > 6) {
      throw new ValidationError(`${field} entries must be integers 0-6 (Monday-Sunday); got ${JSON.stringify(day)}`);
    }
    return day;
  });
  return [...new Set(days)].sort((a, b) => a - b);
}

export function getPreferences(): PreferencesView {
  const row = db.select().from(planPreferences).where(eq(planPreferences.id, 1)).get();
  if (!row) {
    return { desiredCourseCount: 3, blackoutDays: [], softPreferences: { minimizeDaysOnCampus: false, avoidDays: [] } };
  }
  return toPreferencesView(row);
}

export function setPreferences(input: unknown): PreferencesView {
  if (typeof input !== "object" || input === null) {
    throw new ValidationError("expected a preferences object");
  }
  const body = input as Record<string, unknown>;
  if (body.desiredCourseCount !== 3 && body.desiredCourseCount !== 4) {
    throw new ValidationError("desiredCourseCount must be 3 or 4");
  }
  const blackoutDays = validateDayList(body.blackoutDays ?? [], "blackoutDays");

  const soft = body.softPreferences ?? {};
  if (typeof soft !== "object" || soft === null) {
    throw new ValidationError("softPreferences must be an object");
  }
  const softBody = soft as Record<string, unknown>;
  const minimizeDaysOnCampus = Boolean(softBody.minimizeDaysOnCampus);
  const avoidDays = validateDayList(softBody.avoidDays ?? [], "softPreferences.avoidDays");

  const values = {
    desiredCourseCount: body.desiredCourseCount,
    blackoutDays: JSON.stringify(blackoutDays),
    softPreferences: JSON.stringify({ minimizeDaysOnCampus, avoidDays }),
  };
  const row = db
    .insert(planPreferences)
    .values({ id: 1, ...values })
    .onConflictDoUpdate({ target: planPreferences.id, set: values })
    .returning()
    .get();
  return toPreferencesView(row);
}

// --- Confirmed enrolment ---------------------------------------------------

export type ConfirmedEnrollmentView = ConfirmedEnrollment & { course: Course; tutorialSession: Session };

export function listConfirmedEnrollments(): ConfirmedEnrollmentView[] {
  return db
    .select({ enrollment: confirmedEnrollments, course: courses, tutorialSession: sessions })
    .from(confirmedEnrollments)
    .innerJoin(courses, eq(confirmedEnrollments.courseId, courses.id))
    .innerJoin(sessions, eq(confirmedEnrollments.tutorialSessionId, sessions.id))
    .orderBy(courses.code)
    .all()
    .map(({ enrollment, course, tutorialSession }) => ({ ...enrollment, course, tutorialSession }));
}

export type EnrollmentChoice = { courseId: number; tutorialSessionId: number };

// Replaces the whole confirmed plan in one transaction. Validation happens
// *inside* the transaction, interleaved with the delete/insert, not before
// it: that's what makes a failure partway through actually roll back the
// delete and any inserts already applied, rather than merely skipping work
// that was pre-checked. See CLAUDE.md's transactional-replace rule.
export function confirmEnrollment(choices: EnrollmentChoice[]): ConfirmedEnrollmentView[] {
  if (choices.length === 0) {
    throw new ValidationError("at least one course choice is required to confirm a plan");
  }
  const courseIds = choices.map((choice) => choice.courseId);
  if (new Set(courseIds).size !== courseIds.length) {
    throw new ValidationError("each course can only appear once in a confirmed plan");
  }

  return db.transaction((tx) => {
    tx.delete(confirmedEnrollments).run();

    const slots: { label: string; session: KindedSlot }[] = [];
    const toInsert: EnrollmentChoice[] = [];

    for (const choice of choices) {
      const course = tx.select().from(courses).where(eq(courses.id, choice.courseId)).get();
      if (!course) throw new NotFoundError(`No course with id ${choice.courseId}`);

      const tutorial = tx.select().from(sessions).where(eq(sessions.id, choice.tutorialSessionId)).get();
      if (!tutorial) throw new NotFoundError(`No session with id ${choice.tutorialSessionId}`);
      if (tutorial.courseId !== course.id) {
        throw new ValidationError(`Session ${tutorial.id} does not belong to ${course.code}`);
      }
      if (tutorial.kind !== "tutorial") {
        throw new ValidationError(`Session ${tutorial.id} is a ${tutorial.kind}, not a tutorial`);
      }

      const lectures = tx
        .select()
        .from(sessions)
        .where(and(eq(sessions.courseId, course.id), eq(sessions.kind, "lecture")))
        .all();
      for (const lecture of lectures) {
        slots.push({ label: `${course.code} ${lecture.label}`, session: lecture });
      }
      slots.push({ label: `${course.code} ${tutorial.label}`, session: tutorial });

      toInsert.push({ courseId: course.id, tutorialSessionId: tutorial.id });
    }

    const conflict = findConflict(slots);
    if (conflict) {
      throw new ValidationError(`"${conflict[0]}" clashes with "${conflict[1]}"`);
    }

    for (const row of toInsert) {
      tx.insert(confirmedEnrollments).values(row).run();
    }

    return tx
      .select({ enrollment: confirmedEnrollments, course: courses, tutorialSession: sessions })
      .from(confirmedEnrollments)
      .innerJoin(courses, eq(confirmedEnrollments.courseId, courses.id))
      .innerJoin(sessions, eq(confirmedEnrollments.tutorialSessionId, sessions.id))
      .orderBy(courses.code)
      .all()
      .map(({ enrollment, course, tutorialSession }) => ({ ...enrollment, course, tutorialSession }));
  });
}

export function withdrawEnrollment(courseId: number): void {
  const existing = db.select().from(confirmedEnrollments).where(eq(confirmedEnrollments.courseId, courseId)).get();
  if (!existing) throw new NotFoundError(`Course ${courseId} is not in the confirmed plan`);
  db.delete(confirmedEnrollments).where(eq(confirmedEnrollments.courseId, courseId)).run();
}
