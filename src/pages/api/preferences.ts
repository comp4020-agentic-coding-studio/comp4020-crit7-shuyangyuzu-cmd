import type { APIRoute } from "astro";
import { ValidationError, getPreferences, setPreferences } from "../../lib/db";

export const GET: APIRoute = () => Response.json(getPreferences());

// setPreferences does all the real validation (count in {3,4}, day lists are
// integers 0-6); this route just makes sure the body is JSON at all before
// handing it over.
export const PUT: APIRoute = async ({ request }) => {
  const body = await request.json().catch(() => null);
  if (typeof body !== "object" || body === null) {
    return Response.json({ error: "expected a JSON object" }, { status: 400 });
  }
  try {
    return Response.json(setPreferences(body));
  } catch (err) {
    if (err instanceof ValidationError) return Response.json({ error: err.message }, { status: 400 });
    throw err;
  }
};
