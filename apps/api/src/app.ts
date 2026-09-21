import { Elysia } from "elysia";

// Preserve Elysia's route-specific response inference for tests and future mounted handlers.
// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
export function createApp() {
  return new Elysia().get("/health", () => ({ status: "ok" }));
}
