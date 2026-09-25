export const PLACE_CATEGORIES = [
  "unknown",
  "coffee",
  "food",
  "shopping",
  "temple",
  "nature",
  "sightseeing",
  "museum",
  "activity",
  "lodging",
  "transport",
  "restroom",
] as const;

export type PlaceCategory = (typeof PLACE_CATEGORIES)[number];

export const PLACE_CATEGORY_LABELS: Record<PlaceCategory, string> = {
  unknown: "Unknown",
  coffee: "Coffee",
  food: "Food & drink",
  shopping: "Shopping",
  temple: "Temple / shrine",
  nature: "Park / nature",
  sightseeing: "Sightseeing",
  museum: "Museum",
  activity: "Activity",
  lodging: "Lodging",
  transport: "Transport",
  restroom: "Restroom",
};

// These style IDs were checked against the embedded icon images in this exact KML document.
// Style IDs are local to a document, so applying them to unrelated imports would misclassify places.
const VERIFIED_KANTO_KML_HASHES = new Set([
  "b3f7f5f9e05e114881231d5441c8c0448dea6a487e0314f209d9fde70a46b170",
  // The earlier KML has the same 22 icon image binaries and style IDs.
  "807513820c134b8cd355e9462e023f604d510822503b25098cfe9dc88497cc1b",
]);
const VERIFIED_STYLE_CATEGORIES: Readonly<Record<string, PlaceCategory>> = {
  "1504": "transport",
  "1528": "temple",
  "1534": "coffee",
  "1535": "sightseeing",
  "1567": "food",
  "1577": "food",
  "1578": "food",
  "1602": "lodging",
  "1646": "temple",
  "1684": "shopping",
  "1686": "shopping",
  "1720": "nature",
  "1733": "restroom",
};

export function isPlaceCategory(value: unknown): value is PlaceCategory {
  return typeof value === "string" && PLACE_CATEGORIES.some((category) => category === value);
}

export function categoryFromKmlStyle(sourceKey: string, styleRef: string): PlaceCategory {
  if (!VERIFIED_KANTO_KML_HASHES.has(sourceKey.split(":", 1)[0] ?? "")) {
    return "unknown";
  }

  const styleId = /^#icon-(\d+)-[a-f\d]{6}(?:-nodesc)?$/i.exec(styleRef)?.[1];

  return styleId === undefined ? "unknown" : (VERIFIED_STYLE_CATEGORIES[styleId] ?? "unknown");
}

export function effectivePlaceCategory(point: {
  categoryOverride?: unknown;
  sourceKey: string;
  styleRef: string;
}): PlaceCategory {
  return isPlaceCategory(point.categoryOverride)
    ? point.categoryOverride
    : categoryFromKmlStyle(point.sourceKey, point.styleRef);
}
