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
