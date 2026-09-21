import { isIP } from "node:net";

export interface AuthConfig {
  baseURL: string;
  googleClientId: string;
  googleClientSecret: string;
  production: boolean;
  secret: string;
  trustedOrigins: string[];
}

export interface AppConfig {
  auth: AuthConfig;
  databaseURL: string;
  hostname: string;
  port: number;
  trustedProxyIPs: string[];
}

function required(env: Record<string, string | undefined>, name: string): string {
  const value = env[name]?.trim();

  if (!value) {
    throw new Error(`${name} is required.`);
  }

  return value;
}

function parseOrigin(value: string, name: string, production: boolean): string {
  let url: URL;

  try {
    url = new URL(value);
  } catch {
    throw new Error(`${name} must be a valid origin.`);
  }

  const local = url.hostname === "localhost" || url.hostname === "127.0.0.1";
  const invalidProtocol =
    url.protocol !== "https:" && !(url.protocol === "http:" && local && !production);

  if (
    url.hostname.includes("*") ||
    url.username !== "" ||
    url.password !== "" ||
    url.search !== "" ||
    url.hash !== "" ||
    url.pathname !== "/" ||
    invalidProtocol
  ) {
    throw new Error(`${name} must be an HTTPS origin (local HTTP is allowed in development).`);
  }

  return url.origin;
}

export function readConfig(env: Record<string, string | undefined>): AppConfig {
  const production = env.NODE_ENV === "production";
  const secret = required(env, "BETTER_AUTH_SECRET");

  if (secret.length < 32) {
    throw new Error("BETTER_AUTH_SECRET must contain at least 32 characters.");
  }

  const port = Number(env.PORT ?? 3001);

  if (!Number.isInteger(port) || port < 1 || port > 65_535) {
    throw new Error("PORT must be between 1 and 65535.");
  }

  const databaseURL = required(env, "DATABASE_URL");
  let databaseProtocol: string;

  try {
    databaseProtocol = new URL(databaseURL).protocol;
  } catch {
    throw new Error("DATABASE_URL must be a PostgreSQL URL.");
  }

  if (!new Set(["postgres:", "postgresql:"]).has(databaseProtocol)) {
    throw new Error("DATABASE_URL must be a PostgreSQL URL.");
  }

  const trustedProxyIPs = (env.TRUSTED_PROXY_IPS ?? "")
    .split(",")
    .map((value) => value.trim())
    .filter(Boolean);

  if (trustedProxyIPs.some((value) => isIP(value) === 0)) {
    throw new Error("TRUSTED_PROXY_IPS must contain exact IP addresses.");
  }

  return {
    auth: {
      baseURL: parseOrigin(required(env, "BETTER_AUTH_URL"), "BETTER_AUTH_URL", production),
      googleClientId: required(env, "GOOGLE_CLIENT_ID"),
      googleClientSecret: required(env, "GOOGLE_CLIENT_SECRET"),
      production,
      secret,
      trustedOrigins: required(env, "TRUSTED_ORIGINS")
        .split(",")
        .map((value) => parseOrigin(value.trim(), "TRUSTED_ORIGINS", production)),
    },
    databaseURL,
    hostname: env.HOST ?? "127.0.0.1",
    port,
    trustedProxyIPs,
  };
}
