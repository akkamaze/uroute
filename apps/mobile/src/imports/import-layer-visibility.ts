import type { ImportedGeometry, ImportedPoint } from "./parse-place-file";

export type ImportLayerItem = ImportedGeometry | ImportedPoint;
export type ImportLayerKind = "point" | "line" | "area";

const STORAGE_KEY = "uroute-import-map-layers:v1:kanto";

export function importSourceId(item: ImportLayerItem): string {
  return item.sourceKey.split(":", 1)[0] ?? item.sourceKey;
}

export function importLayerKind(item: ImportLayerItem): ImportLayerKind {
  return "longitude" in item ? "point" : "coordinates" in item ? "line" : "area";
}

export function sourceLayerKey(sourceId: string): string {
  return `source:${sourceId}`;
}

export function kindLayerKey(sourceId: string, kind: ImportLayerKind): string {
  return `kind:${sourceId}:${kind}`;
}

export function folderLayerKey(sourceId: string, folder: string): string {
  return `folder:${sourceId}:${folder}`;
}

export function isImportLayerVisible(item: ImportLayerItem, hidden: ReadonlySet<string>): boolean {
  const sourceId = importSourceId(item);

  return (
    !hidden.has(sourceLayerKey(sourceId)) &&
    !hidden.has(kindLayerKey(sourceId, importLayerKind(item))) &&
    !hidden.has(folderLayerKey(sourceId, item.folder))
  );
}

export function loadHiddenImportLayers(): Set<string> {
  try {
    const stored: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? "[]");

    return new Set(
      Array.isArray(stored) ? stored.filter((key): key is string => typeof key === "string") : [],
    );
  } catch {
    return new Set();
  }
}

export function saveHiddenImportLayers(hidden: ReadonlySet<string>): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...hidden]));
  } catch {
    // Map visibility remains usable for this session when storage is unavailable.
  }
}

export interface ImportLayerSource {
  id: string;
  label: string;
  counts: Record<ImportLayerKind, number>;
  shownCounts: Record<ImportLayerKind, number>;
  folders: {
    name: string;
    count: number;
    shownCount: number;
    counts: Record<ImportLayerKind, number>;
  }[];
}

export function buildImportLayerSources(
  points: readonly ImportedPoint[],
  geometries: readonly ImportedGeometry[],
  hidden: ReadonlySet<string>,
): ImportLayerSource[] {
  const sources = new Map<string, ImportLayerSource>();
  for (const item of [...points, ...geometries]) {
    const id = importSourceId(item);
    let source = sources.get(id);
    if (source === undefined) {
      source = {
        id,
        label: item.sourceName?.trim() || item.sourceFile,
        counts: { point: 0, line: 0, area: 0 },
        shownCounts: { point: 0, line: 0, area: 0 },
        folders: [],
      };
      sources.set(id, source);
    } else if (item.sourceName?.trim()) {
      source.label = item.sourceName.trim();
    }
    const kind = importLayerKind(item);
    const shown = isImportLayerVisible(item, hidden);
    source.counts[kind] += 1;
    if (shown) {
      source.shownCounts[kind] += 1;
    }
    const folder = source.folders.find((entry) => entry.name === item.folder);
    if (folder === undefined) {
      source.folders.push({
        name: item.folder,
        count: 1,
        shownCount: shown ? 1 : 0,
        counts: {
          point: kind === "point" ? 1 : 0,
          line: kind === "line" ? 1 : 0,
          area: kind === "area" ? 1 : 0,
        },
      });
    } else {
      folder.count += 1;
      folder.counts[kind] += 1;
      if (shown) {
        folder.shownCount += 1;
      }
    }
  }
  const result = [...sources.values()].sort((left, right) =>
    left.label.localeCompare(right.label),
  );
  const labelCounts = new Map<string, number>();
  for (const source of result) {
    labelCounts.set(source.label, (labelCounts.get(source.label) ?? 0) + 1);
  }
  for (const source of result) {
    if ((labelCounts.get(source.label) ?? 0) > 1) {
      source.label = `${source.label} · ${source.id.slice(0, 6)}`;
    }
    source.folders.sort((left, right) => left.name.localeCompare(right.name));
  }

  return result;
}

export function showAllImportLayers(
  hidden: ReadonlySet<string>,
  sources: readonly ImportLayerSource[],
): Set<string> {
  const next = new Set(hidden);
  for (const source of sources) {
    next.delete(sourceLayerKey(source.id));
    for (const kind of ["point", "line", "area"] as const) {
      next.delete(kindLayerKey(source.id, kind));
    }
    for (const folder of source.folders) {
      next.delete(folderLayerKey(source.id, folder.name));
    }
  }

  return next;
}

export function hideAllImportLayers(
  hidden: ReadonlySet<string>,
  sources: readonly ImportLayerSource[],
): Set<string> {
  const next = new Set(hidden);
  for (const source of sources) {
    next.add(sourceLayerKey(source.id));
  }

  return next;
}
