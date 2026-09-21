import { expect, test } from "bun:test";

import { isSwipeBackEdgeStart, SWIPE_BACK_EDGE_PX } from "../src/navigation/swipe-back.ts";

test("swipe back starts only within the left-edge zone", () => {
  const surfaceLeft = 8;

  expect(SWIPE_BACK_EDGE_PX).toBe(24);
  expect(isSwipeBackEdgeStart(surfaceLeft, surfaceLeft)).toBe(true);
  expect(isSwipeBackEdgeStart(surfaceLeft + SWIPE_BACK_EDGE_PX, surfaceLeft)).toBe(true);
  expect(isSwipeBackEdgeStart(surfaceLeft + SWIPE_BACK_EDGE_PX + 1, surfaceLeft)).toBe(false);
  expect(isSwipeBackEdgeStart(surfaceLeft - 1, surfaceLeft)).toBe(false);
});
