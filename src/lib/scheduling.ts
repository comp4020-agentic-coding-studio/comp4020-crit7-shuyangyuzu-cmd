// Shared conflict-detection primitive. Phase 2 only needs enough of this to
// (a) reject a confirmed plan that overlaps itself and (b) sanity-check that
// the demo data has a feasible plan at all — the ranked, preference-aware
// generator itself is phase 3/4 scope (see PLAN.md).
export type SessionSlot = {
  dayOfWeek: number;
  startMinutes: number;
  endMinutes: number;
};

// A slot that also carries whether it's a lecture or a tutorial, needed
// because the two kinds are no longer treated the same for conflict purposes
// (see classifyOverlap below).
export type KindedSlot = SessionSlot & { kind: "lecture" | "tutorial" };

// Two sessions conflict only if they're on the same day and their time
// ranges actually overlap. One ending exactly when the other starts is
// adjacency, not a conflict (PLAN.md, "rules that shape the whole build").
// This is a pure time-overlap check, independent of lecture/tutorial kind —
// classifyOverlap below is what decides whether an overlap actually blocks.
export function sessionsOverlap(a: SessionSlot, b: SessionSlot): boolean {
  return a.dayOfWeek === b.dayOfWeek && a.startMinutes < b.endMinutes && b.startMinutes < a.endMinutes;
}

// This prototype's rule, revised after real use of the planner page (PLAN.md,
// "rules that shape the whole build"): a lecture can always be caught up on
// as a recording, so a lecture overlapping anything — another lecture, or a
// tutorial — is never a blocking conflict, only ever worth a mild note.
// tutorial-vs-tutorial *is* blocking: a plan actually attends exactly one
// tutorial slot per course, and there's no recording to fall back on there.
// This is a demo-prototype simplification, not a claim about every real ANU
// course's recording policy. Exported (not inlined into findConflict) so
// src/pages/courses.astro and src/pages/planner.astro can classify an overlap
// with the exact same rule the server enforces in src/lib/db.ts, rather than
// a second, hand-written copy of it.
export function classifyOverlap(a: KindedSlot, b: KindedSlot): "tutorial-clash" | "lecture-note" | null {
  if (!sessionsOverlap(a, b)) return null;
  return a.kind === "tutorial" && b.kind === "tutorial" ? "tutorial-clash" : "lecture-note";
}

export function isBlockingOverlap(a: KindedSlot, b: KindedSlot): boolean {
  return classifyOverlap(a, b) === "tutorial-clash";
}

// Returns the labels of the first *blocking* clashing pair found (i.e. a
// tutorial-vs-tutorial overlap), or null if none of the given slots block
// each other. A lecture overlapping anything never counts, however many
// lecture slots are passed in.
export function findConflict<T extends KindedSlot>(slots: { label: string; session: T }[]): [string, string] | null {
  for (let i = 0; i < slots.length; i++) {
    for (let j = i + 1; j < slots.length; j++) {
      if (isBlockingOverlap(slots[i].session, slots[j].session)) {
        return [slots[i].label, slots[j].label];
      }
    }
  }
  return null;
}

// A course can offer the same tutorial time in more than one room/section
// (PLAN.md, "Time options and sections"). For combination purposes those
// rows are one choice, not several: grouping them here is what lets the
// generator and the manual picker both treat "same day/start/end" as a
// single time option, with the concrete room/section a separate, later
// decision that never affects feasibility.
export type TimeOption<T extends { dayOfWeek: number; startMinutes: number; endMinutes: number }> = {
  dayOfWeek: number;
  startMinutes: number;
  endMinutes: number;
  sections: T[];
};

// True once a time option's section has to be picked explicitly before a
// plan built from it can be confirmed — i.e. it groups more than one
// section/room sharing the same time. A single-section time option
// auto-resolves (see PLAN.md): there's nothing to choose.
export function isPendingSection<T extends { dayOfWeek: number; startMinutes: number; endMinutes: number }>(
  option: TimeOption<T>,
): boolean {
  return option.sections.length > 1;
}

// Groups a course's tutorial sessions into time options by
// (dayOfWeek, startMinutes, endMinutes). Order of the input sections within
// each group is preserved, and groups appear in first-seen order.
export function groupTutorialTimeOptions<T extends { dayOfWeek: number; startMinutes: number; endMinutes: number }>(
  tutorials: T[],
): TimeOption<T>[] {
  const options: TimeOption<T>[] = [];
  const byKey = new Map<string, TimeOption<T>>();
  for (const tutorial of tutorials) {
    const key = `${tutorial.dayOfWeek}:${tutorial.startMinutes}:${tutorial.endMinutes}`;
    let option = byKey.get(key);
    if (!option) {
      option = { dayOfWeek: tutorial.dayOfWeek, startMinutes: tutorial.startMinutes, endMinutes: tutorial.endMinutes, sections: [] };
      byKey.set(key, option);
      options.push(option);
    }
    option.sections.push(tutorial);
  }
  return options;
}

// --- Time-proportional weekly grid layout (Phase 3 layout revision) --------
// The planner's weekly grid is a fixed 08:00-22:00 vertical axis shared by
// every day column, at a fixed px-per-hour, so a session's position and
// height are a direct, honest function of its actual time — never squeezed
// to fit a screen, and never just stacked in course order. These two
// functions are pure so the position/height/column math can be unit-tested
// without touching the DOM (see spec/scheduling.test.ts).
export const GRID_START_MINUTES = 8 * 60; // 08:00
export const GRID_END_MINUTES = 22 * 60; // 22:00
export const PX_PER_HOUR = 64;

export type GridPosition =
  | { kind: "out-of-range" }
  | { kind: "visible"; topPx: number; heightPx: number; clippedStart: boolean; clippedEnd: boolean };

// Converts a session's start/end (minutes since midnight) into a top/height
// in pixels against the fixed GRID_START_MINUTES-GRID_END_MINUTES axis. A
// session entirely before or after the window is reported as out-of-range
// rather than silently clamped to a sliver, so callers can surface CLAUDE.md's
// "never silently hide" rule instead of drawing a misleadingly placed block.
// A session that only partially falls outside the window is clamped and
// flagged via clippedStart/clippedEnd so the caller can still show it (at its
// true proportional size within the visible window) alongside a warning.
export function computeGridPosition(startMinutes: number, endMinutes: number): GridPosition {
  if (endMinutes <= GRID_START_MINUTES || startMinutes >= GRID_END_MINUTES) {
    return { kind: "out-of-range" };
  }
  const clippedStart = startMinutes < GRID_START_MINUTES;
  const clippedEnd = endMinutes > GRID_END_MINUTES;
  const visibleStart = Math.max(startMinutes, GRID_START_MINUTES);
  const visibleEnd = Math.min(endMinutes, GRID_END_MINUTES);
  const pxPerMinute = PX_PER_HOUR / 60;
  return {
    kind: "visible",
    topPx: (visibleStart - GRID_START_MINUTES) * pxPerMinute,
    heightPx: (visibleEnd - visibleStart) * pxPerMinute,
    clippedStart,
    clippedEnd,
  };
}

// Assigns each same-day slot a column (and the total column count of the
// cluster it belongs to) so genuinely overlapping sessions sit side by side
// without covering each other, while sessions that are merely back-to-back
// (one starts exactly when another ends — an explicit non-conflict per
// sessionsOverlap/CLAUDE.md) each still get the full day-column width rather
// than being wedged into a shared multi-column cluster.
//
// Input is assumed pre-filtered to a single day. Sessions are sorted by start
// time, then grouped into clusters of *transitively* overlapping sessions: a
// session starting at or after the running cluster's end closes the previous
// cluster and starts a new one. Within a cluster, columns are assigned by
// greedy first-fit (assign the lowest-numbered column whose current slot has
// already ended) — a standard, optimal interval-graph-colouring algorithm —
// and every item in a cluster is reported with that cluster's final column
// count, so equal-width columns can be computed from a single number.
export function packOverlappingSlots<T extends SessionSlot>(slots: T[]): { slot: T; column: number; totalColumns: number }[] {
  const indexed = slots.map((slot, index) => ({ slot, index }));
  indexed.sort((a, b) => a.slot.startMinutes - b.slot.startMinutes || a.index - b.index);

  const results: { slot: T; column: number; totalColumns: number }[] = new Array(slots.length);
  let clusterEnd = -Infinity;

  function flushCluster(items: { slot: T; index: number }[]) {
    if (items.length === 0) return;
    // columnEnds[c] = end time of the slot currently occupying column c.
    const columnEnds: number[] = [];
    const assigned: { item: (typeof items)[number]; column: number }[] = [];
    for (const item of items) {
      let column = columnEnds.findIndex((end) => end <= item.slot.startMinutes);
      if (column === -1) {
        column = columnEnds.length;
        columnEnds.push(item.slot.endMinutes);
      } else {
        columnEnds[column] = item.slot.endMinutes;
      }
      assigned.push({ item, column });
    }
    const totalColumns = columnEnds.length;
    for (const { item, column } of assigned) {
      results[item.index] = { slot: item.slot, column, totalColumns };
    }
  }

  let currentCluster: { slot: T; index: number }[] = [];
  for (const entry of indexed) {
    if (currentCluster.length === 0 || entry.slot.startMinutes < clusterEnd) {
      currentCluster.push(entry);
      clusterEnd = Math.max(clusterEnd, entry.slot.endMinutes);
    } else {
      flushCluster(currentCluster);
      currentCluster = [entry];
      clusterEnd = entry.slot.endMinutes;
    }
  }
  flushCluster(currentCluster);

  return results;
}
