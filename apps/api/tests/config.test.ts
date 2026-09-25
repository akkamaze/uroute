import { expect, test } from "bun:test";

import { readConfig } from "../src/config";

const environment = {
  BETTER_AUTH_SECRET: "test-only-config-secret-with-at-least-32-characters",
  BETTER_AUTH_URL: "http://localhost:3001",
  DATABASE_URL: "postgresql://test:test@localhost:5432/test",
  GOOGLE_CLIENT_ID: "test-client",
  GOOGLE_CLIENT_SECRET: "test-secret",
  TRUSTED_ORIGINS: "http://localhost:5180,http://localhost:5182",
};

test("requires credentials without including secret values in errors", () => {
  expect(() => readConfig({ ...environment, GOOGLE_CLIENT_SECRET: "" })).toThrow(
    "GOOGLE_CLIENT_SECRET is required",
  );
  expect(() => readConfig({ ...environment, BETTER_AUTH_SECRET: "short" })).toThrow("at least 32");
});

test("only explicit origins are accepted", () => {
  expect(readConfig(environment).auth.trustedOrigins).toHaveLength(2);

  for (const value of [
    "https://*.example.com",
    "https://example.com/path",
    "https://user:pass@example.com",
    "http://example.com",
    "javascript:alert(1)",
  ]) {
    expect(() => readConfig({ ...environment, TRUSTED_ORIGINS: value })).toThrow();
  }
});

test("production requires HTTPS even on localhost", () => {
  expect(() => readConfig({ ...environment, NODE_ENV: "production" })).toThrow("HTTPS");
  expect(
    readConfig({
      ...environment,
      BETTER_AUTH_URL: "https://api.example.com",
      NODE_ENV: "production",
      TRUSTED_ORIGINS: "https://app.example.com",
    }).auth.production,
  ).toBe(true);
});
