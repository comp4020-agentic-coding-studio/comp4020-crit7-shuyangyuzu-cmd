import type { APIRoute } from "astro";
import { NotFoundError, ValidationError, confirmEnrollment, listConfirmedEnrollments, withdrawEnrollment } from "../../lib/db";

export const GET: APIRoute = () => Response.json(listConfirmedEnrollments());

type ChoiceInput = { courseId?: unknown; tutorialSessionId?: unknown };

// Replaces the whole confirmed plan. Body shape: { choices: [{ courseId,
// tutorialSessionId }] }. Every choice is re-validated against the database
// inside confirmEnrollment (course exists, tutorial belongs to that course
// and is actually a tutorial, no session-level conflicts) — nothing here is
// trusted just because the client sent it.
export const POST: APIRoute = async ({ request }) => {
  const body = (await request.json().catch(() => null)) as { choices?: unknown } | null;
  if (!Array.isArray(body?.choices)) {
    return Response.json({ error: "expected { choices: [{ courseId, tutorialSessionId }] }" }, { status: 400 });
  }
  const choices: { courseId: number; tutorialSessionId: number }[] = [];
  for (const raw of body.choices as ChoiceInput[]) {
    const courseId = Number(raw?.courseId);
    const tutorialSessionId = Number(raw?.tutorialSessionId);
    if (!Number.isInteger(courseId) || !Number.isInteger(tutorialSessionId)) {
      return Response.json({ error: "each choice needs an integer courseId and tutorialSessionId" }, { status: 400 });
    }
    choices.push({ courseId, tutorialSessionId });
  }
  try {
    return Response.json(confirmEnrollment(choices));
  } catch (err) {
    if (err instanceof NotFoundError) return Response.json({ error: err.message }, { status: 404 });
    if (err instanceof ValidationError) return Response.json({ error: err.message }, { status: 400 });
    throw err;
  }
};

export const DELETE: APIRoute = async ({ url }) => {
  const courseId = Number(url.searchParams.get("courseId"));
  if (!Number.isInteger(courseId)) {
    return Response.json({ error: "?courseId= must be an integer" }, { status: 400 });
  }
  try {
    withdrawEnrollment(courseId);
    return new Response(null, { status: 204 });
  } catch (err) {
    if (err instanceof NotFoundError) return Response.json({ error: err.message }, { status: 404 });
    throw err;
  }
};
