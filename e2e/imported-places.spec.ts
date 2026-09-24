import { expect, test } from "@playwright/test";

const sample = `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2"><Document><Folder><name>Tokyo</name>
<Placemark><name>Market</name><description><![CDATA[<b>Visit</b> for lunch]]></description><Point><coordinates>139.770,35.680</coordinates></Point></Placemark>
<Placemark><name>Bridge</name><Point><coordinates>139.771,35.681</coordinates></Point></Placemark>
<Placemark><name>River path</name><LineString><coordinates>139.770,35.680 139.771,35.681</coordinates></LineString></Placemark>
</Folder></Document></kml>`;

test("opens the mobile file picker on first tap and accepts the same file again", async ({ page }) => {
  const file = {
    name: "sample.kml",
    mimeType: "application/vnd.google-earth.kml+xml",
    buffer: Buffer.from(sample),
  };
  await page.goto("/plan/kanto");
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

test("uses the KML map name instead of its file name for imported layers", async ({ page }) => {
  const file = {
    name: "export-2.kml",
    mimeType: "application/vnd.google-earth.kml+xml",
    buffer: Buffer.from(`<kml><Document><name>Tokyo favourites</name><Folder><name>Central</name>
<Placemark><name>Market</name><Point><coordinates>139.770,35.680</coordinates></Point></Placemark>
</Folder></Document></kml>`),
  };
  await page.goto("/plan/kanto");
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
      transaction.onerror = () => reject(transaction.error ?? new Error("Could not update import storage"));
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
  await expect(page.getByRole("button", { name: "Places 1" })).toBeVisible();
});

test("reviews KML geometry, imports points once, and adds a place to a day", async ({ page }) => {
  await page.goto("/plan/kanto");
  await expect(page.getByRole("heading", { name: "Kanto trip" })).toBeVisible();

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
  await expect(page.getByRole("status")).toContainText("2 places, 1 line and 0 areas imported");
  await expect(page.getByRole("button", { name: "Market Tokyo" })).toBeVisible();

  await page.getByRole("button", { name: "Add Market to this day" }).click();
  await expect(page.getByRole("button", { name: "Plan 1" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(page.getByRole("heading", { name: "Plan · Sun 27 Sep" })).toBeVisible();
  await expect(page.getByText("1 point, 0 lines and 0 areas shown on map")).toBeVisible();
  await page.getByRole("button", { name: "Places 2" }).click();
  await expect(page.getByText("2 points, 1 line and 0 areas shown on map")).toBeVisible();
  await page.reload();
  await expect(page.getByRole("button", { name: "Plan 1" })).toBeVisible();

  await page.getByRole("button", { name: "Places 2" }).click();
  await page.getByLabel("Choose KML or KMZ file").setInputFiles(file);
  await expect(review).toContainText("2 points already on this device");
  await expect(review).toContainText("1 line already on this device");
  await review.getByRole("button", { name: "Import 0 places, 0 lines and 0 areas" }).click();
  await expect(page.getByRole("button", { name: "Places 2" })).toBeVisible();
});

test("rejects KML with a DTD before importing any places", async ({ page }) => {
  await page.goto("/plan/kanto");
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
  await page.goto("/plan/kanto");
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
  await page.goto("/plan/kanto");
  await page.getByLabel("Choose KML or KMZ file").setInputFiles(file);
  const review = page.getByRole("region", { name: "Import review" });
  await expect(review).toContainText("0 points · 0 lines · 1 area");
  await review.getByRole("button", { name: "Import 0 places, 0 lines and 1 area" }).click();
  await expect(page.getByRole("status")).toContainText("0 places, 0 lines and 1 area imported");
  await expect(page.getByText("0 points, 0 lines and 1 area shown on map")).toBeVisible();
  await page.getByRole("button", { name: "Plan 0" }).click();
  await expect(page.getByText("0 points, 0 lines and 0 areas shown on map")).toBeVisible();
  await page.getByRole("button", { name: "Places 0" }).click();
  await expect(page.getByText("0 points, 0 lines and 1 area shown on map")).toBeVisible();
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
  await page.goto("/plan/kanto");
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
  await expect(page.getByRole("button", { name: "Places 2" })).toBeVisible();

  await page.reload();
  await page.getByRole("button", { name: "Map layers" }).click();
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
  await expect(page.getByRole("button", { name: "Market Tokyo" })).toBeVisible();
  await layers.getByRole("button", { name: "Close map layers" }).click();
  await page.getByRole("button", { name: "Market Tokyo" }).click();
  await expect(
    page.getByText("Hidden on map. You can still use this place in your plan."),
  ).toBeVisible();
  await page.getByRole("button", { name: "Map layers" }).click();
  await layers.getByRole("switch", { name: "Show osaka.kml" }).uncheck();
  await expect.poll(async () => (await readMap())?.geometryFeatureCount).toBe(0);
  await layers.getByRole("button", { name: "Hide all" }).click();
  await expect(page.getByText("All imported layers are hidden.")).toBeVisible();
  await layers.getByRole("button", { name: "Close map layers" }).click();
  await expect(page.getByRole("button", { name: "Map layers" })).toBeFocused();
  await page.getByRole("button", { name: "Open layers" }).click();
  await layers.getByRole("button", { name: "Show all", exact: true }).click();
  await expect(page.getByText("2 points, 1 line and 1 area shown on map")).toBeVisible();
  await expect.poll(async () => (await readMap())?.featureCount).toBe(1);
  await expect.poll(async () => (await readMap())?.geometryFeatureCount).toBe(2);
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
  await page.goto("/plan/kanto");
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
  await expect(page.getByRole("button", { name: "Places 1" })).toBeVisible();
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
  await page.goto("/plan/kanto");
  await page.getByLabel("Choose KML or KMZ file").setInputFiles({
    name: "sample.kml",
    mimeType: "application/vnd.google-earth.kml+xml",
    buffer: Buffer.from(sample),
  });
  await page.getByRole("button", { name: "Import 2 places, 1 line and 0 areas" }).click();
  await page.getByLabel("Search imported places").fill("Bridge");
  await expect(page.getByRole("button", { name: "Bridge Tokyo" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Market Tokyo" })).toHaveCount(0);
  await page.getByLabel("Search imported places").fill("Tokyo");
  await expect(page.getByRole("button", { name: "Market Tokyo" })).toBeVisible();
  await page.getByLabel("Filter by folder").selectOption("Tokyo");
  await expect(page.getByRole("button", { name: "Bridge Tokyo" })).toBeVisible();
});

test("reviews a 1,200-point Unicode file and reports invalid coordinates", async ({ page }) => {
  const points = Array.from(
    { length: 1_200 },
    (_, index) =>
      `<Placemark><name>東京 ${index + 1}</name><Point><coordinates>${139 + index / 100_000},35.7</coordinates></Point></Placemark>`,
  ).join("");
  await page.goto("/plan/kanto");
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
  await expect(page.getByRole("button", { name: "Places 1200" })).toBeVisible();
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
  await page.goto("/plan/kanto");
  await page.getByLabel("Choose KML or KMZ file").setInputFiles(samplePath);
  const review = page.getByRole("region", { name: "Import review" });
  await expect(review).toContainText("463 points · 9 lines · 1 area");
  await expect(review.getByText("KANTO TRIP 2026")).toBeVisible();
  await expect(review).toContainText("CENTRAL TOKYO: 101");
  await review.getByRole("button", { name: "Import 463 places, 9 lines and 1 area" }).click();
  await expect(page.getByRole("button", { name: "Places 463" })).toBeVisible();
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
