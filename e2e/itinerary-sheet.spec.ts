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
  await expect(page.locator(".day-plan__storage-notice[role='status']")).toContainText(
    "4 itinerary rows imported · 1 map pins linked · 1 places need review",
  );
  const dayOne = page.getByLabel("Sun 27 Sep imported itinerary");
  await expect(dayOne.locator("article").first()).toContainText("Exact place");
  await expect(dayOne.locator("article").last()).toContainText("No matching map pin yet");
  await expect(dayOne.getByRole("link", { name: "[ Cafe ] Exact place" })).toHaveAttribute(
    "href",
    /\/maps\?.*place=/,
  );
  await expect(page.getByRole("button", { name: "Recenter on day places" })).toBeVisible();
  await page.getByRole("button", { name: "Edit plan for Sun 27 Sep" }).click();
  await page
    .getByRole("textbox", { name: "Note for [ Cafe ] Exact place" })
    .fill("Meet at entrance");
  await page.getByRole("button", { name: "Done editing plan" }).click();
  await page.reload();
  await expect(dayOne).toContainText("Meet at entrance");
  await page.getByRole("button", { name: "Mon 28" }).click();
  await page.getByRole("button", { name: "Option B" }).click();
  await expect(page.getByLabel("Mon 28 Sep imported itinerary")).toContainText("Option B place");
  await page.reload();
  await page.getByRole("button", { name: "Mon 28" }).click();
  await expect(page.getByRole("button", { name: "Option B" })).toHaveAttribute(
    "aria-pressed",
    "true",
  );
  await page.getByLabel("Choose itinerary spreadsheet").setInputFiles({
    name: "updated.xlsx",
    mimeType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    buffer: itineraryFile(false),
  });
  await expect(page.getByLabel("Mon 28 Sep imported itinerary")).toContainText("Option A place");
  await expect(page.getByRole("button", { name: "Option B" })).toHaveCount(0);
  await page.getByRole("button", { name: "Edit trip details" }).click();
  await page.getByRole("textbox", { name: "Trip end date" }).fill("2026-09-27");
  await page.getByRole("button", { name: "Save trip" }).click();
  await expect(page.getByRole("alert")).toContainText("planned stops outside this trip");
  await page.reload();
  await page.getByRole("button", { name: "Mon 28" }).click();
  await expect(page.getByLabel("Mon 28 Sep imported itinerary")).toContainText("Option A place");
});
