import { expect, test } from "bun:test";

import { reconcileItineraryMatches } from "../src/imports/itinerary-sheet.ts";

const points = [
  {
    id: "shibuya",
    name: "[ View ] Observation Floor (Shibuya Scramble Square 12F)",
  },
  {
    id: "kabukicho",
    name: "[ View ] Observation Floor (Tokyu Kabukicho Tower 17F)",
  },
  {
    id: "skytree",
    name: "[ View ] Tokyo Sky Tree East Tower Observation Floor (30-31F)",
  },
];

function entry(title, detail = "") {
  return {
    id: title,
    tripId: "trip",
    day: "2026-09-27",
    variant: "A",
    order: 1,
    time: "",
    title,
    detail,
    area: "",
    kind: "place",
    match: "unmatched",
  };
}

test("links a stored two-line spreadsheet place only to its unique full KML name", () => {
  const [matched, ambiguous, renamed] = reconcileItineraryMatches(
    [
      entry("[ View ] Observation Floor", "(Shibuya Scramble Square 12F) · details"),
      entry("[ View ] Observation Floor"),
      entry("[ View ] Tokyo Skytree East Tower Observation Floor", "(30-31F)"),
    ],
    points,
  );

  expect(matched).toMatchObject({ placeId: "shibuya", match: "matched" });
  expect(ambiguous).toMatchObject({ match: "unmatched" });
  expect(ambiguous).not.toHaveProperty("placeId");
  expect(renamed).toMatchObject({ placeId: "skytree", match: "matched" });
});

test("preserves an existing verified pin despite a later ambiguous name", () => {
  const saved = { ...entry("[ View ] Observation Floor"), placeId: "kabukicho", match: "matched" };

  expect(reconcileItineraryMatches([saved], points)[0]).toEqual(saved);
});
