import { getMigrations } from "better-auth/db/migration";

import { readConfig } from "../config";
import { createDatabase } from "../database";
import { createAuthOptions } from "./create-auth";

const config = readConfig(Bun.env);
const database = createDatabase(config.databaseURL);

try {
  const migrations = await getMigrations(createAuthOptions(database, config.auth));

  if (process.argv.includes("--apply")) {
    await migrations.runMigrations();
    console.info("Authentication schema is up to date.");
  } else {
    console.info(await migrations.compileMigrations());
  }
} finally {
  await database.end();
}
