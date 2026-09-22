import { beforeEach, expect, test } from "bun:test";

import {
  addManageDayVersion,
  clearManageDayDraft,
  loadManageDayDraft,
  loadManageDayVersions,
  saveManageDayDraft,
  visitsSignature,
} from "../src/plan/manage-day-store.ts";

class MemoryStorage {
  #values = new Map();

  clear() {
    this.#values.clear();
  }

  getItem(key) {
    return this.#values.get(key) ?? null;
  }

  setItem(key, value) {
    this.#values.set(key, String(value));
  }
}

const originalVisits = [
  { placeId: "kiyomizu", time: "09:00", notes: "" },
  { placeId: "arabica", time: "11:00", notes: "coffee" },
];

beforeEach(() => {
  globalThis.window = { localStorage: new MemoryStorage() };
});

test("loads an autosaved draft only for the plan revision it was based on", () => {
  const base = visitsSignature(originalVisits);
  const reordered = [originalVisits[1], originalVisits[0]];

  expect(saveManageDayDraft(13, base, reordered)).toBe(true);
  expect(loadManageDayDraft(13, base)?.visits).toEqual(reordered);
  expect(loadManageDayDraft(13, "newer-plan")).toBeNull();

  clearManageDayDraft(13);
  expect(loadManageDayDraft(13, base)).toBeNull();
});

test("keeps the ten newest restorable versions", () => {
  for (let index = 0; index < 12; index += 1) {
    addManageDayVersion(13, originalVisits, `Version ${index}`, 1_000 + index);
  }

  const versions = loadManageDayVersions(13);
  expect(versions).toHaveLength(10);
  expect(versions[0]?.summary).toBe("Version 11");
  expect(versions.at(-1)?.summary).toBe("Version 2");
  expect(versions[0]?.visits).toEqual(originalVisits);
});
