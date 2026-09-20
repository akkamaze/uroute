# uroute

Frontend workspace with separate mobile and web applications. Mobile is the primary application; web is reserved for future work.

## Structure

- `apps/mobile`: mobile Vite application
- `apps/web`: web Vite application
- Root configuration: shared TypeScript, ESLint, Prettier, and Bun workspace scripts

## Setup

```sh
bun install
```

## Commands

```sh
bun run dev          # mobile on http://localhost:5180
bun run dev:web      # web on http://localhost:5181
bun run build        # build both applications
bun run typecheck    # type-check both applications
bun run lint
bun run format
bun run format:check
```
