import { expect, test } from "@playwright/test";
import { fileURLToPath } from "node:url";

const tripId = "5c0f7a52-58f4-4b43-a2d7-3a4f3c2b9d10";

test("a signed-in owner sets an account trip cover photo from the trip card", async ({ page }) => {
  const trip = {
    id: tripId,
    name: "Kanto",
    startDate: "2027-03-01",
    endDate: "2027-03-04",
    version: "1",
    coverVersion: null as string | null,
  };
  const uploads: { contentType: string | undefined; size: number }[] = [];
  let cover: Buffer | null = null;
  await page.route("**/api/auth/get-session", (route) =>
    route.fulfill({
      contentType: "application/json",
      body: JSON.stringify({
        session: { id: "session-1", userId: "owner-1", expiresAt: "2028-01-01T00:00:00.000Z" },
        user: { id: "owner-1", email: "owner@example.test", name: "Traveler" },
      }),
    }),
  );
  await page.route("**/api/trips?*", (route) =>
    route.fulfill({ contentType: "application/json", body: JSON.stringify({ trips: [trip] }) }),
  );
  await page.route(`**/api/trips/${tripId}/cover*`, (route) => {
    if (route.request().method() === "PUT") {
      cover = route.request().postDataBuffer();
      uploads.push({
        contentType: route.request().headers()["content-type"],
        size: cover?.byteLength ?? 0,
      });
      trip.coverVersion = "1";

      return route.fulfill({
        contentType: "application/json",
        body: JSON.stringify({ coverVersion: trip.coverVersion }),
      });
    }

    return cover
      ? route.fulfill({ contentType: "image/jpeg", body: cover })
      : route.fulfill({ status: 404, contentType: "application/json", body: "{}" });
  });

  await page.goto("/trips");
  const card = page.locator(".featured-trip");
  await expect(card).toContainText("Kanto");
  await expect(card.getByRole("img", { name: "Kanto cover" })).toHaveCount(0);
  const chooser = page.waitForEvent("filechooser");
  await card.getByRole("button", { name: "Change cover photo" }).click();
  await (
    await chooser
  ).setFiles(fileURLToPath(new URL("../apps/mobile/public/pwa-192x192.png", import.meta.url)));

  const image = card.getByRole("img", { name: "Kanto cover" });
  await expect(image).toHaveAttribute("src", `/api/trips/${tripId}/cover?v=1`);
  await expect.poll(() => image.evaluate((node: HTMLImageElement) => node.naturalWidth)).toBe(192);
  expect(uploads).toHaveLength(1);
  expect(uploads[0]!.contentType).toBe("image/jpeg");
  expect(uploads[0]!.size).toBeGreaterThan(0);
  await page.reload();
  await expect(
    page.locator(".featured-trip").getByRole("img", { name: "Kanto cover" }),
  ).toBeVisible();
});
