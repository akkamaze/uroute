import { expect, test } from "@playwright/test";

test("creates a trip before using imported places and remembers the selected day", async ({
  page,
}) => {
  await page.goto("/trips");
  await page.getByRole("button", { name: "New" }).click();
  const dialog = page.getByRole("dialog", { name: "New trip" });
  await dialog.getByLabel("Destination").fill("Kanto");
  await dialog.getByLabel("Start date").fill("2027-01-10");
  await dialog.getByLabel("End date").fill("2027-01-11");
  await dialog.getByRole("button", { name: "Create draft trip" }).click();
  const card = page.getByRole("link", { name: /Kanto.*10–11 Jan 2027/ });
  await expect(card).toBeVisible();
  await card.click();
  await expect(page.getByRole("heading", { name: "Kanto" })).toBeVisible();
  await expect(page.getByRole("group", { name: "Trip days" })).toContainText("11");
  await page.getByRole("link", { name: /Add a place/ }).click();
  await page.getByLabel("Choose KML or KMZ file").setInputFiles({
    name: "sample.kml",
    mimeType: "application/vnd.google-earth.kml+xml",
    buffer: Buffer.from(
      `<kml><Document><name>Tokyo map</name><Placemark><name>Market</name><Point><coordinates>139.77,35.68</coordinates></Point></Placemark></Document></kml>`,
    ),
  });
  await page.getByRole("button", { name: "Import 1 place, 0 lines and 0 areas" }).click();
  await page.getByRole("button", { name: "Market" }).click();
  await expect(page.getByRole("button", { name: /Add places to Kanto/ })).toBeVisible();
  await page.getByRole("button", { name: /Add places to Kanto/ }).click();
  await expect(page.getByLabel("Destination trip")).not.toHaveValue("");
  await expect(page.getByLabel("Destination day")).toHaveValue("2027-01-10");
  await page.getByRole("button", { name: /Add to Kanto/ }).click();
  await expect(page.getByRole("status")).toContainText("Market added to Kanto");
  await page.reload();
  await page.getByLabel("Search imported places").fill("Market");
  await page.getByRole("button", { name: "Market" }).click();
  await page.getByRole("button", { name: /Add places to Kanto/ }).click();
  await expect(page.getByLabel("Destination day")).toHaveValue("2027-01-10");
  await page.goto("/trips");
  await page.getByRole("link", { name: /Kanto.*10–11 Jan 2027/ }).click();
  await expect(page.getByLabel(/Sun 10 Jan itinerary/)).toContainText("Market");
  await page.getByRole("button", { name: "Edit plan for Sun 10 Jan" }).click();
  await page.getByLabel("Time for Market").fill("14:30");
  await page.getByLabel("Note for Market").fill("Meet at the east entrance");
  await page.getByRole("button", { name: "Save Market" }).click();
  await expect(page.getByLabel(/Sun 10 Jan itinerary/)).toContainText("Meet at the east entrance");
  await page.reload();
  await expect(page.getByLabel(/Sun 10 Jan itinerary/)).toContainText("14:30");
  await expect(page.getByLabel(/Sun 10 Jan itinerary/)).toContainText("Meet at the east entrance");
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
  await dialog.getByRole("button", { name: "Create draft trip" }).click();
  await page.getByRole("link", { name: /Kanto.*27 Sep–1 Oct 2026/ }).click();
  await page.getByRole("button", { name: "Copy to this trip" }).click();
  await expect(page.getByLabel(/Sun 27 Sep itinerary/)).toContainText("Station");
  await expect(page.getByLabel(/Sun 27 Sep itinerary/)).toContainText("09:30");
  await page.reload();
  await expect(page.getByLabel(/Sun 27 Sep itinerary/)).toContainText("Station");
});
