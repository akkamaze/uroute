import { expect, test } from "bun:test";

import { createApp } from "../src/app";

test("reports API health", async () => {
  const response = await createApp().handle(new Request("http://localhost/health"));

  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ status: "ok" });
});

test("readiness reflects database availability", async () => {
  const ready = await createApp(undefined, undefined, undefined, undefined, undefined, () =>
    Promise.resolve(),
  ).handle(new Request("http://localhost/ready"));
  const unavailable = await createApp(undefined, undefined, undefined, undefined, undefined, () =>
    Promise.reject(new Error("database unavailable")),
  ).handle(new Request("http://localhost/ready"));

  expect(ready.status).toBe(200);
  expect(await ready.json()).toEqual({ status: "ready" });
  expect(unavailable.status).toBe(503);
  expect(await unavailable.json()).toEqual({ status: "unavailable" });
});
