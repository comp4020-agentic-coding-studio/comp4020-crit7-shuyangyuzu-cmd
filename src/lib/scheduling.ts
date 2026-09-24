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
