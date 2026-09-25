import { betterAuth, type BetterAuthOptions } from "better-auth";

import type { AuthConfig } from "../config";

// Better Auth derives its service API from this exact options object.
// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
export function createAuthOptions(
  database: NonNullable<BetterAuthOptions["database"]>,
  config: AuthConfig,
) {
  return {
    account: { encryptOAuthTokens: true, modelName: "auth_account" },
    advanced: {
      cookiePrefix: "uroute",
      disableCSRFCheck: false,
      disableOriginCheck: false,
      ipAddress: { ipAddressHeaders: ["x-uroute-client-ip"] },
      useSecureCookies: config.production,
    },
    appName: "uroute",
    baseURL: {
      allowedHosts: [config.baseURL, ...config.trustedOrigins].map(
        (origin) => new URL(origin).host,
      ),
      fallback: config.baseURL,
      protocol: config.production ? "https" : "auto",
    },
    // The upstream database union intentionally includes adapters with erased types.
    // eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
    database,
    emailAndPassword: { enabled: false },
    rateLimit: { enabled: true, modelName: "auth_rate_limit", storage: "database" },
    secret: config.secret,
    session: {
      cookieCache: { enabled: false },
      expiresIn: 60 * 60 * 24 * 7,
      modelName: "auth_session",
      updateAge: 60 * 60 * 24,
    },
    socialProviders: {
      google: {
        clientId: config.googleClientId,
        clientSecret: config.googleClientSecret,
        prompt: "select_account",
      },
    },
    trustedOrigins: [config.baseURL, ...config.trustedOrigins],
    user: { modelName: "auth_user" },
    verification: { modelName: "auth_verification" },
  } satisfies BetterAuthOptions;
}

// Keep the provider-specific API inferred from createAuthOptions.
// eslint-disable-next-line @typescript-eslint/explicit-function-return-type
export function createAuth(
  database: NonNullable<BetterAuthOptions["database"]>,
  config: AuthConfig,
) {
  return betterAuth(createAuthOptions(database, config));
}

export type AuthService = ReturnType<typeof createAuth>;
