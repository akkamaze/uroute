import { expect, test } from "@playwright/test";

const sample = `<?xml version="1.0" encoding="UTF-8"?>
<kml xmlns="http://www.opengis.net/kml/2.2"><Document><Folder><name>Tokyo</name>
<Placemark><name>Market</name><description><![CDATA[<b>Visit</b> for lunch]]></description><Point><coordinates>139.770,35.680</coordinates></Point></Placemark>
<Placemark><name>Bridge</name><Point><coordinates>139.771,35.681</coordinates></Point></Placemark>
<Placemark><name>River path</name><LineString><coordinates>139.770,35.680 139.771,35.681</coordinates></LineString></Placemark>
</Folder></Document></kml>`;

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
  await review.getByRole("button", { name: "Import 2 places and 1 line" }).click();
  await expect(page.getByRole("status")).toContainText("2 places and 1 line imported");
  await expect(page.getByRole("button", { name: "Market Tokyo" })).toBeVisible();

  await page.getByRole("button", { name: "Add Market to this day" }).click();
  await expect(page.getByRole("button", { name: "Plan 1" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect(page.getByRole("heading", { name: "Plan · Sun 27 Sep" })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("button", { name: "Plan 1" })).toBeVisible();

  await page.getByRole("button", { name: "Places 2" }).click();
  await page.getByLabel("Choose KML or KMZ file").setInputFiles(file);
  await expect(review).toContainText("2 points already on this device");
  await expect(review).toContainText("1 line already on this device");
  await review.getByRole("button", { name: "Import 0 places and 0 lines" }).click();
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

test("searches imported places by name and folder", async ({ page }) => {
  await page.goto("/plan/kanto");
  await page.getByLabel("Choose KML or KMZ file").setInputFiles({
    name: "sample.kml",
    mimeType: "application/vnd.google-earth.kml+xml",
    buffer: Buffer.from(sample),
  });
  await page.getByRole("button", { name: "Import 2 places and 1 line" }).click();
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
  await review.getByRole("button", { name: "Import 1200 places and 0 lines" }).click();
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
  await expect(review).toContainText("CENTRAL TOKYO: 101");
  await review.getByRole("button", { name: "Import 463 places and 9 lines" }).click();
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
    .toMatchObject({ status: "ready", featureCount: 463, geometryFeatureCount: 9 });
});
