import type { ImportedPoint } from "./parse-place-file";

const CACHE_KEY = "uroute.imported-osm-photos.v1";
const CACHE_AGE_MS = 30 * 24 * 60 * 60 * 1_000;
const NO_PHOTO_AGE_MS = 7 * 24 * 60 * 60 * 1_000;
const NOMINATIM_INTERVAL_MS = 1_100;

export interface LinkedOsmPhoto {
  imageUrl: string;
  pageUrl: string;
  artist: string;
  license: string;
  licenseUrl: string;
  osmUrl: string;
}

interface CacheEntry {
  checkedAt: number;
  photo: LinkedOsmPhoto | null;
}

export type OsmPhotoCache = Record<string, CacheEntry>;

interface OsmPlace {
  boundingbox?: string[];
  display_name?: string;
  lat?: string;
  lon?: string;
  namedetails?: Record<string, string>;
  extratags?: Record<string, string>;
  osm_type?: string;
  osm_id?: number;
}

let nextNominatimRequestAt = 0;

function normalizeName(value: string): string {
  return value
    .replace(/^\s*\[[^\]]+\]\s*/, "")
    .normalize("NFKC")
    .toLocaleLowerCase()
    .replace(/[\p{P}\p{S}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function searchName(value: string): string {
  return value.replace(/^\s*\[[^\]]+\]\s*/, "").trim();
}

function isSamePlace(point: ImportedPoint, osm: OsmPlace): boolean {
  const wanted = normalizeName(point.name);
  const names = Object.entries(osm.namedetails ?? {})
    .filter(([key]) => key === "name" || key.startsWith("name:") || key === "alt_name")
    .map(([, value]) => normalizeName(value));
  if (wanted === "" || !names.includes(wanted)) {
    return false;
  }
  const latitude = Number(osm.lat);
  const longitude = Number(osm.lon);
  if (!Number.isFinite(latitude) || !Number.isFinite(longitude)) {
    return false;
  }
  const northSouth = (latitude - point.latitude) * 111_320;
  const eastWest =
    (longitude - point.longitude) * 111_320 * Math.cos((point.latitude * Math.PI) / 180);

  if (Math.hypot(northSouth, eastWest) <= 75) {
    return true;
  }
  const bounds = osm.boundingbox?.map(Number);
  if (bounds?.length !== 4 || bounds.some((value) => !Number.isFinite(value))) {
    return false;
  }
  const [south = 0, north = 0, west = 0, east = 0] = bounds;

  return (
    point.latitude >= south &&
    point.latitude <= north &&
    point.longitude >= west &&
    point.longitude <= east &&
    (north - south) * 111_320 <= 1_000 &&
    (east - west) * 111_320 * Math.cos((point.latitude * Math.PI) / 180) <= 1_000
  );
}

function commonsFile(value: string | undefined): string | null {
  if (value === undefined) {
    return null;
  }
  const trimmed = value.trim();
  if (/^File:[^\n]{1,250}$/i.test(trimmed)) {
    return `File:${trimmed.slice(5)}`;
  }
  try {
    const url = new URL(trimmed);
    if (url.protocol === "https:" && url.hostname === "commons.wikimedia.org") {
      const title = decodeURIComponent(url.pathname.replace(/^\/wiki\//, ""));

      return /^File:[^\n]{1,250}$/i.test(title) ? `File:${title.slice(5)}` : null;
    }
  } catch {
    // OSM image tags may contain other external URLs; their licenses are unknown here.
  }

  return null;
}

function plainText(value: unknown): string {
  return typeof value === "string"
    ? value
        .replace(/<[^>]*>/g, " ")
        .replace(/&amp;/g, "&")
        .replace(/&nbsp;/g, " ")
        .replace(/\s+/g, " ")
        .trim()
    : "";
}

function metadataValue(metadata: unknown, key: string): string {
  if (typeof metadata !== "object" || metadata === null || !(key in metadata)) {
    return "";
  }
  const entry: unknown = (metadata as Record<string, unknown>)[key];

  return typeof entry === "object" && entry !== null && "value" in entry
    ? plainText(entry.value)
    : "";
}

async function wikidataImage(item: string, signal: AbortSignal): Promise<string | null> {
  if (!/^Q\d+$/.test(item)) {
    return null;
  }
  const url = new URL("https://www.wikidata.org/w/api.php");
  url.search = new URLSearchParams({
    action: "wbgetentities",
    ids: item,
    props: "claims",
    format: "json",
    origin: "*",
  }).toString();
  const response = await fetch(url, { signal });
  if (!response.ok) {
    throw new Error("Wikidata did not return image information.");
  }
  const data: unknown = await response.json();
  const entity =
    typeof data === "object" && data !== null && "entities" in data
      ? (data as { entities?: Record<string, { claims?: { P18?: unknown[] } }> }).entities?.[item]
      : undefined;
  const claims = entity?.claims?.P18;
  if (!Array.isArray(claims)) {
    return null;
  }
  for (const claim of claims) {
    const value: unknown = (claim as { mainsnak?: { datavalue?: { value?: unknown } } }).mainsnak
      ?.datavalue?.value;
    if (typeof value === "string") {
      return commonsFile(`File:${value}`);
    }
  }

  return null;
}

async function commonsPhoto(
  file: string,
  osmUrl: string,
  signal: AbortSignal,
): Promise<LinkedOsmPhoto | null> {
  const url = new URL("https://commons.wikimedia.org/w/api.php");
  url.search = new URLSearchParams({
    action: "query",
    prop: "imageinfo",
    iiprop: "url|extmetadata",
    iiurlwidth: "640",
    titles: file,
    format: "json",
    formatversion: "2",
    origin: "*",
  }).toString();
  const response = await fetch(url, { signal });
  if (!response.ok) {
    throw new Error("Wikimedia Commons did not return photo details.");
  }
  const data: unknown = await response.json();
  const pages =
    typeof data === "object" && data !== null && "query" in data
      ? (data as { query?: { pages?: unknown[] } }).query?.pages
      : undefined;
  const page = Array.isArray(pages) ? pages[0] : undefined;
  const image =
    typeof page === "object" && page !== null && "imageinfo" in page
      ? (page as { imageinfo?: unknown[] }).imageinfo?.[0]
      : undefined;
  if (typeof image !== "object" || image === null) {
    return null;
  }
  const info = image as {
    thumburl?: unknown;
    url?: unknown;
    descriptionurl?: unknown;
    extmetadata?: unknown;
  };
  const imageUrl = info.thumburl ?? info.url;
  const license = metadataValue(info.extmetadata, "LicenseShortName");
  const artist = metadataValue(info.extmetadata, "Artist");
  const licenseUrl = metadataValue(info.extmetadata, "LicenseUrl");
  const pageUrl = info.descriptionurl;
  const secureLicenseUrl = licenseUrl.replace(
    /^http:\/\/creativecommons\.org\//,
    "https://creativecommons.org/",
  );
  let imageHost = "";
  try {
    imageHost = typeof imageUrl === "string" ? new URL(imageUrl).hostname : "";
  } catch {
    return null;
  }
  if (
    typeof imageUrl !== "string" ||
    typeof pageUrl !== "string" ||
    !imageUrl.startsWith("https://") ||
    !imageHost.endsWith(".wikimedia.org") ||
    !pageUrl.startsWith("https://commons.wikimedia.org/") ||
    license === ""
  ) {
    return null;
  }

  return {
    imageUrl,
    pageUrl,
    artist: artist || "Wikimedia Commons contributor",
    license,
    licenseUrl: secureLicenseUrl.startsWith("https://") ? secureLicenseUrl : pageUrl,
    osmUrl,
  };
}

async function waitForNominatim(signal: AbortSignal): Promise<void> {
  const delay = Math.max(0, nextNominatimRequestAt - Date.now());
  if (delay > 0) {
    await new Promise<void>((resolve, reject) => {
      const onAbort = (): void => {
        window.clearTimeout(timeout);
        reject(new Error("Photo lookup cancelled."));
      };
      const timeout = window.setTimeout(() => {
        signal.removeEventListener("abort", onAbort);
        resolve();
      }, delay);
      signal.addEventListener("abort", onAbort, { once: true });
    });
  }
  if (signal.aborted) {
    throw signal.reason;
  }
  nextNominatimRequestAt = Date.now() + NOMINATIM_INTERVAL_MS;
}

/** Look up only the opened place, never the entire imported map. */
export async function findLinkedOsmPhoto(
  point: ImportedPoint,
  signal: AbortSignal,
): Promise<LinkedOsmPhoto | null> {
  await waitForNominatim(signal);
  const url = new URL("https://nominatim.openstreetmap.org/search");
  const latitude = point.latitude;
  const longitude = point.longitude;
  url.search = new URLSearchParams({
    format: "jsonv2",
    q: searchName(point.name),
    viewbox: `${longitude - 0.004},${latitude + 0.004},${longitude + 0.004},${latitude - 0.004}`,
    bounded: "1",
    limit: "10",
    extratags: "1",
    namedetails: "1",
    addressdetails: "0",
  }).toString();
  const response = await fetch(url, { signal });
  if (!response.ok) {
    if (response.status === 429 || response.status === 503) {
      nextNominatimRequestAt = Date.now() + 30_000;
    }
    throw new Error("OpenStreetMap did not return this place.");
  }
  const received: unknown = await response.json();
  if (!Array.isArray(received)) {
    return null;
  }
  const matches = received
    .filter((place): place is OsmPlace => typeof place === "object" && place !== null)
    .filter((place) => isSamePlace(point, place));
  const place = matches.find(
    ({ extratags }) =>
      extratags?.image !== undefined ||
      extratags?.wikimedia_commons !== undefined ||
      extratags?.wikidata !== undefined,
  );
  if (place === undefined) {
    return null;
  }
  const tags = place.extratags ?? {};
  const file =
    commonsFile(tags.image) ??
    commonsFile(tags.wikimedia_commons) ??
    (tags.wikidata === undefined ? null : await wikidataImage(tags.wikidata, signal));
  const kind = {
    N: "node",
    W: "way",
    R: "relation",
    node: "node",
    way: "way",
    relation: "relation",
  }[place.osm_type ?? ""];
  if (file === null || kind === undefined || !Number.isInteger(place.osm_id)) {
    return null;
  }
  const osmUrl = `https://www.openstreetmap.org/${kind}/${place.osm_id}`;

  return commonsPhoto(file, osmUrl, signal);
}

export function loadOsmPhotoCache(): OsmPhotoCache {
  try {
    const stored: unknown = JSON.parse(localStorage.getItem(CACHE_KEY) ?? "{}");
    if (typeof stored !== "object" || stored === null || Array.isArray(stored)) {
      return {};
    }
    const now = Date.now();

    const cache: OsmPhotoCache = {};
    for (const [id, entry] of Object.entries(stored)) {
      if (typeof entry !== "object" || entry === null || !("checkedAt" in entry)) {
        continue;
      }
      const item = entry as CacheEntry;
      const age = item.photo === null ? NO_PHOTO_AGE_MS : CACHE_AGE_MS;
      if (
        typeof item.checkedAt === "number" &&
        now - item.checkedAt < age &&
        (item.photo === null ||
          (typeof item.photo === "object" &&
            typeof item.photo.imageUrl === "string" &&
            item.photo.imageUrl.startsWith("https://")))
      ) {
        cache[id] = item;
      }
    }

    return cache;
  } catch {
    return {};
  }
}

export function saveOsmPhotoCache(cache: OsmPhotoCache): void {
  try {
    localStorage.setItem(
      CACHE_KEY,
      JSON.stringify(Object.fromEntries(Object.entries(cache).slice(-200))),
    );
  } catch {
    // Image discovery is optional when local storage is unavailable.
  }
}
