import { expect, test } from "./fixtures";

test("touch swipe reveals the compact remove action without exposing it at rest", async ({
  page,
}) => {
  await page.goto("/plan?day=13");
  const row = page.locator('[data-drop-stop-id="arabica"]');
  const surface = row.locator(".timeline__surface");
  const remove = row.locator(".timeline__remove");
  const box = await surface.boundingBox();
  if (box === null) {
    throw new Error("Arabica plan row is not visible");
  }

  await expect(remove).toHaveCSS("opacity", "0");
  const client = await page.context().newCDPSession(page);
  const start = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  await client.send("Input.dispatchTouchEvent", {
    type: "touchStart",
    touchPoints: [{ ...start, id: 1 }],
  });
  await client.send("Input.dispatchTouchEvent", {
    type: "touchMove",
    touchPoints: [{ x: start.x - 64, y: start.y, id: 1 }],
  });
  await client.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });

  await expect(remove).toHaveCSS("opacity", "1");
  await expect(remove).toHaveCSS("width", "64px");
  await expect(remove.locator("svg")).toHaveAttribute("width", "18");
});

test("expanded place content owns scrolling and a handle drag settles the sheet", async ({
  page,
}) => {
  await page.goto("/places?place=nishiki&day=13");

  await page.waitForFunction(() => {
    const snapshot = (
      window as Window & { __urouteMapDiagnostics?: () => { status: string; moving: boolean } }
    ).__urouteMapDiagnostics?.();

    return snapshot?.status === "ready" && !snapshot.moving;
  });
  const readCamera = async (): Promise<unknown> =>
    page.evaluate(() => {
      const snapshot = (
        window as Window & { __urouteMapDiagnostics?: () => { center: unknown; zoom: number } }
      ).__urouteMapDiagnostics?.();

      return { center: snapshot?.center, zoom: snapshot?.zoom };
    });
  const originalCamera = await readCamera();
  const sheet = page.getByRole("region", { name: "Place details" });
  await expect(sheet).toHaveAttribute("data-snap", "middle");
  await page.getByRole("button", { name: "Expand place details" }).click();
  await expect(sheet).toHaveAttribute("data-snap", "expanded");

  await expect.poll(async () => (await sheet.boundingBox())?.y).toBeCloseTo(72, 0);
  expect(await readCamera()).toEqual(originalCamera);
  const expandedBox = await sheet.boundingBox();
  expect(expandedBox).not.toBeNull();
  expect(expandedBox?.y).toBeCloseTo(72, 0);

  const content = sheet.locator(".place-sheet__content");
  await content.evaluate((element) => element.scrollTo({ top: element.scrollHeight }));
  await expect.poll(() => content.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);
  expect(await sheet.evaluate((element) => element.getBoundingClientRect().top)).toBeCloseTo(72, 0);
  expect(await page.evaluate(() => window.scrollY)).toBe(0);

  const handle = page.getByRole("button", { name: "Collapse place details" });
  const handleBox = await handle.boundingBox();
  if (handleBox === null) {
    throw new Error("Place sheet handle is not visible");
  }

  const startX = handleBox.x + handleBox.width / 2;
  const startY = handleBox.y + handleBox.height / 2;
  await page.mouse.move(startX, startY);
  await page.mouse.down();
  await page.waitForTimeout(180);
  await page.mouse.move(startX, startY + 80, { steps: 4 });
  await page.mouse.up();

  await expect(sheet).toHaveAttribute("data-snap", "middle");
  const middleBox = await sheet.boundingBox();
  expect(middleBox).not.toBeNull();
  expect(middleBox?.y).toBeGreaterThan(expandedBox?.y ?? 72);
  expect(await readCamera()).toEqual(originalCamera);
});

test("swipe back reserves the system edge and accepts the adjacent app zone", async ({ page }) => {
  await page.goto("/trips");
  await page.getByRole("link", { name: "Open Kyoto trip plan" }).click();
  await expect(page.locator(".plan-header")).toBeVisible();

  const navigation = page.locator(".app-navigation");
  await page.mouse.move(8, 120);
  await page.mouse.down();
  await page.mouse.move(140, 122, { steps: 3 });
  await expect(navigation).not.toHaveAttribute("data-swipe-phase", "dragging");
  await page.mouse.up();
  await expect(page).toHaveURL(/\/plan(?:\?|$)/);

  await page.mouse.move(40, 120);
  await page.mouse.down();
  await page.mouse.move(150, 122, { steps: 4 });
  await expect(navigation).toHaveAttribute("data-swipe-phase", "dragging");
  await page.mouse.move(180, 122);
  await page.mouse.up();

  await expect(page).toHaveURL(/\/trips(?:\?|$)/);
  await expect(navigation).toHaveAttribute("data-swipe-phase", "idle");
});

test("holding a row selects it while the grip owns keyboard reordering", async ({ page }) => {
  await page.goto("/plan?day=13");

  const firstStop = page.locator('[data-stop-id="kiyomizu"]');
  const box = await firstStop.boundingBox();
  if (box === null) {
    throw new Error("Kiyomizu plan row is not visible");
  }

  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.waitForTimeout(500);
  await page.mouse.up();

  await expect(page).toHaveURL(/\/plan\?day=13$/);
  await expect(firstStop).toHaveAttribute("aria-checked", "true");
  await page.getByRole("button", { name: "Cancel", exact: true }).click();

  const grip = page.getByRole("button", { name: "Reorder Kiyomizu-dera" });
  await grip.focus();
  await grip.press("Alt+ArrowDown");
  await expect
    .poll(() =>
      page
        .locator("[data-stop-id]")
        .evaluateAll((stops) => stops.map((stop) => stop.getAttribute("data-stop-id"))),
    )
    .toEqual(["arabica", "kiyomizu", "nishiki"]);
});
