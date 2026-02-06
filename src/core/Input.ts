import { ControlsManager } from './ControlsManager';
import type { GameAction } from './ControlsManager';

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

  constructor() {
    window.addEventListener('keydown', (e) => {
      // Prevent default scrolling for arrow keys
      if (["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", "Space"].indexOf(e.code) > -1) {
        e.preventDefault();
      }
      this.keys[e.code] = true;
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
    return !!this.keys[keyCode] && !this.prevKeys[keyCode];
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
      this.isDown(ControlsManager.getControllerKey(action));
  }

  isActionPressed(action: GameAction): boolean {
    return this.isPressed(ControlsManager.getKey(action)) ||
      this.isPressed(ControlsManager.getControllerKey(action));
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

  update() {
    // 1. Snapshot Previous State
    this.prevKeys = { ...this.keys };
    this.prevPadKeys = { ...this.padKeys };

    // 2. Poll Gamepads
    this.pollGamepads();

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
    const gamepads = navigator.getGamepads ? navigator.getGamepads() : [];
    if (!gamepads) return;

    for (const gp of gamepads) {
      if (!gp) continue;

      // Buttons
      for (let i = 0; i < gp.buttons.length; i++) {
        const btn = gp.buttons[i];
        const code = `GP_${i}`;
        this.padKeys[code] = btn.pressed;
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

export const Input = new InputManager();
