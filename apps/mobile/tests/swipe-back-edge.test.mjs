import { expect, test } from "bun:test";

import {
  isSwipeBackEdgeStart,
  SWIPE_BACK_EDGE_END_PX,
  SYSTEM_BACK_EDGE_PX,
} from "../src/navigation/swipe-back.ts";

test("swipe back leaves the system edge free and uses a wider adjacent zone", () => {
  const surfaceLeft = 8;

  expect(SYSTEM_BACK_EDGE_PX).toBe(24);
  expect(SWIPE_BACK_EDGE_END_PX).toBe(88);
  expect(isSwipeBackEdgeStart(surfaceLeft, surfaceLeft)).toBe(false);
  expect(isSwipeBackEdgeStart(surfaceLeft + SYSTEM_BACK_EDGE_PX, surfaceLeft)).toBe(false);
  expect(isSwipeBackEdgeStart(surfaceLeft + SYSTEM_BACK_EDGE_PX + 1, surfaceLeft)).toBe(true);
  expect(isSwipeBackEdgeStart(surfaceLeft + SWIPE_BACK_EDGE_END_PX, surfaceLeft)).toBe(true);
  expect(isSwipeBackEdgeStart(surfaceLeft + SWIPE_BACK_EDGE_END_PX + 1, surfaceLeft)).toBe(false);
  expect(isSwipeBackEdgeStart(surfaceLeft - 1, surfaceLeft)).toBe(false);
});
