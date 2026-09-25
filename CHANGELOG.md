# Changelog

All notable changes to Puyo Live are recorded here.

The format follows [Keep a Changelog 1.1.0](https://keepachangelog.com/en/1.1.0/)
and the project uses [Semantic Versioning 2.0.0](https://semver.org/spec/v2.0.0.html).
What counts as major, minor and patch for a game, and how the product version
differs from `ENGINE_VERSION`, is defined in
[Versioning](website/src/content/docs/reference/versioning.md).

**Every pull request adds its entry under [Unreleased].** CI fails a pull
request that changes code without touching this file (see
[How documentation works](website/src/content/docs/start/documentation-system.md)).
Releasing moves the Unreleased entries under a new version heading and tags
it; the tag publishes that section as the GitHub release notes
([Release](website/src/content/docs/guides/release.md)).

Finding IDs such as `NET-06` refer to the
[findings register](website/src/content/docs/review/findings.md).

## [Unreleased]

## [0.3.0] - 2026-09-25

A new look, frame-exact controls, phone play, a community hub, and a
documentation system that keeps itself current. Rule behaviour is unchanged:
`ENGINE_VERSION` stays 1.0.0 and every characterization golden is identical,
so all existing replays still play.

**Documentation is now maintained with every change, by people and by AI
agents, and CI enforces it.** The handbook in `website/` is the manual. `AGENTS.md` makes updating the pages, this changelog and
the decision records part of every change's definition of done for Claude
Code, Gemini CLI, Codex and other agents, and the `Docs governance` check fails
a pull request that changes code without them
([ADR 0007](docs/adr/0007-documentation-system.md),
[How documentation works](website/src/content/docs/start/documentation-system.md)).
These release notes are this section, published unedited.

### Added

- **Original visual identity** (CLI-14): generated orbs with a symbol for each
  colour, a themed board, backdrop, next queue and stat panels, the Fredoka
  typeface, a new logo and icons, and three themes including high contrast
  ([Visual identity](website/src/content/docs/design/visual-identity.md)).
- **One board renderer**, `BoardView`, used by play, quick play, the opponent
  view and replays: landing squash, pop glow and burst, chain callouts, the
  rotation swing, a ghost of where the pair will land, garbage tray icons
  (small 1 to crown 720), a pulsing rim and death ring as the stack nears the
  top, and a lighter effects mode for slow devices.
- **Handling presets**: Relaxed (DAS 16, ARR 4, SDF 10), Standard (10, 2, 20;
  the new default) and Competitive (7, 0, 40). Players still on the old
  untouched defaults move to Standard (CLI-12).
- **Play on phones** (CLI-13): on-screen touch controls, a sharp canvas on
  high-density screens and a portrait layout.
- **Community hub** at `/community`: news, forums with categories, threads,
  replies, editing, pinning, locking and moderation, rankings and player pages,
  all linkable. Posts use a safe Markdown subset and are never rendered as
  HTML. New API routes under `/api/forums` and migration
  `20260925020000_add_forums`
  ([Community](website/src/content/docs/architecture/community.md)).
- **Results for every mode** (CLI-19): score, best chain, puyos cleared, time
  and personal bests per solo mode; Enter or R plays again.
- **Settings screen** with handling, audio and display tabs; a theme,
  colour-blind symbols and reduced motion.
- A notice when the device cannot keep up, which also lowers effects.
- **Animation lab**: 35 seeded scenarios that demonstrate all 54 animated
  actions and every state transition, checked by 95 tests, playable at
  `/?lab=<id>`, and recorders for the scenarios, every menu flow (desktop and
  phone) and a real two-player match
  ([Animation catalogue](website/src/content/docs/reference/animation-catalogue.md)).
- **Documentation site**: getting started, project tour, architecture, design,
  reference (rules, frame timing, replay format, wire protocol, REST API,
  configuration, animation catalogue, testing, CI/CD, versioning, glossary),
  six how-to guides, generated decision records and changelog, link
  validation on every build, and `/llms.txt` for AI tools.
- **2026 technical review**: a scorecard and a register of 103 findings with
  evidence, severity and roadmap item (42 fixed in this release), a Tsu rules
  comparison, the target architecture, a phased roadmap and a business plan.
- **Governance**: `AGENTS.md` (with `CLAUDE.md` and `GEMINI.md`),
  `CONTRIBUTING.md`, `SECURITY.md`, a pull request template, issue forms, an
  ADR template, `docs/doc-map.json` and `scripts/docs-check.ts` (21 tests).
- **CI**: the docs governance check on pull requests, a docs site build, the
  API suite against PostgreSQL with a schema drift check, a tag-driven
  release workflow, an opt-in docs deploy, and Dependabot.
- `GET /api/users/:id/avatar`, serving avatars with caching (API-02); migration
  `20260925010000_add_avatar_version`.
- Migration `20260925000000_add_moderation_tables` (API-01).
- `.editorconfig` and `.nvmrc`.

### Changed

- **Controls are frame-exact** (CLI-01, CLI-10, CLI-11): DAS and ARR count
  logical frames on every display, input is applied after every engine step,
  and a tap shorter than one frame still registers. One `HandlingController`
  serves every mode.
- **Faster loading** (CLI-02): the build is 18 MB instead of 91 MB. The menu
  music is a 3.6 MB AAC file instead of a 57 MB WAV, screens load on demand and
  are preloaded when idle, and fonts are bundled.
- **Sound** plays through Web Audio from decoded buffers, and music fades
  smoothly (CLI-07).
- **Lighter API responses**: player lists carry avatar URLs instead of inline
  images and responses are compressed; a page of players went from about
  3 MB to a few kilobytes (API-02).
- Rendering allocates nothing per frame (CLI-17), and all in-game text uses
  the game's typeface inside the board (CLI-16).
- The music player docks into the menu and is a small corner chip elsewhere
  (CLI-15); on phones Community is a menu item and the footer fits (CLI-18).
- Guests opening their profile see what an account gives and a way to sign in;
  the account menu says "Sign in" for guests (CLI-31).
- `README.md` is now the front door, and its reference material moved to the
  documentation site; code comments point at the pages.
- The game server image sets `NODE_ENV=production` (OPS-11), and CI tests the
  API against PostgreSQL 18, as production runs (OPS-13).

### Fixed

- **API-09**: after 60 sign-ins in 15 minutes, every further player failed to
  authenticate with the game server and could not play ranked, because all of
  the game server's checks came from one address and hit a per-address limit.
- **NET-14**: players never saw their XP, level and rating after a ranked
  match; the server now sends each player their result.
- **NET-13**: a player thinking about a move, or on a slow device, could be
  judged disconnected and the match aborted.
- **NET-15**: Puyo Mines never showed the board of the player you target.
- **NET-17**: any client could make the server broadcast the room list to every
  player, without limit.
- **NET-06**: moves made on the spawn frame were not recorded, so replays, the
  opponent's view and the server diverged.
- **NET-07**: a reconnecting player's index flipped mid-match.
- **API-01**: bans, audit logs and login logs never had database tables, and
  banned users could still log in.
- **CLI-22**: the opponent's garbage tray showed about 70 times the real
  amount.
- **CLI-21**: replays played every animation at half speed.
- **CLI-23**: the next pair spawned above the visible stage.
- **CLI-24**: a space could not be typed in any text field.
- **CLI-26**: settings changed with the keyboard or a controller were not saved.
- **CLI-27**: Enter at game over could restart the game behind the results.
- **CLI-30**: opening any screen for the first time hid the menu for a moment,
  and could leave the account menu stuck open behind the profile.
- **CLI-33**: the frame-rate notice covered the spawning piece.
- **CLI-25**: a soft drop factor of 0 disabled soft drop.
- **CLI-28**: four sound effects were silent.
- **CLI-29**: the footer always claimed "All systems operational" and version
  0.1.1, and the web manifest called the app "MyWebSite".
- **CLI-08**: the up arrow rotated whatever the key bindings said.
- **ENG-07**: a timed game ended without the state change other code listens
  for.
- **OPS-06**: the API tests had been failing unnoticed and never ran in CI.
- **OPS-07**: an unconfigured game server looked for the API on the wrong port.

### Removed

- The recycled puyo sprite sheets, stock background photographs and unused
  stylesheet (CLI-14, LEG-01).
- A hidden in-game settings panel for settings that do not exist, and the
  unused `lineClearDelay` setting (CLI-32).
- Listeners for socket events the server never sends.

## [0.2.0] - 2026-08-25

Engineering hardening. Retroactive entry covering commits `72c329b` through
`2dc077e`; the rationale for each change is in ADRs 0001 to 0006.

### Added

- CI verification pipeline (`verify.yml`) gating every deploy: type checks for
  all four projects, the engine suite, the client build and a Docker smoke test
  of the full stack.
- Engine characterization suite with snapshot goldens, replay fidelity,
  opponent-view and match-clock tests, and a parity suite comparing the client
  engine with the server simulator.
- Shared match clock: both players derive frame numbers from a server-announced
  start instant and an NTP-style offset (ADR 0003).
- The opponent's board is simulated locally from their relayed inputs instead
  of rate-limited snapshots (ADR 0004).

### Changed

- The engine advances exactly once per logical frame; frame constants restated
  to the speed the game actually shipped at (ADR 0001).
- The engine is fixed-step and takes no delta (ADR 0005), is pure (injected
  `EngineConfig`, audio through `onSound`), and is one package,
  `packages/engine`, shared by client and server (ADR 0006).
- Simulation constants separated from presentation constants.

### Fixed

- Replay determinism: held-key state is recorded as `HH`/`HU` edges, so the
  glide buffer replays correctly (ADR 0002).
- CORS for Vercel previews restricted to this project; production console
  gating keeps `warn` and `error`.

### Removed

- Dead code, tracked build artifacts and unused dependencies.

## [0.1.0] - 2026-04-21

First public version, built between 2026-04-16 and 2026-04-21 (commits up to
`34c202f`). Retroactive entry.

### Added

- Browser Puyo game on PixiJS and React: single player, time modes, settings,
  key and controller bindings, background music and sound effects.
- Real-time multiplayer over Socket.IO: ranked and unranked queues, private and
  public rooms, reconnection.
- Puyo Mines: a persistent free-for-all room with targeting modes and a bot.
- Seed-plus-input replays (format V3) with a replay viewer.
- REST API with accounts, JWT auth, Elo rating, XP and levels, leaderboard,
  match history, avatars and an admin panel.
- Docker Compose deployment with a Cloudflare Tunnel, Watchtower auto-deploy
  and scheduled database backups.

[Unreleased]: https://github.com/Loganocm/puyoliveservice/compare/v0.3.0...HEAD
[0.3.0]: https://github.com/Loganocm/puyoliveservice/compare/2dc077e...v0.3.0
[0.2.0]: https://github.com/Loganocm/puyoliveservice/compare/34c202f...2dc077e
[0.1.0]: https://github.com/Loganocm/puyoliveservice/tree/34c202f
