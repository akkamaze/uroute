import { FRIDAY_STOPS } from "./plan-data";
import {
  getKyotoPlan,
  KYOTO_PLAN_STORAGE_KEY,
  syncKyotoPlanFromStorage,
  type KyotoDay,
  type PlannedVisit,
} from "./plan-store";

const DRAFTS_KEY = "uroute.mock.manage-day-drafts.v1";
const VERSIONS_KEY = "uroute.mock.manage-day-versions.v1";
const knownPlaceIds = new Set(FRIDAY_STOPS.map((place) => place.id));

export interface ManageDayDraft {
  baseSignature: string;
  updatedAt: number;
  visits: PlannedVisit[];
}

export interface ManageDayVersion {
  id: string;
  restoreContext?: {
    kind: "before" | "restored";
    sourceId: string;
    sourceSavedAt: number;
    sourceSequence: number;
    sourceSummary: string;
  };
  savedAt: number;
  sequence: number;
  summary: string;
  visits: PlannedVisit[];
}

type DraftRecord = Partial<Record<KyotoDay, ManageDayDraft>>;
type VersionRecord = Partial<Record<KyotoDay, ManageDayVersion[]>>;

function cloneVisits(visits: readonly PlannedVisit[]): PlannedVisit[] {
  return visits.map((visit) => ({ ...visit }));
}

function isVisit(value: unknown): value is PlannedVisit {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const visit = value as Partial<PlannedVisit>;

  return (
    typeof visit.placeId === "string" &&
    knownPlaceIds.has(visit.placeId) &&
    typeof visit.time === "string" &&
    /^(?:[01]\d|2[0-3]):[0-5]\d$|^$/.test(visit.time) &&
    typeof visit.notes === "string" &&
    visit.notes.length <= 5_000
  );
}

function validVisits(value: unknown): value is PlannedVisit[] {
  if (!Array.isArray(value)) {
    return false;
  }
  const seen = new Set<string>();

  return value.every((visit) => {
    if (!isVisit(visit) || seen.has(visit.placeId)) {
      return false;
    }
    seen.add(visit.placeId);

    return true;
  });
}

function readRecord(key: string): unknown {
  try {
    return JSON.parse(window.localStorage.getItem(key) ?? "null");
  } catch {
    return null;
  }
}

export function visitsSignature(visits: readonly PlannedVisit[]): string {
  return JSON.stringify(visits);
}

export function loadManageDayDraft(day: KyotoDay, baseSignature: string): ManageDayDraft | null {
  const record = readRecord(DRAFTS_KEY);
  if (typeof record !== "object" || record === null) {
    return null;
  }
  const candidate: unknown = Reflect.get(record, String(day));
  if (typeof candidate !== "object" || candidate === null) {
    return null;
  }
  const draft = candidate as Partial<ManageDayDraft>;
  if (
    draft.baseSignature !== baseSignature ||
    typeof draft.updatedAt !== "number" ||
    !validVisits(draft.visits)
  ) {
    return null;
  }

  return { ...draft, visits: cloneVisits(draft.visits) } as ManageDayDraft;
}

export function saveManageDayDraft(
  day: KyotoDay,
  baseSignature: string,
  visits: readonly PlannedVisit[],
): boolean {
  if (!validVisits(visits)) {
    return false;
  }
  const stored = readRecord(DRAFTS_KEY);
  const record: DraftRecord = typeof stored === "object" && stored !== null ? stored : {};
  const next: DraftRecord = {
    ...record,
    [day]: { baseSignature, updatedAt: Date.now(), visits: cloneVisits(visits) },
  };
  try {
    window.localStorage.setItem(DRAFTS_KEY, JSON.stringify(next));

    return true;
  } catch {
    return false;
  }
}

export function clearManageDayDraft(day: KyotoDay): void {
  const stored = readRecord(DRAFTS_KEY);
  if (typeof stored !== "object" || stored === null) {
    return;
  }
  const record = { ...(stored as DraftRecord) };
  delete record[day];
  try {
    window.localStorage.setItem(DRAFTS_KEY, JSON.stringify(record));
  } catch {
    // The draft remains harmless if storage becomes unavailable while leaving the editor.
  }
}

function createVersion(
  visits: readonly PlannedVisit[],
  summary: string,
  savedAt: number,
  sequence: number,
  restoreContext?: ManageDayVersion["restoreContext"],
): ManageDayVersion {
  return {
    id: `${savedAt}-${Math.random().toString(36).slice(2, 8)}`,
    ...(restoreContext === undefined ? {} : { restoreContext }),
    savedAt,
    sequence,
    summary,
    visits: cloneVisits(visits),
  };
}

function isRestoreContext(value: unknown): value is NonNullable<ManageDayVersion["restoreContext"]> {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const context = value as Partial<NonNullable<ManageDayVersion["restoreContext"]>>;

  return (
    (context.kind === "before" || context.kind === "restored") &&
    typeof context.sourceId === "string" &&
    typeof context.sourceSavedAt === "number" &&
    Number.isInteger(context.sourceSequence) &&
    (context.sourceSequence ?? 0) > 0 &&
    typeof context.sourceSummary === "string"
  );
}

function normalizeSequences(versions: ManageDayVersion[]): ManageDayVersion[] {
  const sequences = versions.map((version) => version.sequence);
  const validSequences =
    sequences.every((sequence) => Number.isInteger(sequence) && sequence > 0) &&
    new Set(sequences).size === sequences.length;
  if (validSequences) {
    return versions;
  }

  return versions.map((version, index) => ({ ...version, sequence: versions.length - index }));
}

function nextSequence(versions: readonly ManageDayVersion[]): number {
  return Math.max(0, ...versions.map((version) => version.sequence)) + 1;
}

export function loadManageDayVersions(day: KyotoDay): ManageDayVersion[] {
  const record = readRecord(VERSIONS_KEY);
  if (typeof record !== "object" || record === null) {
    return [];
  }
  const entries: unknown = Reflect.get(record, String(day));
  if (!Array.isArray(entries)) {
    return [];
  }

  const versions = entries.flatMap((entry): ManageDayVersion[] => {
    if (typeof entry !== "object" || entry === null) {
      return [];
    }
    const version = entry as Partial<ManageDayVersion>;
    if (
      typeof version.id !== "string" ||
      typeof version.savedAt !== "number" ||
      typeof version.summary !== "string" ||
      !validVisits(version.visits)
    ) {
      return [];
    }

    const restoreContext = isRestoreContext(version.restoreContext)
      ? version.restoreContext
      : undefined;

    return [
      {
        id: version.id,
        ...(restoreContext === undefined ? {} : { restoreContext }),
        savedAt: version.savedAt,
        sequence:
          typeof version.sequence === "number" && Number.isInteger(version.sequence)
            ? version.sequence
            : 0,
        summary: version.summary,
        visits: cloneVisits(version.visits),
      },
    ];
  });

  return normalizeSequences(versions);
}

export function addManageDayVersion(
  day: KyotoDay,
  visits: readonly PlannedVisit[],
  summary: string,
  savedAt = Date.now(),
): ManageDayVersion[] {
  if (!validVisits(visits)) {
    return loadManageDayVersions(day);
  }
  const stored = readRecord(VERSIONS_KEY);
  const record: VersionRecord = typeof stored === "object" && stored !== null ? stored : {};
  const existing = loadManageDayVersions(day);
  const version = createVersion(visits, summary, savedAt, nextSequence(existing));
  const versions = [version, ...existing];
  try {
    window.localStorage.setItem(VERSIONS_KEY, JSON.stringify({ ...record, [day]: versions }));
  } catch {
    return loadManageDayVersions(day);
  }

  return versions;
}

interface RestoreVersionResult {
  ok: boolean;
  versions: ManageDayVersion[];
}

function restoreStorageValue(key: string, value: string | null): void {
  if (value === null) {
    window.localStorage.removeItem(key);
  } else {
    window.localStorage.setItem(key, value);
  }
}

export function restoreAndSaveManageDayVersion(
  day: KyotoDay,
  current: readonly PlannedVisit[],
  selected: ManageDayVersion,
  savedAt = Date.now(),
): RestoreVersionResult {
  if (!validVisits(current) || !validVisits(selected.visits)) {
    return { ok: false, versions: loadManageDayVersions(day) };
  }

  const originalPlan = window.localStorage.getItem(KYOTO_PLAN_STORAGE_KEY);
  const originalVersions = window.localStorage.getItem(VERSIONS_KEY);
  const originalDrafts = window.localStorage.getItem(DRAFTS_KEY);
  const storedPlan = readRecord(KYOTO_PLAN_STORAGE_KEY);
  const storedDays =
    typeof storedPlan === "object" && storedPlan !== null && "days" in storedPlan
      ? Reflect.get(storedPlan, "days")
      : null;
  const planDays =
    typeof storedDays === "object" && storedDays !== null ? storedDays : getKyotoPlan().days;

  const storedVersions = readRecord(VERSIONS_KEY);
  const versionRecord: VersionRecord =
    typeof storedVersions === "object" && storedVersions !== null ? storedVersions : {};
  const existing = loadManageDayVersions(day);
  const selectedSequence = selected.sequence > 0 ? selected.sequence : nextSequence(existing);
  const restoreContext = {
    sourceId: selected.id,
    sourceSavedAt: selected.savedAt,
    sourceSequence: selectedSequence,
    sourceSummary: selected.summary,
  };
  const previousSequence = nextSequence(existing);
  const previousVersion = createVersion(
    current,
    `Automatically saved before restoring Version ${selectedSequence}`,
    savedAt,
    previousSequence,
    { kind: "before", ...restoreContext },
  );
  const restoredVersion = createVersion(
    selected.visits,
    `Restored from Version ${selectedSequence}`,
    savedAt + 1,
    previousSequence + 1,
    { kind: "restored", ...restoreContext },
  );
  const versions = [restoredVersion, previousVersion, ...existing];
  const storedDrafts = readRecord(DRAFTS_KEY);
  const draftRecord: DraftRecord =
    typeof storedDrafts === "object" && storedDrafts !== null ? { ...storedDrafts } : {};
  delete draftRecord[day];

  try {
    window.localStorage.setItem(
      KYOTO_PLAN_STORAGE_KEY,
      JSON.stringify({ days: { ...planDays, [day]: cloneVisits(selected.visits) } }),
    );
    window.localStorage.setItem(
      VERSIONS_KEY,
      JSON.stringify({ ...versionRecord, [day]: versions }),
    );
    window.localStorage.setItem(DRAFTS_KEY, JSON.stringify(draftRecord));
  } catch {
    try {
      restoreStorageValue(KYOTO_PLAN_STORAGE_KEY, originalPlan);
      restoreStorageValue(VERSIONS_KEY, originalVersions);
      restoreStorageValue(DRAFTS_KEY, originalDrafts);
    } catch {
      // Best-effort rollback preserves the last readable state when storage is degraded.
    }

    return { ok: false, versions: loadManageDayVersions(day) };
  }

  syncKyotoPlanFromStorage();

  return { ok: true, versions };
}
