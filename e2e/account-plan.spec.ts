import { expect, test, type Route } from "@playwright/test";

const tripId = "7fb9672e-3f50-41f7-99e7-05c2b9030d8f";
const day = "2026-10-01";

test("a server trip uses the existing plan UI and saves edited rows back to the account", async ({
  page,
}) => {
  let version = "1";
  const trip = { id: tripId, name: "Kanto", startDate: day, endDate: "2026-10-02", version };
  let entries = [
    {
      id: "entry-1",
      sourceKey: "entry:1",
      day,
      variant: "A",
      position: 0,
      kind: "place",
      title: "Senso-ji",
      timeLabel: "09:00",
      detail: "Visit temple",
      area: "Asakusa",
      placeId: "pin-1",
      place: {
        sourceKey: "pin-1",
        name: "Senso-ji",
        latitude: 35.715,
        longitude: 139.796,
        category: "temple",
        imageUrl: null,
        notes: null,
      },
    },
  ];
  const saves: unknown[] = [];
  await page.route("**/api/auth/get-session", (route) =>
    route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        session: { id: "session-1", userId: "owner-1", expiresAt: "2027-01-01T00:00:00.000Z" },
        user: { id: "owner-1", email: "owner@example.test", name: "Traveler" },
      }),
    }),
  );
  await page.route("**/api/trips?*", (route) =>
    route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({ trips: [{ ...trip, version }] }),
    }),
  );
  await page.route(`**/api/trips/${tripId}`, (route) =>
    route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({ ...trip, version }),
    }),
  );
  await page.route(`**/api/trips/${tripId}/plan?*`, (route) => {
    if (route.request().method() === "PUT") {
      const payload = route.request().postDataJSON() as {
        version: string;
        entries: typeof entries;
      };
      saves.push(payload);
      if (payload.version !== version) {
        return route.fulfill({ status: 409, body: "{}" });
      }

      version = String(Number(version) + 1);
      entries = payload.entries.map((entry, index) => ({
        ...entry,
        id: `saved-${index}`,
        place: entry.placeId === "pin-1" ? entries[0]!.place : null,
      }));
    }

    return route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({ trip: { ...trip, version }, version, entries }),
    });
  });

  await page.goto("/trips");
  await expect(page.locator(".featured-trip")).toContainText("Kanto");
  await page.getByRole("link", { name: "Open Kanto trip plan" }).click();
  await expect(page.getByLabel(/Thursday 1 October itinerary/)).toContainText("Senso-ji");
  await page.getByRole("button", { name: "Edit plan for Thursday 1 October" }).click();
  await expect(page.getByRole("button", { name: "Reorder Senso-ji" })).toBeVisible();
  await page.getByRole("button", { name: "Remove", exact: true }).click();
  await page.getByRole("checkbox", { name: "Mark Senso-ji for removal" }).click();
  await page.getByRole("button", { name: "Remove 1 place" }).click();
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page).toHaveURL(new RegExp(`/plan/trip/${tripId}`));
  expect(saves).toHaveLength(1);
  await expect(page.getByRole("heading", { name: "A day to make your own" })).toBeVisible();
  await page.reload();
  await expect(page.getByRole("heading", { name: "A day to make your own" })).toBeVisible();
});

test("opening a server trip stop shows its details with directions", async ({ page }) => {
  const trip = { id: tripId, name: "Kanto", startDate: day, endDate: "2026-10-02", version: "1" };
  const entries = [
    {
      id: "entry-1",
      sourceKey: "entry:1",
      day,
      variant: "A",
      position: 0,
      kind: "place",
      title: "Senso-ji",
      timeLabel: "09:00",
      detail: "Visit temple",
      area: "Asakusa",
      placeId: "pin-1",
      place: {
        sourceKey: "pin-1",
        name: "Senso-ji",
        latitude: 35.715,
        longitude: 139.796,
        category: "temple",
        imageUrl: null,
        notes: null,
      },
    },
  ];
  await page.route("**/api/auth/get-session", (route) =>
    route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        session: { id: "session-1", userId: "owner-1", expiresAt: "2027-01-01T00:00:00.000Z" },
        user: { id: "owner-1", email: "owner@example.test", name: "Traveler" },
      }),
    }),
  );
  await page.route("**/api/trips?*", (route) =>
    route.fulfill({ contentType: "application/json", body: JSON.stringify({ trips: [trip] }) }),
  );
  await page.route(`**/api/trips/${tripId}`, (route) =>
    route.fulfill({ contentType: "application/json", body: JSON.stringify(trip) }),
  );
  const placeSaves: { category: string | null }[] = [];
  await page.route(`**/api/trips/${tripId}/places`, (route) => {
    const saved = route.request().postDataJSON() as (typeof entries)[number]["place"];
    placeSaves.push(saved);
    entries[0]!.place = saved;

    return route.fulfill({ contentType: "application/json", body: JSON.stringify(saved) });
  });
  await page.route(`**/api/trips/${tripId}/plan?*`, (route) =>
    route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({ trip, version: trip.version, entries }),
    }),
  );

  await page.goto("/maps");
  await page.getByLabel("Choose KML or KMZ file").setInputFiles({
    name: "kanto.kml",
    mimeType: "application/vnd.google-earth.kml+xml",
    buffer: Buffer.from(
      `<kml><Document><Placemark><name>Senso-ji</name><Point><coordinates>139.796,35.715</coordinates></Point></Placemark><Placemark><name>Other place</name><Point><coordinates>139.7,35.6</coordinates></Point></Placemark></Document></kml>`,
    ),
  });
  await page.getByRole("button", { name: "Import 2 places, 0 lines and 0 areas" }).click();
  await page.goto(`/plan/trip/${tripId}?day=${day}`);
  await page.evaluate(() =>
    sessionStorage.setItem(
      "uroute-maps-state:v1",
      JSON.stringify({ query: "Other place", draftQuery: "Other place", searchOpen: true }),
    ),
  );
  await page
    .getByLabel(/Thursday 1 October itinerary/)
    .getByRole("button", { name: /Senso-ji/ })
    .click();
  await expect(page).toHaveURL(/\/maps\?.*place=pin-1/);
  await expect
    .poll(() =>
      page.evaluate(() => {
        const diagnostics = (
          window as Window & {
            __urouteMapDiagnostics?: () => {
              center: { latitude: number; longitude: number };
              placeLabels: { name: string }[];
              renderedSelectedIds: string[];
              status: string;
            };
          }
        ).__urouteMapDiagnostics?.();

        return diagnostics?.status === "ready"
          ? {
              selected: diagnostics.renderedSelectedIds,
              sensoji: diagnostics.placeLabels.filter((label) => label.name === "Senso-ji").length,
              near:
                Math.abs(diagnostics.center.latitude - 35.715) < 0.01 &&
                Math.abs(diagnostics.center.longitude - 139.796) < 0.01,
            }
          : null;
      }),
    )
    .toEqual({ selected: ["pin-1"], sensoji: 1, near: true });
  await expect(
    page.getByRole("link", {
      name: "Directions to Senso-ji in Google Maps (opens another app or tab)",
    }),
  ).toHaveAttribute("href", "https://www.google.com/maps/dir/?api=1&destination=35.715,139.796");
  await page.getByRole("button", { name: "Category: Temple / Shrine. Change category" }).click();
  await page
    .getByRole("group", { name: "Choose place category" })
    .getByRole("button", { name: "Museum" })
    .click();
  await expect(
    page.getByRole("button", { name: "Category: Museum. Change category" }),
  ).toBeVisible();
  expect(placeSaves).toEqual([
    {
      sourceKey: "pin-1",
      name: "Senso-ji",
      latitude: 35.715,
      longitude: 139.796,
      category: "museum",
      imageUrl: null,
      notes: null,
    },
  ]);
  await page.reload();
  await expect(
    page.getByRole("button", { name: "Category: Museum. Change category" }),
  ).toBeVisible();
});

test("swipe back returns from a server trip plan and its map place", async ({ page }) => {
  const trip = { id: tripId, name: "Kanto", startDate: day, endDate: "2026-10-02", version: "1" };
  const entries = [
    {
      id: "entry-1",
      sourceKey: "entry:1",
      day,
      variant: "A",
      position: 0,
      kind: "place",
      title: "Senso-ji",
      timeLabel: "09:00",
      detail: "Visit temple",
      area: "Asakusa",
      placeId: "pin-1",
      place: {
        sourceKey: "pin-1",
        name: "Senso-ji",
        latitude: 35.715,
        longitude: 139.796,
        category: "temple",
        imageUrl: null,
        notes: null,
      },
    },
  ];
  await page.route("**/api/auth/get-session", (route) =>
    route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        session: { id: "session-1", userId: "owner-1", expiresAt: "2027-01-01T00:00:00.000Z" },
        user: { id: "owner-1", email: "owner@example.test", name: "Traveler" },
      }),
    }),
  );
  await page.route("**/api/trips?*", (route) =>
    route.fulfill({ contentType: "application/json", body: JSON.stringify({ trips: [trip] }) }),
  );
  await page.route(`**/api/trips/${tripId}`, (route) =>
    route.fulfill({ contentType: "application/json", body: JSON.stringify(trip) }),
  );
  await page.route(`**/api/trips/${tripId}/plan?*`, (route) =>
    route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({ trip, version: trip.version, entries }),
    }),
  );
  const navigation = page.locator(".app-navigation");
  async function swipeBack(y: number): Promise<void> {
    await page.mouse.move(40, y);
    await page.mouse.down();
    await page.mouse.move(150, y + 2, { steps: 4 });
    await expect(navigation).toHaveAttribute("data-swipe-phase", "dragging");
    await page.mouse.move(220, y + 2);
    await page.mouse.up();
  }

  await page.goto("/trips");
  await page.getByRole("link", { name: "Open Kanto trip plan" }).click();
  await expect(page.getByLabel(/Thursday 1 October itinerary/)).toContainText("Senso-ji");
  await swipeBack(120);
  await expect(page).toHaveURL(/\/trips(?:\?|$)/);
  await expect(navigation).toHaveAttribute("data-swipe-phase", "idle");

  await expect(async () => {
    await page.getByRole("link", { name: "Open Kanto trip plan" }).click();
    await expect(page).toHaveURL(new RegExp(`/plan/trip/${tripId}`), { timeout: 1_000 });
  }).toPass();
  await page
    .getByLabel(/Thursday 1 October itinerary/)
    .getByRole("button", { name: /Senso-ji/ })
    .click();
  await expect(page.getByRole("button", { name: "Close place details" })).toBeVisible();
  const heading = await page.getByRole("heading", { name: "Senso-ji" }).boundingBox();
  if (heading === null) {
    throw new Error("Place details must be visible");
  }
  await swipeBack(heading.y + heading.height / 2);
  await expect(page).toHaveURL(new RegExp(`/plan/trip/${tripId}`));
  await expect(navigation).toHaveAttribute("data-swipe-phase", "idle");
});

test("returning from a map place keeps the plan scroll position", async ({ page }) => {
  const trip = { id: tripId, name: "Kanto", startDate: day, endDate: "2026-10-02", version: "1" };
  const entries = Array.from({ length: 14 }, (_, index) => ({
    id: `entry-${index}`,
    sourceKey: `entry:${index}`,
    day,
    variant: "A",
    position: index,
    kind: "place",
    title: `Stop ${index}`,
    timeLabel: `${String(8 + Math.floor(index / 2)).padStart(2, "0")}:00`,
    detail: "A place to visit during the day",
    area: "Tokyo",
    placeId: `pin-${index}`,
    place: {
      sourceKey: `pin-${index}`,
      name: `Stop ${index}`,
      latitude: 35.68 + index / 1000,
      longitude: 139.76 + index / 1000,
      category: "sightseeing",
      imageUrl: null,
      notes: null,
    },
  }));
  let sessionLoads = 0;
  await page.route("**/api/auth/get-session", async (route) => {
    sessionLoads += 1;
    if (sessionLoads > 1) {
      await new Promise((resolve) => setTimeout(resolve, 800));
    }
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        session: { id: "session-1", userId: "owner-1", expiresAt: "2027-01-01T00:00:00.000Z" },
        user: { id: "owner-1", email: "owner@example.test", name: "Traveler" },
      }),
    });
  });
  await page.route("**/api/trips?*", (route) =>
    route.fulfill({ contentType: "application/json", body: JSON.stringify({ trips: [trip] }) }),
  );
  let tripLoads = 0;
  await page.route(`**/api/trips/${tripId}`, async (route) => {
    tripLoads += 1;
    if (tripLoads > 1) {
      await new Promise((resolve) => setTimeout(resolve, 800));
    }
    await route.fulfill({ contentType: "application/json", body: JSON.stringify(trip) });
  });
  let planLoads = 0;
  await page.route(`**/api/trips/${tripId}/plan?*`, async (route) => {
    planLoads += 1;
    if (planLoads > 1) {
      await new Promise((resolve) => setTimeout(resolve, 800));
    }
    await route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({ trip, version: trip.version, entries }),
    });
  });

  await page.goto(`/plan/trip/${tripId}?day=${day}`);
  const itinerary = page.getByLabel(/Thursday 1 October itinerary/);
  const stop = itinerary.getByRole("button", { name: /Stop 11/ });
  await stop.scrollIntoViewIfNeeded();
  await expect(page.getByRole("group", { name: "Trip days" })).toBeHidden();
  const before = await stop.evaluate((element) => element.getBoundingClientRect().top);
  expect(
    await page.locator(".trip-plan .day-plan").evaluate((element) => element.scrollTop),
  ).toBeGreaterThan(100);
  await stop.click();
  await expect(page).toHaveURL(/\/maps\?.*place=pin-11/);
  await page.goBack();
  await expect(itinerary).toContainText("Stop 11");
  await expect
    .poll(() => stop.evaluate((element) => element.getBoundingClientRect().top))
    .toBeGreaterThan(before - 5);
  expect(await stop.evaluate((element) => element.getBoundingClientRect().top)).toBeLessThan(
    before + 5,
  );
});

test("a server trip plan hides the app navigation and folds its day chrome while reading", async ({
  page,
}) => {
  const trip = { id: tripId, name: "Kanto", startDate: day, endDate: "2026-10-02", version: "1" };
  const entries = Array.from({ length: 14 }, (_, index) => ({
    id: `entry-${index}`,
    sourceKey: `entry:${index}`,
    day,
    variant: "A",
    position: index,
    kind: "place",
    title: `Stop ${index}`,
    timeLabel: "09:00",
    detail: "A place to visit during the day",
    area: "Tokyo",
    placeId: null,
    place: null,
  }));
  await page.route("**/api/auth/get-session", (route) =>
    route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        session: { id: "session-1", userId: "owner-1", expiresAt: "2027-01-01T00:00:00.000Z" },
        user: { id: "owner-1", email: "owner@example.test", name: "Traveler" },
      }),
    }),
  );
  await page.route("**/api/trips?*", (route) =>
    route.fulfill({ contentType: "application/json", body: JSON.stringify({ trips: [trip] }) }),
  );
  await page.route(`**/api/trips/${tripId}`, (route) =>
    route.fulfill({ contentType: "application/json", body: JSON.stringify(trip) }),
  );
  await page.route(`**/api/trips/${tripId}/plan?*`, (route) =>
    route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({ trip, version: trip.version, entries }),
    }),
  );

  await page.goto(`/plan/trip/${tripId}?day=${day}`);
  await expect(page.getByLabel(/Thursday 1 October itinerary/)).toContainText("Stop 13");
  await expect(page.getByRole("navigation", { name: "Primary" })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Edit trip details" })).toHaveCount(0);
  const addButton = await page.locator(".floating-add-button").boundingBox();
  const viewport = page.viewportSize();
  if (addButton === null || viewport === null) {
    throw new Error("The add button must be visible");
  }
  expect(viewport.height - (addButton.y + addButton.height)).toBeLessThan(32);
  const days = page.getByRole("group", { name: "Trip days" });
  const sections = page.getByRole("navigation", { name: "Trip sections" });
  await expect(days).toBeVisible();
  const scroller = page.locator(".trip-plan .day-plan");
  await scroller.evaluate((element) => element.scrollBy(0, 400));
  await expect(days).toBeHidden();
  await expect(sections).toBeHidden();
  await expect(page.getByRole("heading", { name: "Kanto" })).toBeVisible();
  await scroller.evaluate((element) => element.scrollBy(0, -200));
  await expect(days).toBeVisible();
  await expect(sections).toBeVisible();
});

test("a server trip opens its bookings and expenses and accepts a flight booking", async ({
  page,
}) => {
  const trip = {
    id: tripId,
    name: "Kanto",
    startDate: "2026-09-26",
    endDate: "2026-10-02",
    version: "1",
  };
  await page.route("**/api/auth/get-session", (route) =>
    route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        session: { id: "session-1", userId: "owner-1", expiresAt: "2027-01-01T00:00:00.000Z" },
        user: { id: "owner-1", email: "owner@example.test", name: "Traveler" },
      }),
    }),
  );
  await page.route("**/api/trips?*", (route) =>
    route.fulfill({ contentType: "application/json", body: JSON.stringify({ trips: [trip] }) }),
  );

  await page.goto(`/plan/trip/${tripId}/bookings`);
  await page.getByRole("button", { name: "Add booking" }).click();
  await page
    .getByRole("dialog", { name: "Add booking" })
    .getByRole("button", { name: "Flight" })
    .click();
  await expect(page.getByRole("dialog", { name: "Trip & dates" })).toContainText("Kanto");
  await page.getByRole("button", { name: "Close add booking" }).click();

  await page.goto(`/plan/trip/${tripId}/expenses`);
  await expect(page.getByRole("heading", { name: "Kanto" })).toBeVisible();
});

test("a cached server trip plan appears before the account API answers", async ({ page }) => {
  const trip = { id: tripId, name: "Kanto", startDate: day, endDate: "2026-10-02", version: "1" };
  const entries = [
    {
      id: "entry-1",
      sourceKey: "entry:1",
      day,
      variant: "A",
      position: 0,
      kind: "place",
      title: "Senso-ji",
      timeLabel: "09:00",
      detail: "Visit temple",
      area: "Asakusa",
      placeId: "pin-1",
      place: {
        sourceKey: "pin-1",
        name: "Senso-ji",
        latitude: 35.715,
        longitude: 139.796,
        category: "temple",
        imageUrl: null,
        notes: null,
      },
    },
  ];
  let slow = false;
  async function answer(route: Route, body: unknown): Promise<void> {
    if (slow) {
      await new Promise((resolve) => setTimeout(resolve, 4_000));
    }
    await route.fulfill({ contentType: "application/json", body: JSON.stringify(body) });
  }
  await page.route("**/api/auth/get-session", (route) =>
    route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        session: { id: "session-1", userId: "owner-1", expiresAt: "2027-01-01T00:00:00.000Z" },
        user: { id: "owner-1", email: "owner@example.test", name: "Traveler" },
      }),
    }),
  );
  await page.route("**/api/trips?*", (route) => answer(route, { trips: [trip] }));
  await page.route(`**/api/trips/${tripId}`, (route) => answer(route, trip));
  await page.route(`**/api/trips/${tripId}/plan?*`, (route) =>
    answer(route, { trip, version: trip.version, entries }),
  );

  await page.goto(`/plan/trip/${tripId}?day=${day}`);
  const itinerary = page.getByLabel(/Thursday 1 October itinerary/);
  await expect(itinerary).toContainText("Senso-ji");
  slow = true;
  await page.reload();
  await expect(itinerary).toContainText("Senso-ji", { timeout: 1_500 });
});
