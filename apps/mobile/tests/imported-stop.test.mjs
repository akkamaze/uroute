import { expect, test } from "bun:test";

import { importedPointAsStop } from "../src/imports/imported-stop.ts";

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
