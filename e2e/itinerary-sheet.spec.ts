import { expect, test } from "@playwright/test";
import { strToU8, zipSync } from "fflate";

function sheet(rows: string[]): string {
  return `<?xml version="1.0" encoding="UTF-8"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main"><sheetData><row r="1"/><row r="2"/>${rows.map((title, index) => `<row r="${index + 3}"><c r="D${index + 3}" t="inlineStr"><is><t>${title}</t></is></c></row>`).join("")}</sheetData></worksheet>`;
}

function itineraryFile(includeOptionB = true): Buffer {
  const workbook = `<?xml version="1.0" encoding="UTF-8"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets><sheet name="D1-27" sheetId="1" r:id="rId1"/><sheet name="D2-28 A" sheetId="2" r:id="rId2"/><sheet name="D2-28 B" sheetId="3" r:id="rId3"/></sheets></workbook>`;
  const relationships = `<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Target="worksheets/sheet1.xml"/><Relationship Id="rId2" Target="worksheets/sheet2.xml"/><Relationship Id="rId3" Target="worksheets/sheet3.xml"/></Relationships>`;

  return Buffer.from(
    zipSync({
      "xl/workbook.xml": strToU8(workbook),
      "xl/_rels/workbook.xml.rels": strToU8(relationships),
      "xl/worksheets/sheet1.xml": strToU8(sheet(["[ Cafe ] Exact place", "[ Park ] Not imported"])),
      "xl/worksheets/sheet2.xml": strToU8(sheet(["Option A place"])),
      "xl/worksheets/sheet3.xml": strToU8(sheet(includeOptionB ? ["Option B place"] : [])),
    }),
  );
}

test("imports day order, links only verified pins, and keeps the chosen alternative", async ({
  page,
}) => {
  await page.goto("/maps");
  await page.getByLabel("Choose KML or KMZ file").setInputFiles({
    name: "places.kml",
    mimeType: "application/vnd.google-earth.kml+xml",
    buffer: Buffer.from(
      `<kml><Document><Placemark><name>[ Cafe ] Exact place</name><Point><coordinates>139.77,35.68</coordinates></Point></Placemark></Document></kml>`,
    ),
  });
  await page.getByRole("button", { name: "Import 1 place, 0 lines and 0 areas" }).click();
  await page.goto("/trips");
  await page.getByRole("button", { name: "New" }).click();
  const dialog = page.getByRole("dialog", { name: "New trip" });
  await dialog.getByLabel("Destination").fill("Kanto test");
  await dialog.getByLabel("Start date").fill("2026-09-27");
  await dialog.getByLabel("End date").fill("2026-09-28");
  await dialog.getByRole("button", { name: "Create trip" }).click();
  await expect(page.getByRole("heading", { name: "Kanto test" })).toBeVisible();
  await page.getByLabel("Choose itinerary spreadsheet").setInputFiles({
    name: "itinerary.xlsx",
    mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    buffer: itineraryFile(),
  });
  await expect(page.getByRole("status")).toContainText(
    "4 itinerary rows imported · 1 map pins linked · 1 places need review",
  );
  const dayOne = page.getByLabel("Sunday 27 September itinerary");
  await expect(dayOne.locator("[data-plan-stop-id]").first()).toContainText("Exact place");
  await expect(dayOne.locator("[data-plan-stop-id]").last()).toContainText(
    "Not linked to a map pin",
  );
  await expect(dayOne.getByRole("button", { name: /Exact place/ })).toBeVisible();
  await page.getByRole("button", { name: "Map view" }).click();
  await expect(page.getByRole("button", { name: "Recenter on day places" })).toBeVisible();
  await page.getByRole("button", { name: "Edit plan" }).click();
  await page
    .getByRole("textbox", { name: "Note for [ Cafe ] Exact place" })
    .fill("Meet at entrance");
  await page.getByRole("button", { name: "Save [ Cafe ] Exact place" }).click();
  await page.getByRole("button", { name: "Done editing plan" }).click();
  await page.reload();
  await expect(dayOne).toContainText("Meet at entrance");
  await page.getByRole("button", { name: "Monday 28 September", exact: true }).click();
  await page.getByRole("button", { name: "Option B", exact: true }).click();
  await expect(page.getByLabel("Monday 28 September itinerary")).toContainText("Option B place");
  await page.reload();
  await page.getByRole("button", { name: "Monday 28 September", exact: true }).click();
  await expect(page.getByRole("button", { name: "Option B", exact: true })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await page.getByRole("button", { name: "Edit plan" }).click();
  await page.getByLabel("Choose itinerary spreadsheet").setInputFiles({
    name: "updated.xlsx",
    mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    buffer: itineraryFile(false),
  });
  await expect(page.getByLabel("Monday 28 September itinerary")).toContainText("Option A place");
  await expect(page.getByRole("button", { name: "Option B", exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Edit trip details" }).click();
  await page.getByLabel("Trip end date").fill("2026-09-27");
  await page.getByRole("button", { name: "Save trip" }).click();
  await expect(page.getByRole("alert")).toContainText("planned stops outside this trip");
  await page.reload();
  await page.getByRole("button", { name: "Monday 28 September", exact: true }).click();
  await expect(page.getByLabel("Monday 28 September itinerary")).toContainText("Option A place");

  const tripId = new URL(page.url()).pathname.split("/").at(-1)!;
  await page.goto(`/maps?trip=${tripId}&day=2026-09-27`);
  await page.getByLabel("Choose KML or KMZ file").setInputFiles({
    name: "manual.kml",
    mimeType: "application/vnd.google-earth.kml+xml",
    buffer: Buffer.from(
      `<kml><Document><Placemark><name>Manual stop</name><Point><coordinates>139.78,35.69</coordinates></Point></Placemark></Document></kml>`,
    ),
  });
  await page.getByRole("button", { name: "Import 1 place, 0 lines and 0 areas" }).click();
  await page.getByRole("button", { name: "Manual stop" }).click();
  await page.getByRole("button", { name: "Add to plan", exact: true }).click();
  await page.getByRole("button", { name: "Add to plan", exact: true }).click();
  await page.goto(`/plan/trip/${tripId}?day=2026-09-27`);
  const orderedDay = page.getByLabel("Sunday 27 September itinerary");
  await expect(orderedDay.locator("[data-plan-stop-id]").last()).toContainText("Manual stop");
  await page.getByRole("button", { name: "Edit plan" }).click();
  await page.getByRole("button", { name: "Move Manual stop up" }).click();
  await page.getByRole("button", { name: "Move Manual stop up" }).click();
  await expect(orderedDay.locator("[data-plan-stop-id]").first()).toContainText("Manual stop");
  await page.reload();
  await expect(orderedDay.locator("[data-plan-stop-id]").first()).toContainText("Manual stop");
  await page.getByRole("button", { name: "Edit plan" }).click();
  await page.getByRole("button", { name: "Remove Manual stop" }).click();
  await page.getByRole("button", { name: "Remove [ Cafe ] Exact place" }).click();
  await expect(page.getByText("2 places removed", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Monday 28 September", exact: true }).click();
  await page.getByRole("button", { name: "Undo" }).click();
  await page.getByRole("button", { name: "Sunday 27 September", exact: true }).click();
  await expect(orderedDay).toContainText("Manual stop");
  await expect(orderedDay).toContainText("Exact place");
});
