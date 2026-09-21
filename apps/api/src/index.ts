import { createApp } from "./app";

const port = Number(Bun.env.PORT ?? 3001);
const hostname = Bun.env.HOST ?? "127.0.0.1";

if (!Number.isInteger(port) || port < 1 || port > 65_535) {
  throw new Error("PORT must be between 1 and 65535.");
}

const app = createApp().listen({ hostname, port });

console.info("uroute API listening on port", app.server?.port);

let stopping = false;

async function shutdown(): Promise<void> {
  if (stopping) {
    return;
  }

  stopping = true;
  await app.stop();
}

process.on("SIGINT", () => {
  void shutdown();
});
process.on("SIGTERM", () => {
  void shutdown();
});
