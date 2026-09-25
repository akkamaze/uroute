import { expect, test } from "@playwright/test";

test("a signed-in traveler explicitly copies one local trip without overwriting account rows", async ({
  page,
}) => {
  const posted: unknown[] = [];
  let accountHasDifferentRows = false;
  let replaced = false;
  await page.route("**/api/auth/get-session", (route) =>
    route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        session: { id: "session-1", userId: "owner-1", expiresAt: "2027-01-01T00:00:00.000Z" },
        user: { id: "owner-1", email: "owner@example.test", name: "Traveler" },
      }),
    }),
  );
  await page.route("**/api/trips", (route) => {
    if (route.request().method() !== "POST") {
      return route.fallback();
    }
    const input: unknown = route.request().postDataJSON();
    posted.push(input);

    return route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({ ...(input as object), version: "1" }),
    });
  });
  await page.route("**/api/trips/*/entries?*", (route) =>
    route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        entries: accountHasDifferentRows ? [{ sourceKey: "other" }] : [],
        tripVersion: "1",
      }),
    }),
  );
  await page.route("**/api/trips/*/entries", (route) => {
    replaced = true;

    return route.fulfill({ contentType: "application/json", body: "{}" });
  });

  await page.goto("/trips");
  await page.getByRole("button", { name: "New" }).click();
  const dialog = page.getByRole("dialog", { name: "New trip" });
  await dialog.getByLabel("Destination").fill("Lisbon");
  await dialog.getByLabel("Start date").fill("2027-01-10");
  await dialog.getByLabel("End date").fill("2027-01-10");
  await dialog.getByRole("button", { name: "Create trip" }).click();
  await page.goto("/trips");
  await page.getByRole("button", { name: "Copy to account" }).click();
  const confirm = page.getByRole("dialog", { name: "Copy Lisbon to your account?" });
  await expect(confirm).toContainText("KML map pins");
  await expect(posted).toHaveLength(0);
  await confirm.getByRole("button", { name: "Copy trip" }).click();
  await expect(page.getByText(/Lisbon and 0 visible itinerary rows copied/)).toBeVisible();
  expect(posted).toHaveLength(1);
  accountHasDifferentRows = true;
  await page.getByRole("button", { name: "Copy to account" }).click();
  await page
    .getByRole("dialog", { name: "Copy Lisbon to your account?" })
    .getByRole("button", { name: "Copy trip" })
    .click();
  await expect(page.getByText(/different itinerary on your account/)).toBeVisible();
  expect(replaced).toBe(false);
});
