import { expect, test } from "./fixtures";

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
  const section = page.getByRole("region", { name: "Visit notes" });
  await section.scrollIntoViewIfNeeded();
  await expect(section.getByRole("heading", { name: "Notes" })).toBeVisible();
  await expect(page.getByText("Edit visit details", { exact: true })).toHaveCount(0);
  await expect(page.locator('input[type="time"]')).toHaveCount(0);
  await expect(section.getByRole("textbox")).toHaveCount(0);

  await section.getByRole("button", { name: "Add note", exact: true }).click();
  const editor = section.getByRole("textbox", { name: "Notes", exact: true });
  await expect(editor).toBeFocused();
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
  await expect(section.getByRole("textbox")).toHaveCount(0);
  await expect(section).toContainText("Try the fresh mochi.");
  await expect(section.getByRole("button", { name: "Edit notes", exact: true })).toBeFocused();

  await section.getByRole("button", { name: /Sat.*14 Nov/ }).click();
  await expect(section).toContainText("Buy souvenirs");
  await section.getByRole("button", { name: "Edit notes", exact: true }).click();
  await editor.fill("An unsaved change");
  await section.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(section).toContainText("Buy souvenirs");
  await expect(section).not.toContainText("An unsaved change");
  await section.getByRole("button", { name: "Edit notes", exact: true }).click();
  await editor.fill("Meet at the east entrance.");
  await section.getByRole("button", { name: "Save note", exact: true }).click();
  await section.getByRole("button", { name: /Fri.*13 Nov/ }).click();
  await expect(section).toContainText("Try the fresh mochi.");

  await page.reload();
  await page.getByRole("button", { name: "Expand place details" }).click();
  await section.scrollIntoViewIfNeeded();
  await expect(section).toContainText("Try the fresh mochi.");
  await section.getByRole("button", { name: /Sat.*14 Nov/ }).click();
  await expect(section).toContainText("Meet at the east entrance.");
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
  const section = page.getByRole("region", { name: "Visit notes" });
  await section.scrollIntoViewIfNeeded();
  await expect(section.getByRole("textbox")).toHaveCount(0);
  await section.getByRole("button", { name: "Plan a visit", exact: true }).click();
  await expect(page).toHaveURL(/add=open/);
});
