# uroute

Workspace with separate mobile, web, and API applications. Mobile is the primary application; web is reserved for future work.

## Structure

- `apps/mobile`: mobile Vite application
- `apps/web`: web Vite application
- `apps/api`: Bun and Elysia API
- Root configuration: shared TypeScript, ESLint, Prettier, and Bun workspace scripts

## Setup

```sh
bun install
```

## Commands

```sh
bun run dev          # mobile on http://localhost:5180
bun run dev:web      # web on http://localhost:5181
bun run dev:api      # API on http://localhost:3001
bun run build        # build both applications
bun run typecheck    # type-check both applications
bun run lint
bun run format
bun run format:check
bun run test:api
```

See [`docs/authentication.md`](docs/authentication.md) for Google OAuth,
PostgreSQL environment isolation, migrations, and local API configuration.
