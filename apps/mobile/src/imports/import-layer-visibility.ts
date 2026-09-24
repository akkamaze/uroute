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
  fileName: string;
  label: string;
  counts: Record<ImportLayerKind, number>;
  folders: { name: string; count: number }[];
}

export function buildImportLayerSources(
  points: readonly ImportedPoint[],
  geometries: readonly ImportedGeometry[],
): ImportLayerSource[] {
  const sources = new Map<string, ImportLayerSource>();
  for (const item of [...points, ...geometries]) {
    const id = importSourceId(item);
    let source = sources.get(id);
    if (source === undefined) {
      source = {
        id,
        fileName: item.sourceFile,
        label: item.sourceFile,
        counts: { point: 0, line: 0, area: 0 },
        folders: [],
      };
      sources.set(id, source);
    }
    source.counts[importLayerKind(item)] += 1;
    const folder = source.folders.find((entry) => entry.name === item.folder);
    if (folder === undefined) {
      source.folders.push({ name: item.folder, count: 1 });
    } else {
      folder.count += 1;
    }
  }
  const result = [...sources.values()].sort((left, right) =>
    left.fileName.localeCompare(right.fileName),
  );
  const fileNameCounts = new Map<string, number>();
  for (const source of result) {
    fileNameCounts.set(source.fileName, (fileNameCounts.get(source.fileName) ?? 0) + 1);
  }
  for (const source of result) {
    if ((fileNameCounts.get(source.fileName) ?? 0) > 1) {
      source.label = `${source.fileName} · ${source.id.slice(0, 6)}`;
    }
    source.folders.sort((left, right) => left.name.localeCompare(right.name));
  }

  return result;
}
