import { createApp } from "./app";
import { clientAddress } from "./auth/client-address";
import { createAuth } from "./auth/create-auth";
import { readConfig } from "./config";
import { createDatabase } from "./database";
import { PgTripRepository } from "./trips/repository";

const config = readConfig(Bun.env);
const database = createDatabase(config.databaseURL);

database.on("error", () => {
  console.error("Database connection interrupted.");
});

const auth = createAuth(database, config.auth);
let resolveAddress: (request: Request) => string | null = () => null;
const app = createApp(
  auth,
  (request) => resolveAddress(request),
  new PgTripRepository(database),
).listen({
  hostname: config.hostname,
  port: config.port,
});

resolveAddress = (request): string | null =>
  clientAddress(request, app.server?.requestIP(request)?.address ?? null, config.trustedProxyIPs);

console.info("uroute API listening on port", app.server?.port);

let stopping = false;

async function shutdown(): Promise<void> {
  if (stopping) {
    return;
  }

  stopping = true;
  await app.stop();
  await database.end();
}

process.on("SIGINT", () => {
  void shutdown();
});
process.on("SIGTERM", () => {
  void shutdown();
});
