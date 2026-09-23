import type { APIRoute } from "astro";
import { ConflictError, NotFoundError, ValidationError, addCandidate, listCandidates, removeCandidate, setCandidateRequired } from "../../lib/db";

function errorResponse(err: unknown): Response {
  if (err instanceof NotFoundError) return Response.json({ error: err.message }, { status: 404 });
  if (err instanceof ConflictError) return Response.json({ error: err.message }, { status: 409 });
  if (err instanceof ValidationError) return Response.json({ error: err.message }, { status: 400 });
  throw err;
}

export const GET: APIRoute = () => Response.json(listCandidates());

// Never trusts a client-submitted course/session relationship: courseId is
// the only input, and every other fact about the course is re-read from the
// database inside addCandidate.
export const POST: APIRoute = async ({ request }) => {
  const body = await request.json().catch(() => null);
  const courseId = Number((body as { courseId?: unknown } | null)?.courseId);
  if (!Number.isInteger(courseId)) {
    return Response.json({ error: "courseId must be an integer" }, { status: 400 });
  }
  try {
    return Response.json(addCandidate(courseId), { status: 201 });
  } catch (err) {
    return errorResponse(err);
  }
};

export const PATCH: APIRoute = async ({ request }) => {
  const body = (await request.json().catch(() => null)) as { courseId?: unknown; required?: unknown } | null;
  const courseId = Number(body?.courseId);
  if (!Number.isInteger(courseId) || typeof body?.required !== "boolean") {
    return Response.json({ error: "courseId (integer) and required (boolean) are both needed" }, { status: 400 });
  }
  try {
    return Response.json(setCandidateRequired(courseId, body.required));
  } catch (err) {
    return errorResponse(err);
  }
};

export const DELETE: APIRoute = async ({ url }) => {
  const courseId = Number(url.searchParams.get("courseId"));
  if (!Number.isInteger(courseId)) {
    return Response.json({ error: "?courseId= must be an integer" }, { status: 400 });
  }
  try {
    removeCandidate(courseId);
    return new Response(null, { status: 204 });
  } catch (err) {
    return errorResponse(err);
  }
};
