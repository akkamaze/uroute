import { expect, test } from "bun:test";

import { createApp } from "../src/app";

test("reports API health", async () => {
  const response = await createApp().handle(new Request("http://localhost/health"));

  expect(response.status).toBe(200);
  expect(await response.json()).toEqual({ status: "ok" });
});
