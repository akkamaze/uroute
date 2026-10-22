import { startTime, type CreatedPlanRow } from "./created-plan-rows";

export type TravelMode = "ride" | "walk" | "drive";

export interface TravelLeg {
  mode: TravelMode;
  label: string;
}

interface Point {
  latitude: number;
  longitude: number;
}

export const WALK_LIMIT_METERS = 1000;

type TravelRow = Pick<CreatedPlanRow, "id" | "kind" | "time" | "point">;

const EARTH_RADIUS_M = 6_371_000;
const DETOUR_FACTOR = 1.3;
const WALK_METERS_PER_MINUTE = 4800 / 60;
const DRIVE_METERS_PER_MINUTE = 40_000 / 60;
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

export function haversineMeters(from: Point, to: Point): number {
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

function routeMeters(from: Point, to: Point): number {
  return haversineMeters(from, to) * DETOUR_FACTOR;
}

function modeForMeters(meters: number): "walk" | "drive" {
  return meters <= WALK_LIMIT_METERS ? "walk" : "drive";
}

export function walkOrDrive(from: Point, to: Point): "walk" | "drive" {
  return modeForMeters(routeMeters(from, to));
}

export function travelEstimate(from: TravelRow, to: TravelRow): TravelLeg | undefined {
  const ride = rideMinutes(from, to);
  if (ride !== null) {
    return { mode: "ride", label: `${ride} min ride` };
  }
  if (!from.point || !to.point) {
    return undefined;
  }

  const meters = routeMeters(from.point, to.point);
  const distance = formatDistance(meters);

  if (modeForMeters(meters) === "walk") {
    const minutes = Math.max(1, Math.ceil(meters / WALK_METERS_PER_MINUTE));

    return { mode: "walk", label: `Walk about ${minutes} min · ${distance}` };
  }

  const minutes = Math.max(1, Math.ceil(meters / DRIVE_METERS_PER_MINUTE));

  return { mode: "drive", label: `Drive about ${minutes} min · ${distance}` };
}
