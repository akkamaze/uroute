import { readFileSync } from "node:fs";

import { expect, test } from "./fixtures";

const LOGO = readFileSync("apps/mobile/public/pwa-192x192.png");

const OVERNIGHT_FLIGHT = {
  id: "manual-vz830",
  origin: "manual",
  tripId: "kyoto",
  category: "flight",
  group: "travel",
  kind: "Flight",
  dateLabel: "26 Sep 2026",
  title: "Bangkok to Tokyo",
  timeLabel: "23:35 BKK · 07:55 NRT",
  detail: "Thai Vietjet Air · VZ830",
  startDay: "2026-09-26",
  dayOrder: 0,
  endExclusive: "2026-09-28T00:00:00",
  fromName: "Bangkok",
  fromCode: "BKK",
  toName: "Tokyo",
  toCode: "NRT",
  fromLocalTime: "23:35",
  toLocalTime: "07:55",
  arrivalDayOffset: 1,
  airlineName: "Thai Vietjet Air",
  service: "VZ830",
};

test.beforeEach(async ({ page }) => {
  await page.route("**/api/auth/get-session", (route) =>
    route.fulfill({ contentType: "application/json", body: "null" }),
  );
  await page.route("https://pics.avs.io/**", (route) =>
    route.fulfill({
      body: LOGO,
      contentType: "image/png",
      headers: { "access-control-allow-origin": "*" },
    }),
  );
  await page.addInitScript((booking) => {
    window.localStorage.setItem("uroute.app-mode.v1", "mock");
    window.localStorage.setItem("uroute.manual-bookings.v1", JSON.stringify([booking]));
    Object.defineProperty(navigator, "share", { value: undefined });
  }, OVERNIGHT_FLIGHT);
});

test("an overnight flight card shows the next-day arrival, airline logo and new tagline", async ({
  page,
}) => {
  await page.goto("/bookings?booking=manual-vz830");
  const ticket = page.getByRole("article", { name: "Share preview" });
  await expect(ticket).toContainText("Journeys worth remembering");
  await expect(ticket).not.toContainText("Sample booking");
  await expect(ticket).not.toContainText("Your booking");
  await expect(ticket).not.toContainText("Travel brings us closer");
  await expect(ticket.getByLabel("1 day later")).toHaveText("+1");
  await expect(ticket).toContainText("26 Sep 2026");
  await expect(ticket.locator(".booking-ticket__operator-mark img")).toHaveAttribute(
    "src",
    "https://pics.avs.io/al_square/128/128/VZ.png",
  );
});

test("the booking list shows the next-day arrival and airline logo", async ({ page }) => {
  await page.goto("/bookings");
  const card = page.locator("#booking-card-manual-vz830");
  await expect(card.getByLabel("1 day later")).toHaveText("+1");
  await expect(card.locator(".booking-timeline__airline-mark img")).toHaveAttribute(
    "src",
    "https://pics.avs.io/al_square/128/128/VZ.png",
  );
});

test("the saved booking image matches the card preview", async ({ page }) => {
  await page.goto("/bookings?booking=manual-vz830");
  const ticket = page.getByRole("article", { name: "Share preview" });
  await expect(ticket.locator(".booking-ticket__operator-mark img")).toHaveJSProperty(
    "complete",
    true,
  );
  const preview = await ticket.screenshot();
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Share booking" }).click();
  const saved = readFileSync(await (await download).path());

  const difference = await page.evaluate(
    async ({ previewData, savedData }) => {
      async function load(data: string): Promise<HTMLImageElement> {
        const image = new Image();
        image.src = `data:image/png;base64,${data}`;
        await image.decode();

        return image;
      }
      const [previewImage, savedImage] = await Promise.all([load(previewData), load(savedData)]);
      const ticketBox = document.querySelector(".booking-ticket")!.getBoundingClientRect();
      const scale = 900 / ticketBox.width;
      const height = ticketBox.height * scale;
      const top = (1350 - height) / 2;
      const columns = 45;
      const rows = Math.round((columns * height) / 900);
      function sample(
        source: CanvasImageSource,
        sx: number,
        sy: number,
        sw: number,
        sh: number,
      ): Uint8ClampedArray {
        const canvas = document.createElement("canvas");
        canvas.width = columns;
        canvas.height = rows;
        const context = canvas.getContext("2d")!;
        context.imageSmoothingQuality = "high";
        context.drawImage(source, sx, sy, sw, sh, 0, 0, columns, rows);

        return context.getImageData(0, 0, columns, rows).data;
      }
      const expected = sample(
        previewImage,
        0,
        0,
        previewImage.naturalWidth,
        previewImage.naturalHeight,
      );
      const actual = sample(savedImage, 90, top, 900, height);
      let total = 0;
      for (let index = 0; index < expected.length; index += 4) {
        total +=
          (Math.abs(expected[index]! - actual[index]!) +
            Math.abs(expected[index + 1]! - actual[index + 1]!) +
            Math.abs(expected[index + 2]! - actual[index + 2]!)) /
          3;
      }

      return total / (expected.length / 4);
    },
    { previewData: preview.toString("base64"), savedData: saved.toString("base64") },
  );

  expect(difference).toBeLessThan(5);
});
