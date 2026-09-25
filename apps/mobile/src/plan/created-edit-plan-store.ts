import type { PlannedVisit } from "./plan-store";
import type { EditPlanDraft, EditPlanVersion } from "./edit-plan-store";

interface EditorRecord {
  draft?: EditPlanDraft;
  versions: EditPlanVersion[];
}

const STORAGE_PREFIX = "uroute.created-edit-plan.v1";

export function createdEditorKey(tripId: string, day: string, option: string): string {
  return `${STORAGE_PREFIX}.${tripId}.${day}.${option}`;
}

function validVisits(value: unknown): value is PlannedVisit[] {
  if (!Array.isArray(value) || value.length > 10_000) {
    return false;
  }
  const seen = new Set<string>();

  return value.every((item) => {
    if (typeof item !== "object" || item === null) {
      return false;
    }
    const visit = item as Partial<PlannedVisit>;
    if (
      typeof visit.placeId !== "string" ||
      visit.placeId.length === 0 ||
      visit.placeId.length > 300 ||
      seen.has(visit.placeId) ||
      typeof visit.time !== "string" ||
      !/^(?:[01]\d|2[0-3]):[0-5]\d$|^$/.test(visit.time) ||
      typeof visit.notes !== "string" ||
      visit.notes.length > 5_000
    ) {
      return false;
    }
    seen.add(visit.placeId);

    return true;
  });
}

function cloneVisits(visits: readonly PlannedVisit[]): PlannedVisit[] {
  return visits.map((visit) => ({ ...visit }));
}

function read(key: string): EditorRecord {
  try {
    const value: unknown = JSON.parse(localStorage.getItem(key) ?? "null");
    if (typeof value !== "object" || value === null) {
      return { versions: [] };
    }
    const record = value as Partial<EditorRecord>;
    const versions = Array.isArray(record.versions)
      ? record.versions.filter(
          (version): version is EditPlanVersion =>
            typeof version === "object" &&
            version !== null &&
            typeof version.id === "string" &&
            typeof version.savedAt === "number" &&
            Number.isInteger(version.sequence) &&
            typeof version.summary === "string" &&
            validVisits(version.visits),
        )
      : [];
    const draft = record.draft;

    return {
      versions,
      ...(draft &&
      typeof draft.baseSignature === "string" &&
      typeof draft.updatedAt === "number" &&
      validVisits(draft.visits)
        ? { draft }
        : {}),
    };
  } catch {
    return { versions: [] };
  }
}

function write(key: string, record: EditorRecord): boolean {
  try {
    localStorage.setItem(key, JSON.stringify(record));

    return true;
  } catch {
    return false;
  }
}

export function loadCreatedEditDraft(key: string, signature: string): EditPlanDraft | null {
  const draft = read(key).draft;

  return draft?.baseSignature === signature
    ? { ...draft, visits: cloneVisits(draft.visits) }
    : null;
}

export function saveCreatedEditDraft(
  key: string,
  signature: string,
  visits: readonly PlannedVisit[],
): boolean {
  if (!validVisits(visits)) {
    return false;
  }
  const record = read(key);

  return write(key, {
    ...record,
    draft: { baseSignature: signature, updatedAt: Date.now(), visits: cloneVisits(visits) },
  });
}

export function clearCreatedEditDraft(key: string): void {
  const record = read(key);
  delete record.draft;
  write(key, record);
}

export function loadCreatedEditVersions(key: string): EditPlanVersion[] {
  return read(key).versions;
}

export function addCreatedEditVersion(
  key: string,
  visits: readonly PlannedVisit[],
  summary: string,
): EditPlanVersion[] {
  const record = read(key);
  if (!validVisits(visits)) {
    return record.versions;
  }
  const sequence = Math.max(0, ...record.versions.map((version) => version.sequence)) + 1;
  const version: EditPlanVersion = {
    id: crypto.randomUUID(),
    savedAt: Date.now(),
    sequence,
    summary,
    visits: cloneVisits(visits),
  };
  const versions = [version, ...record.versions];

  return write(key, { ...record, versions }) ? versions : record.versions;
}

export function recordCreatedVersionRestore(
  key: string,
  current: readonly PlannedVisit[],
  selected: EditPlanVersion,
): { ok: boolean; versions: EditPlanVersion[] } {
  const record = read(key);
  if (!validVisits(current) || !validVisits(selected.visits)) {
    return { ok: false, versions: record.versions };
  }
  const savedAt = Date.now();
  const sequence = Math.max(0, ...record.versions.map((version) => version.sequence)) + 1;
  const restoreContext = {
    sourceId: selected.id,
    sourceSavedAt: selected.savedAt,
    sourceSequence: selected.sequence,
    sourceSummary: selected.summary,
  };
  const versions: EditPlanVersion[] = [
    {
      id: crypto.randomUUID(),
      savedAt: savedAt + 1,
      sequence: sequence + 1,
      summary: `Restored from Version ${selected.sequence}`,
      visits: cloneVisits(selected.visits),
      restoreContext: { kind: "restored", ...restoreContext },
    },
    {
      id: crypto.randomUUID(),
      savedAt,
      sequence,
      summary: "Auto-saved before restoring",
      visits: cloneVisits(current),
      restoreContext: { kind: "before", ...restoreContext },
    },
    ...record.versions,
  ];
  const ok = write(key, { versions });

  return { ok, versions: ok ? versions : record.versions };
}
