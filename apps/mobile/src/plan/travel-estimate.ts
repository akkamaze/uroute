import { startTime, type CreatedPlanRow } from "./created-plan-rows";

type TravelRow = Pick<CreatedPlanRow, "id" | "kind" | "time" | "point">;

const EARTH_RADIUS_M = 6_371_000;
const DETOUR_FACTOR = 1.3;
const WALK_METERS_PER_MINUTE = 4800 / 60;
const MAX_WALK_MINUTES = 45;
const STATION_KEY = /^(.*:transit:[^:]+:[^:]+):(dep|arr)$/;

function minutesOf(label: string): number | null {
  const time = startTime(label);
  if (!time) {
    return null;
  }
  const [hours, minutes] = time.split(":").map(Number);

  return hours! * 60 + minutes!;
}

function rideMinutes(from: TravelRow, to: TravelRow): number | null {
  if (from.kind !== "transport" || to.kind !== "transport") {
    return null;
  }
  const departure = STATION_KEY.exec(from.id);
  const arrival = STATION_KEY.exec(to.id);
  if (!departure || !arrival || departure[2] !== "dep" || arrival[2] !== "arr") {
    return null;
  }
  if (departure[1] !== arrival[1]) {
    return null;
  }
  const start = minutesOf(from.time);
  const end = minutesOf(to.time);
  if (start === null || end === null) {
    return null;
  }
  const duration = (end - start + 1440) % 1440;

  return duration > 0 ? duration : null;
}

export function haversineMeters(
  from: { latitude: number; longitude: number },
  to: { latitude: number; longitude: number },
): number {
  const radians = (degrees: number): number => (degrees * Math.PI) / 180;
  const latitudeDelta = radians(to.latitude - from.latitude);
  const longitudeDelta = radians(to.longitude - from.longitude);
  const a =
    Math.sin(latitudeDelta / 2) ** 2 +
    Math.cos(radians(from.latitude)) *
      Math.cos(radians(to.latitude)) *
      Math.sin(longitudeDelta / 2) ** 2;

  return 2 * EARTH_RADIUS_M * Math.asin(Math.min(1, Math.sqrt(a)));
}

export function formatDistance(meters: number): string {
  const rounded = Math.round(meters / 10) * 10;

  return rounded < 1000 ? `${rounded} m` : `${(meters / 1000).toFixed(1)} km`;
}

export function travelEstimate(from: TravelRow, to: TravelRow): string | undefined {
  const ride = rideMinutes(from, to);
  if (ride !== null) {
    return `${ride} min ride`;
  }
  if (!from.point || !to.point) {
    return undefined;
  }
  const meters = haversineMeters(from.point, to.point) * DETOUR_FACTOR;
  const minutes = Math.ceil(meters / WALK_METERS_PER_MINUTE);
  if (minutes > MAX_WALK_MINUTES) {
    return `About ${formatDistance(meters)} apart`;
  }

  return `Walk about ${Math.max(1, minutes)} min · ${formatDistance(meters)}`;
}
