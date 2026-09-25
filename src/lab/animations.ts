/**
 * The animation inventory: every visible, animated action the game can
 * perform, enumerated from the code that produces it.
 *
 * Each entry names the code that renders it and a WITNESS -- the evidence in a
 * scenario trace that proves the action actually happened. The catalogue test
 * (tests/lab/catalogue.test.ts) fails if any entry is not witnessed by at least
 * one scenario, so "every animated action" is a checked claim, not a hope.
 *
 * Entries with `layer: 'client'` are produced by the scene or the input layer,
 * not the engine; the headless runner cannot witness them, so they are
 * witnessed in the browser by the lab recorder instead.
 *
 * Adding an animation to the game means adding it here and to a scenario in
 * the same change. See website/src/content/docs/reference/animation-catalogue.md.
 */

export type AnimationLayer = 'engine' | 'client';

export interface AnimationSpec {
    id: string;
    group: 'piece' | 'clear' | 'garbage' | 'end' | 'hud' | 'input';
    title: string;
    /** Where it is drawn or triggered. */
    source: string;
    layer: AnimationLayer;
}

export const ANIMATIONS: readonly AnimationSpec[] = [
    // ── Piece lifecycle ──────────────────────────────────────────────────────
    { id: 'piece.spawn', group: 'piece', layer: 'engine', title: 'New pair scales and fades in at the spawn point', source: 'engine.onPieceSpawn -> GameScene.spawnAnim / drawActivePiece' },
    { id: 'queue.advance', group: 'piece', layer: 'engine', title: 'Next queue advances by one pair', source: 'engine.onPieceSpawn -> GameScene.drawNextQueue' },
    { id: 'piece.gravity-step', group: 'piece', layer: 'engine', title: 'Pair falls one row under natural gravity', source: 'GameEngine.handleActiveState' },
    { id: 'piece.soft-drop', group: 'piece', layer: 'engine', title: 'Pair falls faster while soft drop is held', source: 'GameEngine.handleActiveState (sdf)' },
    { id: 'piece.sonic-drop', group: 'piece', layer: 'engine', title: 'Pair drops to the stack in one frame (SDF 40)', source: 'GameEngine.handleActiveState (delay 0)' },
    { id: 'piece.hard-drop', group: 'piece', layer: 'engine', title: 'Hard drop: instant drop, lock and screen shake', source: 'engine.onHardDrop -> GameScene.shakeStrength' },
    { id: 'piece.move', group: 'piece', layer: 'engine', title: 'Pair moves one column', source: 'GameEngine.movePiece' },
    { id: 'piece.move-blocked', group: 'piece', layer: 'engine', title: 'Move rejected by a wall or the stack', source: 'GameEngine.movePiece (false)' },
    { id: 'piece.rotate', group: 'piece', layer: 'engine', title: 'Pair rotates in place', source: 'GameEngine.rotate' },
    { id: 'piece.wall-kick', group: 'piece', layer: 'engine', title: 'Rotation pushed sideways off a wall or the stack', source: 'GameEngine.rotate (kick x)' },
    { id: 'piece.floor-kick', group: 'piece', layer: 'engine', title: 'Rotation pushed up off the floor or the stack', source: 'GameEngine.rotate (kick y)' },
    { id: 'piece.diagonal-kick', group: 'piece', layer: 'engine', title: 'Rotation pushed diagonally (non-standard)', source: 'GameEngine.rotate (kick x and y)' },
    { id: 'piece.rotate-blocked', group: 'piece', layer: 'engine', title: 'Rotation rejected: no kick fits', source: 'GameEngine.rotate (false)' },
    { id: 'piece.same-colour', group: 'piece', layer: 'engine', title: 'Same-colour pair drawn joined while falling', source: 'GameScene.drawActivePiece (connection masks)' },
    { id: 'piece.ghost', group: 'piece', layer: 'engine', title: 'Ghost shows where the pair will land on an uneven stack', source: 'GameScene.drawGhostPiece' },
    { id: 'piece.lock-delay', group: 'piece', layer: 'engine', title: 'Grounded pair locks after the lock delay', source: 'GameEngine.handleActiveState (lockTimer)' },
    { id: 'piece.lock-reset', group: 'piece', layer: 'engine', title: 'Moves while grounded keep resetting the lock timer (RUL-05)', source: 'GameEngine.movePiece / rotate (lockTimer = 0)' },
    { id: 'piece.glide', group: 'piece', layer: 'engine', title: 'Holding a direction while grounded pauses the lock timer (RUL-05)', source: 'GameEngine.handleActiveState (isGliding)' },
    { id: 'piece.soft-drop-protection', group: 'piece', layer: 'engine', title: 'Soft drop held across a spawn does not slam the new pair', source: 'GameEngine.spawnPiece (softDropLocked)' },
    { id: 'piece.soft-drop-lock', group: 'piece', layer: 'engine', title: 'Soft drop against the stack locks immediately', source: 'GameEngine.handleActiveState (intentToLock)' },
    { id: 'piece.lock-jiggle', group: 'piece', layer: 'engine', title: 'Landed pair and its connected group squash and settle', source: 'engine.onPieceLock -> GameScene.landingAnims' },
    { id: 'piece.split', group: 'piece', layer: 'engine', title: 'A horizontal pair lands unevenly and one half drops (chigiri)', source: 'GameEngine.handleFallingState after lock' },

    // ── Clearing and chains ──────────────────────────────────────────────────
    { id: 'clear.pop', group: 'clear', layer: 'engine', title: 'A group of four flashes, shrinks and bursts into particles', source: 'POP_ANIM -> GameScene.drawBoard (popAnimProgress) / spawnParticles' },
    { id: 'clear.group-bonus', group: 'clear', layer: 'engine', title: 'A group of five or more pops', source: 'GameEngine.calculateScore (group bonus)' },
    { id: 'clear.multi-group', group: 'clear', layer: 'engine', title: 'Two or more groups pop in one step', source: 'GameEngine.handleCheckMatch' },
    { id: 'clear.multi-colour', group: 'clear', layer: 'engine', title: 'Groups of two or more colours pop in one step', source: 'GameEngine.calculateScore (colour bonus)' },
    { id: 'clear.cascade-fall', group: 'clear', layer: 'engine', title: 'Puyos above a pop fall into the gap', source: 'FALLING -> GameScene.drawBoard (fallingProgress)' },
    { id: 'clear.cascade-jiggle', group: 'clear', layer: 'engine', title: 'Fallen puyos squash on landing', source: 'engine.onGravityLanded -> GameScene.landingAnims' },
    { id: 'clear.chain-text', group: 'clear', layer: 'engine', title: '"N Chain" text rises from the popping group', source: 'engine.onChainStep -> GameScene.spawnChainText' },
    { id: 'clear.long-chain', group: 'clear', layer: 'engine', title: 'A chain of six or more links, with growing link duration (RUL-03)', source: 'GameEngine.getChainScaledDuration' },
    { id: 'clear.garbage-clear', group: 'clear', layer: 'engine', title: 'Garbage next to a popping group clears with it', source: 'Board.findNeighborGarbage' },
    { id: 'clear.all-clear', group: 'clear', layer: 'engine', title: '"ALL CLEAR!" text and screen shake', source: 'engine.onAllClear -> GameScene' },
    { id: 'clear.hidden-row-pop', group: 'clear', layer: 'engine', title: 'A group reaching into a hidden row pops (RUL-07)', source: 'Board.findMatches' },

    // ── Garbage ──────────────────────────────────────────────────────────────
    { id: 'garbage.receive', group: 'garbage', layer: 'engine', title: 'Incoming garbage fills the damage meter', source: 'GameEngine.addGarbage -> GameScene.drawDamageMeter' },
    { id: 'garbage.meter-danger', group: 'garbage', layer: 'engine', title: 'Damage meter turns red and flashes at 39+ garbage', source: 'GameScene.drawDamageMeter' },
    { id: 'garbage.fall-partial', group: 'garbage', layer: 'engine', title: 'Fewer than six garbage fall into random columns', source: 'GameEngine.handleGarbageFall / handleGarbageAnimation' },
    { id: 'garbage.fall-rows', group: 'garbage', layer: 'engine', title: 'Whole rows of garbage fall', source: 'GameEngine.handleGarbageFall' },
    { id: 'garbage.fall-capped', group: 'garbage', layer: 'engine', title: 'A large attack falls 24 at a time over several turns (RUL-11)', source: 'GameEngine.handleGarbageFall (MAX_ROCKS_PER_TURN)' },
    { id: 'garbage.on-stack', group: 'garbage', layer: 'engine', title: 'Garbage lands on an uneven stack', source: 'GameEngine.handleGarbageFall (per-column destinations)' },
    { id: 'garbage.offset', group: 'garbage', layer: 'engine', title: 'A chain cancels incoming garbage ("OFFSET!")', source: 'engine.onGarbageOffset -> GameScene' },
    { id: 'garbage.send', group: 'garbage', layer: 'engine', title: 'A chain generates an attack ("ATTACK!")', source: 'engine.onGarbageGenerated -> GameScene' },
    { id: 'garbage.large-attack', group: 'garbage', layer: 'engine', title: 'One link sends 15+ garbage (large-attack sound)', source: "engine.onSound('garbageLarge')" },

    // ── End of game ──────────────────────────────────────────────────────────
    { id: 'end.topout-spawn', group: 'end', layer: 'engine', title: 'Top-out: the spawn cell is filled', source: 'GameEngine.spawnPiece (DEATH_ROW)' },
    { id: 'end.topout-lock', group: 'end', layer: 'engine', title: 'Top-out: a pair locks partly above the board', source: 'GameEngine.lockPiece (out of bounds)' },
    { id: 'end.hidden-row-stack', group: 'end', layer: 'engine', title: 'Stacking into the hidden rows without dying (RUL-06)', source: 'GameEngine.lockPiece' },
    { id: 'end.time-up', group: 'end', layer: 'client', title: "Timed mode ends: \"TIME'S UP!\" and the results overlay", source: 'GameScene.update (timeLimit) -> GameOverlay' },

    // ── HUD ──────────────────────────────────────────────────────────────────
    { id: 'hud.score', group: 'hud', layer: 'engine', title: 'Score, max chain and cleared counters update', source: 'GameScene.drawStatsPanel' },
    { id: 'hud.x-marker', group: 'hud', layer: 'client', title: 'The death-cell X marker animates', source: 'GameScene.xMarkerSprite' },
    { id: 'hud.timer', group: 'hud', layer: 'client', title: 'Timed mode countdown, red under 30 s', source: 'GameScene.drawStatsPanel (TIME)' },
    { id: 'hud.pause', group: 'hud', layer: 'client', title: 'Pause overlay opens and closes', source: 'GameScene.togglePause -> PauseScreen' },

    // ── Input layer ──────────────────────────────────────────────────────────
    { id: 'input.das-arr', group: 'input', layer: 'client', title: 'Held direction: one step, DAS delay, then ARR repeats', source: 'GameScene.handleInput' },
    { id: 'input.arr-zero', group: 'input', layer: 'client', title: 'ARR 0: the pair jumps to the wall', source: 'GameScene.handleInput (dx = ±2)' },
    { id: 'input.spawn-das', group: 'input', layer: 'client', title: 'Charged DAS moves a new pair on its spawn frame', source: 'GameScene.update (SPAWN-FRAME INSTANT MOVEMENT)' },
    { id: 'input.tap', group: 'input', layer: 'client', title: 'A key tap shorter than one frame (CLI-11)', source: 'Input.isPressed' },
];

export const ANIMATION_IDS = new Set(ANIMATIONS.map(a => a.id));
