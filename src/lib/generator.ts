// Phase 4: the auto-schedule generator. Pure and DB-independent on purpose —
// it takes plain course/session data and preferences as arguments and hands
// back a ranked list of feasible plans, never touching sqlite itself. The two
// exported entry points mirror PLAN.md's "Auto-schedule operations": one
// keeps a fixed course set and only searches tutorial times (operation A),
// the other searches which candidates to include as well (operation B).
//
// Every search here is exhaustive, never sampled: enumerateCombos walks the
// full cartesian product of each course's usable tutorial time options
// (pruning a branch only once it's provably infeasible, which never skips a
// feasible combination), and generatePlansFromCandidates does the same one
// level up, over every course-subset of the right size. totalFeasible is
// therefore always the true count, not an estimate — only the *returned*
// plans list is capped (see RESULT_CAP).
import { type TimeOption, groupTutorialTimeOptions, sessionsOverlap } from "./scheduling";

export type GenSession = {
  id: number;
  kind: "lecture" | "tutorial";
  dayOfWeek: number;
  startMinutes: number;
  endMinutes: number;
};

export type GenCourse = {
  id: number;
  code: string;
  sessions: GenSession[];
};

export type GenPreferences = {
  blackoutDays: number[];
  softPreferences: { minimizeDaysOnCampus: boolean; avoidDays: number[] };
};

export type PlanCourseChoice = {
  courseId: number;
  code: string;
  dayOfWeek: number;
  startMinutes: number;
  endMinutes: number;
  sectionId: number | null;
  pending: boolean;
};

export type GeneratedPlan = {
  courses: PlanCourseChoice[];
  daysOnCampus: number[];
  daysOnCampusCount: number;
  avoidDayMinutes: number;
  pendingCount: number;
};

export type GenerateOutcome = { ok: true; totalFeasible: number; plans: GeneratedPlan[] } | { ok: false; reason: string };

export const RESULT_CAP = 50;

type UsableOption = { dayOfWeek: number; startMinutes: number; endMinutes: number; sectionIds: number[] };

function byCode(a: GenCourse, b: GenCourse): number {
  return a.code < b.code ? -1 : a.code > b.code ? 1 : 0;
}

// A blackout day removes the option entirely (hard constraint), not just its
// ranking — an option that lands on a blackout day is never offered, even as
// a low-ranked plan.
function usableTimeOptions(course: GenCourse, blackoutDays: Set<number>): UsableOption[] {
  const tutorials = course.sessions.filter((s): s is GenSession & { kind: "tutorial" } => s.kind === "tutorial");
  const grouped: TimeOption<GenSession>[] = groupTutorialTimeOptions(tutorials);
  return grouped
    .filter((option) => !blackoutDays.has(option.dayOfWeek))
    .map((option) => ({
      dayOfWeek: option.dayOfWeek,
      startMinutes: option.startMinutes,
      endMinutes: option.endMinutes,
      sectionIds: option.sections.map((s) => s.id),
    }));
}

// Verified, not guessed: true only when *every* option pairing between the
// two courses overlaps, i.e. no choice of tutorial times could ever let both
// be on the same plan. This is what lets the "must-include" diagnostics name
// a specific pair (matching the seed data's COMP2100/STAT1008 case) instead
// of a generic "no plan found".
function findUnavoidableClash(entries: { course: GenCourse; options: UsableOption[] }[]): [string, string] | null {
  for (let i = 0; i < entries.length; i++) {
    for (let j = i + 1; j < entries.length; j++) {
      let allClash = true;
      for (const a of entries[i].options) {
        let clashesWithEveryB = true;
        for (const b of entries[j].options) {
          if (!(a.dayOfWeek === b.dayOfWeek && a.startMinutes < b.endMinutes && b.startMinutes < a.endMinutes)) {
            clashesWithEveryB = false;
          }
        }
        if (!clashesWithEveryB) {
          allClash = false;
          break;
        }
      }
      if (allClash) return [entries[i].course.code, entries[j].course.code];
    }
  }
  return null;
}

type ComboChoice = { course: GenCourse; option: UsableOption };

function enumerateCombos(entries: { course: GenCourse; options: UsableOption[] }[]): ComboChoice[][] {
  const results: ComboChoice[][] = [];
  const chosen: ComboChoice[] = [];
  function backtrack(index: number) {
    if (index === entries.length) {
      results.push([...chosen]);
      return;
    }
    for (const option of entries[index].options) {
      if (chosen.some((c) => sessionsOverlap(c.option, option))) continue;
      chosen.push({ course: entries[index].course, option });
      backtrack(index + 1);
      chosen.pop();
    }
  }
  backtrack(0);
  return results;
}

function comboToPlan(combo: ComboChoice[], avoidDays: Set<number>): GeneratedPlan {
  const courses: PlanCourseChoice[] = combo.map(({ course, option }) => ({
    courseId: course.id,
    code: course.code,
    dayOfWeek: option.dayOfWeek,
    startMinutes: option.startMinutes,
    endMinutes: option.endMinutes,
    sectionId: option.sectionIds.length === 1 ? option.sectionIds[0] : null,
    pending: option.sectionIds.length > 1,
  }));
  const daysOnCampus = [...new Set(courses.map((c) => c.dayOfWeek))].sort((a, b) => a - b);
  const avoidDayMinutes = courses
    .filter((c) => avoidDays.has(c.dayOfWeek))
    .reduce((sum, c) => sum + (c.endMinutes - c.startMinutes), 0);
  return {
    courses,
    daysOnCampus,
    daysOnCampusCount: daysOnCampus.length,
    avoidDayMinutes,
    pendingCount: courses.filter((c) => c.pending).length,
  };
}

// Ties are broken by course code and time (my explicit instruction), not by
// whatever order enumeration happened to produce — that makes the tie-break
// a real, reproducible key derived from the plan's own content, rather than
// an accident of iteration order that would still technically be "stable"
// but wouldn't mean anything on its own.
function sortKeyOf(plan: GeneratedPlan): string {
  return [...plan.courses]
    .sort((a, b) => (a.code < b.code ? -1 : a.code > b.code ? 1 : 0))
    .map((c) => `${c.code}:${c.dayOfWeek}:${c.startMinutes}:${c.endMinutes}`)
    .join("|");
}

function comparePlans(a: GeneratedPlan, b: GeneratedPlan, prefs: GenPreferences): number {
  if (prefs.softPreferences.avoidDays.length > 0 && a.avoidDayMinutes !== b.avoidDayMinutes) {
    return a.avoidDayMinutes - b.avoidDayMinutes;
  }
  if (prefs.softPreferences.minimizeDaysOnCampus && a.daysOnCampusCount !== b.daysOnCampusCount) {
    return a.daysOnCampusCount - b.daysOnCampusCount;
  }
  const ka = sortKeyOf(a);
  const kb = sortKeyOf(b);
  return ka < kb ? -1 : ka > kb ? 1 : 0;
}

// The shared inner search: every feasible tutorial-time combination for one
// fixed list of courses, unranked and uncapped. Returns zero silently (never
// throws/guesses a reason) whenever a course has no usable option or no
// overlap-free combination exists — callers that can name a specific cause
// check for it themselves before calling this, using the same
// usableTimeOptions/findUnavoidableClash building blocks.
function enumerateFeasibleForCourseSet(
  courseList: GenCourse[],
  preferences: GenPreferences,
): { totalFeasible: number; plans: GeneratedPlan[] } {
  const blackout = new Set(preferences.blackoutDays);
  const sorted = [...courseList].sort(byCode);
  const entries = sorted.map((course) => ({ course, options: usableTimeOptions(course, blackout) }));
  if (entries.some((e) => e.options.length === 0)) return { totalFeasible: 0, plans: [] };
  const combos = enumerateCombos(entries);
  const avoidDays = new Set(preferences.softPreferences.avoidDays);
  const plans = combos.map((combo) => comboToPlan(combo, avoidDays));
  return { totalFeasible: plans.length, plans };
}

// Operation A: "schedule times for my current preview". The course set is
// exactly what's passed in — never grown or shrunk, and not subject to the
// 3/4 desiredCourseCount rule (that rule only governs operation B's
// candidate-pool selection).
export function generateTimesForFixedCourses(
  fixedCourseIds: number[],
  allCourses: GenCourse[],
  preferences: GenPreferences,
): GenerateOutcome {
  if (fixedCourseIds.length === 0) {
    return {
      ok: false,
      reason: "Your preview is empty — add and include at least one candidate before scheduling tutorial times automatically.",
    };
  }
  const byId = new Map(allCourses.map((c) => [c.id, c]));
  const uniqueIds = [...new Set(fixedCourseIds)];
  const courseList: GenCourse[] = [];
  for (const id of uniqueIds) {
    const course = byId.get(id);
    if (!course) return { ok: false, reason: `Course ${id} in your preview no longer exists.` };
    courseList.push(course);
  }

  const blackout = new Set(preferences.blackoutDays);
  const entries = courseList.map((course) => ({ course, options: usableTimeOptions(course, blackout) }));
  const noOption = entries.find((e) => e.options.length === 0);
  if (noOption) {
    const hasAnyTutorial = noOption.course.sessions.some((s) => s.kind === "tutorial");
    return {
      ok: false,
      reason: hasAnyTutorial
        ? `${noOption.course.code} has no tutorial time that avoids your blackout days.`
        : `${noOption.course.code} has no tutorial time options at all, so no plan can include it.`,
    };
  }
  const clash = findUnavoidableClash(entries);
  if (clash) {
    return {
      ok: false,
      reason: `${clash[0]} and ${clash[1]} clash on every tutorial-time combination — no plan can include both.`,
    };
  }

  const { totalFeasible, plans } = enumerateFeasibleForCourseSet(courseList, preferences);
  if (totalFeasible === 0) {
    return {
      ok: false,
      reason: "No feasible plan was found for your current preview under these conditions — try adjusting your blackout days.",
    };
  }
  const ranked = [...plans].sort((a, b) => comparePlans(a, b, preferences));
  return { ok: true, totalFeasible, plans: ranked.slice(0, RESULT_CAP) };
}

function kCombinations<T>(items: T[], k: number): T[][] {
  const results: T[][] = [];
  const chosen: T[] = [];
  function backtrack(start: number) {
    if (chosen.length === k) {
      results.push([...chosen]);
      return;
    }
    for (let i = start; i < items.length; i++) {
      chosen.push(items[i]);
      backtrack(i + 1);
      chosen.pop();
    }
  }
  backtrack(0);
  return results;
}

// Operation B: "generate a course-selection plan from my candidates". Every
// required candidate is included in every subset tried; the remaining slots
// (targetCount - required.length) are filled from every k-sized subset of
// the non-required candidates that has at least one usable tutorial time —
// exhaustive over both the subset choice and the tutorial-time choice, with
// totalFeasible summed across every subset actually searched.
export function generatePlansFromCandidates(
  requiredCourseIds: number[],
  optionalCourseIds: number[],
  targetCount: number,
  allCourses: GenCourse[],
  preferences: GenPreferences,
): GenerateOutcome {
  const byId = new Map(allCourses.map((c) => [c.id, c]));
  const requiredCourses = requiredCourseIds.map((id) => byId.get(id)).filter((c): c is GenCourse => Boolean(c));
  const optionalCourses = optionalCourseIds
    .map((id) => byId.get(id))
    .filter((c): c is GenCourse => Boolean(c))
    .sort(byCode);

  const blackout = new Set(preferences.blackoutDays);

  if (requiredCourses.length > 0) {
    const requiredEntries = requiredCourses.map((course) => ({ course, options: usableTimeOptions(course, blackout) }));
    const noOption = requiredEntries.find((e) => e.options.length === 0);
    if (noOption) {
      const hasAnyTutorial = noOption.course.sessions.some((s) => s.kind === "tutorial");
      return {
        ok: false,
        reason: hasAnyTutorial
          ? `Required course ${noOption.course.code} has no tutorial time that avoids your blackout days, so no plan is possible.`
          : `Required course ${noOption.course.code} has no tutorial time options at all, so no plan is possible.`,
      };
    }
    const clash = findUnavoidableClash(requiredEntries);
    if (clash) {
      return {
        ok: false,
        reason: `Required courses ${clash[0]} and ${clash[1]} clash on every tutorial-time combination — no plan is possible.`,
      };
    }
  }

  const needed = targetCount - requiredCourses.length;
  if (needed < 0) {
    return {
      ok: false,
      reason: `You have ${requiredCourses.length} required candidates but a target of ${targetCount} — lower your required courses or raise your target.`,
    };
  }

  if (needed === 0) {
    const { totalFeasible, plans } = enumerateFeasibleForCourseSet(requiredCourses, preferences);
    if (totalFeasible === 0) {
      return {
        ok: false,
        reason: "No feasible plan was found for your required courses under these conditions — try adjusting your blackout days.",
      };
    }
    const ranked = [...plans].sort((a, b) => comparePlans(a, b, preferences));
    return { ok: true, totalFeasible, plans: ranked.slice(0, RESULT_CAP) };
  }

  const usableOptional = optionalCourses.filter((course) => usableTimeOptions(course, blackout).length > 0);
  if (usableOptional.length < needed) {
    return {
      ok: false,
      reason: `Only ${usableOptional.length} of your non-required candidates have a tutorial time under your current blackout days, but ${needed} more ${needed === 1 ? "is" : "are"} needed to reach your target of ${targetCount}.`,
    };
  }

  const subsets = kCombinations(usableOptional, needed);
  let totalFeasible = 0;
  const allPlans: GeneratedPlan[] = [];
  for (const subset of subsets) {
    const outcome = enumerateFeasibleForCourseSet([...requiredCourses, ...subset], preferences);
    totalFeasible += outcome.totalFeasible;
    allPlans.push(...outcome.plans);
  }
  if (totalFeasible === 0) {
    return {
      ok: false,
      reason:
        "No combination of your candidate courses reaches your target under these conditions — try adjusting your required courses, candidate list, or blackout days.",
    };
  }
  const ranked = allPlans.sort((a, b) => comparePlans(a, b, preferences));
  return { ok: true, totalFeasible, plans: ranked.slice(0, RESULT_CAP) };
}
