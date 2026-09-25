import { afterEach, beforeEach, expect, test } from "bun:test";
import { Database } from "bun:sqlite";
import { getCookies } from "better-auth/cookies";
import { makeSignature } from "better-auth/crypto";
import { getMigrations } from "better-auth/db/migration";

import { createApp } from "../src/app";
import { createAuth, createAuthOptions, type AuthService } from "../src/auth/create-auth";
import type { AuthConfig } from "../src/config";

const config: AuthConfig = {
  baseURL: "http://localhost:3001",
  googleClientId: "test-client",
  googleClientSecret: "test-secret",
  production: false,
  secret: "test-only-auth-secret-29d86050a8ba4e2fbb",
  trustedOrigins: ["http://localhost:5180", "http://localhost:5182"],
};
let database: Database;
let auth: AuthService;

beforeEach(async () => {
  database = new Database(":memory:");
  await (await getMigrations(createAuthOptions(database, config))).runMigrations();
  auth = createAuth(database, config);
});

afterEach(() => {
  database.close();
});

function request(path: string, options?: RequestInit): Promise<Response> {
  return createApp(auth).handle(new Request(config.baseURL + path, options));
}

function post(
  body: unknown,
  origin = config.trustedOrigins[0] ?? "http://localhost:5180",
): RequestInit {
  return {
    body: JSON.stringify(body),
    headers: { "content-type": "application/json", origin },
    method: "POST",
  };
}

async function sessionCookie(email: string): Promise<string> {
  const context = await auth.$context;
  const user = await context.internalAdapter.createUser(
    { email, emailVerified: true, name: "Test traveler" },
    { method: "oauth", oauth: { profile: {}, providerId: "google" } },
  );
  const session = await context.internalAdapter.createSession(user.id, false);

  if (!session) {
    throw new Error("Test session was not created.");
  }

  const cookieName = getCookies(auth.options).sessionToken.name;
  const signed = `${session.token}.${await makeSignature(session.token, config.secret)}`;

  return `${cookieName}=${encodeURIComponent(signed)}`;
}

test("anonymous and forged sessions cannot access account identity", async () => {
  expect((await request("/api/me")).status).toBe(401);
  expect(
    (await request("/api/me", { headers: { cookie: "uroute.session_token=forged" } })).status,
  ).toBe(401);
});

test("session identity comes from the signed cookie", async () => {
  const cookie = await sessionCookie("traveler@example.test");
  const response = await request("/api/me?userId=somebody-else", { headers: { cookie } });

  expect(response.status).toBe(200);
  expect(response.headers.get("cache-control")).toBe("no-store");
  expect(await response.json()).toMatchObject({
    user: { email: "traveler@example.test", name: "Test traveler" },
  });
});

test("sign-out revokes a session", async () => {
  const cookie = await sessionCookie("out@example.test");
  const options = post({});
  const response = await request("/api/auth/sign-out", {
    ...options,
    headers: { ...options.headers, cookie },
  });

  expect(response.status).toBe(200);
  expect(response.headers.get("set-cookie")).toContain("Max-Age=0");
  expect((await request("/api/me", { headers: { cookie } })).status).toBe(401);
});

test("foreign origins and external callbacks cannot initiate login", async () => {
  expect(
    (
      await request(
        "/api/auth/sign-in/social",
        post(
          { callbackURL: `${config.trustedOrigins[0]}/trips`, provider: "google" },
          "https://untrusted.example",
        ),
      )
    ).status,
  ).toBe(403);
  expect(
    (
      await request(
        "/api/auth/sign-in/social",
        post({ callbackURL: "https://untrusted.example/trips", provider: "google" }),
      )
    ).status,
  ).toBe(403);
});

test("Google initiation includes state and the local callback", async () => {
  const frontendOrigin = config.trustedOrigins[0] ?? "http://localhost:5180";
  const response = await createApp(auth).handle(
    new Request(
      `${frontendOrigin}/api/auth/sign-in/social`,
      post({
        callbackURL: `${frontendOrigin}/trips`,
        errorCallbackURL: `${frontendOrigin}/login?authError=1`,
        provider: "google",
      }),
    ),
  );
  const body: unknown = await response.json();

  if (!body || typeof body !== "object" || !("url" in body) || typeof body.url !== "string") {
    throw new Error("Missing authorization URL.");
  }

  const url = new URL(body.url);

  expect(response.status).toBe(200);
  expect(url.hostname).toBe("accounts.google.com");
  expect(url.searchParams.get("state")).toBeTruthy();
  expect(url.searchParams.get("redirect_uri")).toBe(`${frontendOrigin}/api/auth/callback/google`);
});

test.each(config.trustedOrigins)(
  "cancelled Google authorization returns to %s and allows retry",
  async (origin) => {
    const app = createApp(auth);
    const begin = (): Promise<Response> =>
      app.handle(
        new Request(
          `${origin}/api/auth/sign-in/social`,
          post(
            {
              callbackURL: `${origin}/trips`,
              errorCallbackURL: `${origin}/login?authError=1`,
              provider: "google",
            },
            origin,
          ),
        ),
      );
    const initiation = await begin();
    const body: unknown = await initiation.json();

    if (!body || typeof body !== "object" || !("url" in body) || typeof body.url !== "string") {
      throw new Error("Missing authorization URL.");
    }

    const state = new URL(body.url).searchParams.get("state");

    if (!state) {
      throw new Error("Missing OAuth state.");
    }

    const cookies = initiation.headers
      .getSetCookie()
      .map((cookie) => cookie.split(";")[0])
      .join("; ");
    const callback = new URL("/api/auth/callback/google", origin);

    callback.searchParams.set("error", "access_denied");
    callback.searchParams.set("state", state);

    const cancelled = await app.handle(
      new Request(callback.href, { headers: { cookie: cookies } }),
    );
    const location = cancelled.headers.get("location");

    if (!location) {
      throw new Error("Missing cancellation redirect.");
    }

    const destination = new URL(location);

    expect(cancelled.status).toBe(302);
    expect(destination.origin).toBe(origin);
    expect(destination.pathname).toBe("/login");
    expect(destination.searchParams.get("authError")).toBe("1");
    expect(database.query("SELECT count(*) AS count FROM auth_user").get()).toEqual({ count: 0 });
    expect(database.query("SELECT count(*) AS count FROM auth_session").get()).toEqual({
      count: 0,
    });

    const retry = await begin();
    const retryBody: unknown = await retry.json();

    if (
      !retryBody ||
      typeof retryBody !== "object" ||
      !("url" in retryBody) ||
      typeof retryBody.url !== "string"
    ) {
      throw new Error("Missing retry authorization URL.");
    }

    const retryState = new URL(retryBody.url).searchParams.get("state");

    expect(retry.status).toBe(200);
    expect(retryState).toBeTruthy();
    expect(retryState).not.toBe(state);
  },
);

test("production session cookies are secure, HTTP-only, and same-site", () => {
  const secure = createAuth(database, {
    ...config,
    baseURL: "https://api.example.com",
    production: true,
    trustedOrigins: ["https://app.example.com"],
  });
  const cookie = getCookies(secure.options).sessionToken;

  expect(cookie.attributes.httpOnly).toBe(true);
  expect(cookie.attributes.sameSite).toBe("lax");
  expect(cookie.attributes.secure).toBe(true);
});

test("unknown hosts and missing mutation origins are rejected", async () => {
  expect(
    (await createApp(auth).handle(new Request("https://untrusted.example/api/auth/get-session")))
      .status,
  ).toBe(403);
  expect((await request("/api/auth/sign-out", { method: "POST" })).status).toBe(403);
});
