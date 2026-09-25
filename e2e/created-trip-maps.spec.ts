import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page }) => {
  await page.route("https://nominatim.openstreetmap.org/search?**", (route) =>
    route.fulfill({
      contentType: "application/json",
      headers: { "access-control-allow-origin": "*" },
      body: "[]",
    }),
  );
});

test("creates a trip before using imported places and remembers the selected day", async ({
  page,
}) => {
  await page.goto("/trips");
  await page.getByRole("button", { name: "New" }).click();
  const dialog = page.getByRole("dialog", { name: "New trip" });
  await dialog.getByLabel("Destination").fill("Lisbon");
  await dialog.getByLabel("Start date").fill("2027-01-10");
  await dialog.getByLabel("End date").fill("2027-01-11");
  await dialog.getByRole("button", { name: "Create trip" }).click();
  await expect(page).toHaveURL(/\/plan\/trip\//);
  await expect(page.getByRole("heading", { name: "Lisbon" })).toBeVisible();
  await expect(page.getByRole("group", { name: "Trip days" })).toContainText("11");
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
  await expect(page.getByLabel("Destination trip").locator("option:checked")).toContainText(
    "Lisbon",
  );
  await expect(page.getByLabel("Destination day").locator("option:checked")).toHaveText(
    "Sunday, 10 January",
  );
  await page.getByRole("button", { name: "Add to plan", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("Market added to Lisbon");
  await page.reload();
  await page.getByLabel("Search imported places").fill("Market");
  await page
    .getByRole("region", { name: "Search suggestions" })
    .getByRole("button", { name: "Market Unfiled" })
    .click();
  await page.getByRole("button", { name: "Add to plan", exact: true }).click();
  await expect(page.getByLabel("Destination day").locator("option:checked")).toHaveText(
    "Sunday, 10 January",
  );
  await page.goto("/trips");
  await page.getByRole("link", { name: "Open Lisbon trip plan" }).click();
  await expect(page.getByLabel(/Sunday 10 January itinerary/)).toContainText("Market");
  const row = page.locator("[data-plan-stop-id] .timeline__surface").first();
  const box = await row.boundingBox();
  if (!box) {
    throw new Error("Created trip stop is not visible");
  }
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 - 64, box.y + box.height / 2, { steps: 5 });
  await page.mouse.up();
  await page.getByRole("button", { name: "Remove Market from Sunday 10 January" }).click();
  await expect(page.getByText("1 place removed", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Undo" }).click();
  await expect(page.getByLabel(/Sunday 10 January itinerary/)).toContainText("Market");
  await page.getByRole("button", { name: "Edit plan" }).click();
  await page.getByLabel("Time for Market").fill("14:30");
  await page.getByLabel("Note for Market").fill("Meet at the east entrance");
  await page.getByRole("button", { name: "Save Market" }).click();
  await expect(page.getByLabel(/Sunday 10 January itinerary/)).toContainText(
    "Meet at the east entrance",
  );
  await page.reload();
  await expect(page.getByLabel(/Sunday 10 January itinerary/)).toContainText("14:30");
  await expect(page.getByLabel(/Sunday 10 January itinerary/)).toContainText(
    "Meet at the east entrance",
  );
});

test("offers to copy previous Kanto day selections into a newly created Kanto trip", async ({
  page,
}) => {
  await page.goto("/maps");
  await page.getByLabel("Choose KML or KMZ file").setInputFiles({
    name: "old-kanto.kml",
    mimeType: "application/vnd.google-earth.kml+xml",
    buffer: Buffer.from(
      `<kml><Document><Placemark><name>Station</name><Point><coordinates>139.77,35.68</coordinates></Point></Placemark></Document></kml>`,
    ),
  });
  await page.getByRole("button", { name: "Import 1 place, 0 lines and 0 areas" }).click();
  await page.evaluate(async () => {
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open("uroute-imported-places", 2);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error ?? new Error("Could not read import storage"));
    });
    const points = await new Promise<{ id: string }[]>((resolve, reject) => {
      const request = database.transaction("places", "readonly").objectStore("places").getAll();
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error ?? new Error("Could not read import storage"));
    });
    const transaction = database.transaction("visits", "readwrite");
    transaction.objectStore("visits").put({
      id: `2026-09-27:${points[0]!.id}`,
      day: "2026-09-27",
      placeId: points[0]!.id,
      time: "09:30",
      order: 1,
    });
    await new Promise<void>((resolve, reject) => {
      transaction.oncomplete = () => resolve();
      transaction.onerror = () =>
        reject(transaction.error ?? new Error("Could not write legacy visit"));
    });
    database.close();
  });
  await page.goto("/trips");
  await page.getByRole("button", { name: "New" }).click();
  const dialog = page.getByRole("dialog", { name: "New trip" });
  await dialog.getByLabel("Destination").fill("Kanto");
  await dialog.getByLabel("Start date").fill("2026-09-27");
  await dialog.getByLabel("End date").fill("2026-10-01");
  await dialog.getByRole("button", { name: "Create trip" }).click();
  await expect(page).toHaveURL(/\/plan\/trip\//);
  await page.getByRole("button", { name: "Copy to this trip" }).click();
  await expect(page.getByLabel(/Sunday 27 September itinerary/)).toContainText("Station");
  await expect(page.getByLabel(/Sunday 27 September itinerary/)).toContainText("09:30");
  await page.reload();
  await expect(page.getByLabel(/Sunday 27 September itinerary/)).toContainText("Station");
});

test("created trip tabs keep destination and dates instead of Kyoto fixtures", async ({ page }) => {
  await page.goto("/trips");
  await page.getByRole("button", { name: "New" }).click();
  const dialog = page.getByRole("dialog", { name: "New trip" });
  await dialog.getByLabel("Destination").fill("Cape Town");
  await dialog.getByLabel("Start date").fill("2027-02-03");
  await dialog.getByLabel("End date").fill("2027-02-05");
  await dialog.getByRole("button", { name: "Create trip" }).click();
  await page.getByRole("button", { name: "Map view" }).click();
  await expect
    .poll(() =>
      page.evaluate(() => {
        const diagnostics = (
          window as Window & {
            __urouteMapDiagnostics?: () => {
              center: { latitude: number; longitude: number };
              status: string;
            };
          }
        ).__urouteMapDiagnostics?.();

        return diagnostics?.status === "ready" ? diagnostics.center : null;
      }),
    )
    .toEqual({ latitude: 20, longitude: 0 });
  await page.getByRole("button", { name: "Expand map" }).click();
  await expect(page).toHaveURL(/map=full/);
  await page.getByRole("button", { name: "Collapse map" }).click();
  await expect(page).not.toHaveURL(/map=full/);
  await page.goBack();
  await expect(page).toHaveURL(/\/trips$/);
  await page.goForward();
  await page.getByRole("link", { name: "Bookings", exact: true }).click();
  await expect(page).toHaveURL(/\/plan\/trip\/[^/]+\/bookings/);
  await page.getByRole("button", { name: "Add booking" }).click();
  await page
    .getByRole("dialog", { name: "Add booking" })
    .getByRole("button", { name: "Flight" })
    .click();
  await expect(page.getByRole("dialog", { name: "Trip & dates" })).toContainText("Cape Town");
  await expect(page.getByRole("dialog", { name: "Trip & dates" })).toContainText("3 Feb 2027");
  await page.getByRole("button", { name: "Close add booking" }).click();
  await page.getByRole("link", { name: "Expenses", exact: true }).click();
  await expect(page).toHaveURL(/\/plan\/trip\/[^/]+\/expenses/);
  await expect(page.getByRole("heading", { name: "Cape Town" })).toBeVisible();
  await page.getByLabel("Expense currency").selectOption("ZAR");
  await page.getByRole("button", { name: "Add expense" }).click();
  await page.getByRole("textbox", { name: "What was it for?" }).fill("Lunch");
  await page.getByRole("textbox", { name: "Amount" }).fill("12.50");
  await page.getByRole("button", { name: "Add to estimate" }).click();
  await expect(page.getByRole("region", { name: "Trip expense estimate" })).toContainText("12.50");
  await expect(page.getByLabel("Expense currency")).toBeDisabled();
});
