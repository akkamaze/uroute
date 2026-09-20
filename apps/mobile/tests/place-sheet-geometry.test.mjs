import { expect, test } from "bun:test";
import {
  getSheetOffset,
  getSheetVisibleHeight,
  resolveSheetSnap,
} from "../src/places/place-sheet-geometry.ts";

for (const height of [400, 640, 844]) {
  test("collapsed and middle sheet stay visible at height " + height, () => {
    expect(72 + getSheetOffset("collapsed", height)).toBe(height - 132);
    const middleTop = 72 + getSheetOffset("middle", height);
    expect(middleTop).toBeLessThan(height);
    expect(height - middleTop).toBeCloseTo(getSheetVisibleHeight("middle", height));
    expect(getSheetOffset("expanded", height)).toBe(0);
  });
}
test("snap decisions preserve slow drag and fast fling semantics at short height", () => {
  expect(resolveSheetSnap("collapsed", -30, 500, 400)).toBe("middle");
  expect(resolveSheetSnap("middle", -150, 600, 400)).toBe("expanded");
  expect(resolveSheetSnap("expanded", 30, 500, 400)).toBe("middle");
  expect(resolveSheetSnap("middle", 100, 100, 400)).toBe("collapsed");
  expect(resolveSheetSnap("middle", -100, 100, 400)).toBe("expanded");
});
