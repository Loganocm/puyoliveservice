/**
 * @puyolive/engine -- the simulation, shared by the client and the game server.
 *
 * This package is the whole of the game's rules and nothing else. It is a pure
 * function of its seed, its config, and the inputs applied to it:
 *
 *   - No DOM, no Node APIs, no timers, no wall clock.
 *   - No settings singleton, no audio, no renderer. Handling comes in as an
 *     injected `EngineConfig`; audible moments go out through `onSound`.
 *   - `update()` advances exactly one logical frame and takes no delta.
 *
 * Anything that would break those properties belongs in a consumer, not here.
 * The engine had been implemented twice -- once for the client and once,
 * hand-mirrored, for the server -- and that is what this package ends.
 *
 * See docs/adr/0006-shared-engine-package.md.
 */

export { COLS, ROWS, HIDDEN_ROWS, TOTAL_ROWS, PuyoColor } from './Constants.js';

export { Board } from './Board.js';

export {
    GameEngine,
    GameState,
    DEFAULT_ENGINE_CONFIG,
} from './GameEngine.js';

export type {
    EngineConfig,
    EngineSound,
    GameStats,
    PuyoPair,
    ActivePiece,
} from './GameEngine.js';

export { ENGINE_VERSION } from './replay.js';

export type {
    InputType,
    ReplayInput,
    ReplayPlayer,
    ReplayPlayerSettings,
    ReplayRoomSettings,
    DeterministicEventType,
    DeterministicEvent,
    StateHash,
    ReplayFileV3,
    ReplayFileV2,
} from './replay.js';
