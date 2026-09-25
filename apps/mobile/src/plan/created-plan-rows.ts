import type { ImportedVisit } from "../imports/place-library";
import type { ItineraryEntry } from "../imports/itinerary-sheet";
import type { ImportedPoint } from "../imports/parse-place-file";

export interface CreatedPlanRow {
  id: string;
  title: string;
  time: string;
  detail: string;
  area: string;
  kind: "place" | "transport" | "note";
  point?: ImportedPoint | undefined;
  entry?: ItineraryEntry;
  visit?: ImportedVisit;
}

export function startTime(label: string): string {
  const matched = /(?:^|\D)([01]?\d|2[0-3])[.:]([0-5]\d)/.exec(label);

  return matched ? `${matched[1]!.padStart(2, "0")}:${matched[2]}` : "";
}

export function buildCreatedPlanRows(
  tripId: string,
  day: string,
  option: string,
  points: readonly ImportedPoint[],
  itinerary: readonly ItineraryEntry[],
  visits: readonly ImportedVisit[],
  rowOrder?: readonly string[],
  hiddenIds?: readonly string[],
  rowEdits?: Readonly<Record<string, { time: string; notes: string }>>,
): CreatedPlanRow[] {
  const byId = new Map(points.map((point) => [point.id, point]));
  const sheetRows = itinerary
    .filter((entry) => entry.day === day && entry.variant === option)
    .sort((left, right) => left.order - right.order)
    .map((entry) => ({
      id: entry.id,
      title: entry.title,
      time: entry.time,
      detail: entry.detail,
      area: entry.area,
      kind: entry.kind,
      point: entry.placeId ? byId.get(entry.placeId) : undefined,
      entry,
    }));
  const addedRows = visits
    .filter((visit) => visit.tripId === tripId && visit.day === day)
    .sort((left, right) => left.order - right.order)
    .flatMap((visit) => {
      const point = byId.get(visit.placeId);

      return point
        ? [
            {
              id: visit.id,
              title: point.name,
              time: visit.time,
              detail: visit.notes ?? "",
              area: point.folder,
              kind: "place" as const,
              point,
              visit,
            },
          ]
        : [];
    });

  const hidden = new Set(hiddenIds ?? []);
  const combined = [...sheetRows, ...addedRows]
    .filter((row) => !hidden.has(row.id))
    .map((row) => {
      const edit = rowEdits?.[row.id];

      return edit ? { ...row, time: edit.time, detail: edit.notes } : row;
    });
  if (!Array.isArray(rowOrder) || rowOrder.length === 0) {
    return combined;
  }
  const ranks = new Map(rowOrder.map((id, index) => [id, index]));

  return combined.sort((left, right) => {
    const leftRank = ranks.get(left.id);
    const rightRank = ranks.get(right.id);
    if (leftRank === undefined) {
      return rightRank === undefined ? 0 : 1;
    }

    return rightRank === undefined ? -1 : leftRank - rightRank;
  });
}
