import { expect, test } from "bun:test";

import { importedPointAsStop } from "../src/imports/imported-stop.ts";
import { categoryFromKmlStyle } from "../src/places/place-category.ts";

test("an imported point stays usable without an OSM classification", () => {
  const point = {
    id: "import-1",
    sourceKey: "source:1",
    sourceFile: "trip.kml",
    folder: "Day 1",
    name: "Kiyomizu-dera",
    description: "",
    longitude: 135.785,
    latitude: 34.9949,
    styleRef: "",
    mediaReferences: [],
  };

  expect(importedPointAsStop(point)).toMatchObject({
    id: "import-1",
    name: "Kiyomizu-dera",
    category: "unknown",
    type: "Unknown",
  });
});

test("verified KML icon styles select uroute categories without using place names", () => {
  const sourceKey = "b3f7f5f9e05e114881231d5441c8c0448dea6a487e0314f209d9fde70a46b170:7";
  expect(categoryFromKmlStyle(sourceKey, "#icon-1534-558B2F")).toBe("coffee");
  expect(categoryFromKmlStyle(sourceKey, "#icon-1684-558B2F")).toBe("shopping");
  expect(categoryFromKmlStyle(sourceKey, "#icon-1535-558B2F")).toBe("sightseeing");
  expect(
    categoryFromKmlStyle(
      "807513820c134b8cd355e9462e023f604d510822503b25098cfe9dc88497cc1b:7",
      "#icon-1684-558B2F",
    ),
  ).toBe("shopping");
  expect(categoryFromKmlStyle(sourceKey, "#icon-1498-558B2F")).toBe("unknown");
  expect(categoryFromKmlStyle("another-document:7", "#icon-1534-558B2F")).toBe("unknown");
});

test("an explicit category overrides the icon, including Unknown", () => {
  const point = {
    id: "import-2",
    sourceKey: "b3f7f5f9e05e114881231d5441c8c0448dea6a487e0314f209d9fde70a46b170:7",
    sourceFile: "trip.kmz",
    folder: "Day 1",
    name: "A place",
    description: "",
    longitude: 135,
    latitude: 35,
    styleRef: "#icon-1534-558B2F",
    mediaReferences: [],
  };
  expect(importedPointAsStop(point).category).toBe("coffee");
  expect(importedPointAsStop({ ...point, categoryOverride: "unknown" })).toMatchObject({
    category: "unknown",
    type: "Unknown",
  });
  expect(importedPointAsStop({ ...point, categoryOverride: "nature" })).toMatchObject({
    category: "nature",
    type: "Park / nature",
  });
});
