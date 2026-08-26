/**
 * The replay format, declared once.
 *
 * These types describe what crosses the wire and what gets stored: the input
 * alphabet, the deterministic event log, the periodic state hashes and the V3
 * file itself. Client and server both read and write them, so both must agree
 * on them exactly.
 *
 * They were previously declared TWICE -- in `src/core/ReplayEngine.ts` and in
 * `server/GameRoom.ts` -- as byte-identical copies kept in step by hand. That
 * is the same failure mode as the two engines: a shared format maintained by
 * convention. Widening the input alphabet on one side and not the other
 * produces a server that records symbols the client cannot play back, and
 * nothing catches it, because two structurally identical types type-check
 * against each other happily.
 *
 * They live in the engine package rather than in either consumer because it is
 * the only place both can import from. Nothing here is a runtime dependency on
 * the engine: it is types plus one version string.
 *
 * See README "Replay format" and docs/adr/0002-replay-determinism.md.
 */

/**
 * Current engine version. Bump whenever game logic changes in a way that
 * affects determinism, so old replays are gated out rather than played back
 * incorrectly.
 */
export const ENGINE_VERSION = '1.0.0';

/**
 * The input alphabet. Ten symbols, carried identically on the wire, in replays,
 * and to the opponent view.
 *
 * Hold states are edges (`HH`/`HU`, `SD`/`SU`) because the glide buffer depends
 * on held-key state, which movement edges alone cannot express.
 */
export type InputType =
    | 'L' | 'R'      // move left / right
    | 'CW' | 'CC'    // rotate clockwise / counter-clockwise
    | 'SD' | 'SU'    // soft drop pressed / released
    | 'HD'           // hard drop
    | 'HH' | 'HU'    // horizontal key held / released (drives the glide buffer)
    | 'G';           // garbage received (recorded by the receiver)

/** One frame-stamped input by one player. */
export interface ReplayInput {
    f: number;      // Frame the input was taken on
    p: 0 | 1;       // Player index within the room
    i: InputType;   // Input symbol
    a?: number;     // Amount -- only used by 'G'
}

/** Handling settings captured per player, because they affect simulation. */
export interface ReplayPlayerSettings {
    sdf: number;                    // Soft Drop Factor
    softDropProtection: boolean;    // Require a fresh press on spawn
}

/** Room-level settings that affect the match. */
export interface ReplayRoomSettings {
    garbageMultiplier: number;
    marginTime: number;
}

/** Who played. */
export interface ReplayPlayer {
    id: string;
    username: string;
    userId?: number;
    elo?: number;
}

/**
 * Every state-changing moment the server records, so a replay can be audited
 * and debugged without relying solely on PRNG determinism.
 */
export type DeterministicEventType =
    | 'spawn'           // Piece spawned (records colours)
    | 'lock'            // Piece locked (records position)
    | 'match'           // Match found (records groups)
    | 'garbage_drop'    // Garbage fell (records column order)
    | 'chain_end'       // Chain sequence ended (records stats)
    | 'gameover'        // Game over triggered
    | 'bag_gen';        // New piece bag generated

export interface DeterministicEvent {
    f: number;                     // Frame number
    p: 0 | 1;                      // Player index
    t: DeterministicEventType;     // Event type
    d?: any;                       // Event-specific data
}

/** A board hash stamped at a frame, for validation and desync detection. */
export interface StateHash {
    f: number;              // Frame number
    p: 0 | 1;               // Player index
    h: string;              // Board hash
}

/**
 * The V3 replay file: a seed plus an input log, not board states.
 *
 * A hash stamped frame N describes the board BEFORE the inputs also stamped
 * frame N. See README "The ordering invariant".
 */
export interface ReplayFileV3 {
    version: 3;
    engineVersion: string;                              // Logic fingerprint (e.g. "1.0.0")
    seed: number;                                       // Initial PRNG seed
    players: ReplayPlayer[];
    winner: 0 | 1 | null;
    duration: number;                                   // Total frames
    fps: number;                                        // Frames per second (60)
    inputs: ReplayInput[];                              // Frame-accurate player inputs

    /** Each player may have different handling, so settings are per player. */
    playerSettings: [ReplayPlayerSettings, ReplayPlayerSettings];

    roomSettings: ReplayRoomSettings;

    /** Explicit piece sequences, immune to PRNG changes.
     *  Flattened per player: [main0, sub0, main1, sub1, ...] */
    pieceSequences: [number[], number[]];

    /** Column order used for each garbage drop, per player. */
    garbageColumns: [number[][], number[][]];

    /** All state-changing events, for auditing and debugging. */
    events: DeterministicEvent[];

    /** Periodic board state hashes for validation. */
    stateHashes: StateHash[];
}

/**
 * Legacy V2 format. Kept for type reference and for the UI's "this replay is
 * too old to play" detection. Not generated, and not playable.
 */
export interface ReplayFileV2 {
    version: 2;
    seed: number;
    players: ReplayPlayer[];
    winner: 0 | 1 | null;
    duration: number;
    fps: number;
    inputs: ReplayInput[];
    settings?: ReplayPlayerSettings;
}
