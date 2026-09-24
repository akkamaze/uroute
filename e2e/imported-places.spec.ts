import { expect, test } from "@playwright/test";

const sample = `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2"><Document><Folder><name>Tokyo</name>
<Placemark><name>Market</name><description><![CDATA[<b>Visit</b> for lunch]]></description><Point><coordinates>139.770,35.680</coordinates></Point></Placemark>
<Placemark><name>Bridge</name><Point><coordinates>139.771,35.681</coordinates></Point></Placemark>
<Placemark><name>River path</name><LineString><coordinates>139.770,35.680 139.771,35.681</coordinates></LineString></Placemark>
</Folder></Document></kml>`;

test.beforeEach(async ({ page }) => {
  await page.route("https://nominatim.openstreetmap.org/search?**", (route) =>
    route.fulfill({
      contentType: "application/json",
      headers: { "access-control-allow-origin": "*" },
      body: "[]",
    }),
  );
});

test("opens the mobile file picker on first tap and accepts the same file again", async ({
  page,
}) => {
  const file = {
    name: "sample.kml",
    mimeType: "application/vnd.google-earth.kml+xml",
    buffer: Buffer.from(sample),
  };
  await page.goto("/maps");
  for (let attempt = 0; attempt < 2; attempt += 1) {
    const picker = page.waitForEvent("filechooser");
    if (attempt === 0) {
      await page.locator(".imported-page__import-button").tap();
    } else {
      await page.getByText("Choose a file", { exact: true }).tap();
    }
    await (await picker).setFiles(file);
    const review = page.getByRole("region", { name: "Import review" });
    await expect(review).toContainText("2 points · 1 line · 0 areas");
    await review.getByRole("button", { name: "Cancel" }).click();
  }
});

test("shows the animated white uroute mark while map tiles load", async ({ page }) => {
  await page.route("https://tile.openstreetmap.org/**", async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 1_500));
    await route.fulfill({
      path: "apps/mobile/public/images/kyoto.png",
      contentType: "image/png",
    });
  });
  await page.goto("/maps");
  await page.getByLabel("Choose KML or KMZ file").setInputFiles({
    name: "sample.kml",
    mimeType: "application/vnd.google-earth.kml+xml",
    buffer: Buffer.from(sample),
  });
  await page.getByRole("button", { name: "Import 2 places, 1 line and 0 areas" }).click();
  const loader = page.getByRole("status", { name: "Loading map" });
  await expect(loader).toBeVisible();
  await expect(loader.locator(".animated-brand-mark__route")).toHaveCSS(
    "animation-name",
    "map-route-loop",
  );
  await expect(loader).toBeHidden({ timeout: 15_000 });
});

test("shows KML photos in a swipeable gallery and on the map marker", async ({ page }) => {
  let osmRequests = 0;
  await page.route("https://nominatim.openstreetmap.org/search?**", (route) => {
    osmRequests += 1;

    return route.abort();
  });
  await page.route("**/_kml_images/**", (route) =>
    route.fulfill({
      path: "apps/mobile/public/images/kyoto.png",
      contentType: "image/png",
    }),
  );
  const photos = ["a", "b", "c", "d", "e"].map(
    (name) => `https://mymaps.usercontent.google.com/hostedimage/${name}.jpg`,
  );
  const photoKml = `<kml><Document><Placemark><name>Photo Stop</name>
<description><![CDATA[<img src="${photos[0]}">]]></description>
<ExtendedData><Data name="gx_media_links"><value>${photos.slice(1).join(" ")}</value></Data></ExtendedData>
<Point><coordinates>139.770,35.680</coordinates></Point>
</Placemark></Document></kml>`;
  await page.goto("/maps");
  await page.getByLabel("Choose KML or KMZ file").setInputFiles({
    name: "photos.kml",
    mimeType: "application/vnd.google-earth.kml+xml",
    buffer: Buffer.from(photoKml),
  });
  await page.getByRole("button", { name: "Import 1 place, 0 lines and 0 areas" }).click();
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (
            window as Window & {
              __urouteMapDiagnostics?: () => { renderedPhotoIds: string[] };
            }
          ).__urouteMapDiagnostics?.().renderedPhotoIds.length,
      ),
    )
    .toBe(1);
  await page.getByRole("button", { name: "Photo Stop Unfiled" }).click();
  const gallery = page.getByRole("region", { name: "Photo Stop photos" });
  const firstPhoto = gallery.getByRole("button", { name: "View photo 1 of 5" });
  await expect(firstPhoto).toBeVisible();
  await expect(firstPhoto).toHaveCSS("background-color", "rgb(237, 242, 247)");
  await expect
    .poll(() =>
      gallery
        .locator("img")
        .first()
        .evaluate((image: HTMLImageElement) => image.naturalWidth),
    )
    .toBeGreaterThan(0);
  await expect(gallery.getByRole("button", { name: "See all 5 photos" })).toBeVisible();
  await expect(page.getByText("source media links")).toHaveCount(0);
  await gallery.getByRole("button", { name: "See all 5 photos" }).click();
  const viewer = page.getByRole("dialog", { name: "Photo Stop photos" });
  await expect(viewer).toContainText("5 / 5");
  expect(
    await viewer.evaluate((dialog) => Math.abs(dialog.getBoundingClientRect().width - innerWidth)),
  ).toBeLessThan(1);
  await viewer.getByRole("button", { name: "Previous photo" }).click();
  await expect(viewer).toContainText("4 / 5");
  await expect(viewer.getByRole("link", { name: "Open original photo" })).toHaveCount(0);
  await expect(viewer.locator(".imported-gallery__backdrop")).toHaveCount(1);
  await viewer.getByRole("button", { name: "Close photos" }).click();
  await expect(viewer).not.toBeVisible();
  expect(osmRequests).toBe(0);
});

test("clears the import notice and opens trip selection when Add has no destination", async ({
  page,
}) => {
  await page.goto("/maps");
  await page.getByLabel("Choose KML or KMZ file").setInputFiles({
    name: "sample.kml",
    mimeType: "application/vnd.google-earth.kml+xml",
    buffer: Buffer.from(sample),
  });
  await page.getByRole("button", { name: "Import 2 places, 1 line and 0 areas" }).click();
  const notice = page.locator(".imported-page__notice");
  await expect(notice).toContainText("2 places, 1 line and 0 areas imported");
  await expect(notice).toBeHidden({ timeout: 6_000 });
  await page.getByRole("button", { name: "Market Tokyo" }).click();
  await page.getByRole("button", { name: "Add to plan" }).click();
  const trip = page.getByLabel("Destination trip");
  await expect(trip).toBeVisible();
  await expect(trip).toBeFocused();
  await trip.selectOption("kyoto");
  await expect(page.getByRole("button", { name: /Add to Kyoto/ })).toBeVisible();
});

test("uses a matching OSM-linked Commons photo only after opening a place", async ({ page }) => {
  let osmRequests = 0;
  await page.route("https://nominatim.openstreetmap.org/search?**", (route) => {
    osmRequests += 1;

    return route.fulfill({
      contentType: "application/json",
      headers: { "access-control-allow-origin": "*" },
      body: JSON.stringify([
        {
          lat: "35.680",
          lon: "139.770",
          namedetails: { name: "Photo Stop" },
          extratags: { image: "File:Photo Stop.jpg" },
          osm_type: "node",
          osm_id: 123,
        },
      ]),
    });
  });
  await page.route("https://commons.wikimedia.org/w/api.php?**", (route) =>
    route.fulfill({
      contentType: "application/json",
      headers: { "access-control-allow-origin": "*" },
      body: JSON.stringify({
        query: {
          pages: [
            {
              imageinfo: [
                {
                  thumburl: "https://thumb.wikimedia.org/osm.jpg",
                  descriptionurl: "https://commons.wikimedia.org/wiki/File:Photo_Stop.jpg",
                  extmetadata: {
                    Artist: { value: "A photographer" },
                    LicenseShortName: { value: "CC BY 4.0" },
                    LicenseUrl: { value: "https://creativecommons.org/licenses/by/4.0/" },
                  },
                },
              ],
            },
          ],
        },
      }),
    }),
  );
  await page.route("https://thumb.wikimedia.org/**", (route) =>
    route.fulfill({
      path: "apps/mobile/public/images/kyoto.png",
      contentType: "image/png",
      headers: { "access-control-allow-origin": "*" },
    }),
  );
  await page.goto("/maps");
  await page.getByLabel("Choose KML or KMZ file").setInputFiles({
    name: "photo-stop.kml",
    mimeType: "application/vnd.google-earth.kml+xml",
    buffer: Buffer.from(
      `<kml><Document><Placemark><name>Photo Stop</name><Point><coordinates>139.770,35.680</coordinates></Point></Placemark></Document></kml>`,
    ),
  });
  await page.getByRole("button", { name: "Import 1 place, 0 lines and 0 areas" }).click();
  expect(osmRequests).toBe(0);
  await page.getByRole("button", { name: "Photo Stop Unfiled" }).click();
  const gallery = page.getByRole("region", { name: "Photo Stop photos" });
  await expect(gallery.getByRole("button", { name: "View photo 1 of 1" })).toBeVisible();
  await expect(page.getByText("A photographer")).toBeVisible();
  await expect(page.getByRole("link", { name: "CC BY 4.0" })).toBeVisible();
  await expect
    .poll(() => gallery.locator("img").evaluate((image: HTMLImageElement) => image.naturalWidth))
    .toBeGreaterThan(0);
  expect(osmRequests).toBe(1);
  await page.getByRole("button", { name: "Close place details" }).click();
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (
            window as Window & {
              __urouteMapDiagnostics?: () => { renderedPhotoIds: string[] };
            }
          ).__urouteMapDiagnostics?.().renderedPhotoIds.length,
      ),
    )
    .toBe(1);
  await page.reload();
  await page.getByLabel("Search imported places").click();
  await page.getByLabel("Search imported places").press("Enter");
  await page.getByRole("button", { name: "Photo Stop Unfiled" }).click();
  await expect(gallery.getByRole("button", { name: "View photo 1 of 1" })).toBeVisible();
  expect(osmRequests).toBe(1);
});

test("does not attach a nearby OSM photo when the place name differs", async ({ page }) => {
  let commonsRequests = 0;
  await page.route("https://nominatim.openstreetmap.org/search?**", (route) =>
    route.fulfill({
      contentType: "application/json",
      headers: { "access-control-allow-origin": "*" },
      body: JSON.stringify([
        {
          lat: "35.680",
          lon: "139.770",
          namedetails: { name: "Different Cafe" },
          extratags: { image: "File:Different Cafe.jpg" },
          osm_type: "node",
          osm_id: 456,
        },
      ]),
    }),
  );
  await page.route("https://commons.wikimedia.org/w/api.php?**", (route) => {
    commonsRequests += 1;

    return route.abort();
  });
  await page.goto("/maps");
  await page.getByLabel("Choose KML or KMZ file").setInputFiles({
    name: "photo-stop.kml",
    mimeType: "application/vnd.google-earth.kml+xml",
    buffer: Buffer.from(
      `<kml><Document><Placemark><name>Photo Stop</name><Point><coordinates>139.770,35.680</coordinates></Point></Placemark></Document></kml>`,
    ),
  });
  await page.getByRole("button", { name: "Import 1 place, 0 lines and 0 areas" }).click();
  await page.getByRole("button", { name: "Photo Stop Unfiled" }).click();
  await expect(page.getByText("Checking for a linked photo…")).toBeHidden();
  await expect(page.getByRole("region", { name: "Photo Stop photos" })).toHaveCount(0);
  expect(commonsRequests).toBe(0);
});

test("uses the KML map name instead of its file name for imported layers", async ({ page }) => {
  const file = {
    name: "export-2.kml",
    mimeType: "application/vnd.google-earth.kml+xml",
    buffer: Buffer.from(`<kml><Document><name>Tokyo favourites</name><Folder><name>Central</name>
<Placemark><name>Market</name><Point><coordinates>139.770,35.680</coordinates></Point></Placemark>
</Folder></Document></kml>`),
  };
  await page.goto("/maps");
  await page.getByLabel("Choose KML or KMZ file").setInputFiles(file);
  const review = page.getByRole("region", { name: "Import review" });
  await expect(review.getByText("Tokyo favourites")).toBeVisible();
  await review.getByRole("button", { name: "Import 1 place, 0 lines and 0 areas" }).click();
  await page.getByRole("button", { name: "Map layers" }).click();
  const layers = page.getByRole("dialog", { name: "Map layers" });
  await expect(layers.getByRole("region", { name: "Tokyo favourites" })).toBeVisible();
  await expect(layers).not.toContainText("export-2.kml");
  await layers.getByRole("button", { name: "Close map layers" }).click();
  await page.evaluate(async () => {
    const database = await new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open("uroute-imported-places", 2);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error ?? new Error("Could not open import storage"));
    });
    const transaction = database.transaction("places", "readwrite");
    const store = transaction.objectStore("places");
    const request = store.getAll() as IDBRequest<{ id: string; sourceName?: string }[]>;
    request.onsuccess = () => {
      for (const item of request.result) {
        delete item.sourceName;
        store.put(item);
      }
    };
    await new Promise<void>((resolve, reject) => {
      transaction.oncomplete = () => resolve();
      transaction.onerror = () =>
        reject(transaction.error ?? new Error("Could not update import storage"));
    });
    database.close();
  });
  await page.reload();
  await page.getByRole("button", { name: "Map layers" }).click();
  await expect(layers.getByRole("region", { name: "export-2.kml" })).toBeVisible();
  await layers.getByRole("button", { name: "Close map layers" }).click();
  await page.getByLabel("Choose KML or KMZ file").setInputFiles(file);
  await review.getByRole("button", { name: "Import 0 places, 0 lines and 0 areas" }).click();
  await page.getByRole("button", { name: "Map layers" }).click();
  await expect(layers.getByRole("region", { name: "Tokyo favourites" })).toBeVisible();
  await expect(
    page.locator(".imported-page__list-heading span").getByText("1", { exact: true }),
  ).toBeVisible();
});

test("reviews KML geometry, imports points once, and adds a place to a day", async ({ page }) => {
  await page.goto("/maps");
  await expect(page.getByRole("heading", { name: "Maps" })).toBeVisible();

  const file = {
    name: "sample.kml",
    mimeType: "application/vnd.google-earth.kml+xml",
    buffer: Buffer.from(sample),
  };
  await page.getByLabel("Choose KML or KMZ file").setInputFiles(file);
  const review = page.getByRole("region", { name: "Import review" });
  await expect(review).toContainText("2 points · 1 line · 0 areas");
  await expect(review).toContainText("Tokyo: 2");
  await review.getByRole("button", { name: "Import 2 places, 1 line and 0 areas" }).click();
  await expect(page.locator(".imported-page__notice")).toContainText(
    "2 places, 1 line and 0 areas imported",
  );
  await expect(page.getByRole("button", { name: "Market Tokyo" })).toBeVisible();

  await page.getByRole("button", { name: "Market Tokyo" }).click();
  await page.getByRole("button", { name: /Add places to/ }).click();
  await page.getByLabel("Destination trip").selectOption("kyoto");
  await page.getByLabel("Destination day").selectOption("2026-11-12");
  await page.getByRole("button", { name: "Add to Kyoto · Thu 12 Nov" }).click();
  await expect(page.getByRole("status")).toContainText("Market added to Kyoto · Thu 12 Nov");
  await page.goto("/plan?day=12");
  await expect(page.getByRole("heading", { name: "Kyoto" })).toBeVisible();
  await expect(page.getByLabel("Thursday itinerary")).toContainText("Market");
  await page.goto("/maps");
  await expect(page.locator(".imported-page__map")).toBeVisible();
  await expect(page.getByRole("link", { name: "Back to trips" })).toHaveCount(0);
  await page.getByLabel("Search imported places").fill("Market");
  await page.getByRole("button", { name: "Market Tokyo" }).click();
  await page.getByRole("button", { name: /Add places to Kyoto/ }).click();
  await expect(page.getByLabel("Destination trip")).toHaveValue("kyoto");
  await expect(page.getByLabel("Destination day")).toHaveValue("2026-11-12");
  await page.reload();
  await page.getByLabel("Search imported places").fill("Market");
  await page.getByRole("button", { name: "Market Tokyo" }).click();
  await page.getByRole("button", { name: /Add places to Kyoto/ }).click();
  await expect(page.getByLabel("Destination day")).toHaveValue("2026-11-12");

  await page.getByLabel("Choose KML or KMZ file").setInputFiles(file);
  await expect(review).toContainText("2 points already on this device");
  await expect(review).toContainText("1 line already on this device");
  await review.getByRole("button", { name: "Import 0 places, 0 lines and 0 areas" }).click();
  await expect(page.getByRole("status")).toContainText("already on this device");
  await page.getByLabel("Search imported places").fill("");
  await page.getByLabel("Search imported places").press("Enter");
  await expect(
    page.locator(".imported-page__list-heading span").getByText("2", { exact: true }),
  ).toBeVisible();
});

test("rejects KML with a DTD before importing any places", async ({ page }) => {
  await page.goto("/maps");
  await page.getByLabel("Choose KML or KMZ file").setInputFiles({
    name: "unsafe.kml",
    mimeType: "application/vnd.google-earth.kml+xml",
    buffer: Buffer.from(
      '<!DOCTYPE kml [<!ENTITY secret SYSTEM "file:///private">]><kml>&secret;</kml>',
    ),
  });
  await expect(page.getByRole("alert")).toContainText("DTDs or entities are not supported");
  await expect(page.getByRole("heading", { name: "Bring your places onto the map" })).toBeVisible();
});

test("reviews KML when Web Crypto is unavailable", async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(Crypto.prototype, "subtle", {
      configurable: true,
      get: () => undefined,
    });
  });
  await page.goto("/maps");
  await page.getByLabel("Choose KML or KMZ file").setInputFiles({
    name: "sample.kml",
    mimeType: "application/vnd.google-earth.kml+xml",
    buffer: Buffer.from(sample),
  });
  await expect(page.getByRole("region", { name: "Import review" })).toContainText(
    "2 points · 1 line · 0 areas",
  );
});

test("imports a polygon with an inner ring and does not duplicate it", async ({ page }) => {
  const polygon = `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2"><Document><Folder><name>Zones</name>
<Placemark><name>Garden boundary</name><Polygon>
<outerBoundaryIs><LinearRing><coordinates>139.70,35.60 139.80,35.60 139.80,35.70 139.70,35.70 139.70,35.60</coordinates></LinearRing></outerBoundaryIs>
<innerBoundaryIs><LinearRing><coordinates>139.73,35.63 139.77,35.63 139.77,35.67 139.73,35.67 139.73,35.63</coordinates></LinearRing></innerBoundaryIs>
</Polygon></Placemark></Folder></Document></kml>`;
  const file = {
    name: "polygon.kml",
    mimeType: "application/vnd.google-earth.kml+xml",
    buffer: Buffer.from(polygon),
  };
  await page.route("https://tile.openstreetmap.org/**", (route) =>
    route.fulfill({ path: "apps/mobile/public/images/kyoto.png", contentType: "image/png" }),
  );
  await page.goto("/maps");
  await page.getByLabel("Choose KML or KMZ file").setInputFiles(file);
  const review = page.getByRole("region", { name: "Import review" });
  await expect(review).toContainText("0 points · 0 lines · 1 area");
  await review.getByRole("button", { name: "Import 0 places, 0 lines and 1 area" }).click();
  await expect(page.locator(".imported-page__notice")).toContainText(
    "0 places, 0 lines and 1 area imported",
  );
  await expect(page.locator(".imported-page__map")).toBeVisible();
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (
            window as Window & {
              __urouteMapDiagnostics?: () => { geometryFeatureCount: number | null };
            }
          ).__urouteMapDiagnostics?.().geometryFeatureCount,
      ),
    )
    .toBe(1);

  await page.getByLabel("Choose KML or KMZ file").setInputFiles(file);
  await expect(review).toContainText("1 area already on this device");
  await review.getByRole("button", { name: "Import 0 places, 0 lines and 0 areas" }).click();
  await expect(page.getByRole("status")).toContainText("already on this device");
});

test("toggles imported file, geometry and folder layers without deleting places", async ({
  page,
}) => {
  const areaFile = {
    name: "osaka.kml",
    mimeType: "application/vnd.google-earth.kml+xml",
    buffer: Buffer.from(`<kml><Document><Folder><name>Osaka</name>
<Placemark><name>Park area</name><Polygon><outerBoundaryIs><LinearRing><coordinates>135.49,34.69 135.51,34.69 135.51,34.71 135.49,34.71 135.49,34.69</coordinates></LinearRing></outerBoundaryIs></Polygon></Placemark>
</Folder></Document></kml>`),
  };
  await page.route("https://tile.openstreetmap.org/**", (route) =>
    route.fulfill({ path: "apps/mobile/public/images/kyoto.png", contentType: "image/png" }),
  );
  await page.goto("/maps");
  await page.getByLabel("Choose KML or KMZ file").setInputFiles({
    name: "sample.kml",
    mimeType: "application/vnd.google-earth.kml+xml",
    buffer: Buffer.from(sample),
  });
  await page.getByRole("button", { name: "Import 2 places, 1 line and 0 areas" }).click();
  await page.getByLabel("Choose KML or KMZ file").setInputFiles(areaFile);
  await page.getByRole("button", { name: "Import 0 places, 0 lines and 1 area" }).click();

  const readMap = (): Promise<
    | {
        featureCount: number | null;
        geometryFeatureCount: number | null;
        center: { longitude: number; latitude: number };
        zoom: number;
      }
    | undefined
  > =>
    page.evaluate(() =>
      (
        window as Window & {
          __urouteMapDiagnostics?: () => {
            featureCount: number | null;
            geometryFeatureCount: number | null;
            center: { longitude: number; latitude: number };
            zoom: number;
          };
        }
      ).__urouteMapDiagnostics?.(),
    );
  await expect.poll(async () => (await readMap())?.geometryFeatureCount).toBe(2);
  const mapBeforeSheet = await page.locator(".imported-page__map").boundingBox();
  await page.getByRole("button", { name: "Map layers" }).click();
  const layers = page.getByRole("dialog", { name: "Map layers" });
  await expect(layers.getByRole("button", { name: "Close map layers" })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(layers).not.toBeVisible();
  await expect(page.getByRole("button", { name: "Map layers" })).toBeFocused();
  await page.getByRole("button", { name: "Map layers" }).click();
  const mapAfterSheet = await page.locator(".imported-page__map").boundingBox();
  expect(mapAfterSheet?.y).toBeCloseTo(mapBeforeSheet!.y, 3);
  const fileSwitch = layers.getByRole("switch", { name: "Show sample.kml" });
  await expect(fileSwitch).toBeChecked();
  await fileSwitch.uncheck();
  await expect(layers.getByRole("switch", { name: "Show lines in sample.kml" })).toBeDisabled();
  await fileSwitch.check();
  const lineSwitch = layers.getByRole("switch", { name: "Show lines in sample.kml" });
  await lineSwitch.uncheck();
  await expect(layers.getByRole("region", { name: "sample.kml" })).toContainText(
    "Partly enabled · 2 of 3 enabled",
  );
  await layers
    .getByRole("region", { name: "sample.kml" })
    .getByRole("button", {
      name: "Show all in this file",
    })
    .click();
  await expect(lineSwitch).toBeChecked();
  await lineSwitch.uncheck();
  await expect.poll(async () => (await readMap())?.geometryFeatureCount).toBe(1);
  await layers.getByRole("switch", { name: "Show areas in osaka.kml" }).uncheck();
  await expect.poll(async () => (await readMap())?.geometryFeatureCount).toBe(0);

  await page.reload();
  await expect(layers).toBeVisible();
  await expect(layers.getByRole("switch", { name: "Show lines in sample.kml" })).not.toBeChecked();
  await expect(layers.getByRole("switch", { name: "Show areas in osaka.kml" })).not.toBeChecked();
  await layers.getByRole("switch", { name: "Show areas in osaka.kml" }).check();
  await layers.locator("details").last().locator("summary").click();
  const beforeFolderToggle = await readMap();
  expect(beforeFolderToggle).toBeDefined();
  await layers.getByRole("switch", { name: "Show Tokyo in sample.kml" }).uncheck();
  await expect.poll(async () => (await readMap())?.featureCount).toBe(0);
  await expect.poll(async () => (await readMap())?.geometryFeatureCount).toBe(1);
  const afterFolderToggle = await readMap();
  expect(afterFolderToggle?.center.longitude).toBeCloseTo(beforeFolderToggle!.center.longitude, 6);
  expect(afterFolderToggle?.center.latitude).toBeCloseTo(beforeFolderToggle!.center.latitude, 6);
  expect(afterFolderToggle?.zoom).toBeCloseTo(beforeFolderToggle!.zoom, 6);
  await layers.getByRole("button", { name: "Close map layers" }).click();
  await page.getByLabel("Search imported places").fill("Market");
  await expect(page.getByRole("button", { name: "Market Tokyo" })).toBeVisible();
  await page.getByRole("button", { name: "Market Tokyo" }).click();
  await expect(
    page.getByText("Hidden on map. You can still use this place in your plan."),
  ).toBeVisible();
  await page.getByRole("button", { name: "Close place details" }).click();
  await page.getByRole("button", { name: "Map layers" }).click();
  await layers.getByRole("switch", { name: "Show osaka.kml" }).uncheck();
  await expect.poll(async () => (await readMap())?.geometryFeatureCount).toBe(0);
  await layers.getByRole("button", { name: "Hide all" }).click();
  await expect(page.getByText("All imported layers are hidden.")).toBeVisible();
  await layers.getByRole("button", { name: "Close map layers" }).click();
  await expect(page.getByRole("button", { name: "Map layers" })).toBeFocused();
  await page.getByRole("button", { name: "Open layers" }).click();
  await layers.getByRole("button", { name: "Show all", exact: true }).click();
  await expect.poll(async () => (await readMap())?.featureCount).toBe(1);
  await expect.poll(async () => (await readMap())?.geometryFeatureCount).toBe(0);
  await layers.getByRole("button", { name: "Close map layers" }).click();
  await page.getByLabel("Search imported places").fill("");
  await page.getByLabel("Search imported places").press("Enter");
  await expect.poll(async () => (await readMap())?.geometryFeatureCount).toBe(2);
  await page.getByRole("button", { name: "Map layers" }).click();
  await expect(layers.getByRole("switch", { name: "Show Tokyo in sample.kml" })).toBeChecked();
  await expect(page.getByText("All imported layers are hidden.")).toHaveCount(0);
});

test("imports supported parts of nested MultiGeometry and reports the rest", async ({ page }) => {
  const compound = `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2" xmlns:gx="http://www.google.com/kml/ext/2.2"><Document><Folder><name>Mixed</name>
<Placemark><name>Compound item</name><MultiGeometry>
<Point><coordinates>139.75,35.65</coordinates></Point>
<MultiGeometry>
<LineString><coordinates>139.70,35.60 139.80,35.70</coordinates></LineString>
<gx:MultiTrack><gx:Track><gx:coord>139.71 35.61 0</gx:coord><gx:coord>139.79 35.69 0</gx:coord></gx:Track></gx:MultiTrack>
<Polygon><outerBoundaryIs><LinearRing><coordinates>139.70,35.60 139.80,35.60 139.80,35.70 139.70,35.70 139.70,35.60</coordinates></LinearRing></outerBoundaryIs></Polygon>
<Model><Location><longitude>139.75</longitude><latitude>35.65</latitude></Location></Model>
</MultiGeometry>
</MultiGeometry></Placemark></Folder></Document></kml>`;
  await page.route("https://tile.openstreetmap.org/**", (route) =>
    route.fulfill({ path: "apps/mobile/public/images/kyoto.png", contentType: "image/png" }),
  );
  await page.goto("/maps");
  await page.getByLabel("Choose KML or KMZ file").setInputFiles({
    name: "compound.kml",
    mimeType: "application/vnd.google-earth.kml+xml",
    buffer: Buffer.from(compound),
  });
  const review = page.getByRole("region", { name: "Import review" });
  await expect(review).toContainText("1 point · 2 lines · 1 area");
  await expect(review).toContainText("1 unsupported");
  await review.getByText("Review 1 items not imported").click();
  await expect(review).toContainText("Unsupported Model geometry");
  await review.getByRole("button", { name: "Import 1 place, 2 lines and 1 area" }).click();
  await expect(
    page.locator(".imported-page__list-heading span").getByText("1", { exact: true }),
  ).toBeVisible();
  await expect
    .poll(() =>
      page.evaluate(() => {
        const diagnostics = (
          window as Window & {
            __urouteMapDiagnostics?: () => {
              featureCount: number | null;
              geometryFeatureCount: number | null;
            };
          }
        ).__urouteMapDiagnostics?.();

        return [diagnostics?.featureCount, diagnostics?.geometryFeatureCount];
      }),
    )
    .toEqual([1, 3]);
});

test("searches imported places by name and folder", async ({ page }) => {
  await page.goto("/maps");
  await page.getByLabel("Choose KML or KMZ file").setInputFiles({
    name: "sample.kml",
    mimeType: "application/vnd.google-earth.kml+xml",
    buffer: Buffer.from(sample),
  });
  await page.getByRole("button", { name: "Import 2 places, 1 line and 0 areas" }).click();
  const mapPlaceCount = (): Promise<number | null | undefined> =>
    page.evaluate(
      () =>
        (
          window as Window & {
            __urouteMapDiagnostics?: () => { featureCount: number | null };
          }
        ).__urouteMapDiagnostics?.().featureCount,
    );
  await expect.poll(mapPlaceCount).toBe(2);
  await page.getByLabel("Search imported places").fill("Bridge");
  await expect(page.getByRole("region", { name: "Search suggestions" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Search results" })).toHaveCount(0);
  await expect.poll(mapPlaceCount).toBe(2);
  await expect(page.getByRole("button", { name: "Bridge Tokyo" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Market Tokyo" })).toHaveCount(0);
  await page.getByLabel("Search imported places").press("Enter");
  await expect.poll(mapPlaceCount).toBe(1);
  await page.getByLabel("Search imported places").fill("Tokyo");
  await expect(page.getByRole("button", { name: "Market Tokyo" })).toBeVisible();
  await expect.poll(mapPlaceCount).toBe(1);
  await page.getByLabel("Search imported places").press("Enter");
  await expect(page.getByRole("heading", { name: "Search results" })).toBeVisible();
  await expect.poll(mapPlaceCount).toBe(2);
  await page.getByLabel("Filter by folder").selectOption("Tokyo");
  await expect(page.getByRole("button", { name: "Bridge Tokyo" })).toBeVisible();
  await page.getByLabel("Search imported places").fill("");
  await expect(page.getByRole("heading", { name: "Recent" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Tokyo" })).toBeVisible();
  await page.getByRole("button", { name: "Close search" }).click();
  await expect(page.getByLabel("Search imported places")).toHaveValue("Tokyo");
});

test("keeps Maps view across tabs, centers a selected place above its sheet, and swipes the sheet down", async ({
  page,
}) => {
  await page.goto("/maps");
  await page.getByLabel("Choose KML or KMZ file").setInputFiles({
    name: "sample.kml",
    mimeType: "application/vnd.google-earth.kml+xml",
    buffer: Buffer.from(sample),
  });
  await page.getByRole("button", { name: "Import 2 places, 1 line and 0 areas" }).click();
  await page.getByLabel("Search imported places").fill("Market");
  await page
    .getByRole("region", { name: "Search suggestions" })
    .getByRole("button", { name: "Market Tokyo" })
    .click();
  await expect(page.getByRole("button", { name: "Close place details" })).toBeVisible();

  const mapPosition = (): Promise<{
    latitude: number;
    longitude: number;
    zoom: number;
    offset: number;
  } | null> =>
    page.evaluate(() => {
      const diagnostics = (
        window as Window & {
          __urouteMapDiagnostics?: () => {
            center: { latitude: number; longitude: number };
            moving: boolean;
            selectedPoint: { x: number; y: number } | null;
            zoom: number;
          };
        }
      ).__urouteMapDiagnostics?.();
      const map = document.querySelector(".imported-page__map");
      const sheet = document.querySelector(".imported-page__content--open");
      if (!diagnostics || diagnostics.moving || !diagnostics.selectedPoint || !map || !sheet) {
        return null;
      }
      const visibleBottom = sheet.getBoundingClientRect().top - map.getBoundingClientRect().top;

      return {
        ...diagnostics.center,
        zoom: diagnostics.zoom,
        offset: Math.abs(diagnostics.selectedPoint.y - visibleBottom / 2),
      };
    });
  await expect.poll(async () => (await mapPosition())?.offset).toBeLessThan(45);
  const before = await mapPosition();
  expect(before).not.toBeNull();

  await page.getByRole("link", { name: "Trips" }).click();
  await page.getByRole("link", { name: "Maps" }).click();
  await expect(page.getByLabel("Search imported places")).toHaveValue("Market");
  await expect(page.getByRole("button", { name: "Close place details" })).toBeVisible();
  await expect.poll(async () => (await mapPosition())?.longitude).toBeCloseTo(before!.longitude, 3);
  await expect.poll(async () => (await mapPosition())?.latitude).toBeCloseTo(before!.latitude, 3);
  await expect.poll(async () => (await mapPosition())?.zoom).toBeCloseTo(before!.zoom, 1);

  const handle = await page.locator(".imported-page__sheet-handle").boundingBox();
  expect(handle).not.toBeNull();
  await page.mouse.move(handle!.x + handle!.width / 2, handle!.y + handle!.height / 2);
  await page.mouse.down();
  await page.mouse.move(handle!.x + handle!.width / 2, handle!.y + 160, { steps: 8 });
  await page.mouse.up();
  await expect(page.getByRole("button", { name: "Expand place details" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Close place details" })).toBeHidden();
  await page.getByRole("link", { name: "Trips" }).click();
  await page.getByRole("link", { name: "Maps" }).click();
  await expect(page.getByRole("button", { name: "Expand place details" })).toBeVisible();
  await page.getByRole("button", { name: "Expand place details" }).click();
  await expect(page.getByRole("button", { name: "Close place details" })).toBeVisible();

  await page.getByLabel("Search imported places").fill("Brid");
  await expect(page.getByRole("region", { name: "Search suggestions" })).toBeVisible();
  await page.getByRole("link", { name: "Trips" }).click();
  await page.getByRole("link", { name: "Maps" }).click();
  await expect(page.getByRole("region", { name: "Search suggestions" })).toBeVisible();
  await expect(page.getByLabel("Search imported places")).toHaveValue("Brid");
});

test("reviews a 1,200-point Unicode file and reports invalid coordinates", async ({ page }) => {
  const points = Array.from(
    { length: 1_200 },
    (_, index) =>
      `<Placemark><name>東京 ${index + 1}</name><Point><coordinates>${139 + index / 100_000},35.7</coordinates></Point></Placemark>`,
  ).join("");
  await page.goto("/maps");
  await page.getByLabel("Choose KML or KMZ file").setInputFiles({
    name: "large.kml",
    mimeType: "application/vnd.google-earth.kml+xml",
    buffer: Buffer.from(
      `<kml><Document><Folder><name>日本</name>${points}<Placemark><name>Invalid</name><Point><coordinates>300,35</coordinates></Point></Placemark></Folder></Document></kml>`,
    ),
  });
  const review = page.getByRole("region", { name: "Import review" });
  await expect(review).toContainText("1200 points · 0 lines · 0 areas");
  await expect(review).toContainText("1 point needing correction");
  await expect(review).toContainText("日本: 1200");
  await review.getByRole("button", { name: "Import 1200 places, 0 lines and 0 areas" }).click();
  await expect(page.locator(".imported-page__notice")).toContainText(
    "1200 places, 0 lines and 0 areas imported",
  );
  await page.getByLabel("Search imported places").click();
  await page.getByLabel("Search imported places").press("Enter");
  await expect(
    page.locator(".imported-page__list-heading span").getByText("1200", { exact: true }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "東京 1 日本" })).toBeVisible();
});

test("reviews the supplied KMZ without losing non-point geometry", async ({ page }) => {
  const samplePath = process.env.KANTO_KMZ_PATH;
  test.skip(samplePath === undefined, "Set KANTO_KMZ_PATH to the private sample file path.");
  if (samplePath === undefined) {
    return;
  }
  await page.route("https://tile.openstreetmap.org/**", (route) =>
    route.fulfill({ path: "apps/mobile/public/images/kyoto.png", contentType: "image/png" }),
  );
  await page.goto("/maps");
  await page.getByLabel("Choose KML or KMZ file").setInputFiles(samplePath);
  const review = page.getByRole("region", { name: "Import review" });
  await expect(review).toContainText("463 points · 9 lines · 1 area");
  await expect(review.getByText("KANTO TRIP 2026")).toBeVisible();
  await expect(review).toContainText("CENTRAL TOKYO: 101");
  await review.getByRole("button", { name: "Import 463 places, 9 lines and 1 area" }).click();
  await expect(page.locator(".imported-page__notice")).toContainText(
    "463 places, 9 lines and 1 area imported",
  );
  await page.getByLabel("Search imported places").click();
  await page.getByLabel("Search imported places").press("Enter");
  await expect(
    page.locator(".imported-page__list-heading span").getByText("463", { exact: true }),
  ).toBeVisible();
  await expect
    .poll(() =>
      page.evaluate(() =>
        (
          window as Window & {
            __urouteMapDiagnostics?: () => {
              status: string;
              featureCount: number | null;
              geometryFeatureCount: number | null;
            };
          }
        ).__urouteMapDiagnostics?.(),
      ),
    )
    .toMatchObject({ status: "ready", featureCount: 463, geometryFeatureCount: 10 });

  await page.getByRole("button", { name: "Map layers" }).click();
  const layers = page.getByRole("dialog", { name: "Map layers" });
  await expect(layers.getByRole("region", { name: "KANTO TRIP 2026" })).toBeVisible();
  await layers.locator("details summary").click();
  const readCamera = (): Promise<{
    center: { longitude: number; latitude: number };
    zoom: number;
    count: number | null;
    firstClusterPoint: { x: number; y: number } | null;
    renderedClusterLabels: string[];
  } | null> =>
    page.evaluate(() => {
      const map = (
        window as Window & {
          __urouteMapDiagnostics?: () => {
            center: { longitude: number; latitude: number };
            featureCount: number | null;
            firstClusterPoint: { x: number; y: number } | null;
            renderedClusterLabels: string[];
            zoom: number;
          };
        }
      ).__urouteMapDiagnostics?.();

      return map === undefined
        ? null
        : {
            center: map.center,
            zoom: map.zoom,
            count: map.featureCount,
            firstClusterPoint: map.firstClusterPoint,
            renderedClusterLabels: map.renderedClusterLabels,
          };
    });
  const beforeSumidaToggle = await readCamera();
  expect(beforeSumidaToggle?.firstClusterPoint).not.toBeNull();
  await layers.getByRole("switch", { name: /Show TOKYO \(SUMIDA\) in/ }).uncheck();
  await expect.poll(async () => (await readCamera())?.count).toBeLessThan(463);
  const afterSumidaToggle = await readCamera();
  expect(afterSumidaToggle?.center.longitude).toBeCloseTo(beforeSumidaToggle!.center.longitude, 6);
  expect(afterSumidaToggle?.center.latitude).toBeCloseTo(beforeSumidaToggle!.center.latitude, 6);
  expect(afterSumidaToggle?.zoom).toBeCloseTo(beforeSumidaToggle!.zoom, 6);
  expect(afterSumidaToggle?.renderedClusterLabels).not.toEqual(
    beforeSumidaToggle?.renderedClusterLabels,
  );
  expect(afterSumidaToggle?.firstClusterPoint?.x).toBeCloseTo(
    beforeSumidaToggle!.firstClusterPoint!.x,
    3,
  );
  expect(afterSumidaToggle?.firstClusterPoint?.y).toBeCloseTo(
    beforeSumidaToggle!.firstClusterPoint!.y,
    3,
  );
});
