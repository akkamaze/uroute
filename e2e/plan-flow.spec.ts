import type { Page } from "@playwright/test";

import { expect, test } from "./fixtures";

interface StoredVisit {
  placeId: string;
  time: string;
  notes: string;
}

interface StoredPlan {
  days: Record<string, StoredVisit[]>;
}

const PLAN_STORAGE_KEY = "uroute.mock.kyoto-plan.v1";

async function readStoredPlan(page: Page): Promise<StoredPlan> {
  return page.evaluate((storageKey) => {
    const stored = window.localStorage.getItem(storageKey);

    if (stored === null) {
      throw new Error(`Missing plan storage at ${storageKey}`);
    }

    return JSON.parse(stored) as StoredPlan;
  }, PLAN_STORAGE_KEY);
}

function visitsFor(plan: StoredPlan, day: string): StoredVisit[] {
  const visits = plan.days[day];

  if (visits === undefined) {
    throw new Error(`Missing stored visits for day ${day}`);
  }

  return visits;
}

async function swipeStopLeft(page: Page, stopId: string): Promise<void> {
  const surface = page.locator(`[data-plan-stop-id="${stopId}"] .timeline__surface`);
  await surface.evaluate((element) => element.scrollIntoView({ block: "center" }));
  const box = await surface.boundingBox();
  if (box === null) {
    throw new Error(`${stopId} plan row is not visible`);
  }

  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width / 2 - 64, box.y + box.height / 2, { steps: 5 });
  await page.mouse.up();
}

test("adds one place to the chosen day and keeps it after refresh", async ({ page }) => {
  await page.goto("/trips");
  await page.getByRole("link", { name: "Open Kyoto trip plan" }).click();
  await expect(page).toHaveURL(/\/plan(?:\?|$)/);

  const fridayStops = page.locator('[aria-label="Friday itinerary"] [data-stop-id]');
  await expect(fridayStops).toHaveCount(3);
  const originalFridayIds = await fridayStops.evaluateAll((stops) =>
    stops.map((stop) => stop.getAttribute("data-stop-id")),
  );
  expect(originalFridayIds).toEqual(["kiyomizu", "arabica", "nishiki"]);

  await page.locator('[data-stop-id="nishiki"]').click();
  await expect(page).toHaveURL(/\/places\?.*place=nishiki.*day=13/);
  await page.getByRole("button", { name: "Add to trip" }).click();
  await expect(page).toHaveURL(/add=open/);

  await page
    .getByRole("combobox", { name: "Day" })
    .selectOption({ label: "Saturday, 14 November" });
  await page.getByRole("button", { name: "Add to plan" }).click();
  await expect(page.getByText("Added to Kyoto · Saturday, 14 November.")).toBeVisible();
  await page.getByRole("link", { name: "View day" }).click();

  await expect(page).toHaveURL(/\/plan\?.*day=14/);
  const saturdayItinerary = page.locator('[aria-label="Saturday itinerary"]');
  await expect(saturdayItinerary.locator('[data-stop-id="nishiki"]')).toHaveCount(1);

  let storedPlan = await readStoredPlan(page);
  expect(visitsFor(storedPlan, "13").map((visit) => visit.placeId)).toEqual(originalFridayIds);
  expect(visitsFor(storedPlan, "14").map((visit) => visit.placeId)).toEqual(["nishiki"]);

  await page.reload();
  await expect(page.locator('[aria-label="Saturday itinerary"]')).toContainText("Nishiki Market");
  storedPlan = await readStoredPlan(page);
  expect(visitsFor(storedPlan, "14").filter((visit) => visit.placeId === "nishiki")).toHaveLength(
    1,
  );

  await page.goto("/places?place=nishiki&day=14");
  await page.getByRole("button", { name: "Add to trip" }).click();
  await page.getByRole("button", { name: "Add to plan" }).click();
  await expect(page.getByRole("alert")).toHaveText(
    "Already in your plan for Saturday, 14 November. Choose another day.",
  );
  storedPlan = await readStoredPlan(page);
  expect(visitsFor(storedPlan, "13").map((visit) => visit.placeId)).toEqual(originalFridayIds);
  expect(visitsFor(storedPlan, "14").filter((visit) => visit.placeId === "nishiki")).toHaveLength(
    1,
  );
});

test("browser back and forward safely restore place search query UI", async ({ page }) => {
  await page.goto("/places?place=nishiki&day=13");
  const searchInput = page.getByRole("searchbox", { name: "Search places" });

  await searchInput.click();
  await expect(page).toHaveURL(/search=open/);
  await expect(page.locator(".place-search")).toHaveAttribute("data-active", "true");

  await page.goBack();
  await expect(page).toHaveURL(/\/places\?place=nishiki&day=13$/);
  await expect(page.locator(".place-search")).not.toHaveAttribute("data-active", "true");

  await page.goForward();
  await expect(page).toHaveURL(/search=open/);
  await expect(searchInput).toBeFocused();

  await page.goBack();
  await expect(page).toHaveURL(/\/places\?place=nishiki&day=13$/);
  await page.waitForTimeout(300);
  await expect(page).toHaveURL(/\/places\?place=nishiki&day=13$/);
});

test("place search clears text with the same compact button as Maps", async ({ page }) => {
  await page.goto("/places?place=nishiki&day=13");
  const searchInput = page.getByRole("searchbox", { name: "Search places" });

  await searchInput.fill("temple");
  await page.getByRole("button", { name: "Clear search text" }).click();

  await expect(searchInput).toHaveValue("");
  await expect(searchInput).toBeFocused();
  await expect(page.getByRole("button", { name: "Clear search text" })).toHaveCount(0);
});

test("visible place back returns to the originating plan", async ({ page }) => {
  await page.goto("/plan?day=13");
  await page.locator('[data-stop-id="nishiki"]').click();
  await expect(page).toHaveURL(/\/places\?.*place=nishiki.*day=13/);

  const backButton = page.getByRole("button", { name: "Back", exact: true });
  await expect(backButton).toBeVisible();
  await backButton.click();

  await expect(page).toHaveURL(/\/plan\?.*day=13/);
  await expect(page.locator('[data-stop-id="nishiki"]')).toBeVisible();
});

test("only the itinerary scrolls while plan chrome stays fixed", async ({ page }) => {
  await page.goto("/plan?day=13");

  await expect(page.locator(".trip-map")).toHaveCount(0);
  const selectors = [".plan-header", ".day-strip", ".bottom-navigation"];
  const planChrome = page.locator(selectors.join(", "));
  await expect(planChrome).toHaveCount(selectors.length);
  const before = await planChrome.evaluateAll((elements) =>
    elements.map((element) => ({
      className: element.getAttribute("class") ?? "",
      top: element.getBoundingClientRect().top,
    })),
  );

  const dayPlan = page.locator(".day-plan");
  await dayPlan.evaluate((element) => element.scrollTo({ top: element.scrollHeight }));
  await expect.poll(() => dayPlan.evaluate((element) => element.scrollTop)).toBeGreaterThan(0);

  const after = await planChrome.evaluateAll((elements) =>
    elements.map((element) => ({
      className: element.getAttribute("class") ?? "",
      top: element.getBoundingClientRect().top,
    })),
  );
  expect(after.map(({ className }) => className)).toEqual(before.map(({ className }) => className));
  after.forEach(({ top }, index) => expect(top).toBeCloseTo(before[index]?.top ?? top, 0));

  const overflow = await page.evaluate(() => ({
    body: document.body.scrollHeight - window.innerHeight,
    document: document.documentElement.scrollHeight - window.innerHeight,
    windowY: window.scrollY,
  }));
  expect(overflow.body).toBeLessThanOrEqual(0);
  expect(overflow.document).toBeLessThanOrEqual(0);
  expect(overflow.windowY).toBe(0);
});

test("swipe left reveals remove and undo restores the stop", async ({ page }) => {
  await page.goto("/plan?day=13");
  await swipeStopLeft(page, "arabica");

  const remove = page.getByRole("button", {
    name: "Remove % Arabica Higashiyama from Friday, 13 November",
  });
  await expect(remove).toBeVisible();
  await remove.click();
  await expect(page.locator('[data-stop-id="arabica"]')).toHaveCount(0);
  await expect(page.getByText("1 place removed", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Undo" }).click();
  await expect(page.locator('[data-stop-id="arabica"]')).toHaveCount(1);
  await expect(page.locator("[data-stop-id]")).toHaveCount(3);
});

test("revealed remove action hides add on a compact viewport", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 664 });
  await page.goto("/plan?day=13");

  await swipeStopLeft(page, "arabica");

  await expect(
    page.getByRole("button", {
      name: "Remove % Arabica Higashiyama from Friday, 13 November",
    }),
  ).toBeVisible();
  await expect(page.locator(".day-plan__add")).toHaveCount(0);
});

test("plan map pins follow removal and undo without retaining a removed selection", async ({
  page,
}) => {
  await page.goto("/plan?day=13");
  await page.getByRole("button", { name: "Map view" }).click();
  await expect
    .poll(() =>
      page.evaluate(() =>
        (
          window as Window & {
            __urouteMapDiagnostics?: () => {
              featureCount: number | null;
              renderedSelectedIds: string[];
              status: string;
            };
          }
        ).__urouteMapDiagnostics?.(),
      ),
    )
    .toMatchObject({
      featureCount: 2,
      renderedSelectedIds: ["kiyomizu"],
      status: "ready",
    });

  await swipeStopLeft(page, "kiyomizu");
  await page.getByRole("button", { name: "Remove Kiyomizu-dera from Friday, 13 November" }).click();
  await expect
    .poll(() =>
      page.evaluate(() =>
        (
          window as Window & {
            __urouteMapDiagnostics?: () => {
              featureCount: number | null;
              renderedSelectedIds: string[];
            };
          }
        ).__urouteMapDiagnostics?.(),
      ),
    )
    .toMatchObject({ featureCount: 2, renderedSelectedIds: [] });

  await page.getByRole("button", { name: "Undo" }).click();
  await expect
    .poll(() =>
      page.evaluate(() =>
        (
          window as Window & {
            __urouteMapDiagnostics?: () => {
              featureCount: number | null;
              renderedSelectedIds: string[];
            };
          }
        ).__urouteMapDiagnostics?.(),
      ),
    )
    .toMatchObject({ featureCount: 2, renderedSelectedIds: ["kiyomizu"] });
});

test("one undo restores sequential removals in their original order", async ({ page }) => {
  await page.goto("/plan?day=13");

  await swipeStopLeft(page, "kiyomizu");
  await page.getByRole("button", { name: "Remove Kiyomizu-dera from Friday, 13 November" }).click();
  await swipeStopLeft(page, "nishiki");
  await page
    .getByRole("button", { name: "Remove Nishiki Market from Friday, 13 November" })
    .click();
  await expect(page.getByText("2 places removed", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Undo" }).click();
  await expect
    .poll(() =>
      page
        .locator("[data-stop-id]")
        .evaluateAll((stops) => stops.map((stop) => stop.getAttribute("data-stop-id"))),
    )
    .toEqual(["kiyomizu", "arabica", "nishiki"]);
});

test.skip("multi-select confirms once and undo restores order and visit data", async ({ page }) => {
  await page.goto("/plan?day=13");
  await page.evaluate((storageKey) => {
    window.localStorage.setItem(
      storageKey,
      JSON.stringify({
        days: {
          12: [],
          13: [
            { placeId: "kiyomizu", time: "08:30", notes: "first" },
            { placeId: "arabica", time: "10:15", notes: "coffee" },
            { placeId: "nishiki", time: "12:30", notes: "lunch" },
          ],
          14: [],
          15: [],
          16: [],
        },
      }),
    );
  }, PLAN_STORAGE_KEY);
  await page.reload();

  await expect(
    page.getByText("Swipe left to remove · Hold to select", { exact: true }),
  ).toHaveCount(0);
  await expect(page.getByText("Drag the handle to reorder", { exact: true })).toHaveCount(0);
  const mapView = page.getByRole("button", { name: "Map view", exact: true });
  const selectPlaces = page.getByRole("button", { name: "Select places", exact: true });
  await expect(mapView).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
  await expect(selectPlaces).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
  await selectPlaces.click();
  await expect(page.getByRole("button", { name: "Exit selection mode" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  const selectionToolbar = page.getByRole("button", { name: "Cancel", exact: true });
  const firstPlanRow = page.locator('[data-drop-stop-id="kiyomizu"]');
  const toolbarBox = await selectionToolbar.boundingBox();
  const firstPlanRowBox = await firstPlanRow.boundingBox();
  if (toolbarBox === null || firstPlanRowBox === null) {
    throw new Error("Selection toolbar and first plan row must both be visible");
  }
  expect(firstPlanRowBox.y - (toolbarBox.y + toolbarBox.height)).toBeLessThanOrEqual(16);
  await page.locator(".day-plan").evaluate((plan) => {
    plan.scrollTop = plan.scrollHeight;
  });
  await expect(selectionToolbar).toBeInViewport();
  await expect(page.getByRole("checkbox")).toHaveCount(3);
  await expect(page.getByRole("checkbox", { name: "Select Kiyomizu-dera" })).toHaveCount(1);
  await expect(page.getByRole("button", { name: /Remove \d+ places?/ })).toHaveCount(0);
  const firstRow = page.locator('[data-stop-id="kiyomizu"]');
  const checkboxBox = await firstRow.locator(".timeline__selection-checkbox").boundingBox();
  const timeBox = await firstRow.locator(".timeline__time").boundingBox();
  if (checkboxBox === null || timeBox === null) {
    throw new Error("Selection checkbox and time must both be visible");
  }
  expect(checkboxBox.x).toBeLessThan(timeBox.x);
  await page.locator('[data-stop-id="kiyomizu"]').click();
  const selectedSurface = page
    .locator('[data-drop-stop-id="kiyomizu"]')
    .locator(".timeline__surface");
  await expect(selectedSurface).toHaveCSS("background-color", "rgb(245, 247, 250)");
  await expect(selectedSurface).toHaveCSS("box-shadow", "none");
  await expect(selectedSurface.locator(".timeline__info")).toHaveCSS("opacity", "0.56");
  await expect(selectedSurface.locator(".timeline__selection-checkbox--checked")).toHaveCount(1);
  await expect(selectedSurface.locator(".timeline__selection-checkbox")).toHaveCSS("opacity", "1");
  await page.locator('[data-stop-id="nishiki"]').click();
  await expect(page.locator(".timeline__selection-checkbox--checked")).toHaveCount(2);
  const bulkRemove = page.getByRole("button", { name: "Remove 2 places", exact: true });
  await expect(bulkRemove).toBeVisible();
  await expect.poll(async () => (await bulkRemove.boundingBox())?.width).toBe(56);
  await expect.poll(async () => (await bulkRemove.boundingBox())?.height).toBe(56);
  await bulkRemove.click();

  const dialog = page.getByRole("dialog", { name: "Remove 2 places?" });
  await expect(dialog).toBeVisible();
  await expect(dialog.getByRole("button", { name: "Cancel" })).toBeFocused();
  await dialog.getByRole("button", { name: "Remove 2 places", exact: true }).click();
  await expect(page.locator("[data-stop-id]")).toHaveCount(1);

  await page.getByRole("button", { name: "Undo" }).click();
  await expect(page.locator("[data-stop-id]")).toHaveCount(3);
  const stored = await readStoredPlan(page);
  expect(visitsFor(stored, "13")).toEqual([
    { placeId: "kiyomizu", time: "08:30", notes: "first" },
    { placeId: "arabica", time: "10:15", notes: "coffee" },
    { placeId: "nishiki", time: "12:30", notes: "lunch" },
  ]);
});

test.skip("selection uses the full row hit area", async ({ page }) => {
  await page.goto("/plan?day=13");
  await page.getByRole("button", { name: "Select places", exact: true }).click();

  const row = page.locator('[data-drop-stop-id="kiyomizu"]');
  const surface = row.locator(".timeline__surface");
  const box = await surface.boundingBox();
  if (box === null) {
    throw new Error("Kiyomizu selection row is not visible");
  }

  await page.mouse.click(box.x + box.width - 8, box.y + box.height / 2);
  await expect(page.getByRole("checkbox", { name: "Select Kiyomizu-dera" })).toHaveAttribute(
    "aria-checked",
    "true",
  );
});

test.skip("adjacent selected rows share corners when no travel entry separates them", async ({
  page,
}) => {
  await page.goto("/plan?day=13");
  await page.getByRole("button", { name: "Select places", exact: true }).click();

  await page.locator('[data-stop-id="kiyomizu"]').click();
  await page.locator('[data-stop-id="arabica"]').click();
  await page.locator('[data-drop-stop-id="kiyomizu"] .timeline__travel').evaluate((travel) => {
    travel.remove();
  });

  const firstSurface = page.locator('[data-drop-stop-id="kiyomizu"] .timeline__surface');
  const secondSurface = page.locator('[data-drop-stop-id="arabica"] .timeline__surface');
  const firstShell = page.locator('[data-drop-stop-id="kiyomizu"] .timeline__swipe-shell');
  const secondShell = page.locator('[data-drop-stop-id="arabica"] .timeline__swipe-shell');
  await expect(firstSurface).toHaveCSS("border-bottom-left-radius", "0px");
  await expect(firstSurface).toHaveCSS("border-bottom-right-radius", "0px");
  await expect(secondSurface).toHaveCSS("border-top-left-radius", "0px");
  await expect(secondSurface).toHaveCSS("border-top-right-radius", "0px");
  await expect(firstShell).toHaveCSS("border-bottom-left-radius", "0px");
  await expect(firstShell).toHaveCSS("border-bottom-right-radius", "0px");
  await expect(secondShell).toHaveCSS("border-top-left-radius", "0px");
  await expect(secondShell).toHaveCSS("border-top-right-radius", "0px");
});

test.skip("leaving the plan with selected places asks for confirmation", async ({ page }) => {
  await page.goto("/plan?day=13");
  await page.getByRole("button", { name: "Select places", exact: true }).click();
  await page.locator('[data-stop-id="kiyomizu"]').click();

  await page.getByRole("link", { name: "Bookings", exact: true }).click();
  const leaveDialog = page.getByRole("dialog", { name: "Leave selection mode?" });
  await expect(leaveDialog).toBeVisible();
  await expect(leaveDialog.getByRole("button", { name: "Keep selecting" })).toBeFocused();
  await page.keyboard.press("Escape");
  await expect(page).toHaveURL(/\/plan\?day=13$/);
  await expect(leaveDialog).toBeHidden();
  await expect(page.getByRole("checkbox", { name: "Select Kiyomizu-dera" })).toHaveAttribute(
    "aria-checked",
    "true",
  );

  await page.getByRole("link", { name: "Bookings", exact: true }).click();
  await leaveDialog.getByRole("button", { name: "Leave page" }).click();
  await expect(page).toHaveURL(/\/bookings$/);
});

test.skip("changing days with selected places asks for confirmation", async ({ page }) => {
  await page.goto("/plan?day=13");
  await page.getByRole("button", { name: "Select places", exact: true }).click();
  await page.locator('[data-stop-id="kiyomizu"]').click();

  await page.getByRole("button", { name: "Sat 14", exact: true }).click();
  const changeDayDialog = page.getByRole("dialog", { name: "Change day?" });
  await expect(changeDayDialog).toBeVisible();
  await expect(page).toHaveURL(/\/plan\?day=13$/);
  await changeDayDialog.getByRole("button", { name: "Change day", exact: true }).click();

  await expect(page).toHaveURL(/\/plan\?day=14$/);
  await expect(page.getByRole("button", { name: "Select places", exact: true })).toBeVisible();
});
