import { expect, test } from "@playwright/test";

for (const path of ["/welcome", "/trips", "/maps"]) {
  test(`landscape phones see the portrait guard on ${path}`, async ({ page }) => {
    await page.route("**/api/auth/get-session", (route) =>
      route.fulfill({ contentType: "application/json", body: "null" }),
    );
    await page.goto(path);
    await expect(page.locator("html")).toHaveAttribute("data-orientation-policy", "portrait");
    await page.setViewportSize({ width: 844, height: 390 });
    await expect(page.getByRole("status").filter({ hasText: "Rotate your phone" })).toBeVisible();
  });
}
