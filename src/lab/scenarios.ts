/**
 * The scenario catalogue: seeded, scripted situations that together exercise
 * every animated action in src/lab/animations.ts and every transition of the
 * engine's state machine.
 *
 * A scenario is data, not code, so the same definition runs:
 *   - headless under Vitest (tests/lab/catalogue.test.ts), which checks its
 *     expectations and the coverage of the whole catalogue;
 *   - in the real game at /?lab=<id>, where the recorder
 *     (tests/lab/record-catalogue.mjs) captures a video and keyframes.
 *
 * Boards use the notation in ./board.ts (bottom-aligned rows). Scripts use the
 * replay input alphabet, stamped with an absolute frame or anchored to a
 * piece's lifecycle so they read as intent ("3 frames after piece 1 lands").
 *
 * See website/src/content/docs/reference/animation-catalogue.md.
 */

import type { EngineConfig, InputType } from '@puyolive/engine';

/** Keyboard actions, named as in ControlsManager. */
export type KeyAction = 'moveLeft' | 'moveRight' | 'rotateCW' | 'rotateCCW' | 'softDrop' | 'hardDrop' | 'pause';

export type Anchor =
    | { f: number }
    | { piece: number; on: 'spawn' | 'grounded' | 'lock'; plus?: number }
    | { piece: number; on: 'y'; y: number; plus?: number };

export type ScriptStep = Anchor & (
    | { i: InputType; a?: number }
    | { key: KeyAction; down: boolean }
    | { tap: KeyAction }
);

export interface Scenario {
    id: string;
    title: string;
    /** What to look at in the recording. */
    notes: string;
    /** Animation ids this scenario is expected to witness (checked). */
    covers: string[];
    seed: number;
    board?: string[];
    queue?: string[];
    config?: Partial<EngineConfig>;
    /** Client handling for keyboard-driven scenarios (browser only). */
    handling?: { das?: number; arr?: number };
    /** Timed mode length in seconds (browser only). */
    timeLimit?: number;
    script: ScriptStep[];
    frames: number;
    /** Scenarios driven through the keyboard run only in the browser. */
    browserOnly?: boolean;
    /**
     * Interactions the recorder performs with real key presses, for UI that
     * stops the engine clock (a paused game has no frames to schedule on).
     */
    recorder?: { pauseAt?: number };
    /** Extra keyframes to capture, in engine frames. Engine scenarios also get automatic ones. */
    keyframes?: number[];
    expect?: {
        finalState?: 'SPAWN' | 'ACTIVE' | 'FALLING' | 'CHECK_MATCH' | 'POP_ANIM' | 'GARBAGE_FALL' | 'GAMEOVER';
        maxChain?: number;
        garbageSent?: number;
        /** Exact final board, bottom-aligned. */
        board?: string[];
    };
}

// Reusable fragments -----------------------------------------------------------

/** Checkerboard walls in columns 1-3, six high: forces floor kicks. */
const WELL_6 = ['.GBG..', '.BGB..', '.GBG..', '.BGB..', '.GBG..', '.BGB..'];

/** Two-column staircase: a trigger (R under G) into column 0 fires a 2-chain. */
const STAIRS_2 = ['RG....', 'RG....', 'RG....'];

/** Six-column staircase: a trigger (R under G) into column 0 fires a 6-chain ending in an all clear. */
const STAIRS_6 = ['.BYPR.', 'RGBYPR', 'RGBYPR', 'RGBYPR'];

/** Drop the current piece fast with soft drop, releasing a few rows above the floor. */
const hurry = (piece: number, releaseAtY: number): ScriptStep[] => [
    { piece, on: 'spawn', plus: 1, i: 'SD' },
    { piece, on: 'y', y: releaseAtY, i: 'SU' },
];

export const SCENARIOS: Scenario[] = [
    // ── Piece lifecycle ──────────────────────────────────────────────────────
    {
        id: 'spawn-fall-lock',
        title: 'Spawn, natural gravity, lock delay',
        notes: 'The first pair fades in, falls one row every 30 frames, rests for the lock delay, locks with a jiggle, and the queue advances.',
        covers: ['piece.spawn', 'queue.advance', 'piece.gravity-step', 'piece.lock-delay', 'piece.lock-jiggle', 'hud.score', 'hud.x-marker'],
        seed: 1001,
        queue: ['RG', 'BY', 'PR', 'GB', 'YP'],
        script: [],
        frames: 470,
    },
    {
        id: 'move-rotate-open',
        title: 'Moves, rotations and a blocked move in open space',
        notes: 'Four clockwise and four counter-clockwise rotations, moves to both walls, a move rejected by the wall, then a hard drop with screen shake.',
        covers: ['piece.rotate', 'piece.move', 'piece.move-blocked', 'piece.hard-drop'],
        seed: 1002,
        queue: ['RG', 'BY', 'PR'],
        script: [
            { f: 5, i: 'CW' }, { f: 10, i: 'CW' }, { f: 15, i: 'CW' }, { f: 20, i: 'CW' },
            { f: 25, i: 'CC' }, { f: 30, i: 'CC' }, { f: 35, i: 'CC' }, { f: 40, i: 'CC' },
            { f: 45, i: 'L' }, { f: 50, i: 'L' }, { f: 55, i: 'L' },
            { f: 60, i: 'R' }, { f: 65, i: 'R' }, { f: 70, i: 'R' }, { f: 75, i: 'R' }, { f: 80, i: 'R' }, { f: 85, i: 'R' },
            { f: 95, i: 'HD' },
        ],
        frames: 140,
    },
    {
        id: 'wall-kick-right',
        title: 'Wall kick off the right wall',
        notes: 'At the right wall, rotating clockwise would put the orbiting puyo outside the field, so the pair is pushed one column left.',
        covers: ['piece.wall-kick'],
        seed: 1003,
        queue: ['GB', 'RY', 'PG'],
        script: [{ f: 5, i: 'R' }, { f: 10, i: 'R' }, { f: 15, i: 'R' }, { f: 25, i: 'CW' }, { f: 55, i: 'HD' }],
        frames: 90,
    },
    {
        id: 'wall-kick-left',
        title: 'Wall kick off the left wall',
        notes: 'The mirror image: rotating counter-clockwise at the left wall pushes the pair one column right.',
        covers: ['piece.wall-kick'],
        seed: 1004,
        queue: ['YP', 'RG', 'BY'],
        script: [{ f: 5, i: 'L' }, { f: 10, i: 'L' }, { f: 25, i: 'CC' }, { f: 55, i: 'HD' }],
        frames: 90,
    },
    {
        id: 'floor-kick',
        title: 'Floor kick onto a stack',
        notes: 'The pair lands between two walls. The first rotation fits; the second would push the orbiting puyo into the stack, so the pair is lifted one row.',
        covers: ['piece.floor-kick', 'piece.rotate', 'piece.soft-drop'],
        seed: 1005,
        board: WELL_6,
        queue: ['RY', 'PG', 'BR'],
        script: [...hurry(1, 5), { piece: 1, on: 'grounded', plus: 3, i: 'CW' }, { piece: 1, on: 'grounded', plus: 9, i: 'CW' }],
        frames: 170,
    },
    {
        id: 'diagonal-kick',
        title: 'Diagonal kick (non-standard)',
        notes: 'Every orthogonal kick is blocked, so the rotation succeeds only by moving the pair up and left at once. Tsu has no diagonal kicks (RUL-08).',
        covers: ['piece.diagonal-kick'],
        seed: 1006,
        board: ['...B..', '.G.Y..'],
        queue: ['PR', 'GB', 'YP'],
        script: [...hurry(1, 10), { piece: 1, on: 'grounded', plus: 3, i: 'CW' }],
        frames: 200,
    },
    {
        id: 'rotate-blocked',
        title: 'Rotation blocked in a one-column well',
        notes: 'Walls on both sides leave no room to turn. Tsu would flip the pair 180 degrees on a double press (quick turn, RUL-08); here every press fails.',
        covers: ['piece.rotate-blocked'],
        seed: 1007,
        board: ['.G.B..', '.B.G..', '.G.B..', '.B.G..'],
        queue: ['YP', 'RG', 'BY'],
        script: [
            ...hurry(1, 9),
            { piece: 1, on: 'grounded', plus: 2, i: 'CW' }, { piece: 1, on: 'grounded', plus: 4, i: 'CW' },
            { piece: 1, on: 'grounded', plus: 7, i: 'CC' },
        ],
        frames: 200,
    },
    {
        id: 'same-colour-pair',
        title: 'Same-colour pairs',
        notes: 'A pair of one colour is drawn joined, through every rotation.',
        covers: ['piece.same-colour', 'piece.rotate'],
        seed: 1008,
        queue: ['RR', 'GG', 'BB'],
        script: [{ f: 6, i: 'CW' }, { f: 14, i: 'CW' }, { f: 22, i: 'CW' }, { f: 30, i: 'CW' }, { f: 40, i: 'HD' }, { piece: 2, on: 'spawn', plus: 10, i: 'CW' }, { piece: 2, on: 'spawn', plus: 25, i: 'HD' }],
        frames: 110,
    },
    {
        id: 'split-chigiri',
        title: 'Split: a horizontal pair lands unevenly',
        notes: 'The ghost shows the pair resting on the stack with one half hanging. After the lock, the hanging half drops to the floor and jiggles.',
        covers: ['piece.split', 'piece.ghost', 'clear.cascade-jiggle'],
        seed: 1009,
        board: ['..G...', '..B...', '..G...'],
        queue: ['RB', 'YP', 'GR'],
        script: [{ f: 5, i: 'CW' }, { f: 45, i: 'HD' }],
        frames: 100,
    },
    {
        id: 'soft-drop',
        title: 'Soft drop',
        notes: 'Soft drop held for 30 frames makes the pair fall ten times faster (SDF 10); on release it returns to normal gravity.',
        covers: ['piece.soft-drop', 'piece.gravity-step'],
        seed: 1010,
        queue: ['GY', 'BP', 'RG'],
        script: [{ f: 10, i: 'SD' }, { f: 40, i: 'SU' }],
        frames: 120,
    },
    {
        id: 'sonic-drop-protection',
        title: 'Sonic drop, soft-drop lock and soft-drop protection',
        notes: 'With SDF 40, soft drop reaches the stack in one frame and locks immediately. Held across the next spawn, it does not slam the new pair until it is released and pressed again.',
        covers: ['piece.sonic-drop', 'piece.soft-drop-lock', 'piece.soft-drop-protection'],
        seed: 1011,
        config: { sdf: 40, softDropProtection: true },
        queue: ['RB', 'GY', 'PR', 'BG'],
        script: [
            { f: 20, i: 'SD' },
            { piece: 1, on: 'lock', i: 'SD' },
            { piece: 2, on: 'spawn', plus: 60, i: 'SU' },
            { piece: 2, on: 'spawn', plus: 70, i: 'SD' },
        ],
        frames: 170,
    },
    {
        id: 'lock-reset-stall',
        title: 'Lock-timer resets stall a grounded pair (RUL-05)',
        notes: 'Every move while grounded resets the 15-frame lock timer, without limit. The pair stays alive for as long as the player keeps moving it.',
        covers: ['piece.lock-reset'],
        seed: 1012,
        queue: ['PY', 'RG', 'BY'],
        script: [
            ...hurry(1, 10),
            ...Array.from({ length: 12 }, (_, k): ScriptStep => ({ piece: 1, on: 'grounded', plus: 4 + k * 10, i: k % 2 ? 'R' : 'L' })),
        ],
        frames: 260,
    },
    {
        id: 'glide-hold',
        title: 'Holding a direction pauses the lock timer (RUL-05)',
        notes: 'While a horizontal key is held, a grounded pair never locks. It locks 15 frames after release.',
        covers: ['piece.glide'],
        seed: 1013,
        queue: ['BG', 'RY', 'PB'],
        script: [...hurry(1, 10), { piece: 1, on: 'grounded', plus: 2, i: 'HH' }, { piece: 1, on: 'grounded', plus: 120, i: 'HU' }],
        frames: 290,
    },

    // ── Clearing and chains ──────────────────────────────────────────────────
    {
        id: 'pop-single',
        title: 'A single group of four pops',
        notes: 'The fourth red completes the group. It flashes, shrinks and bursts into particles; the green above falls into the gap and jiggles.',
        covers: ['clear.pop', 'clear.cascade-fall', 'clear.cascade-jiggle'],
        seed: 1014,
        board: ['RRR...'],
        queue: ['RG', 'BY', 'PB'],
        script: [{ f: 4, i: 'R' }, { f: 10, i: 'HD' }],
        frames: 90,
        expect: { maxChain: 1, board: ['...G..'] },
    },
    {
        id: 'pop-group-bonus',
        title: 'A group of five',
        notes: 'A same-colour pair makes a group of five (group bonus 2).',
        covers: ['clear.pop', 'clear.group-bonus', 'piece.same-colour'],
        seed: 1015,
        board: ['RRR...'],
        queue: ['RR', 'BY', 'PG'],
        script: [{ f: 4, i: 'R' }, { f: 10, i: 'HD' }],
        frames: 90,
        expect: { maxChain: 1, board: ['......'] },
    },
    {
        id: 'pop-two-colours-split',
        title: 'Two groups of two colours pop together',
        notes: 'A horizontal pair lands unevenly and splits; the dropped half completes a red row while the other half completes a blue square, so both pop in the same step.',
        covers: ['clear.multi-group', 'clear.multi-colour', 'piece.split', 'piece.ghost'],
        seed: 1016,
        board: ['.....B', 'RRR.BB'],
        queue: ['RB', 'GY', 'PG'],
        script: [{ f: 4, i: 'R' }, { f: 8, i: 'CW' }, { f: 40, i: 'HD' }],
        frames: 110,
        expect: { maxChain: 1 },
    },
    {
        id: 'chain-2',
        title: 'A 2-chain',
        notes: 'The trigger pops the red column; the green on top falls next to three greens and pops as link 2 ("2 Chain"), clearing the board and sending garbage.',
        covers: ['clear.chain-text', 'clear.cascade-fall', 'garbage.send', 'clear.all-clear'],
        seed: 1017,
        board: STAIRS_2,
        queue: ['RG', 'BY', 'PB'],
        script: [{ f: 3, i: 'L' }, { f: 6, i: 'L' }, { f: 12, i: 'HD' }],
        frames: 140,
        expect: { maxChain: 2, garbageSent: 5, board: ['......'] },
    },
    {
        id: 'chain-6-all-clear',
        title: 'A 6-chain staircase ending in an all clear',
        notes: 'Each link drops one puyo into the next column. Watch the pop and fall durations grow with each link (RUL-03), the large-attack sound on link 6, and the all-clear celebration.',
        covers: ['clear.long-chain', 'clear.chain-text', 'clear.all-clear', 'garbage.large-attack', 'garbage.send'],
        seed: 1018,
        board: STAIRS_6,
        queue: ['RG', 'BY', 'PB'],
        script: [{ f: 3, i: 'L' }, { f: 6, i: 'L' }, { f: 12, i: 'HD' }],
        frames: 330,
        expect: { maxChain: 6, board: ['......'] },
    },
    {
        id: 'chain-12-timing',
        title: 'A 12-chain: how link duration grows',
        notes: 'A four-colour board found by searching with the real engine. Twelve links; watch each pop take longer than the last (RUL-03: link 12 takes about four times as long as link 2) while the attack grows past anything a board can hold.',
        covers: ['clear.long-chain', 'clear.chain-text', 'garbage.large-attack', 'garbage.send'],
        seed: 1035,
        board: ['.BGBG.', 'RYBRRG', 'RBGYBG', 'BYBYRB', 'YGYRRB', 'GBBYGR', 'YGRRYY', 'YBGGRY', 'BRRRYG'],
        queue: ['GB', 'RY', 'YG'],
        script: [{ f: 3, i: 'R' }, { f: 6, i: 'R' }, { f: 9, i: 'R' }, { f: 14, i: 'HD' }],
        frames: 540,
        expect: { maxChain: 12 },
    },
    {
        id: 'garbage-clear',
        title: 'Garbage next to a pop clears with it',
        notes: 'The red group pops and takes the adjacent garbage puyo with it; garbage not touching the group stays.',
        covers: ['clear.garbage-clear', 'clear.pop'],
        seed: 1019,
        board: ['...O..', 'RRRO..'],
        queue: ['RG', 'BY', 'PB'],
        script: [{ f: 3, i: 'L' }, { f: 6, i: 'L' }, { f: 12, i: 'HD' }],
        frames: 100,
        expect: { maxChain: 1 },
    },
    {
        id: 'all-clear-simple',
        title: 'A single-step all clear',
        notes: 'A horizontal red pair completes a row of four and empties the board.',
        covers: ['clear.all-clear', 'clear.pop'],
        seed: 1020,
        board: ['RR....'],
        queue: ['RR', 'BY', 'PG'],
        script: [{ f: 5, i: 'CW' }, { f: 12, i: 'HD' }],
        frames: 100,
        expect: { maxChain: 1, board: ['......'] },
    },
    {
        id: 'hidden-row-pop',
        title: 'A group in the hidden rows pops (RUL-07)',
        notes: 'Two reds in the top visible row and two in the first hidden row form a group and pop. In Tsu, 13th-row puyos never pop.',
        covers: ['clear.hidden-row-pop'],
        seed: 1021,
        board: [
            'R.....', 'R.....',
            'GY....', 'BP....', 'GY....', 'BP....', 'GY....', 'BP....',
            'GY....', 'BP....', 'GY....', 'BP....', 'GY....',
        ],
        queue: ['RR', 'BY', 'PG'],
        script: [{ f: 3, i: 'L' }, { f: 8, i: 'HD' }],
        frames: 90,
        expect: { maxChain: 1 },
    },

    // ── Garbage ──────────────────────────────────────────────────────────────
    {
        id: 'garbage-small',
        title: 'A few garbage fall into random columns',
        notes: 'Three garbage arrive, fill the damage meter, and fall after the next placement into three different columns.',
        covers: ['garbage.receive', 'garbage.fall-partial'],
        seed: 1022,
        queue: ['GY', 'BP', 'RG'],
        script: [{ f: 2, i: 'G', a: 3 }, { f: 20, i: 'HD' }],
        frames: 120,
    },
    {
        id: 'garbage-rows-on-stack',
        title: 'Three rows of garbage onto an uneven stack',
        notes: 'Eighteen garbage fall as three full rows, each column landing on its own stack height.',
        covers: ['garbage.fall-rows', 'garbage.on-stack'],
        seed: 1023,
        board: ['G.....', 'B.P...', 'G.Y..R'],
        queue: ['YR', 'BP', 'GB'],
        script: [{ f: 2, i: 'G', a: 18 }, { f: 4, i: 'R' }, { f: 8, i: 'R' }, { f: 20, i: 'HD' }],
        frames: 140,
    },
    {
        id: 'garbage-capped-danger',
        title: 'A 40-garbage attack: danger meter and a capped drop',
        notes: 'The meter passes 39 and flashes. Only 24 fall after the first placement (RUL-11); the remaining 16 fall after the next.',
        covers: ['garbage.meter-danger', 'garbage.fall-capped', 'garbage.fall-rows'],
        seed: 1024,
        queue: ['GY', 'BP', 'RG', 'YB'],
        script: [{ f: 2, i: 'G', a: 40 }, { f: 20, i: 'HD' }, { piece: 2, on: 'spawn', plus: 20, i: 'HD' }],
        frames: 150,
    },
    {
        id: 'garbage-offset',
        title: 'A chain offsets incoming garbage',
        notes: 'Six garbage are waiting. The 2-chain cancels them ("OFFSET!") instead of attacking, and nothing falls.',
        covers: ['garbage.offset', 'garbage.receive'],
        seed: 1025,
        board: STAIRS_2,
        queue: ['RG', 'BY', 'PB'],
        script: [{ f: 2, i: 'G', a: 6 }, { f: 3, i: 'L' }, { f: 6, i: 'L' }, { f: 12, i: 'HD' }],
        frames: 140,
        expect: { maxChain: 2, garbageSent: 0 },
    },

    // ── End of game ──────────────────────────────────────────────────────────
    {
        id: 'hidden-row-stack',
        title: 'Stacking into the hidden rows (RUL-06)',
        notes: 'A pair locks entirely in the two hidden rows above column 1. The game continues: only the spawn column is fatal.',
        covers: ['end.hidden-row-stack'],
        seed: 1026,
        board: ['G.....', 'B.....', 'G.....', 'B.....', 'G.....', 'B.....', 'G.....', 'B.....', 'G.....', 'B.....', 'G.....', 'B.....'],
        queue: ['RY', 'PG', 'BR'],
        script: [{ f: 3, i: 'L' }, { f: 6, i: 'L' }, { f: 10, i: 'HD' }],
        frames: 60,
        expect: { finalState: 'ACTIVE' },
    },
    {
        id: 'topout-lock',
        title: 'Top-out: locking above the board',
        notes: 'Column 3 is full to the first hidden row. The pair can only lock with its top half above the field, which ends the game.',
        covers: ['end.topout-lock'],
        seed: 1027,
        board: ['..G...', '..B...', '..G...', '..B...', '..G...', '..B...', '..G...', '..B...', '..G...', '..B...', '..G...', '..B...', '..G...'],
        queue: ['RY', 'PG', 'BR'],
        script: [{ f: 20, i: 'HD' }],
        frames: 60,
        expect: { finalState: 'GAMEOVER' },
    },
    {
        id: 'topout-spawn',
        title: 'Top-out: the spawn cell is filled',
        notes: 'A horizontal pair locks into the top hidden row across the spawn column. The next pair cannot spawn, and the game ends.',
        covers: ['end.topout-spawn'],
        seed: 1028,
        board: [
            '..GB..', '..BG..', '..GB..', '..BG..', '..GB..', '..BG..', '..GB..',
            '..BG..', '..GB..', '..BG..', '..GB..', '..BG..', '..GB..',
        ],
        queue: ['RY', 'PR', 'BY'],
        script: [{ f: 5, i: 'CW' }, { f: 20, i: 'HD' }],
        frames: 60,
        expect: { finalState: 'GAMEOVER' },
    },

    // ── Keyboard-driven (browser only) ───────────────────────────────────────
    {
        id: 'keys-das-arr',
        title: 'Held key: DAS then ARR (default handling)',
        notes: 'Right is held with the default DAS 25 and ARR 15: one step at once, the next after 25 frames, then one every 15 (CLI-12).',
        covers: ['input.das-arr'],
        seed: 1029,
        queue: ['RG', 'BY', 'PB'],
        browserOnly: true,
        handling: { das: 25, arr: 15 },
        script: [{ f: 10, key: 'moveRight', down: true }, { f: 110, key: 'moveRight', down: false }],
        keyframes: [12, 37, 52],
        frames: 130,
    },
    {
        id: 'keys-arr-zero',
        title: 'ARR 0: straight to the wall',
        notes: 'With ARR 0, once DAS charges the pair jumps to the wall in a single frame.',
        covers: ['input.arr-zero'],
        seed: 1030,
        queue: ['YP', 'RG', 'BY'],
        browserOnly: true,
        handling: { das: 10, arr: 0 },
        script: [{ f: 10, key: 'moveRight', down: true }, { f: 60, key: 'moveRight', down: false }],
        keyframes: [12, 22],
        frames: 80,
    },
    {
        id: 'keys-spawn-das',
        title: 'Charged DAS moves a new pair on its first frame',
        notes: 'Right stays held while the first pair is hard dropped. The second pair spawns and moves on the same frame (the input path fixed in NET-06).',
        covers: ['input.spawn-das', 'input.das-arr'],
        seed: 1031,
        queue: ['GB', 'RY', 'PG'],
        browserOnly: true,
        handling: { das: 10, arr: 2 },
        script: [
            { f: 5, key: 'moveRight', down: true },
            { f: 60, key: 'hardDrop', down: true }, { f: 63, key: 'hardDrop', down: false },
            { f: 120, key: 'moveRight', down: false },
        ],
        frames: 140,
    },
    {
        id: 'keys-tap-loss',
        title: 'A tap shorter than one frame (CLI-11)',
        notes: 'A hard-drop tap whose key-down and key-up land in the same frame, then a normal press. Before the input fix the first tap is lost.',
        covers: ['input.tap', 'piece.hard-drop'],
        seed: 1032,
        queue: ['PB', 'RG', 'YP'],
        browserOnly: true,
        script: [{ f: 30, tap: 'hardDrop' }, { f: 90, key: 'hardDrop', down: true }, { f: 93, key: 'hardDrop', down: false }],
        keyframes: [32, 95],
        frames: 120,
    },
    {
        id: 'pause-overlay',
        title: 'Pause and resume',
        notes: 'Escape opens the pause overlay and freezes the game; Escape again resumes exactly where it stopped. The recorder presses the keys, as a player would.',
        covers: ['hud.pause'],
        seed: 1033,
        queue: ['RG', 'BY', 'PB'],
        browserOnly: true,
        recorder: { pauseAt: 30 },
        script: [{ f: 70, i: 'HD' }],
        frames: 100,
    },
    {
        id: 'time-up',
        title: 'Timed mode runs out',
        notes: 'A four-second timed game: the countdown turns red under 30 seconds, then "TIME\'S UP!" and the results overlay.',
        covers: ['hud.timer', 'end.time-up'],
        seed: 1034,
        queue: ['RG', 'BY', 'PB'],
        browserOnly: true,
        timeLimit: 4,
        script: [{ f: 20, i: 'HD' }, { piece: 2, on: 'spawn', plus: 30, i: 'HD' }],
        frames: 300,
    },
];

export const SCENARIO_BY_ID = new Map(SCENARIOS.map(s => [s.id, s]));
