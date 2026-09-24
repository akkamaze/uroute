import { loadCreatedTrips, tripDays } from "../trips/trip-store";

export type ImportDestinationTrip = string;
export interface MapDestination {
  trip: string;
  day: string;
}

const STORAGE_KEY = "uroute.maps.add-destination.v1";
const KYOTO_DAYS = [12, 13, 14, 15, 16].map((date) => ({
  day: `2026-11-${date}`,
  label: `${["Thu", "Fri", "Sat", "Sun", "Mon"][date - 12]} ${date} Nov`,
}));

export function destinationDays(tripId: string): { day: string; label: string }[] {
  if (tripId === "kyoto") {
    return KYOTO_DAYS;
  }
  if (tripId === "kanto") {
    return [
      { day: "2026-09-27", label: "Sun 27 Sep" },
      { day: "2026-09-28", label: "Mon 28 Sep" },
      { day: "2026-09-29", label: "Tue 29 Sep" },
      { day: "2026-09-30", label: "Wed 30 Sep" },
      { day: "2026-10-01", label: "Thu 1 Oct" },
    ];
  }
  const trip = loadCreatedTrips().find((item) => item.id === tripId);

  return trip === undefined ? [] : tripDays(trip);
}

export function availableDestinations(): { id: string; name: string }[] {
  return [
    { id: "kyoto", name: "Kyoto" },
    ...loadCreatedTrips().map((trip) => ({ id: trip.id, name: trip.name })),
  ];
}

export function isMapDestination(value: unknown): value is MapDestination {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const candidate = value as Partial<MapDestination>;

  return (
    typeof candidate.trip === "string" &&
    typeof candidate.day === "string" &&
    availableDestinations().some(({ id }) => id === candidate.trip) &&
    destinationDays(candidate.trip).some(({ day }) => day === candidate.day)
  );
}

export function loadMapDestination(): MapDestination | null {
  try {
    const stored: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "null");

    return isMapDestination(stored) ? stored : null;
  } catch {
    return null;
  }
}

export function saveMapDestination(destination: MapDestination): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(destination));
  } catch {
    /* session only */
  }
}

export function destinationLabel(destination: MapDestination): string {
  const name =
    destination.trip === "kyoto"
      ? "Kyoto"
      : destination.trip === "kanto"
        ? "Kanto"
        : (loadCreatedTrips().find((trip) => trip.id === destination.trip)?.name ?? "Trip");
  const day = destinationDays(destination.trip).find((item) => item.day === destination.day);

  return `${name} · ${day?.label ?? destination.day}`;
}
