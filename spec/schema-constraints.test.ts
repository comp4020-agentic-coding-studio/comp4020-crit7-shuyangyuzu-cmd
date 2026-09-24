import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import Database from "better-sqlite3";
import { eq } from "drizzle-orm";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { migrate } from "drizzle-orm/better-sqlite3/migrator";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { candidateCourses, confirmedEnrollments, courses, sessions } from "../src/lib/schema";

// Isolated from the shared server DB used by every other spec file: this
// exercises raw SQLite CHECK/UNIQUE/FOREIGN KEY constraints directly, which
// needs its own throwaway file rather than the seeded, HTTP-driven database.
let dir: string;
let db: ReturnType<typeof drizzle>;
let sqlite: Database.Database;

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), "schema-constraints-"));
  sqlite = new Database(join(dir, "test.db"));
  sqlite.pragma("foreign_keys = ON");
  db = drizzle(sqlite);
  migrate(db, { migrationsFolder: "./drizzle" });
});

afterAll(() => {
  sqlite.close();
  rmSync(dir, { recursive: true, force: true });
});

function makeCourse(code: string) {
  return db.insert(courses).values({ code, title: `${code} (test)` }).returning().get();
}

describe("schema constraints", () => {
  it("rejects a session kind other than lecture/tutorial", () => {
    const course = makeCourse("TEST0001");
    // "seminar" is deliberately invalid — this checks the raw SQLite CHECK
    // constraint fires, so the `as` cast is needed to get an invalid value
    // past the type-level "lecture" | "tutorial" the schema also enforces.
    expect(() =>
      db
        .insert(sessions)
        .values({ courseId: course.id, kind: "seminar" as "lecture", label: "X", dayOfWeek: 0, startMinutes: 0, endMinutes: 60 })
        .run(),
    ).toThrow(/CHECK constraint failed/);
  });

  it("rejects a day-of-week outside 0-6", () => {
    const course = makeCourse("TEST0002");
    expect(() =>
      db.insert(sessions).values({ courseId: course.id, kind: "lecture", label: "X", dayOfWeek: 7, startMinutes: 0, endMinutes: 60 }).run(),
    ).toThrow(/CHECK constraint failed/);
  });

  it("rejects a session whose start time is not before its end time", () => {
    const course = makeCourse("TEST0003");
    expect(() =>
      db.insert(sessions).values({ courseId: course.id, kind: "lecture", label: "X", dayOfWeek: 0, startMinutes: 600, endMinutes: 600 }).run(),
    ).toThrow(/CHECK constraint failed/);
  });

  it("rejects a duplicate (courseId, label) session pair", () => {
    const course = makeCourse("TEST0004");
    db.insert(sessions).values({ courseId: course.id, kind: "lecture", label: "Lecture", dayOfWeek: 0, startMinutes: 0, endMinutes: 60 }).run();
    expect(() =>
      db.insert(sessions).values({ courseId: course.id, kind: "lecture", label: "Lecture", dayOfWeek: 1, startMinutes: 0, endMinutes: 60 }).run(),
    ).toThrow(/UNIQUE constraint failed/);
  });

  it("rejects a second candidate row for the same course", () => {
    const course = makeCourse("TEST0005");
    db.insert(candidateCourses).values({ courseId: course.id }).run();
    expect(() => db.insert(candidateCourses).values({ courseId: course.id }).run()).toThrow(/UNIQUE constraint failed/);
  });

  it("rejects a second confirmed-enrolment row for the same course", () => {
    const course = makeCourse("TEST0006");
    const tutorial = db
      .insert(sessions)
      .values({ courseId: course.id, kind: "tutorial", label: "Tutorial A", dayOfWeek: 0, startMinutes: 0, endMinutes: 60 })
      .returning()
      .get();
    db.insert(confirmedEnrollments).values({ courseId: course.id, tutorialSessionId: tutorial.id }).run();
    expect(() => db.insert(confirmedEnrollments).values({ courseId: course.id, tutorialSessionId: tutorial.id }).run()).toThrow(
      /UNIQUE constraint failed/,
    );
  });

  it("cascades: deleting a course removes its sessions and candidate row", () => {
    const course = makeCourse("TEST0007");
    const session = db
      .insert(sessions)
      .values({ courseId: course.id, kind: "lecture", label: "Lecture", dayOfWeek: 0, startMinutes: 0, endMinutes: 60 })
      .returning()
      .get();
    db.insert(candidateCourses).values({ courseId: course.id }).run();

    db.delete(courses).where(eq(courses.id, course.id)).run();

    expect(db.select().from(sessions).where(eq(sessions.id, session.id)).get()).toBeUndefined();
    expect(db.select().from(candidateCourses).where(eq(candidateCourses.courseId, course.id)).get()).toBeUndefined();
  });

  it("restricts: a session still referenced by a confirmed enrolment cannot be deleted directly", () => {
    const course = makeCourse("TEST0008");
    const tutorial = db
      .insert(sessions)
      .values({ courseId: course.id, kind: "tutorial", label: "Tutorial A", dayOfWeek: 0, startMinutes: 0, endMinutes: 60 })
      .returning()
      .get();
    db.insert(confirmedEnrollments).values({ courseId: course.id, tutorialSessionId: tutorial.id }).run();

    expect(() => db.delete(sessions).where(eq(sessions.id, tutorial.id)).run()).toThrow(/FOREIGN KEY constraint failed/);
  });
});
