export const MAP_LABEL_HEIGHT = 36;
export const MAP_LABEL_GAP = 18;

export type MapLabelSide = "left" | "right";

export interface MapLabelPoint {
  id: string;
  width: number;
  x: number;
  y: number;
}

export interface MapLabelViewport {
  height: number;
  width: number;
}

interface LabelRectangle {
  bottom: number;
  left: number;
  right: number;
  top: number;
}

function getLabelRectangle(point: MapLabelPoint, side: MapLabelSide): LabelRectangle {
  const left = side === "right" ? point.x + MAP_LABEL_GAP : point.x - MAP_LABEL_GAP - point.width;

  return {
    bottom: point.y + MAP_LABEL_HEIGHT / 2,
    left,
    right: left + point.width,
    top: point.y - MAP_LABEL_HEIGHT / 2,
  };
}

function fitsViewport(rectangle: LabelRectangle, viewport: MapLabelViewport): boolean {
  return (
    rectangle.left >= 0 &&
    rectangle.right <= viewport.width &&
    rectangle.top >= 0 &&
    rectangle.bottom <= viewport.height
  );
}

function overlaps(first: LabelRectangle, second: LabelRectangle): boolean {
  return !(
    first.right <= second.left ||
    first.left >= second.right ||
    first.bottom <= second.top ||
    first.top >= second.bottom
  );
}

/**
 * Places labels in priority order, preferring the right side of each marker and
 * falling back to the left before hiding a label.
 */
export function placeMapLabels(
  points: readonly MapLabelPoint[],
  viewport: MapLabelViewport,
): Map<string, MapLabelSide> {
  const placements = new Map<string, MapLabelSide>();
  const occupied: LabelRectangle[] = [];

  points.forEach((point) => {
    for (const side of ["right", "left"] as const) {
      const rectangle = getLabelRectangle(point, side);
      if (
        fitsViewport(rectangle, viewport) &&
        occupied.every((placed) => !overlaps(rectangle, placed))
      ) {
        placements.set(point.id, side);
        occupied.push(rectangle);

        return;
      }
    }
  });

  return placements;
}
