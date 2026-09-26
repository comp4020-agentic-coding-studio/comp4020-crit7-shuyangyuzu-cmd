import type { APIRoute } from "astro";
import {
  type GenCourse,
  type GeneratedPlan,
  generatePlansFromCandidates,
  generateTimesForFixedCourses,
} from "../../../lib/generator";
import { type CourseWithSessions, getPreferences, listCandidates, listCourses } from "../../../lib/db";

function toGenCourse(course: CourseWithSessions): GenCourse {
  return {
    id: course.id,
    code: course.code,
    sessions: course.sessions.map((s) => ({
      id: s.id,
      kind: s.kind,
      dayOfWeek: s.dayOfWeek,
      startMinutes: s.startMinutes,
      endMinutes: s.endMinutes,
    })),
  };
}

type SuccessBody = { ok: true; totalFeasible: number; capped: boolean; plans: GeneratedPlan[] };
type FailureBody = { ok: false; reason: string };

function outcomeResponse(outcome: { ok: true; totalFeasible: number; plans: GeneratedPlan[] } | { ok: false; reason: string }): Response {
  if (!outcome.ok) {
    return Response.json({ ok: false, reason: outcome.reason } satisfies FailureBody);
  }
  return Response.json({
    ok: true,
    totalFeasible: outcome.totalFeasible,
    capped: outcome.totalFeasible > outcome.plans.length,
    plans: outcome.plans,
  } satisfies SuccessBody);
}

// Never writes anything — reads courses/candidates/preferences from the
// database and hands them to the pure generator, which only ever computes.
// Nothing here can touch confirmed_enrollments or mutate candidate_courses;
// applying a returned plan to the client's preview is a client-only step
// (see planner.astro), and confirming that preview is still a separate,
// later API entirely.
export const POST: APIRoute = async ({ request }) => {
  const body = await request.json().catch(() => null);
  if (typeof body !== "object" || body === null) {
    return Response.json({ error: "expected a JSON object" }, { status: 400 });
  }
  const mode = (body as { mode?: unknown }).mode;
  if (mode !== "preview" && mode !== "candidates") {
    return Response.json({ error: 'mode must be "preview" or "candidates"' }, { status: 400 });
  }

  const allCourses = listCourses().map(toGenCourse);
  // Preferences (blackout days, soft preferences, desired course count) are
  // always read from the server's stored state, never accepted from the
  // request body — this endpoint can't be told "pretend my blackout days are
  // X" by the client.
  const preferences = getPreferences();

  if (mode === "preview") {
    const rawIds = (body as { courseIds?: unknown }).courseIds;
    if (!Array.isArray(rawIds) || !rawIds.every((id) => Number.isInteger(id))) {
      return Response.json({ error: "courseIds must be an array of integers" }, { status: 400 });
    }
    const courseIds = rawIds as number[];
    const candidateIds = new Set(listCandidates().map((c) => c.courseId));
    const notACandidate = courseIds.find((id) => !candidateIds.has(id));
    if (notACandidate !== undefined) {
      return Response.json({ error: `Course ${notACandidate} is not one of your current candidates` }, { status: 400 });
    }
    return outcomeResponse(generateTimesForFixedCourses(courseIds, allCourses, preferences));
  }

  const candidates = listCandidates();
  const requiredCourseIds = candidates.filter((c) => c.required === 1).map((c) => c.courseId);
  const optionalCourseIds = candidates.filter((c) => c.required === 0).map((c) => c.courseId);
  return outcomeResponse(
    generatePlansFromCandidates(requiredCourseIds, optionalCourseIds, preferences.desiredCourseCount, allCourses, preferences),
  );
};
