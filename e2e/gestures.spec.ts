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

test("the reorder grip drags the card and settles the new order", async ({ page }) => {
  await page.goto("/plan?day=13");
  const storedPlanBeforeDrag = await page.evaluate(() =>
    window.localStorage.getItem("uroute.mock.kyoto-plan.v1"),
  );

  const firstSurface = page.locator('[data-drop-stop-id="kiyomizu"] .timeline__surface');
  const targetEntry = page.locator('[data-drop-stop-id="arabica"]');
  const grip = page.getByRole("button", { name: "Reorder Kiyomizu-dera" });
  const gripBox = await grip.boundingBox();
  const stopBox = await page.locator('[data-stop-id="kiyomizu"]').boundingBox();
  const targetBox = await targetEntry.locator(".timeline__surface").boundingBox();
  const initialBox = await firstSurface.boundingBox();
  if (gripBox === null || stopBox === null || targetBox === null || initialBox === null) {
    throw new Error("Reorder source and target must be visible");
  }
  expect(gripBox.x + gripBox.width).toBeLessThanOrEqual(stopBox.x);

  await page.mouse.move(gripBox.x + gripBox.width / 2, gripBox.y + gripBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(gripBox.x + gripBox.width / 2, gripBox.y + gripBox.height / 2 + 34, {
    steps: 3,
  });

  const travelMarkerBox = await page
    .locator('[data-drop-stop-id="kiyomizu"] .timeline__travel-marker')
    .boundingBox();
  if (travelMarkerBox === null) {
    throw new Error("Travel marker must be visible below the dragged stop");
  }
  await expect
    .poll(() =>
      page.evaluate(
        ({ x, y }) =>
          document
            .elementFromPoint(x, y)
            ?.closest(".timeline__surface")
            ?.classList.contains("timeline__surface--dragging") ?? false,
        {
          x: travelMarkerBox.x + travelMarkerBox.width / 2,
          y: travelMarkerBox.y + travelMarkerBox.height / 2,
        },
      ),
    )
    .toBe(true);

  await page.mouse.move(gripBox.x + gripBox.width / 2, targetBox.y + targetBox.height / 2, {
    steps: 5,
  });

  await expect(firstSurface).toHaveClass(/timeline__surface--dragging/);
  await expect(page.locator('[data-drop-stop-id="kiyomizu"]')).toHaveCSS("z-index", "auto");
  await expect(firstSurface).toHaveCSS("z-index", "3");
  await expect(targetEntry).toHaveClass(/timeline__entry--drop-after/);
  await expect
    .poll(() => targetEntry.evaluate((entry) => window.getComputedStyle(entry, "::before").content))
    .toBe("none");
  await expect
    .poll(async () => {
      const draggedBox = await firstSurface.boundingBox();
      if (draggedBox === null) {
        return [];
      }

      return page.evaluate(
        ({ left, top, width, height }) =>
          [0.1, 0.5, 0.9].map(
            (ratio) =>
              document
                .elementFromPoint(left + width * ratio, top + height / 2)
                ?.closest(".timeline__surface")
                ?.classList.contains("timeline__surface--dragging") ?? false,
          ),
        {
          left: draggedBox.x,
          top: draggedBox.y,
          width: draggedBox.width,
          height: draggedBox.height,
        },
      );
    })
    .toEqual([true, true, true]);
  await expect
    .poll(async () => (await firstSurface.boundingBox())?.y ?? initialBox.y)
    .toBeGreaterThan(initialBox.y + 24);
  await expect
    .poll(() =>
      page
        .locator("[data-stop-id]")
        .evaluateAll((stops) => stops.map((stop) => stop.getAttribute("data-stop-id"))),
    )
    .toEqual(["arabica", "kiyomizu", "nishiki"]);
  await expect
    .poll(() => page.evaluate(() => window.localStorage.getItem("uroute.mock.kyoto-plan.v1")))
    .toBe(storedPlanBeforeDrag);

  await page.mouse.up();
  await expect
    .poll(() =>
      page
        .locator("[data-stop-id]")
        .evaluateAll((stops) => stops.map((stop) => stop.getAttribute("data-stop-id"))),
    )
    .toEqual(["arabica", "kiyomizu", "nishiki"]);
  await expect
    .poll(
      () =>
        page
          .locator(".timeline__surface")
          .evaluateAll((surfaces) =>
            surfaces.reduce((count, surface) => count + surface.getAnimations().length, 0),
          ),
      { timeout: 1_000 },
    )
    .toBeGreaterThan(0);

  await page.reload();
  await expect
    .poll(() =>
      page
        .locator("[data-stop-id]")
        .evaluateAll((stops) => stops.map((stop) => stop.getAttribute("data-stop-id"))),
    )
    .toEqual(["arabica", "kiyomizu", "nishiki"]);
});

test("dropping on the cancel overlay restores the original order", async ({ page }) => {
  await page.goto("/plan?day=13");
  const storedPlanBeforeDrag = await page.evaluate(() =>
    window.localStorage.getItem("uroute.mock.kyoto-plan.v1"),
  );
  const grip = page.getByRole("button", { name: "Reorder Kiyomizu-dera" });
  const gripBox = await grip.boundingBox();
  const targetBox = await page
    .locator('[data-drop-stop-id="arabica"] .timeline__surface')
    .boundingBox();
  if (gripBox === null || targetBox === null) {
    throw new Error("Reorder source and target must be visible");
  }

  await page.mouse.move(gripBox.x + gripBox.width / 2, gripBox.y + gripBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(gripBox.x + gripBox.width / 2, targetBox.y + targetBox.height / 2, {
    steps: 5,
  });
  await expect
    .poll(() =>
      page
        .locator("[data-stop-id]")
        .evaluateAll((stops) => stops.map((stop) => stop.getAttribute("data-stop-id"))),
    )
    .toEqual(["arabica", "kiyomizu", "nishiki"]);

  const cancel = page.locator(".plan-reorder-cancel");
  await expect(cancel).toBeVisible();
  const cancelBox = await cancel.boundingBox();
  if (cancelBox === null) {
    throw new Error("Cancel drop zone must be visible while dragging");
  }
  await page.mouse.move(cancelBox.x + cancelBox.width / 2, cancelBox.y + cancelBox.height / 2, {
    steps: 5,
  });
  await expect(cancel).toHaveClass(/plan-reorder-cancel--active/);
  await expect
    .poll(() =>
      page
        .locator("[data-stop-id]")
        .evaluateAll((stops) => stops.map((stop) => stop.getAttribute("data-stop-id"))),
    )
    .toEqual(["kiyomizu", "arabica", "nishiki"]);

  await page.mouse.up();
  await expect(cancel).toHaveCount(0);
  await expect
    .poll(() => page.evaluate(() => window.localStorage.getItem("uroute.mock.kyoto-plan.v1")))
    .toBe(storedPlanBeforeDrag);
  await expect(page.getByText("Move cancelled.", { exact: true })).toBeAttached();
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
