---
title: Findings register
description: Every finding from the 2026 review, with severity, status, file-and-line evidence, impact, recommendation and roadmap item. The canonical list other pages cite by ID.
sidebar:
  order: 1
tableOfContents:
  maxHeadingLevel: 2
---

This register is the canonical list. Other pages cite findings by ID
(`NET-01`) instead of restating them. **Evidence line numbers refer to the review
baseline, commit `2dc077e`**; later commits move lines, but the ID and the
description stay stable.

**Keeping it current is part of the [definition of
done](/start/documentation-system/#definition-of-done).** When a change resolves
a finding, set its status to *Fixed* and name the version or change, and add a
`CHANGELOG.md` entry that cites the ID. When you discover a new problem, add it
with the next free number in its area. Never renumber or delete an entry.

## Legend

| Severity | Meaning |
|---|---|
| <span class="sev s1">S1</span> Critical | Ranked integrity, security or legal exposure right now |
| <span class="sev s2">S2</span> High | Wrong behaviour players will hit, or a blocker for the roadmap |
| <span class="sev s3">S3</span> Medium | A deviation, a debt or a risk with a workaround |
| <span class="sev s4">S4</span> Low | Hygiene |

| Status | Meaning |
|---|---|
| **Open** | Not yet addressed |
| **Decision** | Needs an owner decision before it can be fixed (usually a ruleset or policy choice) |
| **Fixed** | Resolved; the entry names where |

Roadmap items (`P1.3`) are defined on the [roadmap](/roadmap/).

## Summary

| ID | Sev | Status | Finding | Roadmap |
|---|---|---|---|---|
| RUL-01 | S2 | Decision | Chain power doubles after link 5 instead of +32 | P1.2 |
| RUL-02 | S3 | Decision | Colour and group bonuses and the multiplier cap differ from Tsu | P1.2 |
| RUL-03 | S2 | Decision | Chain step duration grows exponentially | P1.2 |
| RUL-04 | S2 | Open | Receiving garbage changes a player's future pieces | P1.1 |
| RUL-05 | S2 | Open | A piece can be kept from locking indefinitely | P1.1 |
| RUL-06 | S3 | Decision | Top-out rule and free movement above the board differ from Tsu | P1.2 |
| RUL-07 | S3 | Decision | Hidden-row puyos pop and trigger chains | P1.2 |
| RUL-08 | S3 | Open | No quick turn; non-standard diagonal kicks | P1.2 |
| RUL-09 | S3 | Open | No all-clear bonus | P1.2 |
| RUL-10 | S3 | Open | Margin time, garbage multiplier and best-of settings do nothing | P1.2 |
| RUL-11 | S3 | Decision | At most 24 garbage per drop (Tsu: 30) | P1.2 |
| RUL-12 | S3 | Decision | Piece generator differs from Tsu (5 colours, deck of pairs) | P1.2 |
| RUL-13 | S3 | Decision | Garbage from a chain still in progress can land before it ends | P1.2 |
| RUL-14 | S4 | Decision | Placement score does not feed garbage | P1.2 |
| ENG-01 | S2 | Open | No snapshot/restore; engine state is mutated from outside | P1.1 |
| ENG-02 | S3 | Open | State hash is partial and every 5 seconds | P1.1 |
| ENG-03 | S3 | Open | Rules are literals in code, not a ruleset | P1.1 |
| ENG-04 | S4 | Open | PRNG state kept as an unbounded float | P1.1 |
| ENG-05 | S4 | Open | Dead code and comments that contradict behaviour | P0.3 |
| ENG-06 | S4 | Open | A normal top-out is logged as a warning | P1.1 |
| ENG-07 | S4 | Fixed | Timed mode ends the game by writing engine state directly | P1.1 |
| NET-01 | S1 | Open | Garbage is decided by the client | P1.4 |
| NET-02 | S1 | Open | Top-out is decided by the client | P1.4 |
| NET-03 | S2 | Decision | Going AFK aborts a ranked match with no result | P1.5 |
| NET-04 | S2 | Open | Server simulation is not frame-aligned | P1.3 |
| NET-05 | S2 | Open | Garbage timing is set by packet arrival | P1.3 |
| NET-06 | S2 | Fixed | Spawn-frame moves were not recorded | P0.2 |
| NET-07 | S2 | Fixed | Reconnecting flipped a player's index | P0.2 |
| NET-08 | S3 | Open | Seeds are timestamps; the whole sequence is visible to clients | P1.4 |
| NET-09 | S3 | Open | Matchmaking pairs in arrival order | P3.1 |
| NET-10 | S3 | Open | One process holds every match; a deploy drops them all | P2.6 |
| NET-11 | S3 | Open | Snapshot reconcile hides desyncs instead of reporting them | P1.3 |
| NET-12 | S3 | Open | No engine-version handshake between clients and server | P1.1 |
| NET-13 | S3 | Fixed | The server's heartbeat measures board changes, not liveness | P1.5 |
| NET-14 | S2 | Fixed | Players never received their match result | P0.2 |
| NET-15 | S3 | Fixed | Puyo Mines never sent the target's board | P0.2 |
| NET-16 | S3 | Open | A replay whose settings never arrived plays with the wrong soft drop | P1.1 |
| NET-17 | S3 | Fixed | Any client could make the server broadcast the room list to everyone | P2.4 |
| NET-18 | S4 | Open | Two Puyo Mines events have no rate limit | P2.4 |
| CLI-01 | S2 | Fixed | DAS and ARR depend on monitor refresh rate | P1.6 |
| CLI-02 | S2 | Fixed | 91 MB client; a 57 MB WAV streams on the menu | P2.2 |
| CLI-03 | S3 | Open | 2,000-line scene classes mix every concern | P3.5 |
| CLI-04 | S3 | Open | No accessibility support | P2.3 |
| CLI-05 | S3 | Open | No localization | P3.5 |
| CLI-06 | S3 | Open | Session token in `localStorage` | P2.4 |
| CLI-07 | S3 | Fixed | Sound effects use `HTMLAudioElement` | P2.2 |
| CLI-08 | S4 | Fixed | ArrowUp rotates regardless of key bindings | P1.6 |
| CLI-09 | S4 | Open | No Content Security Policy; no offline shell | P2.4 |
| CLI-10 | S3 | Fixed | Input is applied once per rendered frame, after catch-up | P1.6 |
| CLI-11 | S2 | Fixed | Key taps shorter than one frame are dropped | P1.6 |
| CLI-12 | S2 | Fixed | Default handling is very slow (DAS 25, ARR 15) | P1.6 |
| CLI-13 | S2 | Fixed | Unplayable on phones: no touch controls, blurry canvas | P2.3 |
| CLI-14 | S2 | Fixed | No visual identity: recycled sprites and unrelated stock photos | P2.1 |
| CLI-15 | S3 | Fixed | Floating music player covers menus and, mid-match, the player's own board | P2.3 |
| CLI-16 | S3 | Fixed | In-game text overlaps the HUD and renders in a fallback serif font | P2.1 |
| CLI-17 | S3 | Fixed | Every puyo sprite is created and destroyed every frame | P2.2 |
| CLI-18 | S3 | Fixed | Phone menu: side tab overlaps buttons, footer wraps and clips | P2.3 |
| CLI-19 | S4 | Fixed | Single-player top-out says "YOU LOST" and shows no results | P2.1 |
| CLI-20 | S4 | Open | A slow device is told it is "RECONNECTING…" | P2.3 |
| CLI-21 | S3 | Fixed | The replay viewer played animations at half speed | P0.2 |
| CLI-22 | S3 | Fixed | The opponent's garbage tray showed about 70 times the real amount | P0.2 |
| CLI-23 | S3 | Fixed | The new pair spawned above the visible stage | P2.1 |
| CLI-24 | S3 | Fixed | Typing a space in a text field was blocked by game input | P2.3 |
| CLI-25 | S4 | Fixed | A soft drop factor of 0 disabled soft drop | P1.6 |
| CLI-26 | S3 | Fixed | Settings changed with the keyboard were never saved | P2.3 |
| CLI-27 | S4 | Fixed | Enter at game over restarted the game under the results screen | P2.3 |
| CLI-28 | S4 | Fixed | Four sound effects were silent | P2.2 |
| CLI-29 | S4 | Fixed | Fake "All systems operational" status, stale version and a "MyWebSite" manifest | P2.1 |
| CLI-30 | S3 | Fixed | Opening any screen for the first time hid the menu and could freeze the account menu open | P2.3 |
| CLI-31 | S4 | Fixed | A guest's profile showed "Authentication required" | P2.3 |
| CLI-32 | S4 | Fixed | A hidden in-game settings panel edited settings that do not exist | P0.3 |
| CLI-33 | S4 | Fixed | The frame-rate notice covered the spawning piece | P2.3 |
| API-01 | S2 | Fixed | Moderation tables never migrated; bans did not work | P0.2 |
| API-02 | S2 | Fixed | Player lists ship megabytes of base64 avatars, uncompressed | P2.2 |
| API-03 | S3 | Open | Elo with fixed K and an inflationary floor; rank by COUNT | P3.1 |
| API-04 | S4 | Open | Login timing reveals which usernames exist | P2.4 |
| API-05 | S3 | Open | Seven-day tokens with no revocation; HS256 still accepted | P2.4 |
| API-06 | S3 | Open | No schema validation; typed access bypassed with `any` | P2.4 |
| API-07 | S3 | Open | Anyone can lock any account by failing its login | P2.4 |
| API-08 | S3 | Open | Rate limits and lockouts live in process memory | P4.1 |
| API-09 | S2 | Fixed | The game server's calls shared one address's rate limits | P2.4 |
| API-10 | S3 | Open | 20 known-vulnerable API dependencies, 17 in the client workspace | P2.7 |
| OPS-01 | S2 | Open | `:latest` auto-deploys with no staging or rollback | P2.6 |
| OPS-02 | S2 | Open | No metrics, tracing, error tracking or alerting | P2.6 |
| OPS-03 | S3 | Open | Backups every 10 days on the same host, never restore-tested | P0.5 |
| OPS-04 | S3 | Open | Root Dockerfile is stale and unused | P0.5 |
| OPS-05 | S3 | Open | Dependencies a major version behind | P2.7 |
| OPS-06 | S3 | Fixed | API tests did not run in CI and had rotted | P0.2 |
| OPS-07 | S3 | Fixed | Game server defaulted to the wrong API port | P0.2 |
| OPS-08 | S4 | Open | CORS allowlists duplicated; Socket.IO ignores `CORS_ORIGIN` | P2.4 |
| OPS-09 | S3 | Open | No supply-chain hardening | P2.6 |
| OPS-10 | S4 | Open | 88 MB of binaries in git without LFS | P0.5 |
| OPS-11 | S3 | Fixed | The game server image ran without `NODE_ENV=production` | P2.6 |
| OPS-12 | S4 | Open | `DB_*` settings are read but unused | P0.3 |
| OPS-13 | S4 | Fixed | CI tested against PostgreSQL 16; production runs 18 | P0.2 |
| QA-01 | S2 | Open | No end-to-end, client or socket-layer tests | P2.5 |
| QA-02 | S3 | Open | No lint or format standard | P0.3 |
| QA-03 | S3 | Open | No state-coverage or property-based engine tests | P2.5 |
| QA-04 | S3 | Open | No performance budgets in CI | P2.5 |
| LEG-01 | S1 | Decision | Trademarked name; artwork of unverified provenance | P0.4 |
| LEG-02 | S2 | Open | No LICENSE file; asset licences unrecorded | P0.4 |
| LEG-03 | S3 | Open | IP logs without enforced retention; no self-service deletion | P2.4 |
| DOC-01 | S3 | Fixed | Documentation was not enforced; no changelog or release notes | P0.1 |

## Rules fidelity (RUL)

Compared with Puyo Puyo Tsu, the rule set competitive Puyo has standardised on.
The reasoning, the reference values and their sources are on
[Rules fidelity](/review/rules-fidelity/). Entries marked *Decision* may be
intentional design; they need an explicit ruleset choice, not a silent fix.

### RUL-01 Chain power doubles after link 5

<span class="sev s2">S2</span> **Decision** · `packages/engine/src/GameEngine.ts:1042`

The table is `0, 8, 16, 32, 64, 128, 256 … 65536`. Tsu's is `0, 8, 16, 32, 64,
96, 128 … 512`: it rises by 32 per link after the fifth and stops at 512. They
agree to link 5 and diverge fast after it. A 7-chain of single groups sends 288
garbage here against 197 in Tsu; a 10-chain sends 2,336 against 526, 4.4 times
as much. Mid-size chains become disproportionately lethal. The source comment
records this as a deliberate request for "exponentially more", so this is a
ruleset decision.

### RUL-02 Colour bonus, group bonus and multiplier cap differ

<span class="sev s3">S3</span> **Decision** · `GameEngine.ts:985`, `:991`, `:1048`

Colour bonus is `(colours − 1) × 3`: 0, 3, 6, 9, 12. Tsu: 0, 3, 6, 12, 24.
Group bonus is `size − 3` for groups over 4, so 11+ gives 8+; Tsu gives 10 for
every group of 11 or more. The multiplier is floored at 1 but never capped; Tsu
caps it at 999.

### RUL-03 Chain step duration grows exponentially

<span class="sev s2">S2</span> **Decision** · `GameEngine.ts:1053–1063`

`getChainScaledDuration` multiplies pop and fall delays by
`1 + 0.3 × 1.3^(n−1)` for link *n* (and ×2 for the first). The 10th link's pop
takes 37 frames; the 19th takes 312 frames, 5.2 seconds. In Tsu the vanish
animation is a constant 50 frames. Chain duration is a core competitive
variable, because it is the defender's window to respond, so an exponential
curve changes strategy, not just presentation.

### RUL-04 Receiving garbage changes a player's future pieces

<span class="sev s2">S2</span> **Open** · `GameEngine.ts:216`, `:316`, `:808`

Piece bags and garbage column shuffles draw from the same PRNG. Each garbage
drop consumes random numbers, so the next bag is shuffled from a different
state. **Verified:** two engines on seed 12345 playing identically, one of which
receives one garbage drop, deal identical pieces up to piece 106 and different
pieces from piece 107 on. In Puyo both players always see the same sequence.
Here, being attacked changes what you are dealt. Fix: separate streams for
pieces and garbage ([engine v2](/architecture/engine-v2/)).

### RUL-05 A piece can be kept from locking indefinitely

<span class="sev s2">S2</span> **Open** · `GameEngine.ts:399`, `:449`, `:468`, `:617–622`

Every successful move or rotation resets the lock timer with no limit, and
while a horizontal key is held the timer does not advance at all (the "glide
buffer"). Holding a direction against a wall keeps a grounded piece alive
forever. Garbage only falls after a piece locks, so a losing player can stall
the match indefinitely. Tsu's arcade version had an infinite-rotation stall
that later versions treated as a bug and fixed. Fix: a lock-reset budget (the
Tetris Guideline uses 15) and a bounded glide buffer.

### RUL-06 Top-out rule and free movement above the board

<span class="sev s3">S3</span> **Decision** · `GameEngine.ts:494–499`, `:1098`

The game ends only when the topmost hidden cell of column 3 is filled at spawn.
Tsu ends the game when the top *visible* cell of column 3 (the X) is filled.
Pieces may also move and rotate freely above the board. Both are documented as
deliberate TETR.IO-style choices; together they give about two extra rows of
survival.

### RUL-07 Hidden-row puyos pop and trigger chains

<span class="sev s3">S3</span> **Decision** · `packages/engine/src/Board.ts:68`

`findMatches` starts its scan at row index 1 (Tsu's 13th row) and flood fill
reaches row index 0 (the 14th). In Tsu, 13th-row puyos exist but never pop, and
puyos placed in the 14th row are removed.

### RUL-08 No quick turn; non-standard diagonal kicks

<span class="sev s3">S3</span> **Open** · `GameEngine.ts:455–477`

Quick turn (a 180° flip when the pair is wedged in a one-column well, pressing
rotate twice) has been standard since Tsu; the source comment calling it "not
standard Puyo" is wrong. The diagonal kicks tried here are not part of Tsu's
rotation system.

### RUL-09 No all-clear bonus

<span class="sev s3">S3</span> **Open** · `GameEngine.ts:940–942`

Clearing the board fires `onAllClear`, which only shows text. In Tsu the next
chain sends 30 extra garbage (2,100 points at target point 70).

### RUL-10 Margin time, garbage multiplier and best-of do nothing

<span class="sev s3">S3</span> **Open** · `server/GameRoom.ts` (`RoomSettings`), `packages/engine/src/replay.ts:62`

Hosts can set `marginTime`, `garbageMultiplier` and `bestOf`, the server
validates and stores them, and replays record them, but the engine never reads
the first two and no code implements series. A setting that silently does
nothing is worse than no setting.

### RUL-11 At most 24 garbage per drop

<span class="sev s3">S3</span> **Decision** · `GameEngine.ts:791`

Tsu drops at most 30 (five rows) at once.

### RUL-12 Piece generator differs from Tsu

<span class="sev s3">S3</span> **Decision** · `GameEngine.ts:231–324`

Five colours (Tsu versus uses four, which is what makes 10+ chains buildable),
a 100-pair deck of ordered pairs, and a start bag of 6 pairs drawn from 20
shuffled puyo. Tsu shuffles a 256-puyo, 4-colour pool into 128 pairs and limits
the first three pairs to three colours.

### RUL-13 Garbage from a chain in progress can land before the chain ends

<span class="sev s3">S3</span> **Decision** · `GameEngine.ts:1024–1029`, `src/scenes/GameScene.ts:563–571`

Garbage is sent per link and becomes droppable at the receiver's next
placement, even while the attacker's chain is still resolving. In Tsu, garbage
from a chain in progress waits until that chain finishes, which is the window a
defender uses to prepare a counter. *To be confirmed against Tsu frame data
during engine v2.*

### RUL-14 Placement score does not feed garbage

<span class="sev s4">S4</span> **Decision** · `GameEngine.ts:430`, `:682`

Each lock adds 10 points plus a height bonus, and hard drop adds rows dropped;
none of this contributes to garbage. In Tsu, soft-drop points count toward
nuisance. Minor, but it makes score and attack diverge.

## Engine (ENG)

### ENG-01 No snapshot/restore; engine state is mutated from outside

<span class="sev s2">S2</span> **Open** · `GameEngine.ts` (public fields), `src/core/OpponentView.ts` (`reconcile`)

Engine state is spread across ~30 mutable public fields, and consumers write to
them (the opponent view overwrites the grid; the scene reads and writes
timers). There is no way to copy the complete state and restore it. That blocks
rollback netcode, server-side verification, bots that search ahead, and fuzzing.

### ENG-02 State hash is partial and every 5 seconds

<span class="sev s3">S3</span> **Open** · `GameEngine.ts:1122–1138`

The FNV-1a hash covers the grid, score, garbage queue and tray, but not the
active piece, the next queue, the PRNG state, the state machine or its timers,
and it is taken every 300 frames. A divergence is detected only once it reaches
the grid, up to five seconds late.

### ENG-03 Rules are literals in code, not a ruleset

<span class="sev s3">S3</span> **Open** · `GameEngine.ts` throughout

Chain power, bonuses, target point, garbage cap, timings, colour count and
death cell are hard-coded. Offering a Tsu ranked mode next to the current rules,
or honouring room settings, requires a ruleset object passed to the engine and
recorded in the replay.

### ENG-04 PRNG state kept as an unbounded float

<span class="sev s4">S4</span> **Open** · `GameEngine.ts:216`

`this.seed += 0x6D2B79F5` grows without wrapping. Results depend only on the
value modulo 2³², so output is correct while the float stays below 2⁵³, but the
invariant is accidental. Normalising with `>>> 0` preserves every existing
sequence.

### ENG-05 Dead code and comments that contradict behaviour

<span class="sev s4">S4</span> **Open** · `GameEngine.ts:224–228`, `:646–718`; `Board.ts` (`handleBigPuyo`)

A no-op `recordAction`, a placeholder `handleBigPuyo`, a commented-out
three-colour start bag, and a 70-line comment block in `lockPiece` that
describes death rules the code does not implement.

### ENG-07 Timed mode ends the game by writing engine state directly

<span class="sev s4">S4</span> **Fixed in 0.3.0** · `src/scenes/GameScene.ts` (timer, `this.engine.state = GameState.GAMEOVER`)

The timer sets the state field instead of calling `changeState`, so no state
hook fires: nothing observing the engine (recorder, replay, opponent) learns
the game ended. Found by the animation lab, which had to special-case it.

**Fixed:** `GameScene` now ends a timed game with `changeState(GAMEOVER)`, so every observer sees it. Two other endings still write the field (an opponent leaving, a server abort) because `changeState` would report a loss; they belong to ENG-01.

### ENG-06 A normal top-out is logged as a warning

<span class="sev s4">S4</span> **Open** · `GameEngine.ts:691–696`

Locking partly above the board is a normal way to lose, but it goes through an
"Attempted to lock out of bounds?" `console.warn`. The engine suite prints it
115 times per run, which trains everyone to ignore warnings.

## Netcode and competitive integrity (NET)

Background and the recommended design are on [Netcode and
integrity](/review/netcode-and-integrity/) and [target
netcode](/architecture/netcode/).

### NET-01 Garbage is decided by the client

<span class="sev s1">S1</span> **Open** · `server/index.ts:911–931`, `:232–239`, `:1344–1361`

`send_garbage` relays any integer amount from 1 to 100 per packet, rate-limited
to 30 packets a second, so a modified client can send 3,000 garbage per second.
The server's own simulation computes the correct garbage, but relaying it is
disabled. Puyo Mines has the same trust (`mines_send_garbage`).

### NET-02 Top-out is decided by the client

<span class="sev s1">S1</span> **Open** · `server/index.ts:1078–1086`, `:262–270`, `:1372`

A match ends when the loser sends `player_lost`. Server-side death detection is
disabled. A modified client that never sends it cannot lose; the heartbeat
only proves the client is connected, not that it is alive in the game.

### NET-03 Going AFK aborts a ranked match with no result

<span class="sev s2">S2</span> **Decision** · `server/index.ts:1553–1597`, `:1479–1499`

Seven seconds without a board-state packet aborts the match without recording
anything, while a disconnect records a loss. A player who is about to lose can
background the tab and avoid the rating loss. Policy needed: a reconnect
window, then forfeit.

### NET-04 Server simulation is not frame-aligned

<span class="sev s2">S2</span> **Open** · `server/index.ts:248–272`, `:888–893`

The server steps each simulation from `setInterval(…, 16)`, about 62.5 Hz and
drifting, and applies each input when it arrives rather than at the frame it
is stamped with. Its simulation therefore describes a different timeline from
the clients'. This, rather than network latency as such, is why its results
disagreed with the clients' and enforcement was switched off.

### NET-05 Garbage timing is set by packet arrival

<span class="sev s2">S2</span> **Open** · `src/scenes/GameScene.ts:246–256`

The receiver stamps incoming garbage (`G`) with its own frame when the packet
happens to arrive. Nothing in the protocol ties it to the sender's chain frame,
so no two machines agree on when garbage entered the tray, and the server cannot
verify it. Fix: garbage lands at `sender frame + fixed delay`, a deterministic
function of the match.

### NET-06 Spawn-frame moves were not recorded

<span class="sev s2">S2</span> **Fixed in 0.3.0** · `GameScene.ts:923–943`

When DAS was charged as a new piece spawned, the scene moved the piece without
recording the input. Replays, the opponent's view and the server simulation all
missed the move and diverged; the opponent view's snapshot reconcile papered
over it.

### NET-07 Reconnecting flipped a player's index

<span class="sev s2">S2</span> **Fixed in 0.3.0** · `server/GameRoom.ts:194–207`, `:285–288`

Player index comes from `Map` insertion order, and reconnect deleted and
re-inserted the player, moving them to the end. Player 0 became player 1
mid-match: inputs recorded under the wrong index, host swapped, stats
misattributed. The simulator and recorded settings also stayed under the dead
socket id. Regression tests: `tests/server/gameRoom.test.ts`.

### NET-08 Seeds are timestamps; the whole sequence is visible to clients

<span class="sev s3">S3</span> **Open** · `server/GameRoom.ts:222`

The seed is `Date.now()`, so it is guessable and two rooms starting in the same
millisecond share it. The seed is sent to both clients at start, so a modified
client can compute every future piece. Seeing the whole sequence is an accepted
trade-off in client-predicted games (TETR.IO makes the same one); the seed
should still come from a CSPRNG.

### NET-09 Matchmaking pairs in arrival order

<span class="sev s3">S3</span> **Open** · `server/index.ts:482–484`, `:1144–1146`

The first two players in a queue are paired regardless of rating or region, and
the pairing code is duplicated between `join_queue` and `requeue`.

### NET-10 One process holds every match; a deploy drops them all

<span class="sev s3">S3</span> **Open** · `server/RoomManager.ts`, `docker-compose.yml`

Rooms, queues and sessions live in one process's memory with no shared store.
The server cannot scale horizontally, and Watchtower's hot swap kills every
live match without draining.

### NET-11 Snapshot reconcile hides desyncs instead of reporting them

<span class="sev s3">S3</span> **Open** · `src/core/OpponentView.ts`

Board snapshots at 2 Hz overwrite the simulated opponent grid when they
disagree. That hid NET-06 for months. A disagreement is a bug to report
(telemetry), not a state to silently correct.

### NET-12 No engine-version handshake

<span class="sev s3">S3</span> **Open** · `server/index.ts` (`join_queue`, `game_start`)

The client (Vercel) and the game server (Watchtower) deploy independently. A
player with a tab open across a release runs an older engine than their
opponent, and the opponent view simulates them with the wrong rules. Clients
should send `ENGINE_VERSION` and the server should refuse mismatches with a
"refresh to update" message.

### NET-13 The server's heartbeat measures board changes, not liveness

<span class="sev s3">S3</span> **Fixed in 0.3.0** · `server/index.ts` (heartbeat), `GameScene` (`onBoardChange` throttle)

The heartbeat aborts a match when no `send_board_state` arrives for 7 seconds,
but clients only send it when their board changes. A connected player whose
first piece is still falling, or who is thinking, sends nothing. At full speed
the first piece lands after about 7.5 seconds, just inside the grace period; on
a slow device it does not, and the recorded multiplayer session was aborted
every time until a dev-only override was added. Liveness needs its own
periodic ping.

**Fixed:** Inputs (`record_input`) now count as signs of life, and the client sends a board snapshot at least every 2 seconds while its game loop runs (`GameRoom.markAlive`, `findStalledPlayer`, tested in `tests/server/liveness.test.ts`).

### NET-14 Players never received their match result

<span class="sev s2">S2</span> **Fixed in 0.3.0** · `server/index.ts` (`handleMatchEnd`), `api/src/routes/matches.routes.ts`

The client listens for `match_result` to show XP, level and rating changes,
but the server never sent it, and the API's response did not include each
player's progress to send. Ranked players finished every match without seeing
what they earned.

**Fixed:** the API returns `player1_stats` and `player2_stats`, and the server
sends each player their own result (`server/matchResult.ts`, tested).

### NET-15 Puyo Mines never sent the target's board

<span class="sev s3">S3</span> **Fixed in 0.3.0** · `server/index.ts` (`onStateSync`)

The client draws the board of the player it is targeting from
`mines_target_board`, which the server never emitted, so the target panel was
always empty.

**Fixed:** `server/minesTarget.ts` picks the target's board and the state sync
sends it (tested).

### NET-16 A replay whose settings never arrived plays with the wrong soft drop

<span class="sev s3">S3</span> **Open** · `server/GameRoom.ts` (`buildReplayFile`)

If a player's `record_settings` never reaches the server, the replay records
SDF 10 and soft drop protection on, the defaults of an older client. Current
clients default to SDF 20, so such a replay diverges from the first soft drop.
Settings should be part of joining a match, not a separate message.

### NET-17 Any client could make the server broadcast the room list to everyone

<span class="sev s3">S3</span> **Fixed in 0.3.0** · `server/index.ts` (`get_rooms`)

`get_rooms` had no rate limit and answered by broadcasting the room list to
**every** connected socket, so one client could make the server flood all
players.

**Fixed:** it answers the sender only, at most five times a second. Room
changes are still broadcast.

### NET-18 Two Puyo Mines events have no rate limit

<span class="sev s4">S4</span> **Open** · `server/index.ts` (`mines_record_input`, `mines_player_lost`)

Both are validated but not rate-limited, unlike every other gameplay event.

## Client (CLI)

Context and recommendations: [Client review](/review/client/).

### CLI-01 DAS and ARR depend on monitor refresh rate

<span class="sev s2">S2</span> **Fixed in 0.3.0** · `src/scenes/GameScene.ts:1141`

DAS and ARR count calls to `handleInput`, which runs once per *rendered* frame.
On a 144 Hz monitor, DAS 10 lasts 69 ms; on 60 Hz it lasts 167 ms. Two players
with identical settings get different handling, which is unfair in a
competitive game.

**Fixed:** `HandlingController` (`src/input/Handling.ts`) counts DAS and ARR in logical frames and is called once per engine step, in every mode that is played. Tested in `tests/input/handling.test.ts`.

### CLI-02 91 MB client; a 57 MB WAV streams on the menu

<span class="sev s2">S2</span> **Fixed in 0.3.0** · `src/core/BGMManager.ts:159`, `src/resources/`

The production build is 91 MB. The menu track is a 57 MB uncompressed WAV
loaded with `preload = 'auto'`; the backgrounds are up to 8.3 MB JPEGs. The
first 15 seconds of a visit already transfer 9.6 MB (measured).

**Fixed:** The menu track is a 3.6 MB AAC file, the stock backgrounds and recycled sprite sheets are gone (the board is drawn from a generated atlas), screens load on demand, and the build is 18 MB, of which about 16 MB is four music tracks fetched only when they play. The binaries remain in git history (OPS-10).

### CLI-03 2,000-line scene classes mix every concern

<span class="sev s3">S3</span> **Open** · `GameScene.ts` (2,143 lines), `QuickPlayScene.ts` (1,223), `CommunityScreen.tsx` (1,124)

Input, networking, simulation stepping, rendering, audio and UI live in one
class. NET-06 lived here, untested and unnoticed.

**Progress in 0.3.0:** `GameScene` is down to about 1,100 lines and `QuickPlayScene` to about 400: drawing moved to `BoardView`, handling to `HandlingController`, layout to `MatchLayout`. Networking and match flow still share the scene.

### CLI-04 No accessibility support

<span class="sev s3">S3</span> **Open** · `src/screens/`, `src/components/`

No ARIA attributes anywhere in the React UI, no reduced-motion option, and
colour is the only way to tell puyos apart.

**Progress in 0.3.0:** a symbol on every puyo colour, a high-contrast theme, a reduced-motion setting, labelled icon buttons and dialogs, and keyboard-reachable menus. No screen-reader pass yet.

### CLI-05 No localization

<span class="sev s3">S3</span> **Open**

All text is hard-coded English. Japan is the genre's largest competitive scene.

### CLI-06 Session token in `localStorage`

<span class="sev s3">S3</span> **Open** · `src/core/AuthManager.ts:24`

Any script injection can read a seven-day bearer token. An httpOnly, `SameSite`
cookie with short-lived access tokens removes the exposure.

### CLI-07 Sound effects use `HTMLAudioElement`

<span class="sev s3">S3</span> **Fixed in 0.3.0** · `src/core/SoundManager.ts:41`

Media elements have scheduling latency and limited polyphony. Game feedback
sounds should be pre-decoded `AudioBuffer`s played through Web Audio.

**Fixed:** `SoundManager` decodes every effect once into an `AudioBuffer` and plays it through Web Audio; music fades with gain ramps.

### CLI-08 ArrowUp rotates regardless of key bindings

<span class="sev s4">S4</span> **Fixed in 0.3.0** · `GameScene.ts:1242`

`|| Input.isPressed('ArrowUp')` hard-codes a binding the controls screen cannot
change.

**Fixed:** Rotation comes only from the bound actions; the hard-coded key went with the input rewrite.

### CLI-09 No Content Security Policy; no offline shell

<span class="sev s4">S4</span> **Open** · `vercel.json`, `index.html`

### CLI-10 Input is applied once per rendered frame, after catch-up

<span class="sev s3">S3</span> **Fixed in 0.3.0** · `GameScene.ts` (update loop)

When the loop advances several logical frames in one rendered frame, input is
sampled once, after all of them, and stamped on the last frame.

**Fixed:** `GameScene.stepFrame` applies input after **each** engine step, stamped with that step's frame.

### CLI-11 Key taps shorter than one frame are dropped

<span class="sev s2">S2</span> **Fixed in 0.3.0** · `src/core/Input.ts:49–54`, `:104–107`

`isPressed` compares the current key state with a snapshot taken once per
rendered frame. If key-down and key-up both happen between two frames (a fast
tap, under ~16 ms), the press is never seen. Found while driving the game with
scripted input: several of eight quick drops were lost.

**Fixed:** `Input` latches every press until the next logical frame consumes it (`consumePlay`), so a press and release between two frames still counts. Tested, and demonstrated by the `keys-tap-loss` catalogue scenario.

### CLI-12 Default handling is very slow

<span class="sev s2">S2</span> **Fixed in 0.3.0** · `src/core/SettingsManager.ts:6–12`

Defaults are DAS 25 and ARR 15 frames. The first step is instant, but moving a
pair three columns takes 40 frames (0.67 s) and five columns 70 (1.17 s). Tsu
moves a pair three columns in 8 frames and five in 12, and TETR.IO defaults to
DAS 10, ARR 2. New players judge the game on its defaults.

**Fixed:** Three presets, with Standard as the default: Relaxed DAS 16 / ARR 4, Standard 10 / 2, Competitive 7 / 0. Players still on the old untouched defaults are moved to Standard.

### CLI-13 Unplayable on phones

<span class="sev s2">S2</span> **Fixed in 0.3.0** · `src/scenes/GameScene.ts`, `src/core/Input.ts`

There are no touch controls, so a phone can open the game but not play it. The
canvas ignores `devicePixelRatio`, so text and pieces are blurry on high-density
screens, and the board uses about a third of the screen.

**Fixed:** On-screen touch controls (automatic on touch devices, switchable in settings), a canvas that renders at the device pixel ratio (up to 2), and a portrait layout that gives the board most of the screen.

### CLI-14 No visual identity

<span class="sev s2">S2</span> **Fixed in 0.3.0** · `src/resources/puyo.png`, `src/resources/backgrounds/`

The pieces are a recycled sprite sheet in the official games' style; the
backgrounds are unrelated stock photographs (night skies, a gothic hall) that
compete with the board for attention; menus are generic glass panels. There is
nothing a player would recognise as *this* game. See also LEG-01.

**Fixed:** An original identity: generated orbs with a symbol per colour, a board and backdrop drawn from theme tokens, the Fredoka typeface, a new mark and wordmark, and themes including a high-contrast one ([Visual identity](/design/visual-identity/)).

### CLI-15 Floating music player covers menus and, mid-match, the player's own board

<span class="sev s3">S3</span> **Fixed in 0.3.0** · `src/components/BGMPlayer.tsx`

On desktop it covers the footer and the edge of the last menu button; in a
multiplayer match at 800 × 720 it covers the bottom rows of the player's own
board; on a phone it covers the bottom of the board and the results screen.

**Fixed:** The player docks into the menu, and elsewhere collapses to a small chip in the corner, clear of both boards and the results screen.

### CLI-16 In-game text overlaps the HUD and renders in a fallback serif font

<span class="sev s3">S3</span> **Fixed in 0.3.0** · `GameScene.spawnFloatingText`, `src/style.css`

Floating texts ("Warning! +1", "OFFSET! -1") are placed at fixed coordinates
that overlap the NEXT label and the board. They ask for the Rajdhani font,
which is only imported by `src/style.css`, a 604-line stylesheet nothing
imports, so they render in the browser's default serif. Seen in the recorded
multiplayer match.

**Fixed:** All in-game text is drawn by `BoardView.callout` in the game's typeface, placed relative to the board and kept inside it; a new chain callout replaces the previous one.

### CLI-17 Every puyo sprite is created and destroyed every frame

<span class="sev s3">S3</span> **Fixed in 0.3.0** · `GameScene.draw`, `drawOpponent`

`draw()` removes and destroys every sprite and creates a new one for each puyo,
every frame, for both boards: about 150 allocations per frame at mid-game.
That is steady garbage-collection pressure, the classic cause of
micro-stutter, which is worst exactly when the screen is busiest.

**Fixed:** `BoardView` draws from `SpritePool`s and allocates nothing per frame.

### CLI-18 Phone menu: side tab overlaps buttons, footer wraps and clips

<span class="sev s3">S3</span> **Fixed in 0.3.0** · `src/App.tsx`, `src/components/PuyoFooter.tsx`

On a phone the Community side tab covers the left of the Multiplayer button,
the footer wraps "© 2026 PUYO LIVE" onto three lines, and "All systems
operational" is clipped behind the music button.

**Fixed:** On phones Community is a menu item instead of a side tab, and the footer fits one line with real server status.

### CLI-19 Single-player top-out says "YOU LOST" and shows no results

<span class="sev s4">S4</span> **Fixed in 0.3.0** · `GameScene` (`onStateChange`), `src/screens/GameOverScreen.tsx`

There is no opponent in practice mode, so there is nobody to lose to. The
screen should say "Game over" and show the run's score, best chain and time.

**Fixed:** The results screen says "Game over" in solo modes and shows score, best chain, puyos cleared, time and personal bests; Enter or R plays again.

### CLI-20 A slow device is told it is "RECONNECTING…"

<span class="sev s4">S4</span> **Open** · `GameScene` (MatchClock desync)

Falling behind the shared clock because the device cannot render fast enough
is reported as a connection problem.

**Progress in 0.3.0:** single player now tells a slow device the truth ("About N fps: effects reduced") and lowers effects; the multiplayer message is unchanged.

### CLI-21 The replay viewer played animations at half speed

<span class="sev s3">S3</span> **Fixed in 0.3.0** · `src/scenes/ReplayScene.ts`

Animation timings in the replay viewer were written for the double-speed engine
(ADR 0001) and never restated, so every effect lasted twice as long as in play.

**Fixed:** replays use the same `BoardView` as play, and effects follow the
playback speed.

### CLI-22 The opponent's garbage tray showed about 70 times the real amount

<span class="sev s3">S3</span> **Fixed in 0.3.0** · `GameScene` (opponent tray)

The tray added `garbageQueue` (puyos) to `nuisanceTray` (points), so an
incoming 5 read as about 350.

**Fixed:** `pendingGarbage()` converts points to puyos, for both boards.

### CLI-23 The new pair spawned above the visible stage

<span class="sev s3">S3</span> **Fixed in 0.3.0** · `src/core/RenderConstants.ts`

The pair appears above the board, and the stage cut it off: players saw it
only once it fell into the board.

**Fixed:** a taller stage with room above the board for the spawning pair and
the garbage tray.

### CLI-24 Typing a space in a text field was blocked by game input

<span class="sev s3">S3</span> **Fixed in 0.3.0** · `src/core/Input.ts`

The game's key handler cancelled Space and the arrow keys everywhere, so
usernames, search boxes and forum posts could not contain spaces.

**Fixed:** keys typed into editable fields never reach the game
(`Input.isEditable`).

### CLI-25 A soft drop factor of 0 disabled soft drop

<span class="sev s4">S4</span> **Fixed in 0.3.0** · `src/screens/SettingsScreen.tsx`

The slider allowed 0, which divided gravity by zero into "never".

**Fixed:** the minimum is 1.

### CLI-26 Settings changed with the keyboard were never saved

<span class="sev s3">S3</span> **Fixed in 0.3.0** · `src/screens/SettingsScreen.tsx`

Only mouse changes called `save()`; keyboard and controller changes were lost
on reload.

**Fixed:** every change saves.

### CLI-27 Enter at game over restarted the game under the results screen

<span class="sev s4">S4</span> **Fixed in 0.3.0** · `src/screens/GameOverScreen.tsx`

The Enter that ended a hard drop could land on the results screen and restart
the game behind it.

**Fixed:** Enter or R restarts, after a short guard, and the screen closes
first.

### CLI-28 Four sound effects were silent

<span class="sev s4">S4</span> **Fixed in 0.3.0** · `src/core/SoundManager.ts`

`pop`, `menu_select`, `menu_back` and `level_up` were played but had no sound
files.

**Fixed:** they map to existing sounds; the redundant `pop` calls were removed.

### CLI-29 Fake status, stale version and a "MyWebSite" manifest

<span class="sev s4">S4</span> **Fixed in 0.3.0** · `src/components/PuyoFooter.tsx`, `public/site.webmanifest`

The footer always said "All systems operational" and "v0.1.1", and the web
manifest named the app "MyWebSite".

**Fixed:** the footer shows the real connection state and the build's version;
the manifest names the game, with its own icons.

### CLI-30 Opening any screen for the first time hid the menu

<span class="sev s3">S3</span> **Fixed in 0.3.0** · `src/App.tsx`, `src/utils/lazyScreen.tsx`

Screens load on demand, and every one shared a single suspense boundary with
the menu, so the first time any screen opened the whole menu was hidden for a
moment. Opening the profile from the account menu this way cut off the menu's
closing animation, which then stayed on screen behind the profile for good.
Found while recording the screen flows.

**Fixed:** a screen whose code has been preloaded renders at once, and one
still loading waits inside its own boundary.

### CLI-31 A guest's profile showed "Authentication required"

<span class="sev s4">S4</span> **Fixed in 0.3.0** · `src/screens/ProfileScreen.tsx`

A guest opening My Profile got a red API error, a "Level" badge with no number,
and on phones a header that wrapped badly.

**Fixed:** guests see what an account gives them and a way to sign in; the
account menu offers "Sign in" instead of "Log out".

### CLI-32 A hidden in-game settings panel edited settings that do not exist

<span class="sev s4">S4</span> **Fixed in 0.3.0** · `src/ui/SettingsOverlay.ts`

F2 toggled a Pixi panel that was never added to the stage, with sliders for a
spawn delay and a line clear delay the game does not have.

**Fixed:** removed, with the unused `lineClearDelay` setting.

### CLI-33 The frame-rate notice covered the spawning piece

<span class="sev s4">S4</span> **Fixed in 0.3.0** · `src/components/PerfNotice.tsx`

The notice added earlier in 0.3.0 sat at the top centre of the screen, where
the next pair appears.

**Fixed:** bottom left on wide screens, one short line above the spawn point on
phones.

## Backend and security (API)

### API-01 Moderation tables never migrated; bans did not work

<span class="sev s2">S2</span> **Fixed in 0.3.0** · `api/prisma/schema.prisma`, `api/src/services/auth.service.ts:230–245`

`Ban`, `AuditLog` and `LoginLog` were in the schema but no migration created
them. Production builds its schema with `prisma migrate deploy`, so bans,
auditing and login logs failed silently, and a catch-all around the login ban
check also swallowed its own "Account suspended" error. Fixed by migration
`20260925000000_add_moderation_tables` (idempotent; verified on a fresh
database and on one built with `db push`) and by removing the catch-all.

### API-02 Player lists ship megabytes of base64 avatars, uncompressed

<span class="sev s2">S2</span> **Fixed in 0.3.0** · `api/prisma/schema.prisma:17`, `api/src/routes/users.routes.ts`

Avatars are stored as base64 data URIs (up to ~150 KB) in the `users` row and
returned inline. Measured with 30 realistic users: `/users/all?limit=20`
returns **2.9 MB**, and `/users/search`, which the UI calls as you type,
returns **3.65 MB**. Responses are not compressed and carry no cache headers.
Uploads are checked by data-URI prefix only.

**Fixed:** Lists and profiles return a versioned `avatar_url`; `GET /api/users/:id/avatar` serves the image with an `ETag` and, when versioned, a year-long immutable cache. Responses are compressed. Uploads are still checked by declared type only, but the image is always served with that type and `nosniff`, never inline.

### API-03 Elo with fixed K and an inflationary floor; rank by COUNT

<span class="sev s3">S3</span> **Open** · `api/src/config/index.ts:61`, `api/src/services/match.service.ts:32`, `auth.service.ts:292`, `:319`

K = 32 for everyone treats a new player's first game like a veteran's
hundredth. The loser's floor at 100 creates rating from nothing. Rank is a
`COUNT(*)` over users on every profile view.

### API-04 Login timing reveals which usernames exist

<span class="sev s4">S4</span> **Open** · `auth.service.ts:214–228`

An unknown username returns before bcrypt runs, contradicting the comment
beside it. (`/auth/check` also reveals existence by design, for sign-up.)

### API-05 Seven-day tokens with no revocation; HS256 still accepted

<span class="sev s3">S3</span> **Open** · `auth.service.ts` (`verifyToken`, `generateToken`)

### API-06 No schema validation; typed access bypassed with `any`

<span class="sev s3">S3</span> **Open** · `api/src/routes/`

`express-validator` is installed and unused; bodies are validated by hand.
Admin routes reach Prisma through `(prisma as any)` casts, which is how API-01
went unnoticed.

### API-07 Anyone can lock any account by failing its login

<span class="sev s3">S3</span> **Open** · `auth.service.ts:17–60`

Lockout is keyed only by username, so five bad attempts from anywhere lock the
real owner out for up to 30 minutes.

### API-08 Rate limits and lockouts live in process memory

<span class="sev s3">S3</span> **Open** · `api/src/index.ts`, `auth.service.ts:26`

They reset on every deploy and cannot be shared by a second instance.

### API-09 The game server's calls shared one address's rate limits

<span class="sev s2">S2</span> **Fixed in 0.3.0** · `api/src/routes/auth.routes.ts`, `api/src/index.ts`, `server/ApiClient.ts`

The game server verifies every player who signs in through
`POST /api/auth/verify`, which allowed 60 calls per 15 minutes per address.
All of those calls come from the game server's one address, so after the 60th
sign-in in 15 minutes every other player silently failed to authenticate and
could not play ranked. Its result recording also counted against the global
100-a-minute limit.

**Fixed:** the game server sends its internal key, and requests carrying a
valid key skip the per-address limits (`hasInternalKey`, tested in
`api/src/tests/internal-limits.test.ts`).

### API-10 Known-vulnerable dependencies

<span class="sev s3">S3</span> **Open** · `api/package-lock.json`, `package-lock.json`

`npm audit` reports 20 advisories in the API (1 critical, 13 high, 5 moderate,
1 low) and 17 in the client workspace (9 high, 7 moderate, 1 low). Most are
transitive; each needs checking for reachability before upgrading. Dependabot
now proposes updates weekly. See OPS-05.

## Operations (OPS)

Context: [Operations review](/review/operations/).

### OPS-01 `:latest` auto-deploys with no staging or rollback

<span class="sev s2">S2</span> **Open** · `docker-compose.yml:34`, `:68`, `:99`

Watchtower polls every five minutes and swaps whatever `:latest` points at.
There is no staging environment, no canary, no record of what is deployed, and
no rollback short of rebuilding an old commit. Migrations run on boot of
whatever image arrives.

### OPS-02 No metrics, tracing, error tracking or alerting

<span class="sev s2">S2</span> **Open**

Only console logs. Nobody is told when the site is down, when errors spike, or
when desyncs rise.

### OPS-03 Backups every 10 days on the same host, never restore-tested

<span class="sev s3">S3</span> **Open** · `docker-compose.yml` (`db-backup`)

Up to ten days of data can be lost, the backups share the host's fate, and a
backup that has never been restored is a hope, not a backup.

### OPS-04 Root Dockerfile is stale and unused

<span class="sev s3">S3</span> **Open** · `Dockerfile:2`

Node 20 (end of life April 2026), and it does not install the engine workspace.
The client is deployed by Vercel.

### OPS-05 Dependencies a major version behind

<span class="sev s3">S3</span> **Open** · `package.json`, `api/package.json`

React 18 (19 is current), Vitest 3 and 2 (5), TypeScript 5.9 (7, the native
compiler), Prisma 6 (7), and a `rolldown-vite` override made obsolete by Vite 8.
The API and the root pin different TypeScript and Vitest versions. Dependabot
was added in 0.3.0.

### OPS-06 API tests did not run in CI and had rotted

<span class="sev s3">S3</span> **Fixed in 0.3.0** · `.github/workflows/verify.yml`, `api/src/tests/api.integration.test.ts`

Two match-recording tests had failed since the endpoint was restricted to the
internal key. The suite now runs in CI against PostgreSQL.

### OPS-07 Game server defaulted to the wrong API port

<span class="sev s3">S3</span> **Fixed in 0.3.0** · `server/ApiClient.ts:5`

### OPS-08 CORS allowlists duplicated; Socket.IO ignores `CORS_ORIGIN`

<span class="sev s4">S4</span> **Open** · `api/src/index.ts:26–35`, `server/index.ts:17–26`, `:86–95`

### OPS-09 No supply-chain hardening

<span class="sev s3">S3</span> **Open** · `.github/workflows/`, `docker-compose.yml`

Actions pinned by tag, not SHA; no CodeQL or secret scanning configuration; no
SBOM or image signing; Watchtower holds the Docker socket.

### OPS-10 88 MB of binaries in git without LFS

<span class="sev s4">S4</span> **Open** · `src/resources/`

### OPS-11 The game server image ran without `NODE_ENV=production`

<span class="sev s3">S3</span> **Fixed in 0.3.0** · `server/Dockerfile`, `docker-compose.yml`

The development switches (`DEV_FIXED_SEED`, `SIMULATED_LATENCY_MS`,
`EXTRA_CORS_ORIGINS`, `HEARTBEAT_TIMEOUT_MS`) are ignored only in production,
but nothing set production for the game server, so any of them set on the
host would have taken effect: a fixed seed would make every match's pieces
known in advance.

**Fixed:** the image and the Compose service set `NODE_ENV=production`.

### OPS-12 `DB_*` settings are read but unused

<span class="sev s4">S4</span> **Open** · `api/src/config/index.ts`, `api/.env.example`

`DB_HOST`, `DB_PORT`, `DB_NAME`, `DB_USER` and `DB_PASSWORD` are read into
`config.db` and listed in the example, but Prisma reads only `DATABASE_URL`.
Setting them changes nothing.

### OPS-13 CI tested against PostgreSQL 16; production runs 18

<span class="sev s4">S4</span> **Fixed in 0.3.0** · `.github/workflows/verify.yml`

**Fixed:** the API tests run against the same major version as production.

## Quality and testing (QA)

Context: [Quality review](/review/quality-and-testing/).

### QA-01 No end-to-end, client or socket-layer tests

<span class="sev s2">S2</span> **Open**

The engine is well tested; the scenes, the network manager, the socket handlers
and every screen are not. NET-06 and CLI-11 both lived in untested code.

### QA-02 No lint or format standard

<span class="sev s3">S3</span> **Open**

No ESLint, Biome or Prettier configuration. 138 explicit `any`s and 214 console
calls across the codebase.

### QA-03 No state-coverage or property-based engine tests

<span class="sev s3">S3</span> **Open** · `tests/engine/`

The characterization suite pins behaviour on ten seeds but does not prove that
every state and transition is reached, and nothing checks invariants (puyo
conservation, no floating puyos, no unresolved groups) across random play.

### QA-04 No performance budgets in CI

<span class="sev s3">S3</span> **Open**

Bundle size, asset weight and frame time are not measured, which is how a 57 MB
WAV shipped.

## Legal (LEG)

Context: [Legal and IP review](/review/legal-and-ip/).

### LEG-01 Trademarked name; artwork of unverified provenance

<span class="sev s1">S1</span> **Decision** · `src/resources/puyo.png`, `puyosprites.png`

"Puyo Puyo" is a registered trademark of SEGA. The sprite sheets follow the
layout of fan "skins" derived from official art, and their origin is not
recorded. This blocks any monetization and is a takedown risk.

**Progress in 0.3.0:** all recycled artwork is gone (CLI-14); the name remains the decision.

### LEG-02 No LICENSE file; asset licences unrecorded

<span class="sev s2">S2</span> **Open**

The README said "MIT" but no licence file existed, so the code was legally
all-rights-reserved. Backgrounds look like Pixabay images and music provenance
is unknown; none of it is recorded.

### LEG-03 IP logs without enforced retention; no self-service deletion

<span class="sev s3">S3</span> **Open** · `api/prisma/schema.prisma` (`LoginLog`)

## Documentation (DOC)

### DOC-01 Documentation was not enforced; no changelog or release notes

<span class="sev s3">S3</span> **Fixed in 0.3.0** · [ADR 0007](/decisions/0007-documentation-system/)
