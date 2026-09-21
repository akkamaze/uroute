import { Pool, types } from "pg";

export function createDatabase(connectionString: string): Pool {
  const database = new Pool({
    connectionString,
    connectionTimeoutMillis: 5_000,
    idleTimeoutMillis: 30_000,
    max: 10,
  });

  database.on("connect", (client) => {
    client.setTypeParser(types.builtins.INT8, BigInt);
  });

  return database;
}
