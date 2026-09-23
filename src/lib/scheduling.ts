// Shared conflict-detection primitive. Phase 2 only needs enough of this to
// (a) reject a confirmed plan that overlaps itself and (b) sanity-check that
// the demo data has a feasible plan at all — the ranked, preference-aware
// generator itself is phase 3/4 scope (see PLAN.md).
export type SessionSlot = {
  dayOfWeek: number;
  startMinutes: number;
  endMinutes: number;
};

// Two sessions conflict only if they're on the same day and their time
// ranges actually overlap. One ending exactly when the other starts is
// adjacency, not a conflict (PLAN.md, "rules that shape the whole build").
export function sessionsOverlap(a: SessionSlot, b: SessionSlot): boolean {
  return a.dayOfWeek === b.dayOfWeek && a.startMinutes < b.endMinutes && b.startMinutes < a.endMinutes;
}

// Returns the labels of the first clashing pair found, or null if none of
// the given slots overlap each other.
export function findConflict<T extends SessionSlot>(slots: { label: string; session: T }[]): [string, string] | null {
  for (let i = 0; i < slots.length; i++) {
    for (let j = i + 1; j < slots.length; j++) {
      if (sessionsOverlap(slots[i].session, slots[j].session)) {
        return [slots[i].label, slots[j].label];
      }
    }
  }
  return null;
}
