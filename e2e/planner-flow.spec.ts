import { expect, test } from "@playwright/test";

// Real-browser acceptance pass for the whole PLAN.md/CLAUDE.md flow, run
// against an isolated throwaway database (see playwright.config.ts) so it
// never touches a developer's own ./.data/app.db. One long, sequential test
// rather than many independent ones: each step's state (candidates, preview,
// confirmed enrolment) is exactly what the next step needs, the same way a
// real visitor would build it up. This also covers the auto-schedule section
// (both "auto-schedule my current preview" and "generate from candidates"
// modes, viewing a generated plan without mutating the manual preview, and
// Apply updating the preview without ever touching an already-confirmed
// enrolment) — deliberately appended to this same test rather than split into
// a second spec file, since every file under e2e/ shares one running
// server+database per viewport project (see playwright.config.ts): a second
// file racing to add/toggle the same candidate corrupted this file's own
// "add three candidates" step the first time this was tried.
test.describe.configure({ mode: "serial" });

test("full planner flow: search, schedule, multi-section, confirm, refresh, modify, withdraw, auto-schedule", async ({ page }) => {
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

  await test.step("add more candidates for auto-schedule coverage, and lock STAT1008 as required", async () => {
    // Still on /courses/ from the previous step. These four never clash with
    // each other or with STAT1008 on any tutorial option (seed.ts), so a
    // feasible plan built from this pool is guaranteed to exist regardless of
    // which subset the generator ranks first.
    for (const code of ["MATH1013", "PHYS1201", "COMP3120", "COMP4444"]) {
      await page.fill("#course-search", code);
      const card = page.locator(`.course-card[data-code="${code.toLowerCase()}"]`);
      await expect(card).toBeVisible();
      await card.locator(".candidate-toggle").click();
      await expect(card.locator(".candidate-toggle")).toHaveText("Remove from candidates");
    }

    // STAT1008 is the only demo course whose one tutorial time is offered as
    // two same-time sections in different rooms — marking it required
    // guarantees every "generate from candidates" result below includes it,
    // so the pending-section assertions are deterministic. It also always
    // clashes with COMP2100 (already a candidate from the flow above), so
    // requiring STAT1008 has the side effect of guaranteeing COMP2100 is
    // never part of a returned plan — nothing here relies on that, but it's
    // why no assertion below needs to rule COMP2100 out explicitly.
    await page.fill("#course-search", "STAT1008");
    const stat1008Card = page.locator('.course-card[data-code="stat1008"]');
    const requiredCheckbox = stat1008Card.locator(".required-checkbox");
    if (!(await requiredCheckbox.isChecked())) {
      await requiredCheckbox.check();
    }
    await page.fill("#course-search", "");
    await expect(page.locator("#candidate-list li")).toHaveCount(7);
  });

  await test.step("reset the manual preview to empty, and set auto-schedule preferences", async () => {
    await page.getByRole("link", { name: "Planner", exact: true }).click();
    await expect(page).toHaveURL(/\/planner\/?$/);

    // Earlier steps left COMP1010/COMP2100 checked into the preview — the
    // preview lives only in sessionStorage (see planner.astro), so clear it
    // there directly and reload, exactly as a fresh tab would see it. This is
    // simpler and more reliable than unchecking through the UI: unchecking
    // one card re-renders the whole schedule-card list, and this app's own
    // "tick a candidate to auto-expand it" behaviour made a click-driven loop
    // here flaky across re-renders.
    await page.evaluate(() => sessionStorage.removeItem("planner-preview-v1"));
    await page.reload();
    await expect(page.locator("#preview-empty-note")).toBeVisible();

    const checkedBlackout = page.locator(".blackout-day-checkbox:checked");
    while (await checkedBlackout.count()) {
      await checkedBlackout.first().uncheck();
    }
    await page.locator('input[name="desired-count"][value="4"]').check();
    await expect(page.locator("#preferences-status")).toHaveText("Saved.");
  });

  await test.step("generate a plan from candidates: includes the required course, flags its shared timeslot as pending", async () => {
    await page.locator("#generate-from-candidates-btn").click();
    await expect(page.locator("#generate-results")).toBeVisible();
    await expect(page.locator("#generate-results-heading")).toHaveText("Generated plans from your candidates");

    const firstCard = page.locator(".generated-plan-card").first();
    await expect(firstCard).toBeVisible();
    await expect(firstCard).toContainText("STAT1008");
    // The generator must never silently default to one of STAT1008's two
    // same-time sections — it has to say the section is still pending.
    await expect(firstCard).toContainText("(section pending)");
  });

  await test.step("viewing a generated plan never changes the manual preview, and closing leaves it untouched", async () => {
    await expect(page.locator("#preview-empty-note")).toBeVisible();

    await page.locator(".view-plan-btn").first().click();
    await expect(page.locator("#plan-detail-modal")).toBeVisible();
    await expect(page.locator("#plan-detail-pending-note")).toBeVisible();
    await expect(page.locator("#plan-detail-grid .session-block.pending")).not.toHaveCount(0);

    await page.locator("#plan-detail-close").click();
    await expect(page.locator("#plan-detail-modal")).toBeHidden();

    // Still empty — opening/closing the read-only plan view never touched the
    // manual preview above it.
    await expect(page.locator("#preview-empty-note")).toBeVisible();
  });

  await test.step("Apply loads the plan into the preview, but STAT1008's room stays a pending choice rather than a silent default", async () => {
    await page.locator(".apply-plan-btn").first().click();
    await expect(page.locator("#preview-empty-note")).toBeHidden();

    const stat1008 = page.locator(".schedule-card").filter({ hasText: "STAT1008" });
    await expect(stat1008).toContainText("Room pending");
    await expect(page.locator("#confirm-enrolment-btn")).toBeDisabled();
    await expect(page.locator("#confirm-blocked-note")).toContainText("more than one room");
  });

  await test.step("Apply never touched the already-confirmed enrolment", async () => {
    await expect(page.locator("#confirmed-list li")).toHaveCount(1);
    await expect(page.locator("#confirmed-list")).toContainText("COMP1010");
  });

  await test.step("auto-schedule the current preview: keeps the exact same course set, only searches times", async () => {
    const previewCourseIdsBefore = (
      await page
        .locator(".schedule-card .preview-include-checkbox:checked")
        .evaluateAll((els) => els.map((el) => (el as HTMLElement).dataset.courseId))
    ).sort();
    expect(previewCourseIdsBefore.length).toBeGreaterThan(0);

    await page.locator("#generate-preview-times-btn").click();
    await expect(page.locator("#generate-results-heading")).toHaveText("Auto-scheduled tutorial times for your current preview");
    await expect(page.locator(".generated-plan-card").first()).toBeVisible();

    await page.locator(".apply-plan-btn").first().click();
    const previewCourseIdsAfter = (
      await page
        .locator(".schedule-card .preview-include-checkbox:checked")
        .evaluateAll((els) => els.map((el) => (el as HTMLElement).dataset.courseId))
    ).sort();
    expect(previewCourseIdsAfter).toEqual(previewCourseIdsBefore);

    // Confirmed enrolment still untouched by this second Apply too.
    await expect(page.locator("#confirmed-list li")).toHaveCount(1);
    await expect(page.locator("#confirmed-list")).toContainText("COMP1010");
  });
});
