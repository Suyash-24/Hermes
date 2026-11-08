# AGENTS.md

Discord music bot — **Hermes** in `package.json`/TOML, called **"Fade"** in identifiers and comments. Same bot. TypeScript port of a lost Rust codebase: comments cite Rust paths (`src/state.rs`, …) that no longer exist — don't look for them.

## Project direction (owned goals, not aspirations)

- Continuous quality push: best-in-class libraries, maximal polish, features other music bots don't have.
- Framework is **Seyfert** and its plugin ecosystem — prefer an official/first-party Seyfert plugin to a hand-rolled patch. Installed: `seyfert@5.0.0` (upstream latest is `5.2.1`; plugins live under the `@slipher/*` scope by Seyfert's maintainer, plus community ones like `yunaforseyfert`).
- **Every user-visible response is Components V2** via the card system (`FadeResponse` → `.toMessage()`). Old-style embeds are banned: no `new Embed`, no `embeds:` payloads, no messages without the `IsComponentsV2` flag. New surface area ships as a card in `src/cards/`.

## Layout & commands

- All app code is under `ts/`; the repo root only holds `.env`, `config/`, and git files. Run all npm commands from `ts/`.
- `npm run typecheck` is the **only** automated check (no lint, no test suite, no CI). Run it after every change.
- `npm run dev` = `tsx watch src/index.ts` (no build step). `npm run build` = `tsc` → `dist/`; `npm run start` runs that. Node ≥ 20, CommonJS output, decorators enabled.

## Config & runtime files

- Secrets live only in the root `.env` (`DISCORD_TOKEN` is the required one — the bot refuses to boot without it and never reads it from TOML).
- `config/default.toml` is the base; every field can be overridden by env vars (`BOT_NAME`, `BOT_PREFIX`, `LAVALINK_HOST/PORT/PASSWORD/HTTPS`, `LOG_LEVEL`, `SPOTIFY_*`, `PUTER_AUTH_TOKEN`, `LASTFM_API_KEY`). Path overrides: `CONFIG_PATH`, `DATABASE_PATH`.
- Gotcha: there are **two** `config/default.toml` files (repo root and `ts/config/`) and they already diverge (owner lists). Resolution in `src/config.ts` is cwd-first, so npm scripts (cwd `ts/`) load `ts/config/default.toml`. Edit the copy that actually runs.
- `.env`/config/TOML are found via a candidate list (cwd, cwd/.., dist-relative), so the root `.env` is picked up even when running from `ts/`.
- Persistent state is `database.json` at cwd. Snowflake IDs must stay **strings** (`quoteLongIntegers` in `src/db.ts` guards a 19-digit ID being silently rounded by `Number`); `0` means "never expires"; every mutation ends with `state.db.save()`.

## Architecture

- Boot (`src/index.ts`): `loadConfig` → `initAppState` → `new Client` → `initLavalink` → `client.start()` → `uploadCommands`. No DI: three module singletons — `appState()`, `useClient()`, `lavalink()` — are the shared state. Anything outside a command's `ctx` (Lavalink events, timers) must use those.
- Seyfert auto-discovers by location (`seyfert.config.js`: base `src`, output `dist`): default-exported `Command` classes with `@Declare` (+`@Options`) in `src/commands/`, `createEvent` handlers in `src/events/`, `ComponentCommand` in `src/components/buttons/`. Placing a file in the right folder *is* the registration.
- Slash command names must match Discord's lowercase regex — `24/7` is named `24-7` (file `twenty_four_seven.ts`).
- Prefix commands: `prefix` callback in `index.ts` (guild prefix from db → `^^` default → mention prefixes → empty prefix for noprefix users). Positional prefix args come from the `HandleCommand.prototype.argsParser` monkey-patch at the top of `index.ts`. Note: `index.ts` patches `seyfert/lib/commands/handle` internals and `src/music/manager.ts` patches `LavalinkNode.prototype.open` — both will break silently on Seyfert/lavalink-client version bumps; re-verify them first after any upgrade.
- Every user-visible reply is a **card**: `FadeResponse` from `src/components/v2.ts` (Components V2, `IsComponentsV2` flag, call `.toMessage()`) built from `errorCard`/`successCard`/`infoCard` in `src/cards/common.ts` or the variants in `src/cards/music.ts`. Don't hand-build raw embeds.
- Emojis/colors only via `E` and `Colour` from `src/components/emoji.ts`.
- Music (`src/music/`): `lavalink-client` has `autoSkip: true` — the library advances the queue, so a `trackEnd` handler must not pop-and-play. Volume is raw because `volumeDecrementer: 1`. The 5-minute idle leave lives in `src/music/events.ts` with the 24/7-guild exemption; do **not** set `onEmptyQueue.destroyAfterMs` (destroys players unconditionally).
- Voice guards (`src/music/guards.ts`): `requireUserVoice` before connecting, `requireSameVoice`/`requirePlayer` before touching an existing player. They handle the ephemeral error card.
- The connection is deliberately uncrashable: reconnect supervisor loop in `manager.ts`, `unhandledRejection`/`uncaughtException` handlers in `index.ts`. Don't add `process.exit()` on transient Lavalink/network errors.

## External services needed for a real run

- A Lavalink v4 node at the configured host (bot boots without it but can't play — playback code expects this).
- Optional: Spotify credentials (playlist expansion), `PUTER_AUTH_TOKEN` + `LASTFM_API_KEY` (autoplay similar-track lookups).
