export interface CreatedTrip {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
  dayOptions?: Record<string, string>;
  rowOrder?: Record<string, string[]>;
  rowHidden?: Record<string, string[]>;
}

const STORAGE_KEY = "uroute.created-trips.v1";
const DATE = /^\d{4}-\d{2}-\d{2}$/;

function isTrip(value: unknown): value is CreatedTrip {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const item = value as Partial<CreatedTrip>;

  return (
    typeof item.id === "string" &&
    /^[a-zA-Z0-9-]{1,80}$/.test(item.id) &&
    typeof item.name === "string" &&
    item.name.trim().length > 0 &&
    item.name.length <= 120 &&
    typeof item.startDate === "string" &&
    DATE.test(item.startDate) &&
    typeof item.endDate === "string" &&
    DATE.test(item.endDate) &&
    item.endDate >= item.startDate
  );
}

export function loadCreatedTrips(): CreatedTrip[] {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]");

    return Array.isArray(value) ? value.filter(isTrip) : [];
  } catch {
    return [];
  }
}

export function createTrip(name: string, startDate: string, endDate: string): CreatedTrip {
  const trip: CreatedTrip = { id: crypto.randomUUID(), name: name.trim(), startDate, endDate };
  if (!isTrip(trip) || tripDays(trip).length === 0 || tripDays(trip).length > 60) {
    throw new Error("Choose a destination and a date range of up to 60 days.");
  }
  localStorage.setItem(STORAGE_KEY, JSON.stringify([...loadCreatedTrips(), trip]));

  return trip;
}

export function updateTrip(
  id: string,
  name: string,
  startDate: string,
  endDate: string,
): CreatedTrip {
  const trips = loadCreatedTrips();
  const existing = trips.find((trip) => trip.id === id);
  if (!existing) {
    throw new Error("Trip not found on this device.");
  }
  const updated = { ...existing, name: name.trim(), startDate, endDate };
  if (!isTrip(updated) || tripDays(updated).length === 0 || tripDays(updated).length > 60) {
    throw new Error("Choose a destination and a date range of up to 60 days.");
  }
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify(trips.map((trip) => (trip.id === id ? updated : trip))),
  );

  return updated;
}

export function setTripDayOption(id: string, day: string, option: string): CreatedTrip {
  const trips = loadCreatedTrips();
  const existing = trips.find((trip) => trip.id === id);
  if (!existing || day < existing.startDate || day > existing.endDate || !/^[A-Z]$/.test(option)) {
    throw new Error("Could not save this itinerary option.");
  }
  const updated = { ...existing, dayOptions: { ...existing.dayOptions, [day]: option } };
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify(trips.map((trip) => (trip.id === id ? updated : trip))),
  );

  return updated;
}

export function setTripRowOrder(
  id: string,
  day: string,
  option: string,
  rowIds: readonly string[],
): CreatedTrip {
  const trips = loadCreatedTrips();
  const existing = trips.find((trip) => trip.id === id);
  if (
    !existing ||
    day < existing.startDate ||
    day > existing.endDate ||
    !/^[A-Z]$/.test(option) ||
    rowIds.length > 10_000 ||
    rowIds.some((rowId) => typeof rowId !== "string" || rowId.length > 160) ||
    new Set(rowIds).size !== rowIds.length
  ) {
    throw new Error("Could not save this itinerary order.");
  }
  const key = `${day}:${option}`;
  const updated = { ...existing, rowOrder: { ...existing.rowOrder, [key]: [...rowIds] } };
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify(trips.map((trip) => (trip.id === id ? updated : trip))),
  );

  return updated;
}

export function clearTripRowOrder(id: string): CreatedTrip {
  const trips = loadCreatedTrips();
  const existing = trips.find((trip) => trip.id === id);
  if (!existing) {
    throw new Error("Trip not found on this device.");
  }
  const updated = { ...existing };
  delete updated.rowOrder;
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify(trips.map((trip) => (trip.id === id ? updated : trip))),
  );

  return updated;
}

export function setTripPlanRows(
  id: string,
  day: string,
  option: string,
  orderedIds: readonly string[],
  hiddenIds: readonly string[],
): CreatedTrip {
  const trips = loadCreatedTrips();
  const existing = trips.find((trip) => trip.id === id);
  const allIds = [...orderedIds, ...hiddenIds];
  if (
    !existing ||
    day < existing.startDate ||
    day > existing.endDate ||
    !/^[A-Z]$/.test(option) ||
    allIds.length > 10_000 ||
    allIds.some((rowId) => typeof rowId !== "string" || rowId.length > 300) ||
    new Set(allIds).size !== allIds.length
  ) {
    throw new Error("Could not save this plan day.");
  }
  const key = `${day}:${option}`;
  const updated: CreatedTrip = {
    ...existing,
    rowOrder: { ...existing.rowOrder, [key]: [...orderedIds] },
    rowHidden: { ...existing.rowHidden, [key]: [...hiddenIds] },
  };
  localStorage.setItem(
    STORAGE_KEY,
    JSON.stringify(trips.map((trip) => (trip.id === id ? updated : trip))),
  );

  return updated;
}

export function tripDays(trip: CreatedTrip): { day: string; label: string }[] {
  const start = Date.parse(`${trip.startDate}T12:00:00Z`);
  const end = Date.parse(`${trip.endDate}T12:00:00Z`);
  if (
    !Number.isFinite(start) ||
    !Number.isFinite(end) ||
    end < start ||
    end - start > 60 * 86_400_000
  ) {
    return [];
  }
  const weekday = new Intl.DateTimeFormat("en", { weekday: "short", timeZone: "UTC" });
  const month = new Intl.DateTimeFormat("en", { month: "short", timeZone: "UTC" });
  const days: { day: string; label: string }[] = [];
  for (let time = start; time <= end; time += 86_400_000) {
    const date = new Date(time);
    days.push({
      day: date.toISOString().slice(0, 10),
      label: `${weekday.format(date)} ${date.getUTCDate()} ${month.format(date)}`,
    });
  }

  return days;
}
