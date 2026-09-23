import type { APIRoute } from "astro";
import { listCourses } from "../../lib/db";

// Read-only: every demo course with its full lecture/tutorial list. There's
// no candidate-list gate on seeing this — the whole point of the prototype
// is comparing sessions before committing to anything (PLAN.md).
export const GET: APIRoute = () => {
  return Response.json(listCourses());
};
