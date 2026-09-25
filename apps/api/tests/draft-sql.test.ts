import { expect, test } from "bun:test";
import type { Pool } from "pg";

import { PgTripDraftRepository } from "../src/trips/drafts";

const TRIP_ID = "2f0802ba-d889-4493-8a1d-87b07b92f021";

test("draft SQL qualifies joined columns and never inserts for an expected revision", async () => {
  const statements: string[] = [];
  const query = (sql: string): Promise<{ rows: unknown[]; rowCount: number }> => {
    statements.push(sql);
    if (sql.includes("SELECT start_date::text")) {
      return Promise.resolve({
        rows: [{ startDate: "2026-09-27", endDate: "2026-10-01", version: "1" }],
        rowCount: 1,
      });
    }

    return Promise.resolve({ rows: [], rowCount: 0 });
  };
  const pool = {
    query,
    connect: () => Promise.resolve({ query, release: () => {} }),
  } as unknown as Pool;
  const repository = new PgTripDraftRepository(pool);

  await repository.get("owner", TRIP_ID, "2026-09-27", "A");
  expect(statements[0]).toContain("d.updated_at::text");
  expect(statements[0]).toContain("d.day::text");

  expect(await repository.put("owner", TRIP_ID, "2026-09-27", "A", "1", "2", [])).toBe("conflict");
  expect(statements.some((sql) => sql.includes("UPDATE trip_draft SET"))).toBe(true);
  expect(statements.some((sql) => sql.includes("INSERT INTO trip_draft"))).toBe(false);
});
