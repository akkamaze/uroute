import { expect, test } from "@playwright/test";

function isoDate(daysFromToday: number): string {
  const date = new Date();
  date.setUTCDate(date.getUTCDate() + daysFromToday);

  return date.toISOString().slice(0, 10);
}

async function createTrip(
  page: import("@playwright/test").Page,
  name: string,
  startDate: string,
  endDate: string,
): Promise<void> {
  await page.goto("/trips");
  await page.getByRole("button", { name: "New" }).click();
  const dialog = page.getByRole("dialog", { name: "New trip" });
  await dialog.getByLabel("Destination").fill(name);
  await dialog.getByLabel("Start date").fill(startDate);
  await dialog.getByLabel("End date").fill(endDate);
  await dialog.getByRole("button", { name: "Create trip" }).click();
  await expect(page.getByRole("heading", { name })).toBeVisible();
}

test("the nearest upcoming created trip owns the large banner", async ({ page }) => {
  await createTrip(page, "Later trip", isoDate(30), isoDate(34));
  await createTrip(page, "Next trip", isoDate(5), isoDate(9));
  await page.goto("/trips");

  await expect(page.locator(".featured-trip")).toContainText("Next trip");
  await expect(page.locator(".created-compact-trip")).toContainText("Later trip");
  await expect(page.locator(".created-compact-trip .compact-trip__placeholder")).toBeVisible();
});
