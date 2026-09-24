import type { PlaceCollection } from "./map-data";

export const SEARCH_MAP_MARKER_LIMIT = 48;

interface SearchMapOrigin {
  latitude: number;
  longitude: number;
}

const NEARBY_RADIUS_KM = 80;
const CELL_DEGREES = 0.5;

function distanceKm([longitude = 0, latitude = 0]: readonly number[], origin: SearchMapOrigin): number {
  const latitudeRadians = (latitude * Math.PI) / 180;
  const originRadians = (origin.latitude * Math.PI) / 180;
  const latitudeDelta = ((latitude - origin.latitude) * Math.PI) / 180;
  const longitudeDelta = ((longitude - origin.longitude) * Math.PI) / 180;
  const haversine =
    Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(latitudeRadians) *
      Math.cos(originRadians) *
      Math.sin(longitudeDelta / 2) ** 2;

  return 6371 * 2 * Math.asin(Math.min(1, Math.sqrt(haversine)));
}

function densestSearchArea<T>(
  items: readonly T[],
  origin: SearchMapOrigin | null,
  getCoordinates: (item: T) => readonly number[],
): SearchMapOrigin {
  const cells = new Map<string, { latitudeCell: number; longitudeCell: number; count: number }>();

  for (const item of items) {
    const [longitude = 0, latitude = 0] = getCoordinates(item);
    const latitudeCell = Math.floor(latitude / CELL_DEGREES);
    const longitudeCell = Math.floor(longitude / CELL_DEGREES);
    const key = `${latitudeCell}:${longitudeCell}`;
    const cell = cells.get(key);

    if (cell === undefined) {
      cells.set(key, { latitudeCell, longitudeCell, count: 1 });
    } else {
      cell.count += 1;
    }
  }

  let bestCenter: SearchMapOrigin | null = null;
  let bestCount = -1;
  let bestDistance = Number.POSITIVE_INFINITY;

  for (const cell of cells.values()) {
    let neighborhoodCount = 0;

    for (let latitudeOffset = -1; latitudeOffset <= 1; latitudeOffset += 1) {
      for (let longitudeOffset = -1; longitudeOffset <= 1; longitudeOffset += 1) {
        neighborhoodCount +=
          cells.get(
            `${cell.latitudeCell + latitudeOffset}:${cell.longitudeCell + longitudeOffset}`,
          )?.count ?? 0;
      }
    }

    const center = {
      latitude: (cell.latitudeCell + 0.5) * CELL_DEGREES,
      longitude: (cell.longitudeCell + 0.5) * CELL_DEGREES,
    };
    const originDistance = origin === null ? 0 : distanceKm([center.longitude, center.latitude], origin);

    if (neighborhoodCount > bestCount || (neighborhoodCount === bestCount && originDistance < bestDistance)) {
      bestCenter = center;
      bestCount = neighborhoodCount;
      bestDistance = originDistance;
    }
  }

  return bestCenter ?? origin ?? { latitude: 0, longitude: 0 };
}

/** Keep the full search list while limiting the unclustered markers to a useful local area. */
export function selectSearchMapItems<T>(
  items: readonly T[],
  origin: SearchMapOrigin | null,
  getCoordinates: (item: T) => readonly number[],
): readonly T[] {
  if (items.length <= SEARCH_MAP_MARKER_LIMIT) {
    return items;
  }

  const nearby =
    origin === null
      ? []
      : items.filter(
          (item) => distanceKm(getCoordinates(item), origin) <= NEARBY_RADIUS_KM,
        );
  const center =
    nearby.length > 0 && origin !== null
      ? origin
      : densestSearchArea(items, origin, getCoordinates);
  const candidates = nearby.length > 0 ? nearby : items.filter(
    (item) => distanceKm(getCoordinates(item), center) <= NEARBY_RADIUS_KM,
  );

  return [...candidates]
    .sort(
      (first, second) =>
        distanceKm(getCoordinates(first), center) - distanceKm(getCoordinates(second), center),
    )
    .slice(0, SEARCH_MAP_MARKER_LIMIT);
}

export function selectSearchMapPlaces(
  places: PlaceCollection,
  origin: SearchMapOrigin | null,
): PlaceCollection {
  const features = selectSearchMapItems(
    places.features,
    origin,
    (feature) => feature.geometry.coordinates,
  );

  return features === places.features ? places : { ...places, features: [...features] };
}
