import { expect, test } from "bun:test";

import { formatDistance, haversineMeters, travelEstimate } from "../src/plan/travel-estimate.ts";

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
  ).toBe("16 min ride");
});

test("a ride across midnight wraps to the next day", () => {
  expect(
    travelEstimate(
      station("kanto:transit:3:2:dep", "23:50"),
      station("kanto:transit:3:2:arr", "00:20"),
    ),
  ).toBe("30 min ride");
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
  ).toBe("Walk about 6 min · 470 m");
});

test("nearby places show a walk estimate with detour and rounded distance", () => {
  const from = place("a", 35.715, 139.796);
  const to = place("b", 35.7111, 139.7963);
  const meters = haversineMeters(from.point, to.point) * 1.3;

  expect(meters).toBeGreaterThan(560);
  expect(meters).toBeLessThan(565);
  expect(travelEstimate(from, to)).toBe("Walk about 8 min · 560 m");
});

test("walks longer than 45 minutes show the distance apart instead", () => {
  expect(travelEstimate(place("a", 35.68, 139.76), place("b", 35.68, 139.8))).toBe(
    "About 4.7 km apart",
  );
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
