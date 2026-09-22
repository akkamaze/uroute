import type { Page } from "@playwright/test";

import { expect, test } from "./fixtures";

const PLAN_STORAGE_KEY = "uroute.mock.kyoto-plan.v1";
const VERSIONS_STORAGE_KEY = "uroute.mock.manage-day-versions.v1";

test.beforeEach(async ({ page }) => {
  await page.goto("/plan?day=13");
  await page.evaluate((key) => {
    window.localStorage.clear();
    window.localStorage.setItem(
      key,
      JSON.stringify({
        days: {
          12: [],
          13: [
            { placeId: "kiyomizu", time: "09:00", notes: "" },
            { placeId: "arabica", time: "11:00", notes: "" },
            { placeId: "nishiki", time: "12:30", notes: "" },
          ],
          14: [],
          15: [],
          16: [],
        },
      }),
    );
  }, PLAN_STORAGE_KEY);
  await page.reload();
});

async function storedFridayIds(page: Page): Promise<string[]> {
  return page.evaluate((key) => {
    const stored = JSON.parse(window.localStorage.getItem(key) ?? "{}") as {
      days?: Record<string, Array<{ placeId: string }>>;
    };

    return stored.days?.["13"]?.map((visit) => visit.placeId) ?? [];
  }, PLAN_STORAGE_KEY);
}

test("touch swipe tracks the finger, removes a draft place and supports back navigation", async ({
  page,
}) => {
  await page.goto("/plan/manage?day=13");
  const original = await storedFridayIds(page);
  const client = await page.context().newCDPSession(page);
  async function touch(type: "touchStart" | "touchMove" | "touchEnd", x = 0, y = 0): Promise<void> {
    await client.send("Input.dispatchTouchEvent", {
      type,
      touchPoints: type === "touchEnd" ? [] : [{ x, y, id: 1 }],
    });
  }
  const row = page.locator('[data-manage-row-id="kiyomizu"]');
  const box = await row.boundingBox();
  if (box === null) {
    throw new Error("Expected place row");
  }
  const start = box.x + box.width - 20;
  const y = box.y + box.height / 2;
  await touch("touchStart", start, y);
  for (let dx = 10; dx <= 80; dx += 10) {
    await touch("touchMove", start - dx, y);
  }
  await expect(row).toHaveClass(/row--swiping/);
  await expect
    .poll(() => row.evaluate((element) => new DOMMatrix(getComputedStyle(element).transform).m41))
    .toBeCloseTo(-80, 0);
  await page.waitForTimeout(150);
  await touch("touchEnd");
  await expect
    .poll(() => row.evaluate((element) => new DOMMatrix(getComputedStyle(element).transform).m41))
    .toBe(0);
  await expect(page.locator(".manage-day__swipe-remove")).toHaveCount(0);
  expect(await storedFridayIds(page)).toEqual(original);
  // Deliberate swipes commit in either direction without a reveal stage.
  for (const direction of [-1, 1]) {
    const sx = direction < 0 ? start : 105;
    await touch("touchStart", sx, y);
    for (let dx = 10; dx <= box.width * 0.5; dx += 10) {
      await touch("touchMove", sx + direction * dx, y);
    }
    await page.waitForTimeout(150);
    await touch("touchEnd");
    await expect(row).toHaveCount(0);
    await page.getByRole("button", { name: "Undo", exact: true }).click();
    await expect(row).toBeVisible();
    await expect(page.locator(".manage-day__notice")).toContainText(
      "Undid removal · Kiyomizu-dera restored at #1",
    );
    await expect(page.locator(".manage-day__notice")).toContainText("0 undo steps remaining");
    await expect(page.locator("#manage-day-change-announcement")).toHaveText(
      "Undid removal · Kiyomizu-dera restored at #1 · 0 undo steps remaining",
    );
  }
  // Fast, short flicks must delete in both directions rather than stop at Remove.
  for (const direction of [-1, 1]) {
    const sx = direction < 0 ? start : 105;
    await touch("touchStart", sx, y);
    for (const dx of [40, 80, 120]) {
      await touch("touchMove", sx + direction * dx, y);
    }
    await touch("touchEnd");
    await expect(row).toHaveCount(0);
    await page.getByRole("button", { name: "Undo", exact: true }).click();
    await expect(row).toBeVisible();
    await expect(page.locator(".manage-day__notice")).toContainText(
      "Undid removal · Kiyomizu-dera restored at #1",
    );
    await expect(page.locator(".manage-day__notice")).toContainText("0 undo steps remaining");
  }
  // A real touch drag must remain visible outside its original clipped row.
  const grip = await row.locator(".manage-day__grip").boundingBox();
  const target = await page.locator('[data-manage-row-id="nishiki"]').boundingBox();
  if (!grip || !target) {
    throw new Error("Expected drag geometry");
  }
  const gx = grip.x + grip.width / 2;
  const gy = grip.y + grip.height / 2;
  await touch("touchStart", gx, gy);
  for (let dy = 10; dy <= target.y + target.height * 0.75 - gy; dy += 10) {
    await touch("touchMove", gx, gy + dy);
  }
  await expect(row).toHaveClass(/row--dragging/);
  await expect(row.locator("..")).toHaveCSS("overflow", "visible");
  await expect(row.locator("..")).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
  await touch("touchEnd");
  await expect(page.locator("[data-manage-row-id]").last()).toHaveAttribute(
    "data-manage-row-id",
    "kiyomizu",
  );
  await page.getByRole("button", { name: "Undo", exact: true }).click();
  expect(await storedFridayIds(page)).toEqual(original);
  await touch("touchStart", 30, 180);
  for (let x = 40; x <= 260; x += 20) {
    await touch("touchMove", x, 180);
  }
  await touch("touchEnd");
  await expect(page).toHaveURL(/\/plan\?day=13/);
});

test("Plan keeps structural editing in the dedicated Edit plan page", async ({ page }) => {
  await page.goto("/plan?day=13");

  const planCardGeometry = await page
    .locator(".timeline__stop")
    .first()
    .evaluate((card) => {
      const photo = card.querySelector(".timeline__photo");
      const surface = card.closest(".timeline__surface");
      if (!(photo instanceof HTMLElement) || !(surface instanceof HTMLElement)) {
        throw new Error("Plan card surface and photo must be present");
      }
      const cardRect = card.getBoundingClientRect();
      const photoRect = photo.getBoundingClientRect();

      return {
        borderRadius: getComputedStyle(surface).borderRadius,
        height: cardRect.height,
        photoWidth: photoRect.width,
      };
    });

  await expect(page.getByRole("button", { name: /Reorder / })).toHaveCount(0);
  await expect(page.getByRole("checkbox")).toHaveCount(0);
  await expect(
    page.getByRole("button", { name: "Edit plan for Friday, 13 November" }),
  ).toBeVisible();

  await page.getByRole("button", { name: "Edit plan for Friday, 13 November" }).click();
  await expect(page).toHaveURL(/\/plan\/manage\?day=13/);
  await expect(page.getByRole("heading", { name: "Edit plan" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Back to Plan" })).toBeVisible();
  await expect(page.locator(".bottom-navigation")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Reorder Kiyomizu-dera" })).toBeVisible();
  await expect(page.locator(".manage-day__icon")).toHaveCount(3);
  await expect(page.locator(".manage-day__order")).toHaveText(["1", "2", "3"]);
  const manageCardGeometry = await page
    .locator(".manage-day__row")
    .first()
    .evaluate((card) => {
      const photo = card.querySelector("img");
      const grip = card.querySelector(".manage-day__grip");
      if (!(photo instanceof HTMLElement) || !(grip instanceof HTMLElement)) {
        throw new Error("Edit plan card photo and drag handle must be present");
      }
      const cardRect = card.getBoundingClientRect();
      const photoRect = photo.getBoundingClientRect();
      const gripRect = grip.getBoundingClientRect();

      return {
        geometry: {
          borderRadius: getComputedStyle(card).borderRadius,
          height: cardRect.height,
          photoWidth: photoRect.width,
        },
        photoRightInset: cardRect.right - photoRect.right,
        gripIsBeforePhoto: gripRect.right < photoRect.left,
      };
    });
  expect(manageCardGeometry.geometry).toEqual(planCardGeometry);
  expect(manageCardGeometry.photoRightInset).toBe(8);
  expect(manageCardGeometry.gripIsBeforePhoto).toBe(true);
});

test("reorder stays in an autosaved draft until Save and supports undo and redo", async ({
  page,
}) => {
  await page.goto("/plan/manage?day=13");
  const original = await storedFridayIds(page);
  expect(original).toEqual(["kiyomizu", "arabica", "nishiki"]);

  const grip = page.getByRole("button", { name: "Reorder Kiyomizu-dera" });
  await grip.focus();
  await grip.press("Alt+ArrowDown");
  await grip.press("Alt+ArrowDown");
  await expect
    .poll(() =>
      page
        .locator("[data-manage-row-id]")
        .evaluateAll((rows) => rows.map((row) => row.getAttribute("data-manage-row-id"))),
    )
    .toEqual(["arabica", "nishiki", "kiyomizu"]);
  expect(await storedFridayIds(page)).toEqual(original);

  await page.locator(".manage-day__history-actions").getByRole("button", { name: "Undo" }).click();
  await expect(page.locator(".manage-day__notice")).toContainText(
    "Undid move · Kiyomizu-dera #3 → #2",
  );
  await expect(page.locator(".manage-day__notice")).toContainText("1 undo step remaining");
  await expect(page.locator("#manage-day-change-announcement")).toHaveText(
    "Undid move · Kiyomizu-dera #3 → #2 · 1 undo step remaining",
  );
  await expect
    .poll(() =>
      page
        .locator("[data-manage-row-id]")
        .evaluateAll((rows) => rows.map((row) => row.getAttribute("data-manage-row-id"))),
    )
    .toEqual(["arabica", "kiyomizu", "nishiki"]);
  await page.locator(".manage-day__history-actions").getByRole("button", { name: "Undo" }).click();
  await expect(page.locator(".manage-day__notice")).toContainText(
    "Undid move · Kiyomizu-dera #2 → #1",
  );
  await expect(page.locator(".manage-day__notice")).toContainText("0 undo steps remaining");
  await expect(page.locator("#manage-day-change-announcement")).toHaveText(
    "Undid move · Kiyomizu-dera #2 → #1 · 0 undo steps remaining",
  );
  await expect(page.locator(".manage-day__notice")).toHaveCount(0, { timeout: 3_000 });
  await expect
    .poll(() =>
      page
        .locator("[data-manage-row-id]")
        .evaluateAll((rows) => rows.map((row) => row.getAttribute("data-manage-row-id"))),
    )
    .toEqual(original);
  await page.locator(".manage-day__history-actions").getByRole("button", { name: "Redo" }).click();
  await page.getByRole("button", { name: "Save", exact: true }).click();

  await expect(page).toHaveURL(/\/plan\?day=13/);
  expect(await storedFridayIds(page)).toEqual(["arabica", "kiyomizu", "nishiki"]);

  await page.getByRole("button", { name: "Edit plan for Friday, 13 November" }).click();
  await page.getByRole("button", { name: "Version history" }).click();
  await expect(page.getByRole("heading", { name: "Version history" })).toBeVisible();
  await expect(page.getByText("Reordered places · 3 places")).toBeVisible();
  await expect(page.getByText("Initial plan · 3 places")).toBeVisible();

  const initialVersion = page.locator(".version-entry").filter({ hasText: "Initial plan" });
  await expect(initialVersion.getByRole("button", { name: /Restore version from/ })).toHaveCount(0);
  await initialVersion.getByRole("button", { name: /View version from/ }).click();
  await expect(page.getByRole("heading", { name: "Version details" })).toBeVisible();
  await expect(page.getByText("Order changed", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "All places", pressed: true })).toBeVisible();
  await page.getByRole("button", { name: "Changes only" }).click();
  await expect(page.locator("[data-version-row-id]")).toHaveCount(1);
  await page.getByRole("button", { name: "All places" }).click();
  await expect(page.locator("[data-version-row-id]")).toHaveCount(3);
  await expect
    .poll(() =>
      page
        .locator("[data-version-row-id]")
        .evaluateAll((rows) => rows.map((row) => row.getAttribute("data-version-row-id"))),
    )
    .toEqual(original);
  expect(await storedFridayIds(page)).toEqual(["arabica", "kiyomizu", "nishiki"]);

  await page.getByRole("button", { name: "Restore & save" }).click();
  const previewRestoreDialog = page.getByRole("dialog", {
    name: "Restore and save this version?",
  });
  await expect(previewRestoreDialog).toBeVisible();
  await expect(previewRestoreDialog).toContainText(
    "Your current saved plan will remain in Version history",
  );
  await previewRestoreDialog.getByRole("button", { name: "Cancel" }).click();
  await expect(page.getByRole("heading", { name: "Version details" })).toBeVisible();
  await page.getByRole("button", { name: "Restore & save" }).click();
  expect(await storedFridayIds(page)).toEqual(["arabica", "kiyomizu", "nishiki"]);
  await page
    .getByRole("dialog", { name: "Restore and save this version?" })
    .getByRole("button", { name: "Restore & save" })
    .click();
  await expect(page).toHaveURL(/\/plan\?day=13/);
  await expect(
    page.getByRole("button", { name: "Edit plan for Friday, 13 November" }),
  ).toBeVisible();
  expect(await storedFridayIds(page)).toEqual(original);

  await page.getByRole("button", { name: "Edit plan for Friday, 13 November" }).click();
  await page.getByRole("button", { name: "Version history" }).click();
  await expect(page.getByText(/Restored version from/)).toBeVisible();
  await expect(page.getByText("Before restore · 3 places")).toBeVisible();
});

test("edge swipe returns through Version details, History, Edit plan and Plan", async ({
  page,
}) => {
  await page.evaluate(
    ({ key }) => {
      window.localStorage.setItem(
        key,
        JSON.stringify({
          13: [
            {
              id: "swipe-version",
              savedAt: Date.now() - 60_000,
              summary: "Earlier route",
              visits: [
                { placeId: "nishiki", time: "12:30", notes: "" },
                { placeId: "arabica", time: "11:00", notes: "" },
                { placeId: "kiyomizu", time: "09:00", notes: "" },
              ],
            },
          ],
        }),
      );
    },
    { key: VERSIONS_STORAGE_KEY },
  );
  await page.goto("/plan/manage?day=13&view=versions&version=swipe-version");
  await expect(page.getByRole("heading", { name: "Version details" })).toBeVisible();

  async function swipeBack(): Promise<void> {
    await page.mouse.move(30, 180);
    await page.mouse.down();
    await page.mouse.move(260, 180, { steps: 6 });
    await page.mouse.up();
  }

  await swipeBack();
  await expect(page.getByRole("heading", { name: "Version history" })).toBeVisible();
  await swipeBack();
  await expect(page.getByRole("heading", { name: "Edit plan" })).toBeVisible();
  await swipeBack();
  await expect(page).toHaveURL(/\/plan\?day=13/);
  await expect(
    page.getByRole("button", { name: "Edit plan for Friday, 13 November" }),
  ).toBeVisible();
});

test("dragging reorders the draft without writing the saved Plan", async ({ page }) => {
  await page.goto("/plan/manage?day=13");
  const original = await storedFridayIds(page);
  const grip = page.getByRole("button", { name: "Reorder Kiyomizu-dera" });
  await grip.focus();
  await grip.press("Alt+ArrowDown");
  await page.locator(".manage-day__history-actions").getByRole("button", { name: "Undo" }).click();
  await expect(page.locator(".manage-day__notice")).toContainText(
    "Undid move · Kiyomizu-dera #2 → #1",
  );
  await expect(page.locator(".manage-day__notice")).toContainText("0 undo steps remaining");
  await expect(page.locator("#manage-day-change-announcement")).toHaveText(
    "Undid move · Kiyomizu-dera #2 → #1 · 0 undo steps remaining",
  );
  const target = page.locator('[data-manage-row-id="nishiki"]');
  const gripBox = await grip.boundingBox();
  const targetBox = await target.boundingBox();
  if (gripBox === null || targetBox === null) {
    throw new Error("Manage day drag source and target must be visible");
  }

  await page.mouse.move(gripBox.x + gripBox.width / 2, gripBox.y + gripBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(gripBox.x + gripBox.width / 2, targetBox.y + targetBox.height * 0.75, {
    steps: 6,
  });
  const draggingRow = page.locator(".manage-day__row--dragging");
  await expect(draggingRow).toBeVisible();
  await expect
    .poll(() =>
      draggingRow.evaluate((row) =>
        getComputedStyle(row).getPropertyValue("--manage-drag-offset-y").trim(),
      ),
    )
    .not.toBe("0px");
  await expect(page.locator(".manage-day__cancel-move")).toBeVisible();
  await expect(page.locator(".manage-day__notice")).toHaveCount(0);
  await expect
    .poll(() =>
      page
        .locator("[data-manage-row-id]")
        .evaluateAll((rows) => rows.map((row) => row.getAttribute("data-manage-row-id"))),
    )
    .toEqual(["arabica", "nishiki", "kiyomizu"]);
  expect(await storedFridayIds(page)).toEqual(original);

  await page.mouse.up();
  await expect(page.locator(".manage-day__notice")).toHaveCount(0);
  await expect(page.locator("#manage-day-change-announcement")).toHaveText("Kiyomizu-dera moved");
  await expect(page.locator(".manage-day__order")).toHaveText(["1", "2", "3"]);
  await expect(
    page.locator(".manage-day__history-actions").getByRole("button", { name: "Undo" }),
  ).toBeEnabled();
  expect(await storedFridayIds(page)).toEqual(original);
});

test("Cancel move restores the original draft order without enabling Save", async ({ page }) => {
  await page.goto("/plan/manage?day=13");
  async function layout(): Promise<unknown> {
    return page.locator(".manage-day").evaluate((surface) =>
      [
        ".manage-day__app-bar",
        ".manage-day__context",
        ".manage-day__section-heading",
        ".manage-day__list",
        ".manage-day__versions-link",
      ].map((selector) => {
        const rect = surface.querySelector(selector)!.getBoundingClientRect();

        return { selector, top: rect.top, height: rect.height, width: rect.width };
      }),
    );
  }
  const restingLayout = await layout();
  const restingRows = await page.locator("[data-manage-row-id]").evaluateAll((rows) =>
    rows
      .map((row) => ({
        id: row.getAttribute("data-manage-row-id"),
        height: Math.round(row.getBoundingClientRect().height * 100) / 100,
      }))
      .sort((a, b) => (a.id ?? "").localeCompare(b.id ?? "")),
  );
  const original = await storedFridayIds(page);
  const originalDraftOrder = await page
    .locator("[data-manage-row-id]")
    .evaluateAll((rows) => rows.map((row) => row.getAttribute("data-manage-row-id")));
  const grip = page.getByRole("button", { name: "Reorder Kiyomizu-dera" });
  const target = page.locator('[data-manage-row-id="nishiki"]');
  const gripBox = await grip.boundingBox();
  const targetBox = await target.boundingBox();
  if (gripBox === null || targetBox === null) {
    throw new Error("Manage day cancel drag source and target must be visible");
  }

  await page.mouse.move(gripBox.x + gripBox.width / 2, gripBox.y + gripBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(gripBox.x + gripBox.width / 2, targetBox.y + targetBox.height * 0.75, {
    steps: 6,
  });
  await expect(page.locator(".manage-day__cancel-move")).toBeVisible();
  const cancelBox = await page.locator(".manage-day__cancel-move").boundingBox();
  if (cancelBox === null) {
    throw new Error("Cancel move target must be visible");
  }
  const previewOrder = await page
    .locator("[data-manage-row-id]")
    .evaluateAll((rows) => rows.map((row) => row.getAttribute("data-manage-row-id")));
  await page.mouse.move(cancelBox.x + cancelBox.width / 2, cancelBox.y + cancelBox.height / 2, {
    steps: 4,
  });
  await expect(page.locator(".manage-day__cancel-move--active")).toBeVisible();
  expect(
    await page
      .locator("[data-manage-row-id]")
      .evaluateAll((rows) => rows.map((row) => row.getAttribute("data-manage-row-id"))),
  ).toEqual(previewOrder);
  expect(await layout()).toEqual(restingLayout);
  expect(
    await page.locator("[data-manage-row-id]").evaluateAll((rows) =>
      rows
        .map((row) => ({
          id: row.getAttribute("data-manage-row-id"),
          height: Math.round(row.getBoundingClientRect().height * 100) / 100,
        }))
        .sort((a, b) => (a.id ?? "").localeCompare(b.id ?? "")),
    ),
  ).toEqual(restingRows);
  const dragged = page.locator('[data-manage-row-id="kiyomizu"]');
  const cancelX = cancelBox.x + cancelBox.width / 2;
  const cancelY = cancelBox.y + cancelBox.height / 2;
  async function expectUnderPointer(y: number): Promise<void> {
    await expect
      .poll(async () => {
        const rect = await dragged.boundingBox();

        return rect === null ? Infinity : Math.abs(rect.y + rect.height / 2 - y);
      })
      .toBeLessThan(3);
  }
  await expectUnderPointer(cancelY);
  // Small moves within Cancel must not repeatedly reset the dragged card's layout.
  await page.mouse.move(cancelX, cancelY + 3);
  await expectUnderPointer(cancelY + 3);
  expect(await layout()).toEqual(restingLayout);
  // Leaving and re-entering Cancel keeps the card attached to the pointer.
  await page.mouse.move(gripBox.x + gripBox.width / 2, targetBox.y + targetBox.height * 0.75, {
    steps: 4,
  });
  await expect(page.locator(".manage-day__cancel-move--active")).toHaveCount(0);
  await expectUnderPointer(targetBox.y + targetBox.height * 0.75);
  await page.mouse.move(cancelX, cancelY, { steps: 4 });
  await expectUnderPointer(cancelY);
  await page.mouse.up();
  expect(await layout()).toEqual(restingLayout);

  await expect
    .poll(() =>
      page
        .locator("[data-manage-row-id]")
        .evaluateAll((rows) => rows.map((row) => row.getAttribute("data-manage-row-id"))),
    )
    .toEqual(originalDraftOrder);
  await expect(page.locator(".manage-day__notice")).toHaveCount(0);
  await expect(page.locator("#manage-day-change-announcement")).toHaveText("Move cancelled");
  await expect(page.getByRole("button", { name: "Save", exact: true })).toBeDisabled();
  expect(await storedFridayIds(page)).toEqual(original);
});

test("bulk removal changes only the draft and confirms once when saved", async ({ page }) => {
  await page.goto("/plan/manage?day=13");
  const original = await storedFridayIds(page);
  const restingHeight = await page
    .locator(".manage-day__row")
    .first()
    .evaluate((row) => row.getBoundingClientRect().height);

  await page.getByRole("button", { name: "Remove", exact: true }).click();
  await expect(page.getByRole("heading", { name: "Edit plan" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Cancel", exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Select all" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Save", exact: true })).toBeDisabled();
  const selectionHeight = await page
    .locator(".manage-day__row")
    .first()
    .evaluate((row) => row.getBoundingClientRect().height);
  expect(selectionHeight).toBe(restingHeight);
  await page.getByRole("checkbox", { name: "Mark Kiyomizu-dera for removal" }).click();
  await page.getByRole("checkbox", { name: "Mark Nishiki Market for removal" }).click();
  await page.getByRole("button", { name: "Remove 2 places", exact: true }).click();

  await expect(page.locator("[data-manage-row-id]")).toHaveCount(1);
  expect(await storedFridayIds(page)).toEqual(original);
  await page.getByRole("button", { name: "Save", exact: true }).click();

  const dialog = page.getByRole("dialog", { name: "Save changes?" });
  await expect(dialog).toBeVisible();
  await expect(dialog).toContainText("2 places will be removed");
  await dialog.getByRole("button", { name: "Save changes" }).click();

  await expect(page).toHaveURL(/\/plan\?day=13/);
  expect(await storedFridayIds(page)).toEqual(["arabica"]);
});

test("Cancel can keep an autosaved draft or discard it without changing Plan", async ({ page }) => {
  await page.goto("/plan/manage?day=13");
  const original = await storedFridayIds(page);
  const grip = page.getByRole("button", { name: "Reorder Kiyomizu-dera" });
  await grip.focus();
  await grip.press("Alt+ArrowDown");

  await page.getByRole("button", { name: "Back to Plan" }).click();
  const leaveDialog = page.getByRole("dialog", { name: "Leave Edit plan?" });
  await leaveDialog.getByRole("button", { name: "Keep draft" }).click();
  await expect(page).toHaveURL(/\/plan\?day=13/);
  expect(await storedFridayIds(page)).toEqual(original);

  await page.getByRole("button", { name: "Edit plan for Friday, 13 November" }).click();
  await expect
    .poll(() =>
      page
        .locator("[data-manage-row-id]")
        .evaluateAll((rows) => rows.map((row) => row.getAttribute("data-manage-row-id"))),
    )
    .toEqual(["arabica", "kiyomizu", "nishiki"]);

  await page.getByRole("button", { name: "Back to Plan" }).click();
  await page
    .getByRole("dialog", { name: "Leave Edit plan?" })
    .getByRole("button", { name: "Discard" })
    .click();
  await expect(page).toHaveURL(/\/plan\?day=13/);
  expect(await storedFridayIds(page)).toEqual(original);
});
