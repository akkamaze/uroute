import { expect, test } from "bun:test";
import type { Pool } from "pg";

import { PgTripEntryRepository, type EntryInput } from "../src/trips/entries";

const TRIP_ID = "2f0802ba-d889-4493-8a1d-87b07b92f021";
const entries: EntryInput[] = [
  {
    sourceKey: "one",
    day: "2027-01-10",
    variant: "A",
    position: 0,
    kind: "place",
    title: "Market",
    timeLabel: "09:00",
    detail: "new note",
    area: "Center",
    placeId: "market",
  },
  {
    sourceKey: "two",
    day: "2027-01-11",
    variant: "A",
    position: 0,
    kind: "place",
    title: "Museum",
    timeLabel: "10:00",
    detail: "",
    area: "Center",
    placeId: "museum",
  },
];

test("entry replacement rebases drafts only for unchanged day options", async () => {
  const statements: Array<{ sql: string; params: unknown[] }> = [];
  const query = (
    sql: string,
    params: unknown[] = [],
  ): Promise<{ rows: unknown[]; rowCount: number }> => {
    statements.push({ sql, params });
    if (sql.includes("FROM trip") && sql.includes("FOR UPDATE")) {
      return Promise.resolve({
        rows: [{ version: "1", startDate: "2027-01-10", endDate: "2027-01-11" }],
        rowCount: 1,
      });
    }
    if (sql.includes("SELECT id::text") && sql.includes("FROM trip_entry")) {
      const before = statements.filter((statement) => statement.sql.includes("FROM trip_entry"));

      return Promise.resolve({
        rows: before.length === 1 ? [{ ...entries[0], detail: "old note" }, entries[1]] : entries,
        rowCount: 2,
      });
    }
    if (sql.includes("UPDATE trip SET version")) {
      return Promise.resolve({ rows: [{ version: "2" }], rowCount: 1 });
    }

    return Promise.resolve({ rows: [], rowCount: 0 });
  };
  const pool = {
    connect: () => Promise.resolve({ query, release: () => {} }),
  } as unknown as Pool;
  const repository = new PgTripEntryRepository(pool);

  const result = await repository.replace("owner", TRIP_ID, "1", entries);
  expect(typeof result).toBe("object");
  const rebase = statements.find((statement) => statement.sql.includes("UPDATE trip_draft SET"));
  expect(rebase?.params).toEqual([TRIP_ID, "1", "2", ["2027-01-10:A"]]);
  expect(statements.some((statement) => statement.sql === "COMMIT")).toBe(true);
});
