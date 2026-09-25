import { expect, test } from "@playwright/test";

test("mock and real trips stay separate when changing mode", async ({ page }) => {
  await page.goto("/trips");
  await expect(page.getByRole("heading", { name: "Kyoto" })).toHaveCount(0);

  await page.getByRole("button", { name: "New" }).click();
  const dialog = page.getByRole("dialog", { name: "New trip" });
  await dialog.getByLabel("Destination").fill("Private test trip");
  await dialog.getByLabel("Start date").fill("2027-02-01");
  await dialog.getByLabel("End date").fill("2027-02-03");
  await dialog.getByRole("button", { name: "Create trip" }).click();

  await page.goto("/trips");
  await expect(page.locator(".featured-trip")).toContainText("Private test trip");
  await page.getByRole("button", { name: /Packing list/ }).click();
  const realPacking = page.getByRole("dialog", { name: "Packing list" });
  await expect(realPacking).toContainText("Private test trip");
  await realPacking.getByLabel("Add an item to pack").fill("Private item");
  await realPacking.getByRole("button", { name: "Add item" }).click();
  await realPacking.getByRole("button", { name: "Close packing list" }).click();

  await page.goto("/plan");
  await expect(page.getByRole("button", { name: "Browse imported maps" })).toHaveCount(0);

  await page.goto("/user");
  await page.getByRole("button", { name: "Mock" }).click();
  await expect(page).toHaveURL(/\/trips$/);
  await expect(page.getByRole("heading", { name: "Kyoto" })).toBeVisible();
  await expect(page.getByText("Private test trip")).toHaveCount(0);
  await expect(page.getByRole("button", { name: "New" })).toHaveCount(0);
  await page.getByRole("button", { name: /Packing list/ }).click();
  const mockPacking = page.getByRole("dialog", { name: "Packing list" });
  await expect(mockPacking).toContainText("Kyoto");
  await expect(mockPacking.getByText("Private item")).toHaveCount(0);
  await mockPacking.getByRole("button", { name: "Close packing list" }).click();

  await page.goto("/plan");
  await expect(page).toHaveURL(/\/plan$/);
  await expect(page.getByRole("button", { name: "Browse imported maps" })).toHaveCount(0);
  await page.goto("/maps");
  await expect(page).toHaveURL(/\/places$/);

  await page.goto("/user");
  await page.getByRole("button", { name: "My trips" }).click();
  await expect(page.locator(".featured-trip")).toContainText("Private test trip");
  await expect(page.getByRole("heading", { name: "Kyoto" })).toHaveCount(0);
  await page.reload();
  await expect(page.locator(".featured-trip")).toContainText("Private test trip");
});
