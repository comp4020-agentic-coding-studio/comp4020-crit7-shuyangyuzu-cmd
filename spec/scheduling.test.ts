import { describe, expect, it } from "vitest";
import {
  type KindedSlot,
  GRID_END_MINUTES,
  GRID_START_MINUTES,
  PX_PER_HOUR,
  classifyOverlap,
  computeGridPosition,
  findConflict,
  groupTutorialTimeOptions,
  isBlockingOverlap,
  isPendingSection,
  packOverlappingSlots,
  sessionsOverlap,
} from "../src/lib/scheduling";

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

  // Same-timeslot, multi-section grouping (PLAN.md, "Time options and
  // sections"): a course can offer identical tutorial times in more than one
  // room, and combination/feasibility logic must treat that as one time
  // option, not two competing choices.
  describe("groupTutorialTimeOptions / isPendingSection", () => {
    it("gives a single-section time option that is not pending", () => {
      const tutorials = [{ dayOfWeek: 0, startMinutes: 60, endMinutes: 120, label: "Tutorial A" }];
      const options = groupTutorialTimeOptions(tutorials);
      expect(options).toHaveLength(1);
      expect(options[0].sections).toEqual(tutorials);
      expect(isPendingSection(options[0])).toBe(false);
    });

    it("groups two sections sharing the exact same day/start/end into one pending time option", () => {
      const roomA = { dayOfWeek: 0, startMinutes: 820, endMinutes: 870, label: "Tutorial A" };
      const roomB = { dayOfWeek: 0, startMinutes: 820, endMinutes: 870, label: "Tutorial A (Room 2)" };
      const options = groupTutorialTimeOptions([roomA, roomB]);
      expect(options).toHaveLength(1);
      expect(options[0]).toMatchObject({ dayOfWeek: 0, startMinutes: 820, endMinutes: 870 });
      expect(options[0].sections).toEqual([roomA, roomB]);
      expect(isPendingSection(options[0])).toBe(true);
    });

    it("keeps sessions with a different day, start, or end as separate time options", () => {
      const a = { dayOfWeek: 0, startMinutes: 60, endMinutes: 120, label: "Tutorial A" };
      const differentDay = { dayOfWeek: 1, startMinutes: 60, endMinutes: 120, label: "Tutorial B" };
      const differentStart = { dayOfWeek: 0, startMinutes: 90, endMinutes: 120, label: "Tutorial C" };
      const differentEnd = { dayOfWeek: 0, startMinutes: 60, endMinutes: 150, label: "Tutorial D" };
      const options = groupTutorialTimeOptions([a, differentDay, differentStart, differentEnd]);
      expect(options).toHaveLength(4);
      expect(options.every((o) => !isPendingSection(o))).toBe(true);
    });

    it("preserves first-seen order of groups and of sections within a group", () => {
      const first = { dayOfWeek: 2, startMinutes: 0, endMinutes: 60, label: "First" };
      const second = { dayOfWeek: 3, startMinutes: 0, endMinutes: 60, label: "Second" };
      const firstAgain = { dayOfWeek: 2, startMinutes: 0, endMinutes: 60, label: "First again" };
      const options = groupTutorialTimeOptions([first, second, firstAgain]);
      expect(options.map((o) => o.dayOfWeek)).toEqual([2, 3]);
      expect(options[0].sections).toEqual([first, firstAgain]);
    });
  });

  // Time-proportional weekly grid layout (Phase 3 layout revision): the
  // planner's grid axis is fixed at 08:00-22:00 with PX_PER_HOUR pixels per
  // hour, shared by every day, so a block's position/height is a direct
  // function of its actual start/end time rather than course order.
  describe("computeGridPosition", () => {
    it("positions a 09:30-start, 90-minute session at the user's worked example (top=96px, height=96px)", () => {
      // 09:30 is 90 minutes after the 08:00 grid start: 90/60 * 64 = 96px down.
      // A 90-minute duration is likewise 90/60 * 64 = 96px tall.
      const pos = computeGridPosition(570, 660);
      expect(pos).toEqual({ kind: "visible", topPx: 96, heightPx: 96, clippedStart: false, clippedEnd: false });
    });

    it("positions a session starting exactly at the grid start with zero top offset", () => {
      const pos = computeGridPosition(GRID_START_MINUTES, GRID_START_MINUTES + 60);
      expect(pos).toMatchObject({ kind: "visible", topPx: 0, heightPx: PX_PER_HOUR });
    });

    it("reports a session entirely before the grid window as out-of-range", () => {
      expect(computeGridPosition(360, 420)).toEqual({ kind: "out-of-range" });
    });

    it("reports a session entirely after the grid window as out-of-range", () => {
      expect(computeGridPosition(1350, 1400)).toEqual({ kind: "out-of-range" });
    });

    it("clips and flags a session that starts before the grid window but ends inside it", () => {
      const pos = computeGridPosition(GRID_START_MINUTES - 30, GRID_START_MINUTES + 60);
      expect(pos).toEqual({ kind: "visible", topPx: 0, heightPx: PX_PER_HOUR, clippedStart: true, clippedEnd: false });
    });

    it("clips and flags a session that starts inside the grid window but ends after it", () => {
      const pos = computeGridPosition(GRID_END_MINUTES - 60, GRID_END_MINUTES + 30);
      expect(pos).toEqual({ kind: "visible", topPx: (GRID_END_MINUTES - 60 - GRID_START_MINUTES) * (PX_PER_HOUR / 60), heightPx: PX_PER_HOUR, clippedStart: false, clippedEnd: true });
    });

    it("treats a session ending exactly at the grid start as out-of-range, not a zero-height sliver", () => {
      expect(computeGridPosition(GRID_START_MINUTES - 60, GRID_START_MINUTES)).toEqual({ kind: "out-of-range" });
    });
  });

  describe("packOverlappingSlots", () => {
    it("gives two genuinely overlapping same-day sessions separate columns", () => {
      const a: SessionSlotLike = { dayOfWeek: 0, startMinutes: 60, endMinutes: 120 };
      const b: SessionSlotLike = { dayOfWeek: 0, startMinutes: 90, endMinutes: 150 };
      const result = packOverlappingSlots([a, b]);
      expect(result).toHaveLength(2);
      expect(result[0].totalColumns).toBe(2);
      expect(result[1].totalColumns).toBe(2);
      expect(new Set(result.map((r) => r.column))).toEqual(new Set([0, 1]));
    });

    it("keeps two exactly back-to-back sessions in the same single-width column (adjacency is not overlap)", () => {
      const a: SessionSlotLike = { dayOfWeek: 0, startMinutes: 60, endMinutes: 120 };
      const b: SessionSlotLike = { dayOfWeek: 0, startMinutes: 120, endMinutes: 180 };
      const result = packOverlappingSlots([a, b]);
      expect(result.every((r) => r.column === 0 && r.totalColumns === 1)).toBe(true);
    });

    it("gives three mutually-overlapping sessions three separate columns in one cluster", () => {
      const a: SessionSlotLike = { dayOfWeek: 0, startMinutes: 60, endMinutes: 180 };
      const b: SessionSlotLike = { dayOfWeek: 0, startMinutes: 90, endMinutes: 150 };
      const c: SessionSlotLike = { dayOfWeek: 0, startMinutes: 100, endMinutes: 130 };
      const result = packOverlappingSlots([a, b, c]);
      expect(result.every((r) => r.totalColumns === 3)).toBe(true);
      expect(new Set(result.map((r) => r.column))).toEqual(new Set([0, 1, 2]));
    });

    it("reuses a freed column once its occupant has ended, within a transitively-overlapping cluster", () => {
      // A overlaps B, B overlaps C, but A and C don't overlap each other —
      // still one cluster (transitively linked), and C can reuse A's column.
      const a: SessionSlotLike = { dayOfWeek: 0, startMinutes: 0, endMinutes: 60 };
      const b: SessionSlotLike = { dayOfWeek: 0, startMinutes: 30, endMinutes: 90 };
      const c: SessionSlotLike = { dayOfWeek: 0, startMinutes: 60, endMinutes: 120 };
      const result = packOverlappingSlots([a, b, c]);
      const byStart = [...result].sort((x, y) => x.slot.startMinutes - y.slot.startMinutes);
      expect(byStart[0].column).toBe(0); // A
      expect(byStart[1].column).toBe(1); // B, overlaps A
      expect(byStart[2].column).toBe(0); // C starts when A ends, reuses column 0
      expect(byStart.every((r) => r.totalColumns === 2)).toBe(true);
    });

    it("puts non-overlapping sessions on different days into independent full-width clusters when pre-filtered per day", () => {
      // packOverlappingSlots assumes single-day input; cross-day handling is
      // the caller's job (filter by dayOfWeek before calling), so two same-time
      // sessions on different days each get their own single-column cluster.
      const mondaySlots: SessionSlotLike[] = [{ dayOfWeek: 0, startMinutes: 60, endMinutes: 120 }];
      const tuesdaySlots: SessionSlotLike[] = [{ dayOfWeek: 1, startMinutes: 60, endMinutes: 120 }];
      expect(packOverlappingSlots(mondaySlots)[0]).toMatchObject({ column: 0, totalColumns: 1 });
      expect(packOverlappingSlots(tuesdaySlots)[0]).toMatchObject({ column: 0, totalColumns: 1 });
    });

    it("returns an empty array for no slots", () => {
      expect(packOverlappingSlots([])).toEqual([]);
    });
  });
});

type SessionSlotLike = { dayOfWeek: number; startMinutes: number; endMinutes: number };
