# AGENTS.md

Instructions for AI coding agents (Claude Code, Gemini CLI, Codex, Cursor and
others) working in this repository. Humans: the same rules are in
[CONTRIBUTING.md](CONTRIBUTING.md). `CLAUDE.md` and `GEMINI.md` only import this
file, so change the rules here, once.

Puyo Live is a competitive falling-puyo puzzle game for the browser: a
deterministic simulation shared by client and server, real-time 1v1 matches
with replays, a free-for-all mode (Puyo Mines), a REST API with ratings and
community forums, and a documentation site. The documentation site is the
manual: start at `website/src/content/docs/start/project-tour.md`.

## Definition of done

A change is finished only when all of these are in the same commit or pull
request. CI enforces 1 to 5 (`npm run docs:check`); do them without being asked.

1. **Code and tests.** New behaviour has tests. A bug fix has a regression test
   that fails without the fix.
2. **Documentation.** Every page that describes the changed behaviour is updated.
   `docs/doc-map.json` says which pages cover which code.
3. **Changelog.** An entry under `## [Unreleased]` in `CHANGELOG.md`, in the right
   group (Added, Changed, Deprecated, Removed, Fixed, Security), written for
   someone who did not see the change. Cite a finding ID if it resolves one
   (`**NET-14**: ...`).
4. **Decision record.** A new ADR in `docs/adr/` if the change makes or reverses an
   architectural decision (`website/src/content/docs/guides/write-an-adr.md`).
5. **Engine version.** If engine behaviour changed (a characterization golden in
   `tests/engine/__snapshots__/` lost or changed lines), bump `ENGINE_VERSION` in
   `packages/engine/src/replay.ts` and add an ADR
   (`website/src/content/docs/guides/change-the-engine.md`).
6. **Findings and roadmap.** If the change resolves or discovers a problem,
   update `website/src/content/docs/review/findings.md` and the roadmap item.

If a rule truly does not apply, waive it in a commit message with a reason, on
its own line: `Docs-Impact: none - <reason>` or `Changelog: skip - <reason>`.
Never waive to save time.

## Commands

```sh
npm install                 # client, engine and game server (one workspace)
npm --prefix api install    # the REST API installs on its own
npm --prefix website install

npm run dev                 # client at http://localhost:5173
npm run server              # game server on :3000
npm run api                 # REST API on :8080 (needs PostgreSQL, see guides)

npm test                    # client, engine, server and tooling tests (Vitest)
npm run typecheck           # client + tests
npx tsc -p server --noEmit  # game server
npx tsc -p scripts          # tooling
npm --prefix api test       # API tests (needs a database: DATABASE_URL)
npm run build               # engine + client production build

npm run docs:check          # documentation contract, against origin/main
npm run docs:dev            # documentation site at http://localhost:4321
npm run docs:build          # build the site; fails on broken internal links
```

Run the tests and type checks for what you touched before saying you are done,
and say which you ran.

## Invariants: never break these

- **One engine step per logical frame, input after it.** The engine advances
  only in `GameScene.stepFrame` (or the lab's step), then input for that frame is
  applied. Nothing else calls `engine.update()`. (ADR 0001, ADR 0005)
- **The engine is pure.** `packages/engine` has no DOM, no Node APIs, no timers,
  no `Math.random` and no settings singletons. Handling arrives as `EngineConfig`,
  sound leaves through `onSound`. Its tsconfig has no DOM lib, so the compiler
  enforces this. (ADR 0006)
- **Every engine mutation is a recorded input.** Anything that moves, rotates,
  drops or changes held state goes through `HandlingController` and its `record`
  hook, so replays, the opponent's view and the server see it. An unrecorded
  mutation is a desync. (NET-06, ADR 0002)
- **Goldens change only on purpose.** Characterization snapshots change only with
  an `ENGINE_VERSION` bump and an ADR. Never update snapshots to make tests pass.
- **Timing is in logical frames.** DAS, ARR and every gameplay timer count 1/60 s
  frames, never rendered frames. (`website/src/content/docs/reference/frame-timing.md`)
- **Boards are drawn by `BoardView` only**, from a `BoardFrame`. Scenes position
  views and feed them frames. The render loop allocates nothing per frame: use
  `SpritePool`.
- **Colours come from `src/theme/tokens.ts`** (canvas) or the `--pl-*` CSS custom
  properties (menus). No new hard-coded hex colours in UI code.
- **The server decides results.** Clients are never trusted for scores, wins,
  garbage validation or ratings. Internal endpoints need `X-Internal-Key`.
- **User text is never HTML.** Forum posts go through `src/community/markdown.ts`
  and render as React elements. Do not use `dangerouslySetInnerHTML` on user content.
- **Typing is not playing.** Keys typed into text fields must not reach the game
  (`Input.isEditable`).

## Where common changes go

| Change | Touch |
|---|---|
| A game rule or timing | `packages/engine/src/`, tests in `tests/engine/`, `reference/rules.md` or `reference/frame-timing.md`, maybe `ENGINE_VERSION` |
| Handling (DAS, ARR, keys) | `src/input/Handling.ts`, `src/core/Input.ts`, `tests/input/`, `design/game-feel.md` |
| How the board looks or moves | `src/render/`, `src/core/PieceArt.ts`, `design/visual-identity.md`; check with the animation lab |
| A new animation or board situation | a scenario in `src/lab/scenarios.ts`; `tests/lab/catalogue.test.ts` checks it; `reference/animation-catalogue.md` |
| A socket event | `server/index.ts`, `src/core/NetworkManager.ts`, `reference/wire-protocol.md` |
| A REST endpoint | `api/src/routes/`, `api/src/services/`, tests in `api/src/tests/`, `reference/api.md` |
| A database change | `api/prisma/schema.prisma` plus a migration in `api/prisma/migrations/` (idempotent SQL, checked with `prisma migrate diff`) |
| A setting | `src/core/SettingsManager.ts`, `src/screens/SettingsScreen.tsx`, `design/game-feel.md` |
| An environment variable | where it is read, and `reference/configuration.md` |
| CI | `.github/workflows/`, `reference/ci-cd.md` |

Page paths above are under `website/src/content/docs/`.

## Writing documentation

- One home per fact: link instead of repeating.
- Pages have `title` and `description` frontmatter. Link with absolute site paths
  (`/reference/rules/`). In `docs/adr/` and `CHANGELOG.md` link to the page file
  (`website/src/content/docs/reference/rules.md`).
- Say what the code does, including what is wrong with it. Timings are in frames
  at 60 fps with wall time in brackets.
- Do not use line numbers except in the findings register.

## Working here

- Read the relevant pages before changing an area; they record why it is the way
  it is. The review (`website/src/content/docs/review/`) lists known problems.
- Keep changes focused. If you find an unrelated problem, record it in the
  findings register rather than fixing it silently in passing.
- Do not commit `artifacts/`, `dist/`, `.env` files or generated site content.
- Visual changes: record the affected catalogue scenarios before and after
  (`node tests/lab/record-catalogue.mjs --only <ids> --label <name>`) and look at them.
