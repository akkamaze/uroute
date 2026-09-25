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
  let accountEntries: unknown[] = [];
  let accountVersion = "1";
  let accountDraft: { baseVersion: string; revision: string; visits: unknown } | null = null;
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
  await page.route("**/api/trips/*", (route) =>
    route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({ version: accountVersion }),
    }),
  );
  await page.route("**/api/trips/*/entries?*", (route) =>
    route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({ entries: accountEntries, tripVersion: accountVersion }),
    }),
  );
  await page.route("**/api/trips/*/entries", (route) => {
    const input: unknown = route.request().postDataJSON();
    if (
      typeof input !== "object" ||
      input === null ||
      !("entries" in input) ||
      !Array.isArray(input.entries)
    ) {
      throw new Error("Expected itinerary entries");
    }
    accountEntries = input.entries;
    accountVersion = String(Number(accountVersion) + 1);

    return route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({ entries: accountEntries, tripVersion: accountVersion }),
    });
  });
  await page.route("**/api/trips/*/drafts/*/*", (route) => {
    if (route.request().method() === "GET") {
      return route.fulfill(
        accountDraft
          ? { contentType: "application/json", body: JSON.stringify(accountDraft) }
          : { status: 404, contentType: "application/json", body: "{}" },
      );
    }
    if (route.request().method() === "DELETE") {
      accountDraft = null;

      return route.fulfill({ contentType: "application/json", body: '{"deleted":true}' });
    }
    const payload: unknown = route.request().postDataJSON();
    if (typeof payload !== "object" || payload === null || !("visits" in payload)) {
      throw new Error("Expected draft object");
    }
    copiedDraft = payload;
    accountDraft = {
      baseVersion: String("baseVersion" in payload ? payload.baseVersion : accountVersion),
      revision: String(Number(accountDraft?.revision ?? "0") + 1),
      visits: payload.visits,
    };

    return route.fulfill({
      contentType: "application/json",
      body: JSON.stringify(accountDraft),
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
  await expect(page.locator(".imported-page__notice")).toContainText("Market added");
  await page.goto("/trips");
  await page.getByRole("link", { name: "Open Lisbon trip plan" }).click();
  await page.getByRole("button", { name: "Edit plan for Sunday 10 January" }).click();
  await page.getByRole("button", { name: "Edit time and note for Market" }).click();
  const details = page.getByRole("dialog", { name: "Market" });
  await details.getByLabel("Visit time").fill("09:45");
  await details.getByLabel("Visit note").fill("Before lunch");
  await details.getByRole("button", { name: "Apply" }).click();
  await page.getByRole("button", { name: "Back to Plan" }).click();
  await expect(page).toHaveURL(/\/plan\/trip\//);
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
  await page.getByRole("link", { name: "Open Lisbon trip plan" }).click();
  await page.getByRole("button", { name: "Edit plan for Sunday 10 January" }).click();
  await page.getByRole("button", { name: "Edit time and note for Market" }).click();
  await page.getByRole("dialog", { name: "Market" }).getByLabel("Visit note").fill("After lunch");
  await page.getByRole("dialog", { name: "Market" }).getByRole("button", { name: "Apply" }).click();
  await expect
    .poll(() => (accountDraft?.visits as Array<{ notes: string }> | undefined)?.[0]?.notes)
    .toBe("After lunch");
  await page.getByRole("button", { name: "Back to Plan" }).click();
  await expect(page).toHaveURL(/\/plan\/trip\//);
  await page.evaluate(() => {
    for (const key of Object.keys(localStorage)) {
      if (key.startsWith("uroute.created-edit-plan.v1.")) {
        localStorage.removeItem(key);
      }
    }
  });
  await page.getByRole("button", { name: "Edit plan for Sunday 10 January" }).click();
  await page.getByRole("button", { name: "Edit time and note for Market" }).click();
  await expect(page.getByRole("dialog", { name: "Market" }).getByLabel("Visit note")).toHaveValue(
    "After lunch",
  );
  await page
    .getByRole("dialog", { name: "Market" })
    .getByRole("button", { name: "Cancel" })
    .click();
  await page.getByRole("button", { name: "Back to Plan" }).click();
  await expect(page).toHaveURL(/\/plan\/trip\//);
  await page.goto("/trips");
  await page.getByRole("button", { name: "Copy to account" }).click();
  await page
    .getByRole("dialog", { name: "Copy Lisbon to your account?" })
    .getByRole("button", { name: "Copy trip" })
    .click();
  await expect(page.getByText(/1 saved draft copied/)).toBeVisible();
  expect(copiedDraft).toMatchObject({ revision: "1", visits: [{ notes: "After lunch" }] });
  expect(accountDraft).toMatchObject({ revision: "2" });
  accountEntries = [];
  accountVersion = "3";
  await page.getByRole("button", { name: "Copy to account" }).click();
  await page
    .getByRole("dialog", { name: "Copy Lisbon to your account?" })
    .getByRole("button", { name: "Copy trip" })
    .click();
  await expect(page.getByText(/different itinerary on your account/)).toBeVisible();
  expect(accountEntries).toHaveLength(0);
  await page.getByRole("link", { name: "Open Lisbon trip plan" }).click();
  await page.getByRole("button", { name: "Edit plan for Sunday 10 January" }).click();
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect.poll(() => accountDraft).toBeNull();
  await page.getByRole("button", { name: "Edit plan for Sunday 10 January" }).click();
  await page.getByRole("button", { name: "Edit time and note for Market" }).click();
  await page.getByRole("dialog", { name: "Market" }).getByLabel("Visit note").fill("Dinner");
  await page.getByRole("dialog", { name: "Market" }).getByRole("button", { name: "Apply" }).click();
  await expect
    .poll(() => (accountDraft?.visits as Array<{ notes: string }> | undefined)?.[0]?.notes)
    .toBe("Dinner");
});
