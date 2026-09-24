import type { ImportedGeometry, ImportedPoint } from "./parse-place-file";

const DATABASE_NAME = "uroute-imported-places";
const DATABASE_VERSION = 2;

export const KANTO_DAYS = [
  { date: "2026-09-27", label: "Sun 27 Sep" },
  { date: "2026-09-28", label: "Mon 28 Sep" },
  { date: "2026-09-29", label: "Tue 29 Sep" },
  { date: "2026-09-30", label: "Wed 30 Sep" },
  { date: "2026-10-01", label: "Thu 1 Oct" },
] as const;

export type KantoDay = (typeof KANTO_DAYS)[number]["date"];

export interface ImportedVisit {
  id: string;
  day: KantoDay;
  placeId: string;
  time: string;
  order: number;
}

export function sameImportedPlace(left: ImportedPoint, right: ImportedPoint): boolean {
  if (left.sourceKey === right.sourceKey) {
    return true;
  }

  return (
    left.longitude === right.longitude &&
    left.latitude === right.latitude &&
    left.name.trim().toLocaleLowerCase() === right.name.trim().toLocaleLowerCase() &&
    left.folder.trim().toLocaleLowerCase() === right.folder.trim().toLocaleLowerCase()
  );
}

function geometryCoordinates(
  geometry: ImportedGeometry,
): [number, number][] | [number, number][][] {
  return "coordinates" in geometry ? geometry.coordinates : geometry.rings;
}

export function sameImportedGeometry(left: ImportedGeometry, right: ImportedGeometry): boolean {
  return (
    left.sourceKey === right.sourceKey ||
    (left.name.trim().toLocaleLowerCase() === right.name.trim().toLocaleLowerCase() &&
      left.folder.trim().toLocaleLowerCase() === right.folder.trim().toLocaleLowerCase() &&
      JSON.stringify(geometryCoordinates(left)) === JSON.stringify(geometryCoordinates(right)))
  );
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE_NAME, DATABASE_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains("places")) {
        database.createObjectStore("places", { keyPath: "id" });
      }
      if (!database.objectStoreNames.contains("geometries")) {
        database.createObjectStore("geometries", { keyPath: "id" });
      }
      if (!database.objectStoreNames.contains("visits")) {
        database.createObjectStore("visits", { keyPath: "id" });
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(request.error ?? new Error("Could not open local place storage."));
  });
}

function complete(transaction: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    transaction.oncomplete = () => resolve();
    transaction.onabort = () =>
      reject(transaction.error ?? new Error("Local storage was interrupted."));
    transaction.onerror = () => reject(transaction.error ?? new Error("Local storage failed."));
  });
}

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error ?? new Error("Could not read local storage."));
  });
}

export async function loadImportedPlaces(): Promise<ImportedPoint[]> {
  const database = await openDatabase();
  try {
    const transaction = database.transaction("places", "readonly");
    const places = await requestResult(
      transaction.objectStore("places").getAll() as IDBRequest<ImportedPoint[]>,
    );

    return places.sort(
      (left, right) =>
        left.folder.localeCompare(right.folder) || left.name.localeCompare(right.name),
    );
  } finally {
    database.close();
  }
}

export async function loadImportedGeometries(): Promise<ImportedGeometry[]> {
  const database = await openDatabase();
  try {
    const geometries = await requestResult(
      database
        .transaction("geometries", "readonly")
        .objectStore("geometries")
        .getAll() as IDBRequest<ImportedGeometry[]>,
    );

    return geometries.sort(
      (left, right) =>
        left.folder.localeCompare(right.folder) || left.name.localeCompare(right.name),
    );
  } finally {
    database.close();
  }
}
export async function saveImportedContent(
  points: readonly ImportedPoint[],
  geometries: readonly ImportedGeometry[],
): Promise<{ placeCount: number; lineCount: number; areaCount: number }> {
  const database = await openDatabase();
  try {
    const readTransaction = database.transaction(["places", "geometries"], "readonly");
    const [knownPlaces, knownGeometries] = await Promise.all([
      requestResult(readTransaction.objectStore("places").getAll() as IDBRequest<ImportedPoint[]>),
      requestResult(
        readTransaction.objectStore("geometries").getAll() as IDBRequest<ImportedGeometry[]>,
      ),
    ]);
    const knownIds = new Set(knownPlaces.map((point) => point.id));
    const newPoints = points.filter(
      (point) =>
        !knownIds.has(point.id) && !knownPlaces.some((known) => sameImportedPlace(point, known)),
    );
    const knownGeometryIds = new Set(knownGeometries.map((geometry) => geometry.id));
    const newGeometries = geometries.filter(
      (geometry) =>
        !knownGeometryIds.has(geometry.id) &&
        !knownGeometries.some((known) => sameImportedGeometry(geometry, known)),
    );
    if (newPoints.length === 0 && newGeometries.length === 0) {
      return { placeCount: 0, lineCount: 0, areaCount: 0 };
    }
    const transaction = database.transaction(["places", "geometries"], "readwrite");
    const done = complete(transaction);
    const placeStore = transaction.objectStore("places");
    const geometryStore = transaction.objectStore("geometries");
    newPoints.forEach((point) => placeStore.put(point));
    newGeometries.forEach((geometry) => geometryStore.put(geometry));
    await done;

    return {
      placeCount: newPoints.length,
      lineCount: newGeometries.filter((geometry) => "coordinates" in geometry).length,
      areaCount: newGeometries.filter((geometry) => "rings" in geometry).length,
    };
  } finally {
    database.close();
  }
}

export async function loadImportedVisits(): Promise<ImportedVisit[]> {
  const database = await openDatabase();
  try {
    const transaction = database.transaction("visits", "readonly");
    const visits = await requestResult(
      transaction.objectStore("visits").getAll() as IDBRequest<ImportedVisit[]>,
    );

    return visits.sort((left, right) => left.order - right.order);
  } finally {
    database.close();
  }
}

export async function addImportedVisit(
  day: KantoDay,
  placeId: string,
): Promise<"added" | "duplicate"> {
  const database = await openDatabase();
  try {
    const id = `${day}:${placeId}`;
    const transaction = database.transaction("visits", "readwrite");
    const store = transaction.objectStore("visits");
    const existing = await requestResult(store.get(id) as IDBRequest<ImportedVisit | undefined>);
    if (existing !== undefined) {
      return "duplicate";
    }
    const visits = await requestResult(store.getAll() as IDBRequest<ImportedVisit[]>);
    const nextOrder =
      Math.max(0, ...visits.filter((visit) => visit.day === day).map((visit) => visit.order)) + 1;
    const done = complete(transaction);
    store.put({ id, day, placeId, time: "", order: nextOrder } satisfies ImportedVisit);
    await done;

    return "added";
  } finally {
    database.close();
  }
}

export async function removeImportedVisit(day: KantoDay, placeId: string): Promise<void> {
  const database = await openDatabase();
  try {
    const transaction = database.transaction("visits", "readwrite");
    const done = complete(transaction);
    transaction.objectStore("visits").delete(`${day}:${placeId}`);
    await done;
  } finally {
    database.close();
  }
}
