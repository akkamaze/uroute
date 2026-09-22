import type { Page } from "@playwright/test";

import { expect, test } from "./fixtures";

const PLAN_STORAGE_KEY = "uroute.mock.kyoto-plan.v1";

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

test("Plan keeps structural editing in the dedicated Manage day page", async ({ page }) => {
  await page.goto("/plan?day=13");

  await expect(page.getByRole("button", { name: /Reorder / })).toHaveCount(0);
  await expect(page.getByRole("checkbox")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Manage Friday, 13 November" })).toBeVisible();

  await page.getByRole("button", { name: "Manage Friday, 13 November" }).click();
  await expect(page).toHaveURL(/\/plan\/manage\?day=13/);
  await expect(page.getByRole("heading", { name: "Manage day" })).toBeVisible();
  await expect(page.locator(".bottom-navigation")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Reorder Kiyomizu-dera" })).toBeVisible();
  await expect(page.locator(".manage-day__icon")).toHaveCount(3);
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
  await expect
    .poll(() =>
      page
        .locator("[data-manage-row-id]")
        .evaluateAll((rows) => rows.map((row) => row.getAttribute("data-manage-row-id"))),
    )
    .toEqual(["arabica", "kiyomizu", "nishiki"]);
  expect(await storedFridayIds(page)).toEqual(original);

  await page.locator(".manage-day__history-actions").getByRole("button", { name: "Undo" }).click();
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

  await page.getByRole("button", { name: "Manage Friday, 13 November" }).click();
  await page.getByRole("button", { name: "Version history" }).click();
  await expect(page.getByRole("heading", { name: "Version history" })).toBeVisible();
  await expect(page.getByText("Reordered places · 3 places")).toBeVisible();
  await expect(page.getByText("Initial plan · 3 places")).toBeVisible();

  const initialVersion = page.locator(".version-entry").filter({ hasText: "Initial plan" });
  await expect(initialVersion.getByRole("button", { name: /Restore version from/ })).toBeVisible();
  await initialVersion.getByRole("button", { name: /View version from/ }).click();
  await expect(page.getByRole("heading", { name: "Version preview" })).toBeVisible();
  await expect(page.getByText("Changes the order", { exact: true })).toBeVisible();
  await expect(page.locator("[data-version-row-id]")).toHaveCount(3);
  await expect
    .poll(() =>
      page
        .locator("[data-version-row-id]")
        .evaluateAll((rows) => rows.map((row) => row.getAttribute("data-version-row-id"))),
    )
    .toEqual(original);
  expect(await storedFridayIds(page)).toEqual(["arabica", "kiyomizu", "nishiki"]);

  await page.getByRole("button", { name: "Restore this version" }).click();
  const previewRestoreDialog = page.getByRole("dialog", { name: "Restore this version?" });
  await expect(previewRestoreDialog).toBeVisible();
  await expect(previewRestoreDialog).toContainText("Plan will not change until you Save");
  await previewRestoreDialog.getByRole("button", { name: "Cancel" }).click();
  await expect(page.getByRole("heading", { name: "Version preview" })).toBeVisible();
  await page.getByRole("button", { name: "History" }).click();
  await page
    .locator(".version-entry")
    .filter({ hasText: "Initial plan" })
    .getByRole("button", { name: /Restore version from/ })
    .click();
  const historyRestoreDialog = page.getByRole("dialog", { name: "Restore this version?" });
  await expect(historyRestoreDialog).toBeVisible();
  expect(await storedFridayIds(page)).toEqual(["arabica", "kiyomizu", "nishiki"]);
  await historyRestoreDialog.getByRole("button", { name: "Restore draft" }).click();
  await expect(page.getByRole("heading", { name: "Manage day" })).toBeVisible();
  await expect
    .poll(() =>
      page
        .locator("[data-manage-row-id]")
        .evaluateAll((rows) => rows.map((row) => row.getAttribute("data-manage-row-id"))),
    )
    .toEqual(original);
  expect(await storedFridayIds(page)).toEqual(["arabica", "kiyomizu", "nishiki"]);
});

test("dragging reorders the draft without writing the saved Plan", async ({ page }) => {
  await page.goto("/plan/manage?day=13");
  const original = await storedFridayIds(page);
  const grip = page.getByRole("button", { name: "Reorder Kiyomizu-dera" });
  await grip.focus();
  await grip.press("Alt+ArrowDown");
  await page.locator(".manage-day__history-actions").getByRole("button", { name: "Undo" }).click();
  await expect(page.locator(".manage-day__notice")).toBeVisible();
  const target = page.locator('[data-manage-row-id="nishiki"]');
  const gripBox = await grip.boundingBox();
  const targetBox = await target.boundingBox();
  if (gripBox === null || targetBox === null) {
    throw new Error("Manage day drag source and target must be visible");
  }

  await page.mouse.move(gripBox.x + gripBox.width / 2, gripBox.y + gripBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(gripBox.x + gripBox.width / 2, targetBox.y + targetBox.height / 2, {
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
  await expect(page.getByText("Kiyomizu-dera moved", { exact: true })).toBeVisible();
  expect(await storedFridayIds(page)).toEqual(original);
});

test("bulk removal changes only the draft and confirms once when saved", async ({ page }) => {
  await page.goto("/plan/manage?day=13");
  const original = await storedFridayIds(page);

  await page.getByRole("button", { name: "Select", exact: true }).click();
  await page.getByRole("checkbox", { name: "Select Kiyomizu-dera" }).click();
  await page.getByRole("checkbox", { name: "Select Nishiki Market" }).click();
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

  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  const leaveDialog = page.getByRole("dialog", { name: "Leave Manage day?" });
  await leaveDialog.getByRole("button", { name: "Keep draft" }).click();
  await expect(page).toHaveURL(/\/plan\?day=13/);
  expect(await storedFridayIds(page)).toEqual(original);

  await page.getByRole("button", { name: "Manage Friday, 13 November" }).click();
  await expect
    .poll(() =>
      page
        .locator("[data-manage-row-id]")
        .evaluateAll((rows) => rows.map((row) => row.getAttribute("data-manage-row-id"))),
    )
    .toEqual(["arabica", "kiyomizu", "nishiki"]);

  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await page
    .getByRole("dialog", { name: "Leave Manage day?" })
    .getByRole("button", { name: "Discard" })
    .click();
  await expect(page).toHaveURL(/\/plan\?day=13/);
  expect(await storedFridayIds(page)).toEqual(original);
});
