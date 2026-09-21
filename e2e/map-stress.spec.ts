import type { Page } from "@playwright/test";

import { expect, test } from "./fixtures";

interface MapSnapshot {
  center: { latitude: number; longitude: number };
  clusterLayerReady: boolean;
  clusteringEnabled: boolean;
  featureCount: number | null;
  firstClusterPoint: { x: number; y: number } | null;
  moving: boolean;
  renderedClusterCount: number;
  renderedClusterLabels: string[];
  renderedSelectedIds: string[];
  markerMode: "places" | "order";
  placeLabels: { name: string; label: string }[];
  numberedPlaces: { id: string; marker: string }[];
  sourceId: string;
  sourceLoaded: boolean;
  status: "loading" | "ready" | "error";
  zoom: number;
}

type DiagnosticsWindow = Window & {
  __urouteMapDiagnostics?: () => MapSnapshot;
};

async function readMapSnapshot(page: Page): Promise<MapSnapshot | null> {
  return page.evaluate(() => {
    const readDiagnostics = (window as DiagnosticsWindow).__urouteMapDiagnostics;

    return readDiagnostics?.() ?? null;
  });
}

test("loads, clusters, and interacts with 1,200 map points", async ({ page }) => {
  await page.goto("/plan?day=13&stress=1200");
  await expect(page.getByText("Synthetic stress fixture · 1,200 points")).toBeVisible();
  await expect.poll(async () => (await readMapSnapshot(page))?.status).toBe("ready");

  let snapshot = await readMapSnapshot(page);
  expect(snapshot).toMatchObject({
    clusterLayerReady: true,
    clusteringEnabled: true,
    featureCount: 1_200,
    sourceId: "trip-places",
    sourceLoaded: true,
    status: "ready",
  });
  expect(snapshot?.renderedClusterCount).toBeGreaterThan(0);
  expect(snapshot?.renderedClusterLabels.length).toBe(snapshot?.renderedClusterCount);
  expect(snapshot?.renderedClusterLabels.every((label) => /[0-9]/.test(label))).toBe(true);

  await page.getByRole("button", { name: "Map view" }).click();
  await expect(page.getByRole("button", { name: "Map view" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await page.getByRole("button", { name: "Expand map" }).click();
  await expect(page).toHaveURL(/map=full/);
  await expect(page.locator("html")).toHaveAttribute("data-orientation-policy", "any");
  await expect.poll(async () => (await readMapSnapshot(page))?.moving).toBe(false);
  await page.evaluate(
    () =>
      new Promise<void>((resolve) => {
        window.requestAnimationFrame(() => window.requestAnimationFrame(() => resolve()));
      }),
  );
  await expect
    .poll(async () => {
      const current = await readMapSnapshot(page);

      return (
        current !== null &&
        current.firstClusterPoint !== null &&
        current.renderedClusterCount > 0 &&
        !current.moving
      );
    })
    .toBe(true);

  snapshot = await readMapSnapshot(page);
  const clusterPoint = snapshot?.firstClusterPoint;
  const mapCanvas = page.locator(".trip-map__canvas");
  const mapBox = await mapCanvas.boundingBox();
  if (clusterPoint === null || clusterPoint === undefined || mapBox === null || snapshot === null) {
    throw new Error("A rendered cluster and map geometry are required for the stress interaction");
  }

  const zoomBeforeCluster = snapshot.zoom;
  await mapCanvas.click({ position: clusterPoint });
  await expect
    .poll(async () => (await readMapSnapshot(page))?.zoom ?? 0)
    .toBeGreaterThan(zoomBeforeCluster);
  await expect.poll(async () => (await readMapSnapshot(page))?.moving).toBe(false);

  snapshot = await readMapSnapshot(page);
  if (snapshot === null) {
    throw new Error("Map diagnostics disappeared after cluster expansion");
  }
  const centerBeforePan = snapshot.center;
  await page.mouse.move(mapBox.x + mapBox.width * 0.5, mapBox.y + mapBox.height * 0.55);
  await page.mouse.down();
  await page.mouse.move(mapBox.x + mapBox.width * 0.72, mapBox.y + mapBox.height * 0.55, {
    steps: 8,
  });
  await page.mouse.up();
  await expect
    .poll(async () => {
      const current = await readMapSnapshot(page);

      return current === null
        ? 0
        : Math.hypot(
            current.center.longitude - centerBeforePan.longitude,
            current.center.latitude - centerBeforePan.latitude,
          );
    })
    .toBeGreaterThan(0.0001);

  snapshot = await readMapSnapshot(page);
  const zoomBeforeWheel = snapshot?.zoom ?? 0;
  await page.mouse.move(mapBox.x + mapBox.width / 2, mapBox.y + mapBox.height / 2);
  await page.mouse.wheel(0, -600);
  await expect
    .poll(async () => (await readMapSnapshot(page))?.zoom ?? 0)
    .toBeGreaterThan(zoomBeforeWheel);

  await page.getByRole("button", { name: "Recenter on Kyoto" }).click();
  await expect.poll(async () => (await readMapSnapshot(page))?.moving).toBe(false);
  const recentered = await readMapSnapshot(page);
  expect(recentered?.sourceLoaded).toBe(true);
  expect(recentered?.featureCount).toBe(1_200);

  await page.getByRole("button", { name: "Collapse map" }).click();
  await expect(page).not.toHaveURL(/map=full/);
  await expect(page.locator("html")).toHaveAttribute("data-orientation-policy", "portrait");
  await expect(page.getByRole("navigation", { name: "Primary" })).toBeVisible();
});

test("keeps the selected place and its photo visible after zooming out into clusters", async ({
  page,
}) => {
  await page.goto("/places?place=nishiki&day=13");
  await expect(page.getByRole("img", { name: "Nishiki Market map photo" })).toBeVisible();
  await expect.poll(async () => (await readMapSnapshot(page))?.status).toBe("ready");
  await expect
    .poll(async () => (await readMapSnapshot(page))?.renderedSelectedIds)
    .toContain("nishiki");
  await page.getByRole("button", { name: "Expand map" }).click();
  await expect.poll(async () => (await readMapSnapshot(page))?.moving).toBe(false);
  const canvas = page.locator(".trip-map__canvas");
  await canvas.hover({ position: { x: 180, y: 250 } });
  await expect
    .poll(
      async () => {
        const snapshot = await readMapSnapshot(page);
        if ((snapshot?.renderedClusterCount ?? 0) > 0) {
          return true;
        }
        await page.mouse.wheel(0, 1000);

        return false;
      },
      { intervals: [800], timeout: 15_000 },
    )
    .toBe(true);
  await expect
    .poll(async () => (await readMapSnapshot(page))?.renderedSelectedIds)
    .toContain("nishiki");
});

test("switches between photo exploration and only the current day's ordered stops", async ({
  page,
}) => {
  await page.addInitScript(() => {
    window.localStorage.setItem(
      "uroute.mock.kyoto-plan.v1",
      JSON.stringify({
        days: {
          14: [
            { placeId: "nishiki", time: "10:00", notes: "" },
            { placeId: "arabica", time: "12:00", notes: "" },
          ],
        },
      }),
    );
  });
  await page.goto("/plan?day=14");
  await page.getByRole("button", { name: "Map view", exact: true }).click();
  await expect(page.getByRole("button", { name: "Places", exact: true })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await expect.poll(async () => (await readMapSnapshot(page))?.featureCount).toBe(3);
  await page.getByRole("button", { name: "Day order", exact: true }).click();
  await expect
    .poll(async () => (await readMapSnapshot(page))?.numberedPlaces)
    .toEqual([
      { id: "nishiki", marker: "place-1" },
      { id: "arabica", marker: "place-2" },
    ]);
  await expect.poll(async () => (await readMapSnapshot(page))?.clusteringEnabled).toBe(false);
  await expect(page.locator(".trip-map__photo")).toHaveCount(0);
  await page.goto("/places?place=nishiki&day=14");
  await expect(page.getByRole("img", { name: "Nishiki Market map photo" })).toBeVisible();
  await page.getByRole("button", { name: "Day order", exact: true }).click();
  await expect
    .poll(async () => (await readMapSnapshot(page))?.numberedPlaces)
    .toEqual([
      { id: "nishiki", marker: "place-1" },
      { id: "arabica", marker: "place-2" },
    ]);
  await expect(page.locator(".trip-map__photo")).toHaveCount(0);
  await page.getByRole("button", { name: "Places", exact: true }).click();
  await expect(page.getByRole("img", { name: "Nishiki Market map photo" })).toBeVisible();
  await expect.poll(async () => (await readMapSnapshot(page))?.featureCount).toBe(3);
  await expect.poll(async () => (await readMapSnapshot(page))?.clusteringEnabled).toBe(true);
  await page.goto("/places?place=nishiki&day=15");
  await page.getByRole("button", { name: "Day order", exact: true }).click();
  await expect(page.getByText("No stops planned for this day")).toBeVisible();
  await expect.poll(async () => (await readMapSnapshot(page))?.featureCount).toBe(0);
});

test("renders compact ellipsized place names in both marker modes", async ({ page }) => {
  await page.goto("/places?place=arabica&day=13");
  const readLabel = async (): Promise<string | undefined> =>
    (await readMapSnapshot(page))?.placeLabels.find(
      (place) => place.name === "% Arabica Higashiyama",
    )?.label;
  await expect.poll(readLabel).toMatch(/…$/);
  const label = await readLabel();
  expect(label?.length).toBeLessThan("% Arabica Higashiyama".length);
  await page.getByRole("button", { name: "Day order", exact: true }).click();
  await expect.poll(readLabel).toMatch(/…$/);
  await expect.poll(async () => (await readMapSnapshot(page))?.markerMode).toBe("order");
});
