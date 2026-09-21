# Authentication

Google is the only enabled sign-in method. Better Auth owns the OAuth flow,
account records, and cookie-backed sessions; Elysia exposes its HTTP endpoints.
Signing in identifies an account but does not by itself authorize access to every
trip. Data endpoints must still enforce resource ownership.

## Local setup

1. Create the isolated `uroute_dev` PostgreSQL database on the NAS and a
   dedicated non-superuser role such as `uroute_dev_app`. Do not reuse the
   older project's database or the future production database.
2. Copy `apps/api/.env.example` to `apps/api/.env`. Set the database URL,
   Google OAuth client values, and a random secret containing at least 32
   characters. Never place these values in frontend environment files.
3. In Google Cloud, configure the OAuth consent screen and create an OAuth
   client of type **Web application**.
4. Add `http://localhost:5180/api/auth/callback/google` as an authorized
   redirect URI. Add the equivalent URI for port 5182 only when testing the
   production preview, and add each production HTTPS origin separately.
5. Review the schema with `bun run --cwd apps/api db:plan`, then apply it with
   `bun run --cwd apps/api db:migrate`. Migrations never run at server startup.
6. Run `bun run dev:api` alongside `bun run dev`.

The auth tables are `auth_user`, `auth_session`, `auth_account`,
`auth_verification`, and `auth_rate_limit`.

## Environment isolation

Local development runs the API on this computer and connects to `uroute_dev`
on the NAS. Staging and production must use separate databases, non-superuser
roles, environment files, Better Auth secrets, Google OAuth clients and exact
callbacks. Development and staging must never connect to production data.

Apply and verify migrations against development first. Staging promotion and
production deployment are separate reviewed operations; neither is performed
by this authentication implementation.

## Security and proxy contract

The mobile Vite server forwards `/api` to loopback port 3001 while retaining the
original Host header. Production must expose the same same-origin `/api` route
over HTTPS. `TRUSTED_ORIGINS` contains exact origins only; wildcard hosts and
paths are rejected.

Sessions use HTTP-only, SameSite=Lax cookies and Secure cookies in production.
OAuth tokens in the database are encrypted with `BETTER_AUTH_SECRET`. Session
responses are marked `no-store`, and state-changing API requests require a
trusted Origin. Session tokens never belong in localStorage or URLs.

When deployed behind a reverse proxy, add only the proxy's exact peer addresses
to `TRUSTED_PROXY_IPS` and make the proxy overwrite `X-Real-IP`. Client-supplied
internal address headers are stripped before Better Auth applies rate limits.

## Verification

`bun run test:api` exercises configuration validation, trusted client address
handling, anonymous access, session identity, sign-out revocation, rejected
origins, and Google authorization URL construction without contacting Google.
A configured end-to-end run is still required to verify the real consent flow
and PostgreSQL connection.
