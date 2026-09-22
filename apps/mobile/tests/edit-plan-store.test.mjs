import { beforeEach, expect, test } from "bun:test";

import {
  addEditPlanVersion,
  clearEditPlanDraft,
  loadEditPlanDraft,
  loadEditPlanVersions,
  restoreAndSaveEditPlanVersion,
  saveEditPlanDraft,
  visitsSignature,
} from "../src/plan/edit-plan-store.ts";
import { KYOTO_PLAN_STORAGE_KEY } from "../src/plan/plan-store.ts";

class MemoryStorage {
  #values = new Map();
  failKey = null;

  clear() {
    this.#values.clear();
  }

  getItem(key) {
    return this.#values.get(key) ?? null;
  }

  setItem(key, value) {
    if (this.failKey === key) {
      this.failKey = null;
      throw new Error("Storage unavailable");
    }
    this.#values.set(key, String(value));
  }

  removeItem(key) {
    this.#values.delete(key);
  }
}

let memoryStorage;

const originalVisits = [
  { placeId: "kiyomizu", time: "09:00", notes: "" },
  { placeId: "arabica", time: "11:00", notes: "coffee" },
];

beforeEach(() => {
  memoryStorage = new MemoryStorage();
  globalThis.window = { localStorage: memoryStorage };
});

test("restores the plan, records both sides of history and clears the draft together", () => {
  const restoredVisits = [originalVisits[1], originalVisits[0]];
  globalThis.window.localStorage.setItem(
    KYOTO_PLAN_STORAGE_KEY,
    JSON.stringify({ days: { 12: [], 13: originalVisits, 14: [], 15: [], 16: [] } }),
  );
  saveEditPlanDraft(13, visitsSignature(originalVisits), restoredVisits);
  const selected = addEditPlanVersion(13, restoredVisits, "Earlier route", 500)[0];
  if (selected === undefined) {
    throw new Error("Expected source version");
  }

  const result = restoreAndSaveEditPlanVersion(13, originalVisits, selected, 1_000);

  expect(result.ok).toBe(true);
  expect(
    JSON.parse(globalThis.window.localStorage.getItem(KYOTO_PLAN_STORAGE_KEY)).days[13],
  ).toEqual(restoredVisits);
  expect(result.versions.slice(0, 2).map((version) => version.summary)).toEqual([
    "Restored from Version 1",
    "Auto-saved before restoring",
  ]);
  expect(result.versions.slice(0, 2).map((version) => version.sequence)).toEqual([3, 2]);
  expect(result.versions[0]?.restoreContext).toEqual({
    kind: "restored",
    sourceId: selected.id,
    sourceSavedAt: 500,
    sourceSequence: 1,
    sourceSummary: "Earlier route",
  });
  expect(loadEditPlanDraft(13, visitsSignature(originalVisits))).toBeNull();
});

test("rolls back plan, history and draft when atomic restoration cannot finish", () => {
  const restoredVisits = [originalVisits[1], originalVisits[0]];
  const originalPlan = JSON.stringify({
    days: { 12: [], 13: originalVisits, 14: [], 15: [], 16: [] },
  });
  globalThis.window.localStorage.setItem(KYOTO_PLAN_STORAGE_KEY, originalPlan);
  saveEditPlanDraft(13, visitsSignature(originalVisits), restoredVisits);
  const originalDrafts = globalThis.window.localStorage.getItem("uroute.mock.edit-plan-drafts.v1");
  memoryStorage.failKey = "uroute.mock.edit-plan-versions.v1";

  const result = restoreAndSaveEditPlanVersion(
    13,
    originalVisits,
    {
      id: "target",
      savedAt: 500,
      sequence: 1,
      summary: "Earlier route",
      visits: restoredVisits,
    },
    1_000,
  );

  expect(result.ok).toBe(false);
  expect(globalThis.window.localStorage.getItem(KYOTO_PLAN_STORAGE_KEY)).toBe(originalPlan);
  expect(globalThis.window.localStorage.getItem("uroute.mock.edit-plan-drafts.v1")).toBe(
    originalDrafts,
  );
  expect(loadEditPlanVersions(13)).toEqual([]);
});

test("loads an autosaved draft only for the plan revision it was based on", () => {
  const base = visitsSignature(originalVisits);
  const reordered = [originalVisits[1], originalVisits[0]];

  expect(saveEditPlanDraft(13, base, reordered)).toBe(true);
  expect(loadEditPlanDraft(13, base)?.visits).toEqual(reordered);
  expect(loadEditPlanDraft(13, "newer-plan")).toBeNull();

  clearEditPlanDraft(13);
  expect(loadEditPlanDraft(13, base)).toBeNull();
});

test("keeps every restorable version while assigning stable sequence numbers", () => {
  for (let index = 0; index < 12; index += 1) {
    addEditPlanVersion(13, originalVisits, `Version ${index}`, 1_000 + index);
  }

  const versions = loadEditPlanVersions(13);
  expect(versions).toHaveLength(12);
  expect(versions[0]?.summary).toBe("Version 11");
  expect(versions[0]?.sequence).toBe(12);
  expect(versions.at(-1)?.summary).toBe("Version 0");
  expect(versions.at(-1)?.sequence).toBe(1);
  expect(versions[0]?.visits).toEqual(originalVisits);
});

test("assigns stable sequence numbers when loading legacy version entries", () => {
  globalThis.window.localStorage.setItem(
    "uroute.mock.edit-plan-versions.v1",
    JSON.stringify({
      13: [
        { id: "newer", savedAt: 200, summary: "Newer", visits: originalVisits },
        { id: "older", savedAt: 100, summary: "Older", visits: originalVisits },
      ],
    }),
  );

  expect(loadEditPlanVersions(13).map((version) => version.sequence)).toEqual([2, 1]);
});

test("labels legacy restore backups with the restored source version", () => {
  const restoredVisits = [originalVisits[1], originalVisits[0]];
  globalThis.window.localStorage.setItem(
    "uroute.mock.edit-plan-versions.v1",
    JSON.stringify({
      13: [
        {
          id: "legacy-restored",
          savedAt: 302,
          summary: "Restored version from Today, 09:00 AM",
          visits: restoredVisits,
        },
        { id: "legacy-before", savedAt: 301, summary: "Before restore", visits: originalVisits },
        { id: "source", savedAt: 100, summary: "Initial plan", visits: restoredVisits },
      ],
    }),
  );

  const versions = loadEditPlanVersions(13);
  expect(versions[0]?.summary).toBe("Restored from Version 1");
  expect(versions[1]?.summary).toBe("Auto-saved before restoring");
  expect(versions[1]?.restoreContext).toEqual({
    kind: "before",
    sourceId: "source",
    sourceSavedAt: 100,
    sourceSequence: 1,
    sourceSummary: "Initial plan",
  });
});
