import { ControlsManager } from './ControlsManager';
import type { GameAction } from './ControlsManager';
import { PLAY_ACTIONS } from '../input/Handling';
import type { FrameInput, PlayAction } from '../input/Handling';

/**
 * Keyboard and gamepad state.
 *
 * Presses are LATCHED: a key-down is remembered until something reads it,
 * even if the key is already up again. Two latches serve two clocks:
 *
 *   - the frame latch, cleared by update() after every rendered frame, backs
 *     isPressed()/isActionPressed() for menus and scene-level keys;
 *   - the play latch, cleared by consumePlay() once per LOGICAL frame, feeds
 *     piece handling (src/input/Handling.ts).
 *
 * Before this, "pressed" meant "down now and not down at the last rendered
 * frame", so a tap that went down and up between two frames was never seen
 * (CLI-11), and gameplay input was tied to the monitor's refresh rate.
 */
export class InputManager {
  private keys: { [key: string]: boolean } = {};
  // Previous frame key state
  private prevKeys: { [key: string]: boolean } = {};
  // How long a key has been held (in frames/ticks)
  private keyDuration: { [key: string]: number } = {};

  // Store active gamepad button states 'GP_X' -> boolean
  private padKeys: { [key: string]: boolean } = {};
  private prevPadKeys: { [key: string]: boolean } = {};
  private padDuration: { [key: string]: number } = {};

  // Stick Deadzone
  private readonly DEADZONE = 0.5;

  /** Codes pressed since the last rendered frame. */
  private readonly frameLatch = new Set<string>();
  /** Codes pressed since the last logical frame consumed them. */
  private readonly playLatch = new Set<string>();
  private readonly playPressed = new Set<PlayAction>();
  private readonly playHeld = new Set<PlayAction>();
  /** Actions held on on-screen buttons. */
  private readonly virtualHeld = new Set<GameAction>();
  private readonly playInput: FrameInput = { pressed: this.playPressed, held: this.playHeld };

  constructor() {
    window.addEventListener('keydown', (e) => {
      // Prevent default scrolling for arrow keys
      if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Space"].indexOf(e.code) > -1) {
        e.preventDefault();
      }
      this.keys[e.code] = true;
      // Auto-repeat is the OS's, not the player's: handling has its own DAS.
      if (!e.repeat) {
        this.frameLatch.add(e.code);
        this.playLatch.add(e.code);
      }
    });

    window.addEventListener('keyup', (e) => {
      this.keys[e.code] = false;
    });

    window.addEventListener("gamepadconnected", (e) => {
      console.log("Gamepad connected at index %d: %s. %d buttons, %d axes.",
        e.gamepad.index, e.gamepad.id,
        e.gamepad.buttons.length, e.gamepad.axes.length);
    });
  }

  // --- Core State Checks ---

  isDown(keyCode: string): boolean {
    if (keyCode.startsWith('GP_')) {
      return !!this.padKeys[keyCode];
    }
    return !!this.keys[keyCode];
  }

  // Returns true only on the frame it was initially pressed
  isPressed(keyCode: string): boolean {
    if (keyCode.startsWith('GP_')) {
      return !!this.padKeys[keyCode] && !this.prevPadKeys[keyCode];
    }
    return this.frameLatch.has(keyCode);
  }

  // Returns the duration (in ticks) the key has been held
  getDuration(keyCode: string): number {
    if (keyCode.startsWith('GP_')) {
      return this.padDuration[keyCode] || 0;
    }
    return this.keyDuration[keyCode] || 0;
  }

  // --- Abstract Action Checks (Keyboard OR Controller) ---

  isActionDown(action: GameAction): boolean {
    return this.isDown(ControlsManager.getKey(action)) ||
      this.isDown(ControlsManager.getControllerKey(action)) ||
      this.virtualHeld.has(action);
  }

  isActionPressed(action: GameAction): boolean {
    return this.isPressed(ControlsManager.getKey(action)) ||
      this.isPressed(ControlsManager.getControllerKey(action)) ||
      this.frameLatch.has(virtualCode(action));
  }

  // --- Virtual buttons (touch controls) ---

  /**
   * Press an action from an on-screen button. Latched exactly like a key, so
   * a quick tap is never lost, and held until releaseVirtual().
   */
  pressVirtual(action: GameAction): void {
    if (this.virtualHeld.has(action)) return;
    this.virtualHeld.add(action);
    this.frameLatch.add(virtualCode(action));
    this.playLatch.add(virtualCode(action));
  }

  releaseVirtual(action: GameAction): void {
    this.virtualHeld.delete(action);
  }

  /** Release every on-screen button, e.g. when the controls unmount. */
  releaseAllVirtual(): void {
    this.virtualHeld.clear();
  }

  getActionDuration(action: GameAction): number {
    const keyDur = this.getDuration(ControlsManager.getKey(action));
    if (keyDur > 0) return keyDur;

    return this.getDuration(ControlsManager.getControllerKey(action));
  }

  // Reset DAS timing for movement keys (called when a new piece spawns)
  resetMovementDAS() {
    const actions: GameAction[] = ['moveLeft', 'moveRight'];

    actions.forEach(action => {
      // Keyboard
      const key = ControlsManager.getKey(action);
      if (this.keys[key]) {
        this.prevKeys[key] = false;
        this.keyDuration[key] = 0;
      }

      // Controller
      const padKey = ControlsManager.getControllerKey(action);
      if (this.padKeys[padKey]) {
        this.prevPadKeys[padKey] = false;
        this.padDuration[padKey] = 0;
      }
    });
  }

  /**
   * Input for one logical frame of play: every play action pressed since the
   * previous call, and every one held now. Clears the play latch. The
   * returned object is reused; read it before the next call.
   */
  consumePlay(): FrameInput {
    this.playPressed.clear();
    this.playHeld.clear();
    for (const action of PLAY_ACTIONS) {
      const key = ControlsManager.getKey(action);
      const pad = ControlsManager.getControllerKey(action);
      if (this.playLatch.has(key) || this.playLatch.has(pad) || this.playLatch.has(virtualCode(action))) this.playPressed.add(action);
      if (this.keys[key] || this.padKeys[pad] || this.virtualHeld.has(action)) this.playHeld.add(action);
    }
    this.playLatch.clear();
    return this.playInput;
  }

  /** Drop presses nobody has read yet, e.g. menu keys, when a game starts or resumes. */
  discardPlay(): void {
    this.playLatch.clear();
  }

  update() {
    // 1. Snapshot Previous State
    this.prevKeys = { ...this.keys };
    this.prevPadKeys = { ...this.padKeys };
    this.frameLatch.clear();

    // 2. Poll Gamepads, latching buttons that went down since the last poll.
    this.pollGamepads();
    for (const code in this.padKeys) {
      if (this.padKeys[code] && !this.prevPadKeys[code]) this.playLatch.add(code);
    }

    // 3. Update Durations (Keyboard)
    for (const key in this.keys) {
      if (this.keys[key]) {
        this.keyDuration[key] = (this.keyDuration[key] || 0) + 1;
      } else {
        this.keyDuration[key] = 0;
      }
    }

    // 4. Update Durations (Gamepad)
    for (const key in this.padKeys) {
      if (this.padKeys[key]) {
        this.padDuration[key] = (this.padDuration[key] || 0) + 1;
      } else {
        this.padDuration[key] = 0;
      }
    }
  }

  private pollGamepads() {
    // Reset gamepad state for this frame to avoid sticky keys if controller disconnected
    this.padKeys = {};

    const gamepads = navigator.getGamepads ? navigator.getGamepads() : [];
    if (!gamepads) return;

    for (const gp of gamepads) {
      if (!gp) continue;

      // Buttons
      for (let i = 0; i < gp.buttons.length; i++) {
        const btn = gp.buttons[i];
        const code = `GP_${i}`;
        // Use OR logic so if *any* controller presses it, it registers
        if (btn.pressed) {
          this.padKeys[code] = true;
        }
      }

      // Analog Sticks -> D-Pad Mapping (Left Stick)
      // Axis 0: Left(-1) to Right(1)
      // Axis 1: Up(-1) to Down(1)
      const axisX = gp.axes[0];
      const axisY = gp.axes[1];

      // Map Stick to Virtual D-Pad Buttons
      // Note: We use OR logic so real D-Pad + Stick both work
      if (Math.abs(axisX) > this.DEADZONE) {
        if (axisX < -this.DEADZONE) this.padKeys['GP_14'] = true; // Stick Left -> D-Left
        if (axisX > this.DEADZONE) this.padKeys['GP_15'] = true;  // Stick Right -> D-Right
      }
      if (Math.abs(axisY) > this.DEADZONE) {
        if (axisY < -this.DEADZONE) this.padKeys['GP_12'] = true; // Stick Up -> D-Up
        if (axisY > this.DEADZONE) this.padKeys['GP_13'] = true;  // Stick Down -> D-Down
      }
    }
  }

  // --- UI Helper ---
  public getLastPressedButton(): string | null {
    for (const key in this.padKeys) {
      // If pressed this frame AND wasn't pressed last frame
      if (this.padKeys[key] && !this.prevPadKeys[key]) {
        return key;
      }
    }
    return null;
  }
}

/** The latch code for an on-screen button; cannot collide with a KeyboardEvent.code or a GP_ code. */
function virtualCode(action: GameAction): string {
  return `VK_${action}`;
}

export const Input = new InputManager();
