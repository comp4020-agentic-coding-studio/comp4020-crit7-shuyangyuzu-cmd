import { expect, test } from "@playwright/test";

// Real-browser acceptance pass for the whole PLAN.md/CLAUDE.md flow, run
// against an isolated throwaway database (see playwright.config.ts) so it
// never touches a developer's own ./.data/app.db. One long, sequential test
// rather than many independent ones: each step's state (candidates, preview,
// confirmed enrolment) is exactly what the next step needs, the same way a
// real visitor would build it up.
test.describe.configure({ mode: "serial" });

test("full planner flow: search, schedule, multi-section, confirm, refresh, modify, withdraw", async ({ page }) => {
  await test.step("root path is a real entry point, not the starter guestbook", async () => {
    await page.goto("/");
    await expect(page.locator("h1")).toHaveText("ANU course planner (demo)");
    await expect(page.getByText(/Prototype, not an official ANU service/)).toBeVisible();
    await expect(page.locator(".primary-action", { hasText: "Browse courses" })).toBeVisible();
    await expect(page.locator(".primary-action", { hasText: "Open the planner" })).toBeVisible();
    // The old guestbook UI must be fully gone.
    await expect(page.locator("#messages")).toHaveCount(0);
  });

  await test.step("search for a course and add three candidates", async () => {
    await page.locator(".primary-action", { hasText: "Browse courses" }).click();
    await expect(page).toHaveURL(/\/courses\/?$/);

    for (const code of ["COMP1010", "COMP2100", "STAT1008"]) {
      await page.fill("#course-search", code);
      const card = page.locator(`.course-card[data-code="${code.toLowerCase()}"]`);
      await expect(card).toBeVisible();
      await expect(page.locator(".course-card:visible")).toHaveCount(1);
      await card.locator(".candidate-toggle").click();
      await expect(card.locator(".candidate-toggle")).toHaveText("Remove from candidates");
    }
    await page.fill("#course-search", "");
    await expect(page.locator("#candidate-list li")).toHaveCount(3);
  });

  await test.step("manual scheduling: lecture overlap never blocks, tutorial overlap does", async () => {
    await page.getByRole("link", { name: "Planner", exact: true }).click();
    await expect(page).toHaveURL(/\/planner\/?$/);
    await expect(page.locator(".schedule-card")).toHaveCount(3);

    async function openCourse(code: string) {
      const card = page.locator(".schedule-card").filter({ hasText: code });
      // Checking the include-checkbox already auto-expands this card (it's
      // "the course being edited" the moment it enters the preview) — an
      // extra click on .schedule-card-toggle here would collapse it again.
      await card.locator(".preview-include-checkbox").check();
      return card;
    }

    // COMP1010 Tutorial B (Wed) and COMP2100 Tutorial A (Mon) never clash
    // with each other, but both courses' lectures sit at the exact same
    // Monday slot — that lecture-vs-lecture overlap must never block.
    const comp1010 = await openCourse("COMP1010");
    await comp1010.locator(".tutorial-option-row").filter({ hasText: "Wed" }).locator(".tutorial-radio").check();

    const comp2100 = await openCourse("COMP2100");
    await comp2100.locator(".tutorial-option-row").first().locator(".tutorial-radio").check();

    // The weekly grid should now render both lecture blocks (overlapping,
    // never marked as a conflict) — assert no ".conflict" grid block exists
    // yet, since nothing scheduled so far actually clashes.
    await expect(page.locator("#weekly-grid .session-block.conflict")).toHaveCount(0);
    await expect(page.locator("#weekly-grid .session-block.lecture")).not.toHaveCount(0);

    // Now bring in STAT1008: its only tutorial time option unavoidably
    // overlaps both of COMP2100's tutorial options (seed.ts is explicit
    // about this), so this must surface as a *blocking* tutorial clash, and
    // confirming must be refused.
    const stat1008 = await openCourse("STAT1008");
    await stat1008.locator(".tutorial-radio").check();

    // That one time is itself offered in two rooms, so it's "pending room"
    // before it's anything else — pick a room first to get past that reason
    // and reach the tutorial-clash reason underneath it.
    await expect(page.locator("#confirm-blocked-note")).toContainText("more than one room");
    await stat1008.locator(".room-picker .room-radio").first().check();

    await expect(page.locator("#confirm-enrolment-btn")).toBeDisabled();
    await expect(page.locator("#confirm-blocked-note")).toContainText("Tutorial clash");

    // Take STAT1008 back out of the preview for now (candidate list is
    // untouched) so the rest of this flow can confirm a clean plan first.
    await stat1008.locator(".preview-include-checkbox").uncheck();
    await expect(page.locator("#confirm-enrolment-btn")).toBeEnabled();
  });

  await test.step("confirm shows a diff, saves, and survives a refresh", async () => {
    await page.locator("#confirm-enrolment-btn").click();
    await expect(page.locator("#confirm-dialog")).toBeVisible();
    const diff = page.locator("#confirm-dialog-diff");
    await expect(diff.locator(".diff-added")).toContainText("COMP1010");
    await expect(diff.locator(".diff-added")).toContainText("COMP2100");
    await page.locator("#confirm-dialog-confirm").click();
    await expect(page.locator("#confirm-dialog")).toBeHidden();
    await expect(page.locator("#confirm-status")).toHaveText("Enrolment confirmed.");
    await expect(page.locator("#confirmed-list li")).toHaveCount(2);

    await page.reload();
    await expect(page.locator("#confirmed-list li")).toHaveCount(2);
    await expect(page.locator("#confirmed-list")).toContainText("COMP1010");
    await expect(page.locator("#confirmed-list")).toContainText("COMP2100");
  });

  await test.step("multi-section time option stays pending until a room is chosen", async () => {
    // STAT1008 clashed with COMP2100's tutorial above, so drop COMP2100 from
    // the preview (its confirmed enrolment above is untouched — this only
    // edits the client-only preview) to isolate the pending-room behaviour.
    const comp2100 = page.locator(".schedule-card").filter({ hasText: "COMP2100" });
    await comp2100.locator(".preview-include-checkbox").uncheck();

    const stat1008 = page.locator(".schedule-card").filter({ hasText: "STAT1008" });
    // Checking the include-checkbox already auto-expands this card.
    await stat1008.locator(".preview-include-checkbox").check();
    await stat1008.locator(".tutorial-radio").check();

    const roomPicker = stat1008.locator(".room-picker");
    await expect(roomPicker).toBeVisible();
    await expect(roomPicker.locator(".incomplete-note")).toHaveText("Choose a room");
    await expect(page.locator("#confirm-enrolment-btn")).toBeDisabled();
    await expect(page.locator("#confirm-blocked-note")).toContainText("more than one room");

    await roomPicker.locator(".room-radio").first().check();
    await expect(page.locator("#confirm-blocked-note")).toBeHidden();
    await expect(page.locator("#confirm-enrolment-btn")).toBeEnabled();

    // Leave the preview back where it needs to be for the rest of the flow:
    // STAT1008 out again, COMP2100 back in with its previous choice cleared
    // is fine since COMP2100 is still confirmed server-side regardless.
    await stat1008.locator(".preview-include-checkbox").uncheck();
  });

  await test.step("modify a tutorial via edit-in-preview, then confirm the change", async () => {
    await page.locator("#load-confirmed-into-preview-btn").click();
    await expect(page.locator("#load-preview-dialog")).toBeVisible();
    await page.locator("#load-preview-dialog-confirm").click();
    await expect(page.locator("#load-preview-dialog")).toBeHidden();

    const comp2100 = page.locator(".schedule-card").filter({ hasText: "COMP2100" });
    await comp2100.locator(".schedule-card-toggle").click();
    // Switch COMP2100 to its other tutorial option (still no clash with
    // COMP1010's Wednesday tutorial, and STAT1008 is not in this preview).
    const rows = comp2100.locator(".tutorial-option-row");
    await rows.nth(1).locator(".tutorial-radio").check();

    await page.locator("#confirm-enrolment-btn").click();
    await expect(page.locator("#confirm-dialog-diff .diff-changed")).toContainText("COMP2100");
    await page.locator("#confirm-dialog-confirm").click();
    await expect(page.locator("#confirm-dialog")).toBeHidden();
    await expect(page.locator("#confirmed-list li")).toHaveCount(2);
  });

  await test.step("withdraw removes the confirmed enrolment only, never the candidate", async () => {
    const confirmedRow = page.locator("#confirmed-list li").filter({ hasText: "COMP2100" });
    await confirmedRow.locator(".withdraw-course-btn").click();
    await expect(page.locator("#withdraw-dialog")).toBeVisible();
    await page.locator("#withdraw-dialog-confirm").click();
    await expect(page.locator("#withdraw-dialog")).toBeHidden();
    await expect(page.locator("#confirmed-list li")).toHaveCount(1);
    await expect(page.locator("#confirmed-list")).not.toContainText("COMP2100");

    // Still a candidate — withdrawing must never touch the candidate list.
    await page.getByRole("link", { name: "Courses", exact: true }).click();
    await expect(page.locator("#candidate-list li")).toHaveCount(3);
    await expect(page.locator("#candidate-list")).toContainText("COMP2100");
  });
});
