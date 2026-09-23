import { describe, expect, it } from "vitest";
import { findConflict, sessionsOverlap } from "../src/lib/scheduling";

// This is the exact primitive the planner page's early conflict-hint feature
// imports client-side (src/pages/planner.astro), and the same one
// confirmEnrollment uses server-side (src/lib/db.ts) — pinning its semantics
// down here covers the client usage indirectly, since the client script
// itself can't be driven by this suite (spec/invariants.test.ts's JSDOM
// only executes externally-loaded <script src> content when a resource
// loader actually fetches it, which this project's default JSDOM options
// don't enable).
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

  it("findConflict returns null when nothing overlaps", () => {
    const slots = [
      { label: "A", session: { dayOfWeek: 0, startMinutes: 0, endMinutes: 60 } },
      { label: "B", session: { dayOfWeek: 0, startMinutes: 60, endMinutes: 120 } },
      { label: "C", session: { dayOfWeek: 1, startMinutes: 0, endMinutes: 60 } },
    ];
    expect(findConflict(slots)).toBeNull();
  });

  it("findConflict reports the labels of the first clashing pair it finds", () => {
    const slots = [
      { label: "A", session: { dayOfWeek: 0, startMinutes: 0, endMinutes: 60 } },
      { label: "B", session: { dayOfWeek: 1, startMinutes: 0, endMinutes: 60 } },
      { label: "C", session: { dayOfWeek: 0, startMinutes: 30, endMinutes: 90 } },
    ];
    expect(findConflict(slots)).toEqual(["A", "C"]);
  });
});
