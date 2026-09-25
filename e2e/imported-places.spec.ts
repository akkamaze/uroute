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

test("imported place category can be edited, persisted, and reset to the default pin", async ({
  page,
}) => {
  await page.goto("/maps");
  await page.getByLabel("Choose KML or KMZ file").setInputFiles({
    name: "category-test.kml",
    mimeType: "application/vnd.google-earth.kml+xml",
    buffer: Buffer.from(sample),
  });
  await page.getByRole("button", { name: "Import 2 places, 1 line and 0 areas" }).click();
  await page.getByRole("button", { name: "Market Tokyo" }).click();
  await expect(
    page.getByRole("button", { name: "Category: Unknown. Change category" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Category: Unknown. Change category" }).click();
  await page
    .getByRole("group", { name: "Choose place category" })
    .getByRole("button", { name: "Coffee" })
    .click();
  await expect(
    page.getByRole("button", { name: "Category: Coffee. Change category" }),
  ).toBeVisible();

  await page.reload();
  await expect(
    page.getByRole("button", { name: "Category: Coffee. Change category" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Category: Coffee. Change category" }).click();
  await page
    .getByRole("group", { name: "Choose place category" })
    .getByRole("button", { name: "Use imported map icon (Unknown)" })
    .click();
  await expect(
    page.getByRole("button", { name: "Category: Unknown. Change category" }),
  ).toBeVisible();
});

test("Maps search keeps one submit path and offers a compact clear button", async ({ page }) => {
  await page.goto("/maps");
  const search = page.getByLabel("Search imported places");
  await search.fill("hi");
  await expect(page.getByRole("button", { name: "Show map results" })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Places", exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Clear search text" }).click();
  await expect(search).toHaveValue("");
});

test("Maps suggestions preview imported photos and keep a pin when no photo exists", async ({
  page,
}) => {
  await page.route("https://example.com/market.jpg", (route) =>
    route.fulfill({ path: "apps/mobile/public/images/kyoto.png", contentType: "image/png" }),
  );
  await page.goto("/maps");
  if ((await page.locator(".imported-page__header .imported-page__file-input").count()) === 0) {
    await page.getByRole("button", { name: "Map layers" }).click();
  }
  await page.getByLabel("Choose KML or KMZ file").setInputFiles({
    name: "search-photos.kml",
    mimeType: "application/vnd.google-earth.kml+xml",
    buffer: Buffer.from(`<kml><Document>
      <Placemark><name>Market photo</name><description><![CDATA[<img src="https://example.com/market.jpg">]]></description><Point><coordinates>139.77,35.68</coordinates></Point></Placemark>
      <Placemark><name>Market plain</name><Point><coordinates>139.78,35.69</coordinates></Point></Placemark>
    </Document></kml>`),
  });
  await page.getByRole("button", { name: "Import 2 places, 0 lines and 0 areas" }).click();
  await page.getByLabel("Search imported places").fill("Market");

  const suggestions = page.getByRole("region", { name: "Search suggestions" });
  const photoRow = suggestions.getByRole("button", { name: "Market photo Unfiled" });
  const plainRow = suggestions.getByRole("button", { name: "Market plain Unfiled" });
  await expect(photoRow.locator("img")).toBeVisible();
  const [photoThumbnail, plainThumbnail, photoTitle, plainTitle] = await Promise.all([
    photoRow.locator(".imported-page__search-thumbnail").boundingBox(),
    plainRow.locator(".imported-page__search-thumbnail").boundingBox(),
    photoRow.locator("strong").boundingBox(),
    plainRow.locator("strong").boundingBox(),
  ]);
  expect(photoThumbnail).not.toBeNull();
  expect(plainThumbnail).not.toBeNull();
  expect(photoTitle).not.toBeNull();
  expect(plainTitle).not.toBeNull();
  expect(Math.abs(photoThumbnail!.width - photoThumbnail!.height)).toBeLessThan(1);
  expect(Math.abs(plainThumbnail!.width - plainThumbnail!.height)).toBeLessThan(1);
  expect(Math.abs(photoThumbnail!.x - plainThumbnail!.x)).toBeLessThan(1);
  expect(Math.abs(photoTitle!.x - plainTitle!.x)).toBeLessThan(1);
  await expect(plainRow.locator("img")).toHaveCount(0);
  await expect(plainRow.locator("svg")).toHaveCount(1);
});

test("empty Maps results keep the sheet anchored while dragging", async ({ page }) => {
  await page.goto("/maps");
  await page.getByLabel("Choose KML or KMZ file").setInputFiles({
    name: "single.kml",
    mimeType: "application/vnd.google-earth.kml+xml",
    buffer: Buffer.from(
      "<kml><Placemark><name>Market</name><Point><coordinates>139.77,35.68</coordinates></Point></Placemark></kml>",
    ),
  });
  await page.getByRole("button", { name: "Import 1 place, 0 lines and 0 areas" }).click();
  const search = page.getByLabel("Search imported places");
  await search.fill("nothing-matches-this-place");
  await search.press("Enter");

  await expect(page.getByText("No places match this search.")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Search results" })).toBeVisible();
  await expect(page.locator(".imported-page__list-heading span")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Done" })).toBeVisible();
  await expect(page.getByLabel("Filter by folder")).toHaveCount(0);

  const sheet = page.locator(".imported-page__content--open");
  const handle = page.getByRole("button", { name: "Expand place details" });
  const handleBox = await handle.boundingBox();
  expect(handleBox).not.toBeNull();
  await page.mouse.move(handleBox!.x + handleBox!.width / 2, handleBox!.y + handleBox!.height / 2);
  await page.mouse.down();
  await page.mouse.move(handleBox!.x + handleBox!.width / 2, handleBox!.y - 100, { steps: 6 });

  const draggingBox = await sheet.boundingBox();
  expect(draggingBox).not.toBeNull();
  expect(draggingBox!.y + draggingBox!.height).toBeGreaterThanOrEqual(
    page.viewportSize()!.height - 1,
  );
  await page.mouse.up();

  await page.getByRole("button", { name: "Clear search text" }).click();
  await expect(search).toHaveValue("");
  await expect(page.locator(".imported-page__content--open")).toHaveCount(0);
  await expect(page.getByRole("region", { name: "Search suggestions" })).toHaveCount(0);
});

test("Maps places filter on the lower left and recenter on the lower right", async ({ page }) => {
  await page.goto("/maps");
  await page.getByLabel("Choose KML or KMZ file").setInputFiles({
    name: "single.kml",
    mimeType: "application/vnd.google-earth.kml+xml",
    buffer: Buffer.from(
      "<kml><Placemark><name>Market</name><Point><coordinates>139.77,35.68</coordinates></Point></Placemark></kml>",
    ),
  });
  await page.getByRole("button", { name: "Import 1 place, 0 lines and 0 areas" }).click();
  await page.getByRole("button", { name: "Market Unfiled" }).click();
  const filter = await page.getByRole("button", { name: "Map layers" }).boundingBox();
  const recenter = await page
    .getByRole("button", { name: "Recenter imported places" })
    .boundingBox();
  const sheet = await page.locator(".imported-page__content--open").boundingBox();
  expect(filter).not.toBeNull();
  expect(recenter).not.toBeNull();
  expect(sheet).not.toBeNull();
  expect(filter!.x).toBeLessThan(page.viewportSize()!.width / 2);
  expect(recenter!.x).toBeGreaterThan(page.viewportSize()!.width / 2);
  expect(Math.abs(filter!.y - recenter!.y)).toBeLessThan(3);
  expect(filter!.y + filter!.height).toBeLessThan(sheet!.y);
});

test("Maps hides map controls when search results cover the map", async ({ page }) => {
  await page.goto("/maps");
  await page.getByLabel("Choose KML or KMZ file").setInputFiles({
    name: "sample.kml",
    mimeType: "application/vnd.google-earth.kml+xml",
    buffer: Buffer.from(sample),
  });
  await page.getByRole("button", { name: "Import 2 places, 1 line and 0 areas" }).click();
  await page.getByLabel("Search imported places").fill("Market");
  await page.getByLabel("Search imported places").press("Enter");
  await expect(page.getByRole("button", { name: "Map layers" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Recenter imported places" })).toBeVisible();

  await page.getByRole("button", { name: "Expand place details" }).click();
  await expect(page.locator(".imported-page__content--expanded")).toBeVisible();
  await expect(page.getByRole("button", { name: "Map layers" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Recenter imported places" })).toHaveCount(0);

  await page.getByRole("button", { name: "Collapse place details" }).click();
  await expect(page.getByRole("button", { name: "Map layers" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Recenter imported places" })).toBeVisible();
});

test("Maps details obey the same expanded top boundary as Plan", async ({ page }) => {
  await page.goto("/trips");
  await page.evaluate(() => localStorage.setItem("uroute.app-mode.v1", "mock"));
  await page.goto("/places?place=kiyomizu&day=13");
  const planTransition = await page.locator(".place-sheet").evaluate((sheet) => ({
    duration: getComputedStyle(sheet).transitionDuration,
    timing: getComputedStyle(sheet).transitionTimingFunction,
  }));
  await page.getByRole("button", { name: "Expand place details" }).click();
  await expect
    .poll(() => page.locator(".place-sheet").evaluate((sheet) => sheet.getBoundingClientRect().top))
    .toBe(72);
  const planTop = await page
    .locator(".place-sheet")
    .evaluate((sheet) => sheet.getBoundingClientRect().top);

  await page.evaluate(() => localStorage.setItem("uroute.app-mode.v1", "real"));
  await page.goto("/maps");
  await page.getByLabel("Choose KML or KMZ file").setInputFiles({
    name: "sample.kml",
    mimeType: "application/vnd.google-earth.kml+xml",
    buffer: Buffer.from(sample),
  });
  await page.getByRole("button", { name: "Import 2 places, 1 line and 0 areas" }).click();
  await page.getByRole("button", { name: "Market Tokyo" }).click();
  const mapsTransition = await page.locator(".imported-page__content--open").evaluate((sheet) => ({
    duration: getComputedStyle(sheet).transitionDuration,
    timing: getComputedStyle(sheet).transitionTimingFunction,
  }));
  expect(mapsTransition).toEqual(planTransition);
  await page.getByRole("button", { name: "Expand place details" }).click();
  await expect
    .poll(() =>
      page
        .locator(".imported-page__content--open")
        .evaluate((sheet) => sheet.getBoundingClientRect().top),
    )
    .toBe(72);
  const mapsTop = await page
    .locator(".imported-page__content--open")
    .evaluate((sheet) => sheet.getBoundingClientRect().top);
  expect(Math.abs(mapsTop - planTop), `Maps ${mapsTop}px vs Plan ${planTop}px`).toBeLessThan(2);
});

test("Maps sheet fills behind content throughout an upward drag", async ({ page }) => {
  await page.goto("/maps");
  await page.getByLabel("Choose KML or KMZ file").setInputFiles({
    name: "single.kml",
    mimeType: "application/vnd.google-earth.kml+xml",
    buffer: Buffer.from(
      "<kml><Placemark><name>Market</name><Point><coordinates>139.77,35.68</coordinates></Point></Placemark></kml>",
    ),
  });
  await page.getByRole("button", { name: "Import 1 place, 0 lines and 0 areas" }).click();
  await page.getByRole("button", { name: "Market Unfiled" }).click();
  const sheet = page.locator(".imported-page__content--open");
  const handle = await page.locator(".imported-page__sheet-handle").boundingBox();
  expect(handle).not.toBeNull();
  const start = await sheet.evaluate((element) => element.getBoundingClientRect().top);
  const x = handle!.x + handle!.width / 2;
  const y = handle!.y + handle!.height / 2;
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x, y - 100, { steps: 8 });
  const during = await sheet.evaluate((element) => ({
    top: element.getBoundingClientRect().top,
    bottom: element.getBoundingClientRect().bottom,
    containerBottom: element.parentElement!.getBoundingClientRect().bottom,
  }));
  expect(during.top).toBeLessThan(start - 50);
  expect(
    during.bottom,
    "sheet must cover the map down to the bottom while moving",
  ).toBeGreaterThanOrEqual(during.containerBottom - 2);
  await page.mouse.up();
});

test("Maps sheet follows an Android-style touch drag without a map gap", async ({ page }) => {
  await page.goto("/maps");
  await page.getByLabel("Choose KML or KMZ file").setInputFiles({
    name: "single.kml",
    mimeType: "application/vnd.google-earth.kml+xml",
    buffer: Buffer.from(
      "<kml><Placemark><name>Market</name><Point><coordinates>139.77,35.68</coordinates></Point></Placemark></kml>",
    ),
  });
  await page.getByRole("button", { name: "Import 1 place, 0 lines and 0 areas" }).click();
  await page.getByRole("button", { name: "Market Unfiled" }).click();
  const sheet = page.locator(".imported-page__content--open");
  const handle = await page.locator(".imported-page__sheet-handle").boundingBox();
  expect(handle).not.toBeNull();
  const x = handle!.x + handle!.width / 2;
  const y = handle!.y + handle!.height / 2;
  const client = await page.context().newCDPSession(page);
  await client.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [{ x, y, id: 1 }],
  });
  for (let step = 1; step <= 8; step += 1) {
    await client.send("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: [{ x, y: y - step * 12.5, id: 1 }],
    });
  }
  const during = await sheet.evaluate((element) => ({
    bottom: element.getBoundingClientRect().bottom,
    containerBottom: element.parentElement!.getBoundingClientRect().bottom,
  }));
  expect(during.bottom).toBeGreaterThanOrEqual(during.containerBottom - 2);
  await client.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await expect(sheet).toHaveClass(/imported-page__content--expanded/);
  const expandedHandle = await page.locator(".imported-page__sheet-handle").boundingBox();
  expect(expandedHandle).not.toBeNull();
  const downX = expandedHandle!.x + expandedHandle!.width / 2;
  const downY = expandedHandle!.y + expandedHandle!.height / 2;
  await client.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [{ x: downX, y: downY, id: 2 }],
  });
  for (let step = 1; step <= 8; step += 1) {
    await client.send("Input.dispatchTouchEvent", {
      type: "touchMove",
      touchPoints: [{ x: downX, y: downY + step * 20, id: 2 }],
    });
  }
  const downTop = await sheet.evaluate((element) => element.getBoundingClientRect().top);
  expect(downTop).toBeGreaterThan(72);
  await client.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
  await expect(sheet).not.toHaveClass(/imported-page__content--expanded/);
  await client.detach();
});

test("imported place bookmark appears in Saved and returns to the same map place", async ({
  page,
}) => {
  await page.goto("/maps");
  await page.getByLabel("Choose KML or KMZ file").setInputFiles({
    name: "sample.kml",
    mimeType: "application/vnd.google-earth.kml+xml",
    buffer: Buffer.from(sample),
  });
  await page.getByRole("button", { name: "Import 2 places, 1 line and 0 areas" }).click();
  await page.getByRole("button", { name: "Market Tokyo" }).click();
  const save = page.getByRole("button", { name: "Save place" });
  await expect(save).toBeVisible();
  await save.click();
  await expect(page.getByRole("button", { name: "Remove from saved places" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Close place details" })).toHaveCSS(
    "background-color",
    "rgb(241, 244, 247)",
  );
  await page.goto("/saved");
  await expect(page.getByRole("link", { name: "Open Market" })).toBeVisible();
  await page.getByRole("link", { name: "Open Market" }).click();
  await expect(page.locator(".imported-page__selected-header")).toContainText("Market");
});

test("Maps Add to trip uses Plan form sizing and spacing", async ({ page }) => {
  const metrics = async (): Promise<{
    gap: string;
    headingFont: string;
    headingMarginTop: string;
    selectHeight: number;
    selectRadius: string;
    buttonHeight: number;
    buttonRadius: string;
  }> =>
    page.locator(".add-place-panel").evaluate((form) => {
      const heading = form.querySelector(".add-place-panel__heading h2")!;
      const select = form.querySelector("select")!;
      const button = form.querySelector(".add-place-panel__confirm")!;

      return {
        gap: getComputedStyle(form).gap,
        headingFont: getComputedStyle(heading).fontSize,
        headingMarginTop: getComputedStyle(heading).marginTop,
        selectHeight: select.getBoundingClientRect().height,
        selectRadius: getComputedStyle(select).borderRadius,
        buttonHeight: button.getBoundingClientRect().height,
        buttonRadius: getComputedStyle(button).borderRadius,
      };
    });
  await page.goto("/trips");
  await page.evaluate(() => localStorage.setItem("uroute.app-mode.v1", "mock"));
  await page.goto("/places?place=kiyomizu&day=13");
  await page.getByRole("button", { name: "Add to trip" }).click();
  const plan = await metrics();
  await page.evaluate(() => localStorage.setItem("uroute.app-mode.v1", "real"));
  await page.goto("/maps");
  await page.getByLabel("Choose KML or KMZ file").setInputFiles({
    name: "sample.kml",
    mimeType: "application/vnd.google-earth.kml+xml",
    buffer: Buffer.from(sample),
  });
  await page.getByRole("button", { name: "Import 2 places, 1 line and 0 areas" }).click();
  await page.getByRole("button", { name: "Market Tokyo" }).click();
  await page.getByRole("button", { name: "Add to plan" }).click();
  expect(await metrics()).toEqual(plan);
});

test("imports from Map layers on first tap and accepts the same file again", async ({ page }) => {
  const file = {
    name: "sample.kml",
    mimeType: "application/vnd.google-earth.kml+xml",
    buffer: Buffer.from(sample),
  };
  await page.goto("/maps");
  await expect(page.locator(".imported-page__header .imported-page__import-button")).toHaveCount(0);
  for (let attempt = 0; attempt < 2; attempt += 1) {
    await page.getByRole("button", { name: "Open map layers" }).click();
    await expect(page.getByRole("dialog", { name: "Map layers" })).toBeVisible();
    const picker = page.waitForEvent("filechooser");
    await page.locator(".imported-page__layers-import").tap();
    await (await picker).setFiles(file);
    const review = page.getByRole("region", { name: "Import review" });
    await expect(review).toContainText("2 points · 1 line · 0 areas");
    await expect(page.getByRole("dialog", { name: "Map layers" })).not.toBeVisible();
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
    await viewer.locator(".imported-gallery__photo").evaluate((photo) => {
      const bounds = photo.getBoundingClientRect();

      return Math.abs(bounds.top + bounds.height / 2 - innerHeight / 2);
    }),
  ).toBeLessThan(2);
  expect(
    await viewer.evaluate((dialog) => Math.abs(dialog.getBoundingClientRect().width - innerWidth)),
  ).toBeLessThan(1);
  await viewer.getByRole("button", { name: "Previous photo" }).click();
  await expect(viewer).toContainText("4 / 5");
  await expect(viewer.getByRole("link", { name: "Open original photo" })).toHaveCount(0);
  await expect(viewer.locator(".imported-gallery__backdrop")).toHaveCount(1);
  expect(
    await viewer.evaluate((dialog) => {
      const backdrop = dialog.querySelector(".imported-gallery__backdrop");

      return backdrop === null
        ? Number.POSITIVE_INFINITY
        : backdrop.getBoundingClientRect().top - dialog.getBoundingClientRect().top;
    }),
  ).toBeLessThanOrEqual(0);
  await expect(viewer.locator("header")).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
  await expect(viewer.locator("header span")).toHaveCSS("background-color", /rgba\(/);
  await viewer.getByRole("button", { name: "Close photos" }).click();
  await expect(viewer).not.toBeVisible();
  expect(osmRequests).toBe(0);
});

test("clears the import notice and opens trip selection when Add has no destination", async ({
  page,
}) => {
  await page.goto("/trips");
  await page.evaluate(() => {
    localStorage.setItem("uroute.app-mode.v1", "real");
    localStorage.setItem(
      "uroute.created-trips.v1",
      JSON.stringify([
        {
          id: "a1111111-1111-4111-8111-111111111111",
          name: "Lisbon",
          startDate: "2027-01-10",
          endDate: "2027-01-10",
        },
      ]),
    );
  });
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
  await expect(page.getByRole("heading", { name: "Choose a trip and day" })).toBeVisible();
  await expect(page.getByRole("form", { name: "Add to plan" })).toContainText("Add to trip");
  const trip = page.getByLabel("Destination trip");
  await expect(trip).toBeVisible();
  await expect(page.locator(".imported-page__selected select")).toHaveCount(2);
  await expect(trip.locator("option:checked")).toHaveText("Lisbon · 10–10 Jan 2027");
  await expect(page.getByLabel("Destination day").locator("option:checked")).toHaveText(
    "Sunday, 10 January",
  );
  await expect(page.getByRole("button", { name: "Add to plan", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Back to place details" }).click();
  await expect(page.getByRole("form", { name: "Add to plan" })).toBeHidden();
  await page.getByRole("button", { name: "Add to plan", exact: true }).click();
  await expect(page.getByLabel("Destination day").locator("option:checked")).toHaveText(
    "Sunday, 10 January",
  );
  await page.keyboard.press("Escape");
  await expect(page.getByRole("form", { name: "Add to plan" })).toBeHidden();
});

test("keeps the title visible while expanded details scroll and restores details on browser back", async ({
  page,
}) => {
  await page.goto("/maps");
  await page.getByLabel("Choose KML or KMZ file").setInputFiles({
    name: "long-place.kml",
    mimeType: "application/vnd.google-earth.kml+xml",
    buffer: Buffer.from(
      `<kml><Document><Placemark><name>Long place</name><description>${"A long description of the place. ".repeat(100)}</description><Point><coordinates>139.77,35.68</coordinates></Point></Placemark></Document></kml>`,
    ),
  });
  await page.getByRole("button", { name: "Import 1 place, 0 lines and 0 areas" }).click();
  await page.getByRole("button", { name: "Long place" }).click();
  const sheet = page.locator(".imported-page__content--open");
  const header = page.locator(".imported-page__selected-header");
  await page.getByRole("button", { name: "Expand place details" }).click();
  await expect(sheet).toHaveClass(/imported-page__content--expanded/);
  const initial = await header.boundingBox();
  await sheet.evaluate((element) => {
    element.scrollTop = 120;
  });
  const first = await header.boundingBox();
  await sheet.evaluate((element) => {
    element.scrollTop = 240;
  });
  const second = await header.boundingBox();
  expect(initial).not.toBeNull();
  expect(first).not.toBeNull();
  expect(second).not.toBeNull();
  expect(Math.abs(initial!.y - first!.y), `${initial!.y} → ${first!.y}`).toBeLessThan(1);
  expect(Math.abs(first!.y - second!.y)).toBeLessThan(1);
  expect(await sheet.evaluate((element) => element.scrollTop)).toBe(240);
  await expect(header.getByRole("button", { name: "Close place details" })).toBeInViewport();
  await sheet.evaluate((element) => {
    element.scrollTop = 0;
  });
  const add = page.getByRole("button", { name: "Add to plan", exact: true });
  await add.click();
  await expect(page).toHaveURL(/add=open/);
  await expect(page.getByRole("form", { name: "Add to plan" })).toBeVisible();
  await expect(page.getByText(/A long description of the place/)).toHaveCount(0);
  await page.goBack();
  await expect(page).not.toHaveURL(/add=open/);
  await expect(page.getByText(/A long description of the place/)).toBeVisible();
});

test("shows imported map labels with plan-style place details and a close sheet handle", async ({
  page,
}) => {
  await page.goto("/maps");
  await page.getByLabel("Choose KML or KMZ file").setInputFiles({
    name: "labeled.kml",
    mimeType: "application/vnd.google-earth.kml+xml",
    buffer: Buffer.from(
      `<kml><Document><Folder><name>South Tokyo</name><Placemark><name>[ View ] Shimbashi Station</name><Point><coordinates>139.77,35.68</coordinates></Point></Placemark></Folder></Document></kml>`,
    ),
  });
  await page.getByRole("button", { name: "Import 1 place, 0 lines and 0 areas" }).click();
  await page.getByRole("button", { name: /Shimbashi Station/ }).click();

  const header = page.locator(".imported-page__selected-header");
  await expect(header.getByRole("heading", { name: "Shimbashi Station" })).toBeVisible();
  await expect(header).toContainText("View · South Tokyo");
  await expect(header).not.toContainText("[ View ]");
  await expect(page.getByRole("button", { name: "Add to plan" })).toContainText("Add to trip");
  await expect(
    page.getByRole("link", { name: /Directions to .* Shimbashi Station/ }),
  ).toBeVisible();
  await expect(page.getByText(/Coordinates from/)).toBeVisible();

  const handle = await page.locator(".imported-page__sheet-handle").boundingBox();
  const heading = await header.getByRole("heading").boundingBox();
  expect(handle).not.toBeNull();
  expect(heading).not.toBeNull();
  expect(heading!.y - (handle!.y + handle!.height)).toBeLessThan(30);

  const titleX = heading!.x + heading!.width / 2;
  const titleY = heading!.y + heading!.height / 2;
  await page.mouse.move(titleX, titleY);
  await page.mouse.down();
  await page.mouse.move(titleX, titleY - 150, { steps: 8 });
  const duringUpwardDrag = await page.locator(".imported-page__content--open").boundingBox();
  expect(duringUpwardDrag).not.toBeNull();
  expect(duringUpwardDrag!.y).toBeGreaterThanOrEqual(70);
  expect(duringUpwardDrag!.y).toBeLessThan(titleY);
  await page.mouse.up();
  await expect(page.locator(".imported-page__content--expanded")).toBeVisible();
  expect(
    (await page.locator(".imported-page__content--expanded").boundingBox())!.y,
  ).toBeGreaterThanOrEqual(70);
  const expandedHandle = await page.locator(".imported-page__sheet-handle").boundingBox();
  expect(expandedHandle).not.toBeNull();
  const handleX = expandedHandle!.x + expandedHandle!.width / 2;
  const handleY = expandedHandle!.y + expandedHandle!.height / 2;
  await page.mouse.move(handleX, handleY);
  await page.mouse.down();
  await page.mouse.move(handleX, handleY + 220, { steps: 12 });
  const duringDownwardDrag = await page.locator(".imported-page__content--expanded").boundingBox();
  expect(duringDownwardDrag).not.toBeNull();
  expect(duringDownwardDrag!.y).toBeGreaterThanOrEqual(70);
  await page.mouse.up();
  await expect(page.locator(".imported-page__content--expanded")).toHaveCount(0);
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
  await page.goto("/trips");
  await page.evaluate(() => {
    localStorage.setItem("uroute.app-mode.v1", "real");
    localStorage.setItem(
      "uroute.created-trips.v1",
      JSON.stringify([
        {
          id: "b2222222-2222-4222-8222-222222222222",
          name: "Tokyo",
          startDate: "2026-11-12",
          endDate: "2026-11-13",
        },
      ]),
    );
  });
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
  await page.getByRole("button", { name: "Add to plan", exact: true }).click();
  await page.getByLabel("Destination day").selectOption("2026-11-12");
  await page.getByRole("button", { name: "Add to plan", exact: true }).click();
  await expect(page.getByRole("status")).toContainText("Market added to Tokyo · Thu 12 Nov");
  await page.goto("/plan/trip/b2222222-2222-4222-8222-222222222222?day=2026-11-12");
  await expect(page.getByRole("heading", { name: "Tokyo" })).toBeVisible();
  await expect(page.locator("[data-plan-stop-id]")).toContainText("Market");
  await page.goto("/maps");
  await expect(page.locator(".imported-page__map")).toBeVisible();
  await expect(page.getByRole("link", { name: "Back to trips" })).toHaveCount(0);
  await page.getByLabel("Search imported places").fill("Market");
  await page.getByRole("button", { name: "Market Tokyo" }).click();
  await page.getByRole("button", { name: "Add to plan", exact: true }).click();
  await expect(page.getByLabel("Destination trip").locator("option:checked")).toContainText(
    "Tokyo",
  );
  await expect(page.getByLabel("Destination day").locator("option:checked")).toHaveText(
    "Thursday, 12 November",
  );
  await page.reload();
  await expect(page.getByRole("form", { name: "Add to plan" })).toBeVisible();
  await expect(page.getByLabel("Destination day").locator("option:checked")).toHaveText(
    "Thursday, 12 November",
  );
  await page.getByRole("button", { name: "Back to place details" }).click();
  await page.getByLabel("Search imported places").fill("Market");
  await page.getByRole("button", { name: "Market Tokyo" }).click();
  await page.getByRole("button", { name: "Add to plan", exact: true }).click();
  await expect(page.getByLabel("Destination day").locator("option:checked")).toHaveText(
    "Thursday, 12 November",
  );

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
  await expect
    .poll(() =>
      page.evaluate(() =>
        (
          window as Window & {
            __urouteMapDiagnostics?: () => {
              clusteringEnabled: boolean;
              renderedClusterCount: number;
              renderedPlaces: { id: string }[];
            };
          }
        ).__urouteMapDiagnostics?.(),
      ),
    )
    .toMatchObject({
      clusteringEnabled: false,
      renderedClusterCount: 0,
      renderedPlaces: expect.arrayContaining([expect.any(Object), expect.any(Object)]),
    });
  await expect(page.getByLabel("Filter by folder")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Bridge Tokyo" })).toBeVisible();
  await page.getByLabel("Search imported places").fill("");
  await expect(page.getByRole("heading", { name: "Recent" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Tokyo" })).toBeVisible();
  await page.getByRole("button", { name: "Close search" }).click();
  await expect(page.getByLabel("Search imported places")).toHaveValue("Tokyo");
});

test("closing a place opened from Maps search restores the result sheet", async ({ page }) => {
  await page.goto("/maps");
  await page.getByLabel("Choose KML or KMZ file").setInputFiles({
    name: "sample.kml",
    mimeType: "application/vnd.google-earth.kml+xml",
    buffer: Buffer.from(sample),
  });
  await page.getByRole("button", { name: "Import 2 places, 1 line and 0 areas" }).click();
  await page.getByLabel("Search imported places").fill("Tokyo");
  await page.getByLabel("Search imported places").press("Enter");
  await expect(page.getByRole("heading", { name: "Search results" })).toBeVisible();
  await expect(page.locator(".imported-page__list-heading span")).toHaveCount(0);
  await expect(page.locator(".imported-page__row")).toHaveCount(2);
  await page.getByRole("button", { name: "Market Tokyo" }).click();
  await expect(page.getByRole("button", { name: "Close place details" })).toBeVisible();
  await page.getByRole("button", { name: "Close place details" }).click();
  await expect(page.getByRole("heading", { name: "Search results" })).toBeVisible();
  await expect(page.locator(".imported-page__row")).toHaveCount(2);
  await expect(page.getByLabel("Search imported places")).toHaveValue("Tokyo");
});

test("system back from Maps Add to trip returns to the selected place", async ({ page }) => {
  await page.goto("/maps");
  await page.getByLabel("Choose KML or KMZ file").setInputFiles({
    name: "sample.kml",
    mimeType: "application/vnd.google-earth.kml+xml",
    buffer: Buffer.from(sample),
  });
  await page.getByRole("button", { name: "Import 2 places, 1 line and 0 areas" }).click();
  await page.getByLabel("Search imported places").fill("Market");
  await page.getByLabel("Search imported places").press("Enter");
  await page.getByRole("button", { name: "Market Tokyo" }).click();
  await page.getByRole("button", { name: "Add to plan", exact: true }).click();
  await expect(page).toHaveURL(/add=open/);
  await page.goBack();

  await expect(page).not.toHaveURL(/add=open/);
  await expect(page.getByRole("button", { name: "Close place details" })).toBeVisible();
  await expect(page.getByRole("form", { name: "Add to plan" })).toHaveCount(0);
});

test("Maps search back closes the editor without stepping through older queries", async ({
  page,
}) => {
  await page.goto("/maps");
  await page.getByLabel("Choose KML or KMZ file").setInputFiles({
    name: "sample.kml",
    mimeType: "application/vnd.google-earth.kml+xml",
    buffer: Buffer.from(sample),
  });
  await page.getByRole("button", { name: "Import 2 places, 1 line and 0 areas" }).click();
  const input = page.getByLabel("Search imported places");
  await input.fill("Market");
  await input.press("Enter");
  await input.fill("Bridge");
  await input.press("Enter");
  await input.click();
  await expect(page.getByRole("region", { name: "Search suggestions" })).toBeVisible();
  await page.getByRole("button", { name: "Close search" }).click();

  await expect(page.getByRole("region", { name: "Search suggestions" })).toHaveCount(0);
  await expect(input).toHaveValue("Bridge");
  await expect(page.getByRole("heading", { name: "Search results" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Bridge Tokyo" })).toBeVisible();
  await expect(page.getByRole("button", { name: "Market Tokyo" })).toHaveCount(0);
});

test("fits distant name-search matches on Maps without clustering them", async ({ page }) => {
  await page.goto("/maps");
  await page.getByLabel("Choose KML or KMZ file").setInputFiles({
    name: "distant-search.kml",
    mimeType: "application/vnd.google-earth.kml+xml",
    buffer: Buffer.from(`<kml><Document><Folder><name>Wide</name>
      <Placemark><name>Wide Tokyo</name><Point><coordinates>139.77,35.68</coordinates></Point></Placemark>
      <Placemark><name>Wide Kyoto</name><Point><coordinates>135.77,35.01</coordinates></Point></Placemark>
    </Folder></Document></kml>`),
  });
  await page.getByRole("button", { name: "Import 2 places, 0 lines and 0 areas" }).click();
  await page.getByLabel("Search imported places").fill("Wide");
  await page.getByLabel("Search imported places").press("Enter");
  await expect
    .poll(() =>
      page.evaluate(() => {
        const snapshot = (
          window as Window & {
            __urouteMapDiagnostics?: () => {
              clusteringEnabled: boolean;
              renderedPlaces: { id: string }[];
              zoom: number;
            };
          }
        ).__urouteMapDiagnostics?.();

        return snapshot === undefined
          ? null
          : {
              clusteringEnabled: snapshot.clusteringEnabled,
              markerCount: new Set(snapshot.renderedPlaces.map((place) => place.id)).size,
              zoomedOut: snapshot.zoom < 8,
            };
      }),
    )
    .toEqual({ clusteringEnabled: false, markerCount: 2, zoomedOut: true });
});

test("shows only nearby or dense map subsets in Maps search results", async ({ page }) => {
  const points = [
    ...Array.from(
      { length: 120 },
      (_, index) =>
        `<Placemark><name>H Tokyo ${index}</name><Point><coordinates>${139.7 + (index % 12) * 0.005},${35.6 + Math.floor(index / 12) * 0.005}</coordinates></Point></Placemark>`,
    ),
    ...Array.from(
      { length: 40 },
      (_, index) =>
        `<Placemark><name>H Kyoto ${index}</name><Point><coordinates>${135.7 + (index % 8) * 0.005},${35 + Math.floor(index / 8) * 0.005}</coordinates></Point></Placemark>`,
    ),
  ];

  await page.goto("/maps");
  await page.getByLabel("Choose KML or KMZ file").setInputFiles({
    name: "broad-search.kml",
    mimeType: "application/vnd.google-earth.kml+xml",
    buffer: Buffer.from(`<kml><Document>${points.join("")}</Document></kml>`),
  });
  await page.getByRole("button", { name: "Import 160 places, 0 lines and 0 areas" }).click();
  await page.evaluate(() => {
    const saved: unknown = JSON.parse(sessionStorage.getItem("uroute-maps-state:v1") ?? "{}");
    const state = saved !== null && typeof saved === "object" ? saved : {};
    sessionStorage.setItem(
      "uroute-maps-state:v1",
      JSON.stringify({ ...state, viewport: { latitude: 35.01, longitude: 135.77, zoom: 12 } }),
    );
  });
  await page.reload();
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (
            window as Window & {
              __urouteMapDiagnostics?: () => { center: { longitude: number } };
            }
          ).__urouteMapDiagnostics?.().center.longitude,
      ),
    )
    .toBeLessThan(136);
  await page.getByLabel("Search imported places").fill("H");
  const previewNames = await page
    .getByRole("region", { name: "Search suggestions" })
    .locator(".imported-page__search-list strong")
    .allTextContents();
  expect(previewNames).toHaveLength(40);
  await page.getByLabel("Search imported places").press("Enter");
  await expect(page.locator(".imported-page__list-heading span")).toHaveCount(0);
  await expect(page.locator(".imported-page__row")).toHaveCount(40);
  await expect(page.locator(".imported-page__row strong")).toHaveText(previewNames);
  await expect(page.getByRole("button", { name: "Show more places" })).toHaveCount(0);
  await expect
    .poll(() =>
      page.evaluate(() => {
        const snapshot = (
          window as Window & {
            __urouteMapDiagnostics?: () => {
              clusteringEnabled: boolean;
              featureCount: number | null;
            };
          }
        ).__urouteMapDiagnostics?.();

        return snapshot === undefined
          ? null
          : {
              clustered: snapshot.clusteringEnabled,
              count: snapshot.featureCount,
            };
      }),
    )
    .toEqual({ clustered: false, count: 40 });

  await page.evaluate(() => {
    const saved: unknown = JSON.parse(sessionStorage.getItem("uroute-maps-state:v1") ?? "{}");
    const state = saved !== null && typeof saved === "object" ? saved : {};
    sessionStorage.setItem(
      "uroute-maps-state:v1",
      JSON.stringify({ ...state, viewport: { latitude: -33.87, longitude: 151.2, zoom: 10 } }),
    );
  });
  await page.reload();
  await expect(page.locator(".imported-page__row")).toHaveCount(48);
  await expect(page.getByRole("button", { name: "Show more places" })).toHaveCount(0);
  await expect
    .poll(() =>
      page.evaluate(() => {
        const snapshot = (
          window as Window & {
            __urouteMapDiagnostics?: () => {
              center: { longitude: number };
              clusteringEnabled: boolean;
              featureCount: number | null;
            };
          }
        ).__urouteMapDiagnostics?.();

        return snapshot === undefined
          ? null
          : {
              clustered: snapshot.clusteringEnabled,
              count: snapshot.featureCount,
              nearTokyo: snapshot.center.longitude > 139,
            };
      }),
    )
    .toEqual({ clustered: false, count: 48, nearTokyo: true });
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
  await page.mouse.move(handle!.x + handle!.width / 2, handle!.y + 300, { steps: 8 });
  await page.mouse.up();
  await expect(page.locator(".imported-page__content--collapsed")).toBeVisible();
  await expect(page.getByRole("button", { name: "Close place details" })).toBeVisible();
  await page.getByRole("link", { name: "Trips" }).click();
  await page.getByRole("link", { name: "Maps" }).click();
  await expect(page.locator(".imported-page__content--collapsed")).toBeVisible();
  async function dragHandle(delta: number): Promise<void> {
    const bounds = await page.locator(".imported-page__sheet-handle").boundingBox();
    expect(bounds).not.toBeNull();
    const x = bounds!.x + bounds!.width / 2;
    const y = bounds!.y + bounds!.height / 2;
    await page.mouse.move(x, y);
    await page.mouse.down();
    await page.mouse.move(x, y + delta, { steps: 8 });
    await page.mouse.up();
  }
  await dragHandle(-140);
  await expect(page.locator(".imported-page__content--collapsed")).toHaveCount(0);
  await dragHandle(-140);
  await expect(page.locator(".imported-page__content--expanded")).toBeVisible();
  await dragHandle(140);
  await expect(page.locator(".imported-page__content--expanded")).toHaveCount(0);

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
  await expect(review).toContainText("470 points · 9 lines · 1 area");
  await expect(review.getByText("KANTO TRIP 2026")).toBeVisible();
  await expect(review).toContainText("CENTRAL TOKYO: 101");
  await review.getByRole("button", { name: "Import 470 places, 9 lines and 1 area" }).click();
  await expect(page.locator(".imported-page__notice")).toContainText(
    "470 places, 9 lines and 1 area imported",
  );
  await page.getByLabel("Search imported places").click();
  await page.getByLabel("Search imported places").press("Enter");
  await expect(
    page.locator(".imported-page__list-heading span").getByText("470", { exact: true }),
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
    .toMatchObject({ status: "ready", featureCount: 470, geometryFeatureCount: 10 });

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
  await expect.poll(async () => (await readCamera())?.count).toBeLessThan(470);
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
