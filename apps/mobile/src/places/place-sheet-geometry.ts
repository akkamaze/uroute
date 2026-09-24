export type SheetSnap = "collapsed" | "expanded" | "middle";

// Keep 44px map controls and their 12px gap below the sheet's 72px top boundary.
export const MIN_VISIBLE_MAP_CONTROLS_TOP = 128;

const SHEET_FLING_VELOCITY = 0.75;
const SHEET_MIN_FLING_DISTANCE = 64;
const SHEET_MIN_DRAG_INTENT = 18;

export function getSheetVisibleHeight(snap: SheetSnap, viewportHeight: number): number {
  if (snap === "expanded") {
    return Number.POSITIVE_INFINITY;
  }

  if (snap === "middle") {
    return (viewportHeight - 72) * 0.55;
  }

  return 132;
}

export function getSheetOffset(snap: SheetSnap, viewportHeight: number): number {
  if (snap === "expanded") {
    return 0;
  }

  const sheetHeight = viewportHeight - 72;

  return Math.max(0, sheetHeight - getSheetVisibleHeight(snap, viewportHeight));
}

export function getDragOffset(snap: SheetSnap, delta: number, viewportHeight: number): number {
  const baseOffset = getSheetOffset(snap, viewportHeight);
  const maximumOffset = getSheetOffset("collapsed", viewportHeight);

  return Math.min(maximumOffset - baseOffset, Math.max(-baseOffset, delta));
}

export function resolveSheetSnap(
  current: SheetSnap,
  delta: number,
  duration: number,
  viewportHeight: number,
): SheetSnap {
  const sheetHeight = viewportHeight - 72;
  const releasedOffset =
    getSheetOffset(current, viewportHeight) + getDragOffset(current, delta, viewportHeight);
  const releasedRatio = releasedOffset / sheetHeight;
  const velocity = delta / Math.max(1, duration);
  const flingDistance = Math.max(SHEET_MIN_FLING_DISTANCE, viewportHeight * 0.08);

  if (Math.abs(delta) >= flingDistance && Math.abs(velocity) >= SHEET_FLING_VELOCITY) {
    return delta < 0 ? "expanded" : "collapsed";
  }

  if (current === "collapsed" && delta <= -SHEET_MIN_DRAG_INTENT && releasedRatio > 0.28) {
    return "middle";
  }

  if (current === "expanded" && delta >= SHEET_MIN_DRAG_INTENT && releasedRatio < 0.7) {
    return "middle";
  }

  if (releasedRatio <= 0.28) {
    return "expanded";
  }

  if (releasedRatio >= 0.7) {
    return "collapsed";
  }

  return "middle";
}
