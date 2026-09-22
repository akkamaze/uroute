import { expect, test } from "bun:test";

import { createVersionDiff } from "../src/plan/version-diff.ts";

const visit = (placeId, time = "09:00", notes = "") => ({ placeId, time, notes });

test("does not mark downstream places as moved after insertion or removal", () => {
  const inserted = createVersionDiff(
    [visit("kiyomizu"), visit("arabica"), visit("nishiki")],
    [visit("kiyomizu"), visit("gion"), visit("arabica"), visit("nishiki")],
  );
  expect(inserted.places.map((place) => place.changes.map((change) => change.kind))).toEqual([
    [],
    ["added"],
    [],
    [],
  ]);

  const removed = createVersionDiff(
    [visit("kiyomizu"), visit("gion"), visit("arabica"), visit("nishiki")],
    [visit("kiyomizu"), visit("arabica"), visit("nishiki")],
  );
  expect(removed.places.every((place) => place.changes.length === 0)).toBe(true);
  expect(removed.removed[0]?.placeId).toBe("gion");
});

test("reports a true reorder and multiple changes on one place", () => {
  const diff = createVersionDiff(
    [visit("kiyomizu"), visit("arabica", "11:00", "Old"), visit("nishiki")],
    [visit("arabica", "12:00", "New"), visit("kiyomizu"), visit("nishiki")],
  );
  const arabica = diff.places.find((place) => place.placeId === "arabica");

  expect(arabica?.changes.map((change) => change.kind)).toEqual(["time", "note"]);
  expect(
    diff.places.flatMap((place) => place.changes).filter((change) => change.kind === "order"),
  ).toHaveLength(1);
  expect(diff.changedPlaceCount).toBe(2);
});

test("handles matching and empty versions", () => {
  const current = [visit("kiyomizu"), visit("arabica")];
  expect(createVersionDiff(current, current).changedPlaceCount).toBe(0);

  const empty = createVersionDiff(current, []);
  expect(empty.places).toEqual([]);
  expect(empty.removed.map((place) => place.placeId)).toEqual(["kiyomizu", "arabica"]);
  expect(empty.changedPlaceCount).toBe(2);
});

test("does not report an unchanged position excluded by the longest common subsequence", () => {
  const current = [visit("kiyomizu"), visit("arabica"), visit("nishiki")];
  const reversed = [visit("nishiki"), visit("arabica"), visit("kiyomizu")];
  const diff = createVersionDiff(current, reversed);

  expect(diff.places.find((place) => place.placeId === "arabica")?.changes).toEqual([]);
  const moves = diff.places
    .flatMap((place) => place.changes)
    .filter((change) => change.kind === "order");
  expect(moves.length).toBeGreaterThan(0);
  expect(moves.every((change) => change.from !== change.to)).toBe(true);

  const edited = createVersionDiff(current, [
    visit("nishiki"),
    visit("arabica", "10:00", "New note"),
    visit("kiyomizu"),
  ]);
  expect(
    edited.places
      .find((place) => place.placeId === "arabica")
      ?.changes.map((change) => change.kind),
  ).toEqual(["time", "note"]);
});
