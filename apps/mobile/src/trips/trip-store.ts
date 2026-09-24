export interface CreatedTrip {
  id: string;
  name: string;
  startDate: string;
  endDate: string;
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
