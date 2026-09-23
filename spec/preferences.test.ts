import { describe, expect, inject, it } from "vitest";

const baseUrl = inject("baseUrl");

const put = (body: unknown) =>
  fetch(new URL("/api/preferences", baseUrl), {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });

describe("preferences", () => {
  it("has a sensible default before anything is saved", async () => {
    const res = await fetch(new URL("/api/preferences", baseUrl));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect([3, 4]).toContain(body.desiredCourseCount);
    expect(Array.isArray(body.blackoutDays)).toBe(true);
  });

  it("saves a valid set of preferences, deduping and sorting day lists, and reads it back unchanged", async () => {
    const res = await put({
      desiredCourseCount: 4,
      blackoutDays: [5, 2, 5],
      softPreferences: { minimizeDaysOnCampus: true, avoidDays: [0] },
    });
    expect(res.status).toBe(200);
    const saved = await res.json();
    expect(saved).toEqual({
      desiredCourseCount: 4,
      blackoutDays: [2, 5],
      softPreferences: { minimizeDaysOnCampus: true, avoidDays: [0] },
    });

    const reread = await fetch(new URL("/api/preferences", baseUrl)).then((r) => r.json());
    expect(reread).toEqual(saved);
  });

  it("rejects a course count that isn't 3 or 4", async () => {
    const res = await put({ desiredCourseCount: 5, blackoutDays: [], softPreferences: {} });
    expect(res.status).toBe(400);
  });

  it("rejects a blackout day outside 0-6", async () => {
    const res = await put({ desiredCourseCount: 3, blackoutDays: [7], softPreferences: {} });
    expect(res.status).toBe(400);
  });

  it("rejects a non-array blackoutDays", async () => {
    const res = await put({ desiredCourseCount: 3, blackoutDays: "Monday", softPreferences: {} });
    expect(res.status).toBe(400);
  });

  it("rejects a body that isn't a JSON object", async () => {
    const res = await fetch(new URL("/api/preferences", baseUrl), {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: "not json",
    });
    expect(res.status).toBe(400);
  });
});
