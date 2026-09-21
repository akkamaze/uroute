import { expect, test } from "bun:test";
import { placeMapLabels } from "../src/plan/map-label-placement.ts";

const viewport = { height: 300, width: 320 };

test("places a label on the left when the right side leaves the viewport", () => {
  expect(placeMapLabels([{ id: "edge", width: 116, x: 290, y: 100 }], viewport).get("edge")).toBe(
    "left",
  );
});

test("uses the left side when the preferred right side overlaps another label", () => {
  const placements = placeMapLabels(
    [
      { id: "first", width: 116, x: 150, y: 100 },
      { id: "second", width: 116, x: 160, y: 100 },
    ],
    viewport,
  );

  expect(placements.get("first")).toBe("right");
  expect(placements.get("second")).toBe("left");
});

test("hides a label only when neither side has enough room", () => {
  const placements = placeMapLabels(
    [
      { id: "right", width: 116, x: 150, y: 100 },
      { id: "left", width: 116, x: 160, y: 100 },
      { id: "hidden", width: 116, x: 155, y: 100 },
    ],
    viewport,
  );

  expect(placements.has("hidden")).toBe(false);
});

test("shows all labels on the preferred side once they no longer overlap", () => {
  const placements = placeMapLabels(
    [
      { id: "first", width: 116, x: 40, y: 100 },
      { id: "second", width: 116, x: 180, y: 100 },
    ],
    viewport,
  );

  expect([...placements.values()]).toEqual(["right", "right"]);
});
