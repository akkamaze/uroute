import type { PlannedVisit } from "./plan-store";

export type VersionChangeKind = "added" | "removed" | "order" | "time" | "note";

export interface VersionChange {
  from?: string;
  kind: VersionChangeKind;
  label: string;
  to?: string;
  value?: string;
}

export interface VersionPlaceDiff {
  changes: VersionChange[];
  placeId: string;
  position: number;
  visit: PlannedVisit;
}

export interface VersionDiff {
  changedPlaceCount: number;
  places: VersionPlaceDiff[];
  removed: VersionPlaceDiff[];
}

function longestCommonSubsequence(left: readonly string[], right: readonly string[]): Set<string> {
  const lengths = Array.from({ length: left.length + 1 }, () =>
    Array<number>(right.length + 1).fill(0),
  );

  for (let leftIndex = left.length - 1; leftIndex >= 0; leftIndex -= 1) {
    for (let rightIndex = right.length - 1; rightIndex >= 0; rightIndex -= 1) {
      lengths[leftIndex]![rightIndex] =
        left[leftIndex] === right[rightIndex]
          ? 1 + lengths[leftIndex + 1]![rightIndex + 1]!
          : Math.max(lengths[leftIndex + 1]![rightIndex]!, lengths[leftIndex]![rightIndex + 1]!);
    }
  }

  const stable = new Set<string>();
  let leftIndex = 0;
  let rightIndex = 0;
  while (leftIndex < left.length && rightIndex < right.length) {
    if (left[leftIndex] === right[rightIndex]) {
      stable.add(left[leftIndex]!);
      leftIndex += 1;
      rightIndex += 1;
    } else if (lengths[leftIndex + 1]![rightIndex]! >= lengths[leftIndex]![rightIndex + 1]!) {
      leftIndex += 1;
    } else {
      rightIndex += 1;
    }
  }

  return stable;
}

function displayTime(time: string): string {
  return time === "" ? "No time set" : time;
}

function displayNote(note: string): string {
  return note === "" ? "No note" : note;
}

export function createVersionDiff(
  current: readonly PlannedVisit[],
  version: readonly PlannedVisit[],
): VersionDiff {
  const currentById = new Map(current.map((visit, index) => [visit.placeId, { index, visit }]));
  const versionIds = new Set(version.map((visit) => visit.placeId));
  const sharedCurrent = current
    .filter((visit) => versionIds.has(visit.placeId))
    .map((visit) => visit.placeId);
  const sharedVersion = version
    .filter((visit) => currentById.has(visit.placeId))
    .map((visit) => visit.placeId);
  const stableIds = longestCommonSubsequence(sharedCurrent, sharedVersion);

  const places = version.map((visit, index): VersionPlaceDiff => {
    const existing = currentById.get(visit.placeId);
    const changes: VersionChange[] = [];
    if (existing === undefined) {
      changes.push({
        kind: "added",
        label: "Added",
        value: `Added as Stop ${index + 1}${visit.time === "" ? "" : ` · ${visit.time}`}`,
      });
    } else {
      if (!stableIds.has(visit.placeId) && existing.index !== index) {
        changes.push({
          from: `Stop ${existing.index + 1}`,
          kind: "order",
          label: "Order changed",
          to: `Stop ${index + 1}`,
        });
      }
      if (existing.visit.time !== visit.time) {
        changes.push({
          from: displayTime(existing.visit.time),
          kind: "time",
          label: "Time changed",
          to: displayTime(visit.time),
        });
      }
      if (existing.visit.notes !== visit.notes) {
        changes.push({
          from: displayNote(existing.visit.notes),
          kind: "note",
          label: "Note changed",
          to: displayNote(visit.notes),
        });
      }
    }

    return { changes, placeId: visit.placeId, position: index, visit: { ...visit } };
  });

  const removed = current.flatMap((visit, index): VersionPlaceDiff[] => {
    if (versionIds.has(visit.placeId)) {
      return [];
    }

    return [
      {
        changes: [
          {
            kind: "removed",
            label: "Removed",
            value: `Removed from Stop ${index + 1}${visit.time === "" ? "" : ` · ${visit.time}`}`,
          },
        ],
        placeId: visit.placeId,
        position: index,
        visit: { ...visit },
      },
    ];
  });
  const changedPlaceCount =
    places.filter((place) => place.changes.length > 0).length + removed.length;

  return { changedPlaceCount, places, removed };
}
