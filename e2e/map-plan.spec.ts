import { expect, test, type Page } from "@playwright/test";

const tripId = "7fb9672e-3f50-41f7-99e7-05c2b9030d8f";
const day = "2026-10-01";

async function mockTrip(page: Page): Promise<void> {
  const trip = { id: tripId, name: "Kanto", startDate: day, endDate: "2026-10-02", version: "1" };
  const entries = Array.from({ length: 14 }, (_, index) => ({
    id: `entry-${index}`,
    sourceKey: `entry:${index}`,
    day,
    variant: "A",
    position: index,
    kind: "place",
    title: `Stop ${index}`,
    timeLabel: "09:00",
    detail: "A place to visit during the day",
    area: "Tokyo",
    placeId: `pin-${index}`,
    place: {
      sourceKey: `pin-${index}`,
      name: `Stop ${index}`,
      latitude: 35.68 + index / 1000,
      longitude: 139.76 + index / 1000,
      category: "sightseeing",
      imageUrl: null,
      notes: null,
    },
    visitedAt: null,
  }));
  await page.route("**/api/auth/get-session", (route) =>
    route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        session: { id: "session-1", userId: "owner-1", expiresAt: "2027-01-01T00:00:00.000Z" },
        user: { id: "owner-1", email: "owner@example.test", name: "Traveler" },
      }),
    }),
  );
  await page.route("**/api/trips?*", (route) =>
    route.fulfill({ contentType: "application/json", body: JSON.stringify({ trips: [trip] }) }),
  );
  await page.route(`**/api/trips/${tripId}/plan?*`, (route) => {
    const requested = new URL(route.request().url()).searchParams.get("day");

    return route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        trip,
        version: trip.version,
        entries: requested === day ? entries : [],
      }),
    });
  });
}

test("the Maps plan shows a read-only day plan and returns to the same place", async ({ page }) => {
  await mockTrip(page);
  await page.goto("/maps");
  await page.getByRole("button", { name: "Trip plan" }).click();
  const plan = page.getByRole("region", { name: "Trip plan" });
  const itinerary = plan.getByLabel(/Thursday 1 October itinerary/);
  await expect(itinerary).toContainText("Stop 13");
  await expect(itinerary.getByRole("button", { name: /Stop 0/ })).toBeInViewport();
  await expect(plan.getByRole("button", { name: /Remove/ })).toHaveCount(0);
  await expect(plan.getByRole("group", { name: "Trip days" })).toBeVisible();

  const sheet = page.locator(".imported-page__content");
  await page.getByRole("button", { name: "Expand place details" }).click();
  await itinerary.getByRole("button", { name: /Stop 10/ }).scrollIntoViewIfNeeded();
  await page.waitForTimeout(300);
  const saved = await sheet.evaluate((element) => element.scrollTop);
  expect(saved).toBeGreaterThan(100);

  await itinerary.getByRole("button", { name: /Stop 10/ }).click();
  await expect(page.getByRole("heading", { name: "Stop 10" })).toBeVisible();
  await expect(
    page.getByRole("link", { name: /Directions to Stop 10 in Google Maps/ }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Back to plan" }).click();
  await expect(itinerary).toBeVisible();
  await expect.poll(() => sheet.evaluate((element) => element.scrollTop)).toBe(saved);

  await page.reload();
  await expect(page.getByLabel(/Thursday 1 October itinerary/)).toContainText("Stop 13");
  await expect
    .poll(() => page.locator(".imported-page__content").evaluate((element) => element.scrollTop))
    .toBe(saved);

  await page
    .getByLabel(/Thursday 1 October itinerary/)
    .getByRole("button", { name: /Stop 11/ })
    .click();
  await page.getByRole("button", { name: "Close place details" }).click();
  await expect(page.getByRole("region", { name: "Trip plan" })).toHaveCount(0);
  await page.getByRole("button", { name: "Trip plan" }).click();
  await expect(page.getByLabel(/Thursday 1 October itinerary/)).toContainText("Stop 13");
  await expect
    .poll(() => page.locator(".imported-page__content").evaluate((element) => element.scrollTop))
    .toBe(saved);

  await page.getByRole("button", { name: "Friday 2 October" }).click();
  await expect(page.getByRole("region", { name: "Trip plan" })).toContainText(
    "No plans for this day",
  );
});
