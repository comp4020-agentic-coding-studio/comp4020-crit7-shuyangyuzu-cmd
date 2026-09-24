import { describe, expect, it } from "vitest";
import { type KindedSlot, classifyOverlap, findConflict, isBlockingOverlap, sessionsOverlap } from "../src/lib/scheduling";

// This is the exact primitive the courses/planner pages' conflict-hint
// features import client-side, and the same one confirmEnrollment uses
// server-side (src/lib/db.ts) — pinning its semantics down here covers the
// client usage indirectly, since the client script itself can't be driven by
// this suite (spec/invariants.test.ts's JSDOM only executes
// externally-loaded <script src> content when a resource loader actually
// fetches it, which this project's default JSDOM options don't enable).
describe("scheduling", () => {
  it("flags two sessions on the same day that overlap", () => {
    expect(sessionsOverlap({ dayOfWeek: 0, startMinutes: 60, endMinutes: 120 }, { dayOfWeek: 0, startMinutes: 90, endMinutes: 150 })).toBe(true);
  });

  it("does not flag sessions on different days, even at an identical time", () => {
    expect(sessionsOverlap({ dayOfWeek: 0, startMinutes: 60, endMinutes: 120 }, { dayOfWeek: 1, startMinutes: 60, endMinutes: 120 })).toBe(false);
  });

  it("treats a session ending exactly when another starts as not conflicting", () => {
    expect(sessionsOverlap({ dayOfWeek: 0, startMinutes: 60, endMinutes: 120 }, { dayOfWeek: 0, startMinutes: 120, endMinutes: 180 })).toBe(false);
  });

  it("flags one session fully containing another on the same day", () => {
    expect(sessionsOverlap({ dayOfWeek: 0, startMinutes: 60, endMinutes: 180 }, { dayOfWeek: 0, startMinutes: 90, endMinutes: 120 })).toBe(true);
  });

  // Revised rule (PLAN.md, "rules that shape the whole build"): a lecture can
  // always be caught up on as a recording, so it never blocks a plan on its
  // own — only a tutorial-vs-tutorial overlap does. classifyOverlap is the
  // single source of truth both findConflict (blocking) and the UI's mild
  // "available via recording" hint are built from.
  describe("classifyOverlap / isBlockingOverlap", () => {
    it("is null when the two sessions don't overlap at all", () => {
      const a = { dayOfWeek: 0, startMinutes: 0, endMinutes: 60, kind: "lecture" as const };
      const b = { dayOfWeek: 0, startMinutes: 60, endMinutes: 120, kind: "lecture" as const };
      expect(classifyOverlap(a, b)).toBeNull();
      expect(isBlockingOverlap(a, b)).toBe(false);
    });

    it("is a non-blocking 'lecture-note' when two overlapping lectures clash", () => {
      const a = { dayOfWeek: 0, startMinutes: 0, endMinutes: 60, kind: "lecture" as const };
      const b = { dayOfWeek: 0, startMinutes: 30, endMinutes: 90, kind: "lecture" as const };
      expect(classifyOverlap(a, b)).toBe("lecture-note");
      expect(isBlockingOverlap(a, b)).toBe(false);
    });

    it("is a non-blocking 'lecture-note' when a lecture overlaps a tutorial", () => {
      const lecture = { dayOfWeek: 0, startMinutes: 0, endMinutes: 60, kind: "lecture" as const };
      const tutorial = { dayOfWeek: 0, startMinutes: 30, endMinutes: 90, kind: "tutorial" as const };
      expect(classifyOverlap(lecture, tutorial)).toBe("lecture-note");
      expect(isBlockingOverlap(lecture, tutorial)).toBe(false);
    });

    it("is a blocking 'tutorial-clash' only when two tutorials overlap", () => {
      const a = { dayOfWeek: 0, startMinutes: 0, endMinutes: 60, kind: "tutorial" as const };
      const b = { dayOfWeek: 0, startMinutes: 30, endMinutes: 90, kind: "tutorial" as const };
      expect(classifyOverlap(a, b)).toBe("tutorial-clash");
      expect(isBlockingOverlap(a, b)).toBe(true);
    });
  });

  it("findConflict returns null when nothing overlaps", () => {
    const slots = [
      { label: "A", session: { dayOfWeek: 0, startMinutes: 0, endMinutes: 60, kind: "tutorial" as const } },
      { label: "B", session: { dayOfWeek: 0, startMinutes: 60, endMinutes: 120, kind: "tutorial" as const } },
      { label: "C", session: { dayOfWeek: 1, startMinutes: 0, endMinutes: 60, kind: "tutorial" as const } },
    ];
    expect(findConflict(slots)).toBeNull();
  });

  it("findConflict reports the labels of the first blocking pair it finds", () => {
    const slots = [
      { label: "A", session: { dayOfWeek: 0, startMinutes: 0, endMinutes: 60, kind: "tutorial" as const } },
      { label: "B", session: { dayOfWeek: 1, startMinutes: 0, endMinutes: 60, kind: "tutorial" as const } },
      { label: "C", session: { dayOfWeek: 0, startMinutes: 30, endMinutes: 90, kind: "tutorial" as const } },
    ];
    expect(findConflict(slots)).toEqual(["A", "C"]);
  });

  it("findConflict ignores a lecture overlapping the rest of the plan, even one overlapping a tutorial", () => {
    const slots: { label: string; session: KindedSlot }[] = [
      { label: "A Lecture", session: { dayOfWeek: 0, startMinutes: 0, endMinutes: 90, kind: "lecture" } },
      { label: "B Lecture", session: { dayOfWeek: 0, startMinutes: 30, endMinutes: 120, kind: "lecture" } },
      { label: "B Tutorial", session: { dayOfWeek: 0, startMinutes: 40, endMinutes: 100, kind: "tutorial" } },
    ];
    expect(findConflict(slots)).toBeNull();
  });
});
