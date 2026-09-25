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
  expect(posted).toHaveLength(0);
  await confirm.getByRole("button", { name: "Copy trip" }).click();
  await expect(
    page.getByText(/Lisbon, 0 visible itinerary rows and 0 saved drafts copied/),
  ).toBeVisible();
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

test("account import includes the current unsaved Edit Plan draft", async ({ page }) => {
  let copiedDraft: {
    baseVersion?: string;
    revision?: string | null;
    visits?: Array<{ time: string; notes: string }>;
  } | null = null;
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
    const input: unknown = route.request().postDataJSON();
    if (typeof input !== "object" || input === null) {
      throw new Error("Expected trip object");
    }

    return route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({ ...input, version: "1" }),
    });
  });
  await page.route("**/api/trips/*/entries?*", (route) =>
    route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({ entries: [], tripVersion: "1" }),
    }),
  );
  await page.route("**/api/trips/*/entries", (route) =>
    route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({ entries: [], tripVersion: "2" }),
    }),
  );
  await page.route("**/api/trips/*/drafts/*/*", (route) => {
    if (route.request().method() === "GET") {
      return route.fulfill({ status: 404, contentType: "application/json", body: "{}" });
    }
    const payload: unknown = route.request().postDataJSON();
    if (typeof payload !== "object" || payload === null) {
      throw new Error("Expected draft object");
    }
    copiedDraft = payload;

    return route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({ revision: "1" }),
    });
  });

  await page.goto("/trips");
  await page.getByRole("button", { name: "New" }).click();
  const dialog = page.getByRole("dialog", { name: "New trip" });
  await dialog.getByLabel("Destination").fill("Lisbon");
  await dialog.getByLabel("Start date").fill("2027-01-10");
  await dialog.getByLabel("End date").fill("2027-01-10");
  await dialog.getByRole("button", { name: "Create trip" }).click();
  await page.getByRole("button", { name: /Add a place/ }).click();
  await page.getByLabel("Choose KML or KMZ file").setInputFiles({
    name: "sample.kml",
    mimeType: "application/vnd.google-earth.kml+xml",
    buffer: Buffer.from(
      `<kml><Document><name>Lisbon map</name><Placemark><name>Market</name><Point><coordinates>-9.1393,38.7223</coordinates></Point></Placemark></Document></kml>`,
    ),
  });
  await page.getByRole("button", { name: "Import 1 place, 0 lines and 0 areas" }).click();
  await page.getByRole("button", { name: "Market" }).click();
  await page.getByRole("button", { name: "Add to plan", exact: true }).click();
  await page.getByRole("button", { name: "Add to plan", exact: true }).click();
  await page.goto("/trips");
  await page.getByRole("link", { name: "Open Lisbon trip plan" }).click();
  await page.getByRole("button", { name: "Edit plan for Sunday 10 January" }).click();
  await page.getByRole("button", { name: "Edit time and note for Market" }).click();
  const details = page.getByRole("dialog", { name: "Market" });
  await details.getByLabel("Visit time").fill("09:45");
  await details.getByLabel("Visit note").fill("Before lunch");
  await details.getByRole("button", { name: "Apply" }).click();
  await page.getByRole("button", { name: "Back to Plan" }).click();
  await page.goto("/trips");
  await page.getByRole("button", { name: "Copy to account" }).click();
  await page
    .getByRole("dialog", { name: "Copy Lisbon to your account?" })
    .getByRole("button", { name: "Copy trip" })
    .click();
  await expect(page.getByText(/1 saved draft copied/)).toBeVisible();
  expect(copiedDraft).toMatchObject({
    baseVersion: "2",
    revision: null,
    visits: [{ time: "09:45", notes: "Before lunch" }],
  });
});
