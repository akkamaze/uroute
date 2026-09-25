import { strFromU8, unzipSync } from "fflate";

import type { ImportedPoint } from "./parse-place-file";
import { notifyCreatedTripChanged } from "../trips/trip-store";

export interface ItineraryEntry {
  id: string;
  tripId: string;
  day: string;
  variant: string;
  order: number;
  time: string;
  title: string;
  detail: string;
  area: string;
  kind: "place" | "transport" | "note";
  placeId?: string;
  match: "matched" | "unmatched" | "ambiguous" | "not-applicable";
}

const MAX_FILE_BYTES = 8 * 1024 * 1024;
const MAX_XML_BYTES = 16 * 1024 * 1024;
const MAX_TOTAL_XML_BYTES = 32 * 1024 * 1024;
const MAX_XML_FILES = 70;
const DATABASE_NAME = "uroute-trip-itineraries";
const DATE_SHEET = /^D(\d+)-(\d+)(?:\s+([ABX]))?$/i;
const DATE_ROW = /^(\d{1,2})\s+([A-Z]{3})\s+(\d{4})(?:\s+\([A-Z]{3}\))?$/i;
const MONTHS = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
const TRAIN =
  /(?:railway|subway|metro|train|express|shinkansen|bus|flight|airport transfer|^jr\s)/i;

function xml(bytes: Uint8Array | undefined, name: string): Document {
  if (bytes === undefined || bytes.length > MAX_XML_BYTES) {
    throw new Error(`Missing or oversized ${name} in the spreadsheet.`);
  }
  const document = new DOMParser().parseFromString(strFromU8(bytes), "application/xml");
  if (document.querySelector("parsererror")) {
    throw new Error(`Could not read ${name}.`);
  }

  return document;
}

function elements(parent: Document | Element, name: string): Element[] {
  return Array.from(parent.getElementsByTagName("*")).filter((node) => node.localName === name);
}

function column(reference: string): number {
  const letters = /^[A-Z]+/.exec(reference)?.[0] ?? "";

  return [...letters].reduce((value, letter) => value * 26 + letter.charCodeAt(0) - 64, 0);
}

function rows(
  document: Document,
  sharedStrings: string[],
): { number: number; values: Map<number, string> }[] {
  return elements(document, "row").map((row) => {
    const values = new Map<number, string>();
    for (const cell of elements(row, "c")) {
      const index = column(cell.getAttribute("r") ?? "");
      const raw = elements(cell, "v")[0]?.textContent ?? "";
      const value =
        cell.getAttribute("t") === "s"
          ? (sharedStrings[Number(raw)] ?? "")
          : cell.getAttribute("t") === "inlineStr"
            ? elements(cell, "t")
                .map((node) => node.textContent ?? "")
                .join("")
            : raw;
      if (index > 0 && value.trim()) {
        values.set(index, value.trim());
      }
    }

    return { number: Number(row.getAttribute("r")), values };
  });
}

function normalizeName(name: string): string {
  return name
    .split("\n")[0]!
    .replace(/\s*\([^)]*\d+\.\d+[^)]*\)\s*$/u, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLocaleLowerCase();
}

function normalizeFullName(name: string): string {
  return name
    .normalize("NFKC")
    .replace(/\s*\([^)]*\d+\.\d+[^)]*\)\s*$/u, "")
    .replace(/\bsky\s+tree\b/gi, "skytree")
    .toLocaleLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

function matchPlace(
  title: string,
  points: readonly ImportedPoint[],
  subtitle = "",
): {
  placeId?: string;
  match: ItineraryEntry["match"];
} {
  const name = normalizeName(title);
  if (!name) {
    return { match: "unmatched" };
  }
  const exact = points.filter((point) => normalizeName(point.name) === name);
  if (exact.length === 1) {
    return { placeId: exact[0]!.id, match: "matched" };
  }

  // The spreadsheet often puts a venue and floor on the next line while the
  // matching KML pin keeps that context on one line. Use it only for a unique
  // full-name match; a shared short name must never choose an arbitrary pin.
  const fullName = normalizeFullName(subtitle ? `${title} ${subtitle}` : title);
  const contextual = points.filter((point) => normalizeFullName(point.name) === fullName);
  if (contextual.length === 1) {
    return { placeId: contextual[0]!.id, match: "matched" };
  }

  return { match: exact.length > 1 || contextual.length > 1 ? "ambiguous" : "unmatched" };
}

export function reconcileItineraryMatches(
  entries: readonly ItineraryEntry[],
  points: readonly ImportedPoint[],
): ItineraryEntry[] {
  const known = new Set(points.map((point) => point.id));

  return entries.map((entry) => {
    if (entry.kind !== "place" || (entry.placeId && known.has(entry.placeId))) {
      return entry;
    }

    const withoutLink = { ...entry };
    delete withoutLink.placeId;

    const subtitle = entry.detail.startsWith("(") ? entry.detail.split(" · ")[0] : "";

    return { ...withoutLink, ...matchPlace(entry.title, points, subtitle) };
  });
}

function entryKind(title: string): ItineraryEntry["kind"] {
  if (TRAIN.test(title) || /\bplatform\s*\d/i.test(title)) {
    return "transport";
  }
  if (
    /^\[\s*[^\]]+\s*\]/.test(title) ||
    /\b(?:station|temple|shrine|park|market|hotel|airport)\b/i.test(title)
  ) {
    return "place";
  }

  return "note";
}

function explicitRowDate(value: string): string | null {
  const match = DATE_ROW.exec(value.trim());
  if (!match) {
    return null;
  }
  const month = MONTHS.indexOf(match[2]!.toUpperCase());
  if (month < 0) {
    return null;
  }
  const year = Number(match[3]);
  const day = Number(match[1]);
  const date = new Date(Date.UTC(year, month, day));

  return date.getUTCFullYear() === year && date.getUTCMonth() === month && date.getUTCDate() === day
    ? date.toISOString().slice(0, 10)
    : null;
}

export async function parseItinerarySheet(
  file: File,
  tripId: string,
  startDate: string,
  points: readonly ImportedPoint[],
): Promise<ItineraryEntry[]> {
  if (!file.name.toLowerCase().endsWith(".xlsx") || file.size > MAX_FILE_BYTES) {
    throw new Error("Choose an .xlsx itinerary under 8 MB.");
  }
  let expandedBytes = 0;
  let xmlFiles = 0;
  const archive = unzipSync(new Uint8Array(await file.arrayBuffer()), {
    filter: (entry) => {
      if (
        !/^(?:xl\/workbook\.xml|xl\/_rels\/workbook\.xml\.rels|xl\/sharedStrings\.xml|xl\/worksheets\/sheet\d+\.xml)$/.test(
          entry.name,
        )
      ) {
        return false;
      }
      expandedBytes += entry.originalSize;
      xmlFiles += 1;
      if (
        entry.originalSize > MAX_XML_BYTES ||
        expandedBytes > MAX_TOTAL_XML_BYTES ||
        xmlFiles > MAX_XML_FILES
      ) {
        throw new Error("The spreadsheet is too large to import safely.");
      }

      return true;
    },
  });
  const workbook = xml(archive["xl/workbook.xml"], "workbook");
  const relationships = xml(archive["xl/_rels/workbook.xml.rels"], "workbook relationships");
  const sharedStrings = archive["xl/sharedStrings.xml"]
    ? elements(xml(archive["xl/sharedStrings.xml"], "shared strings"), "si").map((item) =>
        elements(item, "t")
          .map((part) => part.textContent ?? "")
          .join(""),
      )
    : [];
  const paths = new Map(
    elements(relationships, "Relationship").map((item) => [
      item.getAttribute("Id") ?? "",
      item.getAttribute("Target") ?? "",
    ]),
  );
  const start = Date.parse(`${startDate}T12:00:00Z`);
  const result: ItineraryEntry[] = [];
  let foundDays = 0;
  const dayOptions = new Set<string>();
  for (const sheet of elements(workbook, "sheet")) {
    const sheetName = sheet.getAttribute("name") ?? "";
    const matchedName = DATE_SHEET.exec(sheetName);
    if (!matchedName) {
      continue;
    }
    const dayIndex = Number(matchedName[1]);
    if (dayIndex < 1 || dayIndex > 60) {
      continue;
    }
    const option = matchedName[3]?.toUpperCase();
    const variant = option === "X" ? "B" : (option ?? "A");
    const relationshipId = sheet.getAttributeNS(
      "http://schemas.openxmlformats.org/officeDocument/2006/relationships",
      "id",
    );
    const target = paths.get(relationshipId ?? "") ?? "";
    const path = target.startsWith("/") ? target.slice(1) : `xl/${target.replace(/^\.\.\//, "")}`;
    const dayRows = rows(xml(archive[path], sheetName), sharedStrings);
    const date = new Date(start + (dayIndex - 1) * 86_400_000).toISOString().slice(0, 10);
    const dayOption = `${date}:${variant}`;
    if (dayOptions.has(dayOption)) {
      throw new Error(`More than one spreadsheet tab maps to ${dayOption}.`);
    }
    dayOptions.add(dayOption);
    foundDays += 1;
    let area = "";
    let currentDate = date;
    for (const { number, values: row } of dayRows) {
      if (number < 3 || !Number.isInteger(number)) {
        continue;
      }
      area = row.get(2) ?? row.get(1) ?? area;
      const title = row.get(4)?.trim() ?? "";
      if (!title) {
        currentDate = explicitRowDate(row.get(3) ?? "") ?? currentDate;
        continue;
      }
      const kind = entryKind(title);
      const selected =
        kind === "place" ? matchPlace(title, points) : { match: "not-applicable" as const };
      result.push({
        id: `${tripId}:${sheetName}:${number}`,
        tripId,
        day: currentDate,
        variant,
        order: number,
        time: row.get(3)?.split("\n")[0] ?? "",
        title: title.split("\n")[0]!,
        detail: [title.split("\n").slice(1).join(" "), row.get(5) ?? ""]
          .filter(Boolean)
          .join(" · ")
          .slice(0, 1500),
        area,
        kind,
        ...selected,
      });
    }
  }
  if (!foundDays || result.length === 0) {
    throw new Error("No D1, D2, … daily itinerary tabs were found.");
  }

  return result;
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, 1);
    request.onupgradeneeded = () => {
      const store = request.result.createObjectStore("entries", { keyPath: "id" });
      store.createIndex("trip", "tripId");
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Could not open itinerary storage."));
  });
}

export async function loadItinerary(tripId: string): Promise<ItineraryEntry[]> {
  const database = await openDatabase();
  try {
    return await new Promise((resolve, reject) => {
      const request = database
        .transaction("entries", "readonly")
        .objectStore("entries")
        .index("trip")
        .getAll(tripId);
      request.onsuccess = () => resolve(request.result as ItineraryEntry[]);
      request.onerror = () => reject(request.error ?? new Error("Could not read itinerary."));
    });
  } finally {
    database.close();
  }
}

export async function saveItinerary(
  tripId: string,
  entries: readonly ItineraryEntry[],
): Promise<void> {
  const database = await openDatabase();
  try {
    const existing = await loadItinerary(tripId);
    await new Promise<void>((resolve, reject) => {
      const transaction = database.transaction("entries", "readwrite");
      const store = transaction.objectStore("entries");
      existing.forEach((entry) => store.delete(entry.id));
      entries.forEach((entry) => store.put(entry));
      transaction.oncomplete = () => resolve();
      transaction.onerror = () =>
        reject(transaction.error ?? new Error("Could not save itinerary."));
      transaction.onabort = () =>
        reject(transaction.error ?? new Error("Itinerary save was interrupted."));
    });
    notifyCreatedTripChanged(tripId);
  } finally {
    database.close();
  }
}
