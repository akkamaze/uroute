import { expect, test as base, type Page } from "@playwright/test";

const TRANSPARENT_PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=",
  "base64",
);

type RuntimeFixtures = {
  runtimeErrors: string[];
};

async function stubMapTiles(page: Page): Promise<void> {
  await page.route("https://tile.openstreetmap.org/**", async (route) => {
    await route.fulfill({ body: TRANSPARENT_PNG, contentType: "image/png", status: 200 });
  });
}

export const test = base.extend<RuntimeFixtures>({
  runtimeErrors: [
    async ({ page }, use) => {
      const errors: string[] = [];

      page.on("pageerror", (error) => errors.push(`pageerror: ${error.message}`));
      page.on("console", (message) => {
        if (message.type() === "error") {
          errors.push(`console.error: ${message.text()}`);
        }
      });
      await stubMapTiles(page);
      await use(errors);
      expect(errors, "uncaught browser errors").toEqual([]);
    },
    { auto: true },
  ],
});

export { expect } from "@playwright/test";
