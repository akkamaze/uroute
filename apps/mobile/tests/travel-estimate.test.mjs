import { expect, test } from "bun:test";

import { directionModes } from "../src/plan/account-plan.ts";
import {
  formatDistance,
  haversineMeters,
  travelEstimate,
  walkOrDrive,
  WALK_LIMIT_METERS,
} from "../src/plan/travel-estimate.ts";

function station(id, time, point) {
  return { id, kind: "transport", time, point };
}

function place(id, latitude, longitude, time = "") {
  return { id, kind: "place", time, point: { latitude, longitude } };
}

test("a departure and arrival of the same leg show the ride duration", () => {
  expect(
    travelEstimate(
      station("kanto:transit:2:1:dep", "08:40"),
      station("kanto:transit:2:1:arr", "08:56 Ueno"),
    ),
  ).toEqual({ mode: "ride", label: "16 min ride" });
});

test("a ride across midnight wraps to the next day", () => {
  expect(
    travelEstimate(
      station("kanto:transit:3:2:dep", "23:50"),
      station("kanto:transit:3:2:arr", "00:20"),
    ),
  ).toEqual({ mode: "ride", label: "30 min ride" });
});

test("stations of different legs or order are not treated as a ride", () => {
  expect(
    travelEstimate(
      station("kanto:transit:2:1:dep", "08:40"),
      station("kanto:transit:2:2:arr", "09:00"),
    ),
  ).toBeUndefined();
  expect(
    travelEstimate(
      station("kanto:transit:2:1:arr", "08:40"),
      station("kanto:transit:2:1:dep", "09:00"),
    ),
  ).toBeUndefined();
});

test("a ride without times falls back to walking between coordinates", () => {
  expect(
    travelEstimate(
      station("kanto:transit:2:1:dep", "", { latitude: 35.7138, longitude: 139.7773 }),
      station("kanto:transit:2:1:arr", "", { latitude: 35.7138, longitude: 139.7813 }),
    ),
  ).toEqual({ mode: "walk", label: "Walk about 6 min · 470 m" });
});

test("nearby places show a walk estimate with detour and rounded distance", () => {
  const from = place("a", 35.715, 139.796);
  const to = place("b", 35.7111, 139.7963);
  const meters = haversineMeters(from.point, to.point) * 1.3;

  expect(meters).toBeGreaterThan(560);
  expect(meters).toBeLessThan(565);
  expect(travelEstimate(from, to)).toEqual({ mode: "walk", label: "Walk about 8 min · 560 m" });
});

test("places farther than the walk limit show a drive estimate", () => {
  expect(travelEstimate(place("a", 35.68, 139.76), place("b", 35.68, 139.8))).toEqual({
    mode: "drive",
    label: "Drive about 8 min · 4.7 km",
  });
});

test("the walk limit splits walking from driving at one kilometre of route", () => {
  const from = place("a", 35.68, 139.76);
  const under = place("b", 35.6869, 139.76);
  const over = place("c", 35.68692, 139.76);

  expect(WALK_LIMIT_METERS).toBe(1000);
  expect(haversineMeters(from.point, under.point) * 1.3).toBeLessThan(1000);
  expect(haversineMeters(from.point, over.point) * 1.3).toBeGreaterThan(1000);
  expect(travelEstimate(from, under)).toEqual({
    mode: "walk",
    label: "Walk about 13 min · 1.0 km",
  });
  expect(travelEstimate(from, over)).toEqual({
    mode: "drive",
    label: "Drive about 2 min · 1.0 km",
  });
  expect(walkOrDrive(from.point, under.point)).toBe("walk");
  expect(walkOrDrive(from.point, over.point)).toBe("drive");
});

test("rows without coordinates have no travel line", () => {
  expect(travelEstimate(place("a", 35.68, 139.76), { id: "b", kind: "note", time: "" })).toBe(
    undefined,
  );
});

test("distances round to 10 m below a kilometre and one decimal above", () => {
  expect(formatDistance(344)).toBe("340 m");
  expect(formatDistance(1234)).toBe("1.2 km");
});

function entry(position, kind, place, variant = "A") {
  return {
    id: `entry-${variant}-${position}`,
    sourceKey: `entry:${variant}:${position}`,
    day: "2026-10-01",
    variant,
    position,
    kind,
    title: "",
    timeLabel: "",
    detail: "",
    area: "",
    placeId: place?.sourceKey ?? null,
    place: place
      ? {
          name: place.sourceKey,
          category: null,
          imageUrl: null,
          notes: null,
          latitude: null,
          longitude: null,
          ...place,
        }
      : null,
  };
}

test("directions ride transit between stations, walk to near stops and drive to far ones", () => {
  const modes = directionModes([
    entry(4, "place", { sourceKey: "far", latitude: 35.68, longitude: 139.8 }),
    entry(0, "transport", { sourceKey: "dep", latitude: 35.68, longitude: 139.76 }),
    entry(1, "transport", { sourceKey: "arr", latitude: 35.7, longitude: 139.76 }),
    entry(2, "note", null),
    entry(3, "place", { sourceKey: "near", latitude: 35.7, longitude: 139.761 }),
    entry(0, "place", { sourceKey: "other-first", latitude: 35.68, longitude: 139.76 }, "B"),
  ]);

  expect(Object.fromEntries(modes)).toEqual({
    dep: "walking",
    arr: "transit",
    near: "walking",
    far: "driving",
    "other-first": "walking",
  });
  expect(modes.get("not-in-plan")).toBeUndefined();
});

test("directions compare with the previous stop that has coordinates", () => {
  const modes = directionModes([
    entry(0, "place", { sourceKey: "start", latitude: 35.68, longitude: 139.76 }),
    entry(1, "place", { sourceKey: "unlocated" }),
    entry(2, "place", { sourceKey: "end", latitude: 35.68, longitude: 139.8 }),
  ]);

  expect(modes.get("unlocated")).toBe("walking");
  expect(modes.get("end")).toBe("driving");
});

test("a place planned twice takes the mode of its first stop", () => {
  const modes = directionModes([
    entry(0, "place", { sourceKey: "hotel", latitude: 35.68, longitude: 139.76 }),
    entry(1, "place", { sourceKey: "beach", latitude: 35.68, longitude: 139.8 }),
    entry(2, "place", { sourceKey: "hotel", latitude: 35.68, longitude: 139.76 }),
  ]);

  expect(modes.get("hotel")).toBe("walking");
  expect(modes.get("beach")).toBe("driving");
});
