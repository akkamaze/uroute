import { expect, test } from "./fixtures";

test.beforeEach(async ({ page }) => {
  await page.route("**/api/auth/get-session", (route) =>
    route.fulfill({ contentType: "application/json", body: "null" }),
  );
  await page.addInitScript(() => localStorage.setItem("uroute.app-mode.v1", "mock"));
});

test("reads and edits notes independently for each visit day without changing times", async ({
  page,
}) => {
  await page.addInitScript(() => {
    if (localStorage.getItem("uroute.mock.kyoto-plan.v1") === null) {
      localStorage.setItem(
        "uroute.mock.kyoto-plan.v1",
        JSON.stringify({
          days: {
            14: [{ placeId: "nishiki", time: "15:15", notes: "Buy souvenirs" }],
          },
        }),
      );
    }
  });
  await page.goto("/places?place=nishiki&day=13");
  await page.getByRole("button", { name: "Expand place details" }).click();
  const sheet = page.getByRole("region", { name: "Place details" });
  const content = sheet.locator(".place-sheet__content");
  const section = page.getByRole("region", { name: "Visit description" });
  await section.scrollIntoViewIfNeeded();
  await expect(section.getByRole("heading", { name: "Notes" })).toHaveCount(0);
  await expect(section.getByRole("group", { name: "Note day" })).toHaveCount(0);
  await expect(page.getByText("Edit visit details", { exact: true })).toHaveCount(0);
  await expect(page.locator('input[type="time"]')).toHaveCount(0);
  await expect(section.getByRole("textbox")).toHaveCount(0);
  await expect(section).not.toContainText("Buy souvenirs");
  const sheetTopBefore = await sheet.evaluate((element) => element.getBoundingClientRect().top);
  const scrollBefore = await content.evaluate((element) => element.scrollTop);

  await section.getByRole("button", { name: "Add note for Friday, 13 November" }).click();
  await expect(page).toHaveURL(/note=open/);
  await expect(section.getByRole("heading", { name: "Edit note" })).toBeVisible();
  const editor = section.getByRole("textbox");
  await expect(editor).toHaveAccessibleName("Note for Friday, 13 November");
  await expect(editor).toBeFocused();
  const editorBox = await editor.boundingBox();
  expect(editorBox).not.toBeNull();
  expect(editorBox?.x).toBeGreaterThanOrEqual(0);
  expect((editorBox?.x ?? 0) + (editorBox?.width ?? 0)).toBeLessThanOrEqual(
    page.viewportSize()?.width ?? 0,
  );
  await editor.fill("Try the fresh mochi.\nBring cash for small stalls.");
  await expect
    .poll(async () => {
      const box = await editor.boundingBox();

      return (
        box !== null && box.y >= 72 && box.y + box.height <= (page.viewportSize()?.height ?? 0)
      );
    })
    .toBe(true);
  await section.getByRole("button", { name: "Save note", exact: true }).click();
  await expect(page).not.toHaveURL(/note=open/);
  await expect(section.getByRole("heading", { name: "Edit note" })).toHaveCount(0);
  await expect(page.getByRole("status")).toHaveText("Saved");
  await expect(section.getByRole("textbox")).toHaveCount(0);
  await expect(section).toContainText("Try the fresh mochi.");
  await expect(sheet).toHaveAttribute("data-snap", "expanded");
  expect(await sheet.evaluate((element) => element.getBoundingClientRect().top)).toBeCloseTo(
    sheetTopBefore,
    0,
  );
  await expect
    .poll(() => content.evaluate((element) => element.scrollTop))
    .toBeCloseTo(scrollBefore, 0);
  await expect(
    section.getByRole("button", { name: "Edit note for Friday, 13 November" }),
  ).toBeFocused();

  await page.goto("/places?place=nishiki&day=14");
  await page.getByRole("button", { name: "Expand place details" }).click();
  await section.scrollIntoViewIfNeeded();
  await expect(section).toContainText("Buy souvenirs");
  await section.getByRole("button", { name: "Edit note for Saturday, 14 November" }).click();
  await editor.fill("An unsaved change");
  await section.getByRole("button", { name: "Back to place details" }).click();
  await expect(page).not.toHaveURL(/note=open/);
  const saturdayCard = section.getByRole("button", {
    name: "Edit note for Saturday, 14 November",
  });
  await expect(saturdayCard).toContainText("Buy souvenirs");
  await expect(saturdayCard).not.toContainText("An unsaved change");
  await saturdayCard.click();
  await editor.fill("Meet at the east entrance.");
  await section.getByRole("button", { name: "Save note", exact: true }).click();

  await page.goto("/places?place=nishiki&day=13");
  await page.getByRole("button", { name: "Expand place details" }).click();
  await section.scrollIntoViewIfNeeded();
  await expect(section).toContainText("Try the fresh mochi.");

  await page.reload();
  await page.getByRole("button", { name: "Expand place details" }).click();
  await section.scrollIntoViewIfNeeded();
  await expect(section).toContainText("Try the fresh mochi.");
  const visits = await page.evaluate(() => {
    const stored = JSON.parse(localStorage.getItem("uroute.mock.kyoto-plan.v1") ?? "{}") as {
      days: Record<string, { placeId: string; time: string; notes: string }[]>;
    };

    return [
      stored.days["13"]?.find((visit) => visit.placeId === "nishiki"),
      stored.days["14"]?.[0],
    ];
  });
  expect(visits).toEqual([
    {
      placeId: "nishiki",
      time: "12:30",
      notes: "Try the fresh mochi.\nBring cash for small stalls.",
    },
    { placeId: "nishiki", time: "15:15", notes: "Meet at the east entrance." },
  ]);
});

test("offers a quiet planning state when the place has no visit", async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("uroute.mock.kyoto-plan.v1", JSON.stringify({ days: { 13: [] } }));
  });
  await page.goto("/places?place=nishiki&day=13");
  await page.getByRole("button", { name: "Expand place details" }).click();
  const section = page.getByRole("region", { name: "Visit description" });
  await section.scrollIntoViewIfNeeded();
  await expect(section.getByRole("textbox")).toHaveCount(0);
  await section.getByRole("button", { name: "Plan a visit to add a note" }).click();
  await expect(page).toHaveURL(/add=open/);
});
