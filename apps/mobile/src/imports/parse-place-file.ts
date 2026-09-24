import { unzipSync } from "fflate";

const MAX_ARCHIVE_BYTES = 8 * 1024 * 1024;
const MAX_KML_BYTES = 12 * 1024 * 1024;
const MAX_PLACEMARKS = 5_000;

export interface ImportedPoint {
  id: string;
  sourceKey: string;
  sourceFile: string;
  folder: string;
  name: string;
  description: string;
  longitude: number;
  latitude: number;
  styleRef: string;
  mediaReferences: string[];
}

export interface ImportedLine {
  id: string;
  sourceKey: string;
  sourceFile: string;
  folder: string;
  name: string;
  description: string;
  coordinates: [number, number][];
  styleRef: string;
  mediaReferences: string[];
}

export interface ImportedArea {
  id: string;
  sourceKey: string;
  sourceFile: string;
  folder: string;
  name: string;
  description: string;
  rings: [number, number][][];
  styleRef: string;
  mediaReferences: string[];
}

export type ImportedGeometry = ImportedArea | ImportedLine;

export interface ImportPreview {
  fileName: string;
  points: ImportedPoint[];
  lines: ImportedLine[];
  areas: ImportedArea[];
  unsupportedCount: number;
  invalidCount: number;
  invalidGeometryCount: number;
  coordinateCollisionCount: number;
  skipped: { name: string; reason: string }[];
  warnings: string[];
}

function directChild(parent: Element, localName: string): Element | undefined {
  return Array.from(parent.children).find((child) => child.localName === localName);
}

function childText(parent: Element, localName: string): string {
  return directChild(parent, localName)?.textContent?.trim() ?? "";
}

function folderPath(element: Element): string {
  const folders: string[] = [];
  let parent = element.parentElement;
  while (parent !== null) {
    if (parent.localName === "Folder") {
      const name = childText(parent, "name");
      if (name !== "") {
        folders.unshift(name);
      }
    }
    parent = parent.parentElement;
  }

  return folders.join(" / ") || "Unfiled";
}

function plainDescription(value: string): string {
  return value
    .replace(/<[^>]*>/g, " ")
    .replace(/&nbsp;|&#160;/gi, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 5_000);
}

function mediaReferences(placemark: Element): string[] {
  const extendedData = directChild(placemark, "ExtendedData");
  if (extendedData === undefined) {
    return [];
  }
  const media = Array.from(extendedData.getElementsByTagNameNS("*", "Data")).find(
    (entry) => entry.getAttribute("name") === "gx_media_links",
  );

  return childText(media ?? extendedData, "value")
    .split(/\s+/)
    .filter((value) => /^https:\/\//i.test(value) && value.length <= 2_048)
    .slice(0, 20);
}

function readKmlBytes(fileName: string, bytes: Uint8Array): Uint8Array {
  if (fileName.toLowerCase().endsWith(".kml")) {
    if (bytes.byteLength > MAX_KML_BYTES) {
      throw new Error("The KML file is too large to import.");
    }

    return bytes;
  }
  if (!fileName.toLowerCase().endsWith(".kmz")) {
    throw new Error("Choose a KML or KMZ file.");
  }
  if (bytes.byteLength > MAX_ARCHIVE_BYTES) {
    throw new Error("The KMZ archive is too large to import.");
  }

  let oversized = false;
  const kmlFiles = unzipSync(bytes, {
    filter: (entry) => {
      if (!entry.name.toLowerCase().endsWith(".kml")) {
        return false;
      }
      if (entry.originalSize > MAX_KML_BYTES) {
        oversized = true;

        return false;
      }

      return true;
    },
  });
  if (oversized) {
    throw new Error("The KML inside the KMZ archive is too large to import.");
  }
  const names = Object.keys(kmlFiles);
  if (names.length !== 1) {
    throw new Error("The KMZ archive must contain exactly one KML document.");
  }
  const kml = kmlFiles[names[0] ?? ""];
  if (kml === undefined) {
    throw new Error("The KMZ archive has no readable KML document.");
  }

  return kml;
}

function parseCoordinates(value: string): [number, number] | null {
  const parts = value.trim().split(",");
  if (parts.length < 2) {
    return null;
  }
  const longitude = Number(parts[0]);
  const latitude = Number(parts[1]);
  if (
    !Number.isFinite(longitude) ||
    !Number.isFinite(latitude) ||
    longitude < -180 ||
    longitude > 180 ||
    latitude < -90 ||
    latitude > 90
  ) {
    return null;
  }

  return [longitude, latitude];
}

function parseCoordinateSequence(value: string, minimumLength: number): [number, number][] | null {
  const coordinates = value.trim().split(/\s+/).filter(Boolean).map(parseCoordinates);
  if (coordinates.length < minimumLength || coordinates.some((coordinate) => coordinate === null)) {
    return null;
  }

  return coordinates as [number, number][];
}

function parseLinearRing(boundary: Element): [number, number][] | null {
  const ring = directChild(boundary, "LinearRing");
  if (ring === undefined) {
    return null;
  }
  const coordinates = parseCoordinateSequence(childText(ring, "coordinates"), 4);
  const first = coordinates?.[0];
  const last = coordinates?.at(-1);
  if (
    coordinates === null ||
    first === undefined ||
    last === undefined ||
    first[0] !== last[0] ||
    first[1] !== last[1]
  ) {
    return null;
  }

  return coordinates;
}

function parsePolygonRings(polygon: Element): [number, number][][] | null {
  const outer = directChild(polygon, "outerBoundaryIs");
  const outerRing = outer === undefined ? null : parseLinearRing(outer);
  const innerRings = Array.from(polygon.children)
    .filter((child) => child.localName === "innerBoundaryIs")
    .map(parseLinearRing);
  if (outerRing === null || innerRings.some((ring) => ring === null)) {
    return null;
  }

  return [outerRing, ...(innerRings as [number, number][][])];
}

const SHA_256_INITIAL = new Uint32Array([
  0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19,
]);

const SHA_256_ROUNDS = new Uint32Array([
  0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
  0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
  0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
  0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
  0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
  0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
  0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
  0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
]);

function rotateRight(value: number, bits: number): number {
  return (value >>> bits) | (value << (32 - bits));
}

function sha256WithoutWebCrypto(bytes: Uint8Array): string {
  const paddedLength = Math.ceil((bytes.byteLength + 9) / 64) * 64;
  const padded = new Uint8Array(paddedLength);
  padded.set(bytes);
  padded[bytes.byteLength] = 0x80;
  const view = new DataView(padded.buffer);
  const bitLength = bytes.byteLength * 8;
  view.setUint32(paddedLength - 8, Math.floor(bitLength / 0x1_0000_0000));
  view.setUint32(paddedLength - 4, bitLength >>> 0);

  const hash = new Uint32Array(SHA_256_INITIAL);
  const words = new Uint32Array(64);
  for (let offset = 0; offset < paddedLength; offset += 64) {
    for (let index = 0; index < 16; index += 1) {
      words[index] = view.getUint32(offset + index * 4);
    }
    for (let index = 16; index < words.length; index += 1) {
      const earlier = words[index - 15] ?? 0;
      const later = words[index - 2] ?? 0;
      const sigma0 = rotateRight(earlier, 7) ^ rotateRight(earlier, 18) ^ (earlier >>> 3);
      const sigma1 = rotateRight(later, 17) ^ rotateRight(later, 19) ^ (later >>> 10);
      words[index] = ((words[index - 16] ?? 0) + sigma0 + (words[index - 7] ?? 0) + sigma1) >>> 0;
    }

    let a = hash[0] ?? 0;
    let b = hash[1] ?? 0;
    let c = hash[2] ?? 0;
    let d = hash[3] ?? 0;
    let e = hash[4] ?? 0;
    let f = hash[5] ?? 0;
    let g = hash[6] ?? 0;
    let h = hash[7] ?? 0;
    for (let index = 0; index < words.length; index += 1) {
      const sigma1 = rotateRight(e, 6) ^ rotateRight(e, 11) ^ rotateRight(e, 25);
      const choose = (e & f) ^ (~e & g);
      const first =
        (h + sigma1 + choose + (SHA_256_ROUNDS[index] ?? 0) + (words[index] ?? 0)) >>> 0;
      const sigma0 = rotateRight(a, 2) ^ rotateRight(a, 13) ^ rotateRight(a, 22);
      const majority = (a & b) ^ (a & c) ^ (b & c);
      const second = (sigma0 + majority) >>> 0;
      h = g;
      g = f;
      f = e;
      e = (d + first) >>> 0;
      d = c;
      c = b;
      b = a;
      a = (first + second) >>> 0;
    }

    hash[0] = ((hash[0] ?? 0) + a) >>> 0;
    hash[1] = ((hash[1] ?? 0) + b) >>> 0;
    hash[2] = ((hash[2] ?? 0) + c) >>> 0;
    hash[3] = ((hash[3] ?? 0) + d) >>> 0;
    hash[4] = ((hash[4] ?? 0) + e) >>> 0;
    hash[5] = ((hash[5] ?? 0) + f) >>> 0;
    hash[6] = ((hash[6] ?? 0) + g) >>> 0;
    hash[7] = ((hash[7] ?? 0) + h) >>> 0;
  }

  return Array.from(hash)
    .map((part) => part.toString(16).padStart(8, "0"))
    .join("");
}

async function sha256(bytes: Uint8Array): Promise<string> {
  const subtle = globalThis.crypto?.subtle;
  if (subtle === undefined) {
    return sha256WithoutWebCrypto(bytes);
  }
  const input = new Uint8Array(bytes.byteLength);
  input.set(bytes);

  return Array.from(new Uint8Array(await subtle.digest("SHA-256", input)))
    .map((part) => part.toString(16).padStart(2, "0"))
    .join("");
}

export async function parsePlaceFile(file: File): Promise<ImportPreview> {
  const extension = file.name.toLowerCase();
  if (!extension.endsWith(".kml") && !extension.endsWith(".kmz")) {
    throw new Error("Choose a KML or KMZ file.");
  }
  if (file.size > MAX_ARCHIVE_BYTES && extension.endsWith(".kmz")) {
    throw new Error("The KMZ archive is too large to import.");
  }
  if (file.size > MAX_KML_BYTES && extension.endsWith(".kml")) {
    throw new Error("The KML file is too large to import.");
  }
  const bytes = new Uint8Array(await file.arrayBuffer());
  const kml = readKmlBytes(file.name, bytes);
  const xml = new TextDecoder("utf-8", { fatal: true }).decode(kml);
  if (/<!\s*(?:DOCTYPE|ENTITY)\b/i.test(xml)) {
    throw new Error("KML documents with DTDs or entities are not supported.");
  }
  const document = new DOMParser().parseFromString(xml, "application/xml");
  if (
    document.querySelector("parsererror") !== null ||
    document.documentElement.localName !== "kml"
  ) {
    throw new Error("The KML document is invalid.");
  }

  const placemarks = Array.from(document.getElementsByTagNameNS("*", "Placemark"));
  if (placemarks.length > MAX_PLACEMARKS) {
    throw new Error("This file has too many map items to import at once.");
  }
  const hash = await sha256(kml);
  const preview: ImportPreview = {
    fileName: file.name,
    points: [],
    lines: [],
    areas: [],
    unsupportedCount: 0,
    invalidCount: 0,
    invalidGeometryCount: 0,
    coordinateCollisionCount: 0,
    skipped: [],
    warnings: [],
  };
  const coordinatesSeen = new Set<string>();

  placemarks.forEach((placemark, index) => {
    const name = childText(placemark, "name").slice(0, 240);
    const sourceKey = `${hash}:${index}`;
    const shared = {
      id: `import-${sourceKey}`,
      sourceKey,
      sourceFile: file.name,
      folder: folderPath(placemark),
      name,
      description: plainDescription(childText(placemark, "description")),
      styleRef: childText(placemark, "styleUrl").slice(0, 240),
      mediaReferences: mediaReferences(placemark),
    };
    const geometry = Array.from(placemark.children).find((child) =>
      ["Point", "LineString", "Polygon", "MultiGeometry"].includes(child.localName),
    );
    if (geometry?.localName === "LineString") {
      const coordinates = parseCoordinateSequence(childText(geometry, "coordinates"), 2);
      if (coordinates === null || name === "") {
        preview.invalidGeometryCount += 1;
        preview.skipped.push({
          name: name || `Item ${index + 1}`,
          reason: "Missing name or valid line coordinates",
        });

        return;
      }
      preview.lines.push({ ...shared, coordinates });

      return;
    }
    if (geometry?.localName === "Polygon") {
      const rings = parsePolygonRings(geometry);
      if (rings === null || name === "") {
        preview.invalidGeometryCount += 1;
        preview.skipped.push({
          name: name || `Item ${index + 1}`,
          reason: "Missing name or valid closed area coordinates",
        });

        return;
      }
      preview.areas.push({ ...shared, rings });

      return;
    }
    if (geometry?.localName !== "Point") {
      preview.unsupportedCount += 1;
      preview.skipped.push({ name: name || `Item ${index + 1}`, reason: "Unsupported geometry" });

      return;
    }
    const coordinates = parseCoordinates(childText(geometry, "coordinates"));
    if (coordinates === null || name === "") {
      preview.invalidCount += 1;
      preview.skipped.push({
        name: name || `Item ${index + 1}`,
        reason: "Missing name or coordinates",
      });

      return;
    }
    const coordinateKey = coordinates.join(",");
    if (coordinatesSeen.has(coordinateKey)) {
      preview.coordinateCollisionCount += 1;
    }
    coordinatesSeen.add(coordinateKey);
    preview.points.push({
      ...shared,
      longitude: coordinates[0],
      latitude: coordinates[1],
    });
  });

  if (preview.unsupportedCount > 0) {
    preview.warnings.push("Unsupported geometry is listed in this review but is not imported yet.");
  }
  if (preview.invalidCount > 0) {
    preview.warnings.push(
      "Some point items need a name or valid coordinates and cannot be imported.",
    );
  }
  if (preview.coordinateCollisionCount > 0) {
    preview.warnings.push(
      "Some points share coordinates. Review them before adding places to a plan.",
    );
  }
  if (preview.invalidGeometryCount > 0) {
    preview.warnings.push(
      "Some map geometry needs a name and valid coordinates and cannot be imported.",
    );
  }

  return preview;
}
