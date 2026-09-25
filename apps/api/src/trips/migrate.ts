import { readConfig } from "../config";
import { createDatabase } from "../database";

const migrations = await Promise.all(
  ["001_trip_core", "002_trip_draft", "003_trip_source_place"].map(async (version) => ({
    version,
    up: await Bun.file(new URL(`../../migrations/${version}.up.sql`, import.meta.url)).text(),
    down: await Bun.file(new URL(`../../migrations/${version}.down.sql`, import.meta.url)).text(),
  })),
);

if (!process.argv.includes("--apply") && !process.argv.includes("--rollback")) {
  migrations.forEach(({ version, up }) => console.info(`-- ${version}\n${up}`));
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
      "SELECT version FROM app_schema_migration WHERE version = ANY($1::text[])",
      [migrations.map(({ version }) => version)],
    );
    const applied = new Set(existing.rows.map(({ version }) => version));
    if (process.argv.includes("--rollback")) {
      for (const { version, down } of [...migrations].reverse()) {
        if (applied.has(version)) {
          await client.query(down);
          await client.query("DELETE FROM app_schema_migration WHERE version = $1", [version]);
        }
      }
    } else {
      for (const { version, up } of migrations) {
        if (!applied.has(version)) {
          await client.query(up);
          await client.query("INSERT INTO app_schema_migration (version) VALUES ($1)", [version]);
        }
      }
    }
    await client.query("COMMIT");
    console.info(
      `Trip migrations are ${process.argv.includes("--rollback") ? "rolled back" : "up to date"}.`,
    );
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
    await database.end();
  }
}
