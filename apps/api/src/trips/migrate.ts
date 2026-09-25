import { readConfig } from "../config";
import { createDatabase } from "../database";

const migration = "001_trip_core";
const up = await Bun.file(new URL("../../migrations/001_trip_core.up.sql", import.meta.url)).text();
const down = await Bun.file(
  new URL("../../migrations/001_trip_core.down.sql", import.meta.url),
).text();

if (!process.argv.includes("--apply") && !process.argv.includes("--rollback")) {
  console.info(up);
} else {
  const config = readConfig(Bun.env);
  const database = createDatabase(config.databaseURL);
  const client = await database.connect();

  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock(hashtext($1))", ["uroute-trip-migration"]);
    await client.query(`CREATE TABLE IF NOT EXISTS app_schema_migration (
      version varchar(64) PRIMARY KEY,
      applied_at timestamptz NOT NULL DEFAULT now()
    )`);
    const existing = await client.query<{ version: string }>(
      "SELECT version FROM app_schema_migration WHERE version = $1",
      [migration],
    );
    if (process.argv.includes("--rollback")) {
      if (existing.rowCount) {
        await client.query(down);
        await client.query("DELETE FROM app_schema_migration WHERE version = $1", [migration]);
      }
    } else if (!existing.rowCount) {
      await client.query(up);
      await client.query("INSERT INTO app_schema_migration (version) VALUES ($1)", [migration]);
    }
    await client.query("COMMIT");
    console.info(
      `Trip migration ${migration} is ${process.argv.includes("--rollback") ? "rolled back" : "applied"}.`,
    );
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
    await database.end();
  }
}
