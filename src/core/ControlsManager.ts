export type GameAction = 'moveLeft' | 'moveRight' | 'softDrop' | 'hardDrop' | 'rotateCCW' | 'rotateCW' | 'pause';

interface KeyBindings {
    moveLeft: string;
    moveRight: string;
    softDrop: string;
    hardDrop: string;
    rotateCCW: string;
    rotateCW: string;
    pause: string;
}

interface ControllerBindings {
    moveLeft: string;
    moveRight: string;
    softDrop: string;
    hardDrop: string;
    rotateCCW: string;
    rotateCW: string;
    pause: string;
}

// Map button index to standarized name (Gamepad API Standard Mapping)
// 0: A/Cross, 1: B/Circle, 2: X/Square, 3: Y/Triangle
// 12: Dpad Up, 13: Dpad Down, 14: Dpad Left, 15: Dpad Right
export const GP_BUTTONS = {
    A: 'GP_0',
    B: 'GP_1',
    X: 'GP_2',
    Y: 'GP_3',
    LB: 'GP_4',
    RB: 'GP_5',
    LT: 'GP_6',
    RT: 'GP_7',
    UP: 'GP_12',
    DOWN: 'GP_13',
    LEFT: 'GP_14',
    RIGHT: 'GP_15'
};

export class ControlsManager {
    private static bindings: KeyBindings = {
        moveLeft: 'ArrowLeft',
        moveRight: 'ArrowRight',
        softDrop: 'ArrowDown',
        hardDrop: 'Space',
        rotateCCW: 'KeyZ',
        rotateCW: 'KeyX',
        pause: 'Escape'
    };

    private static readonly DEFAULT_BINDINGS: KeyBindings = {
        moveLeft: 'ArrowLeft',
        moveRight: 'ArrowRight',
        softDrop: 'ArrowDown',
        hardDrop: 'Space',
        rotateCCW: 'KeyZ',
        rotateCW: 'KeyX',
        pause: 'Escape'
    };

    private static controllerBindings: ControllerBindings = {
        moveLeft: 'GP_14', // D-Pad Left
        moveRight: 'GP_15', // D-Pad Right
        softDrop: 'GP_13', // D-Pad Down
        hardDrop: 'GP_3',  // Y (Xbox) / Triangle (PS)
        rotateCCW: 'GP_1', // B (Xbox) / Circle (PS)
        rotateCW: 'GP_0',  // A (Xbox) / Cross (PS)
        pause: 'GP_9'      // Start (Xbox/PS)
    };

    private static readonly DEFAULT_CONTROLLER_BINDINGS: ControllerBindings = {
        moveLeft: 'GP_14',
        moveRight: 'GP_15',
        softDrop: 'GP_13',
        hardDrop: 'GP_3',  // Y (Xbox) / Triangle (PS)
        rotateCCW: 'GP_1',
        rotateCW: 'GP_0',
        pause: 'GP_9'      // Start (Xbox/PS)
    };

    public static getKey(action: GameAction): string {
        return this.bindings[action];
    }

    public static getControllerKey(action: GameAction): string {
        return this.controllerBindings[action];
    }

    public static setKey(action: GameAction, keyCode: string): boolean {
        // Check if this key is already bound to another action
        for (const [existingAction, existingKey] of Object.entries(this.bindings)) {
            if (existingKey === keyCode && existingAction !== action) {
                // Steal the binding!
                console.log(`Rebinding: Stealing ${keyCode} from ${existingAction}`);
                this.bindings[existingAction as GameAction] = '';
                // Proceed to bind new action
            }
        }

        this.bindings[action] = keyCode;
        this.save();
        return true;
    }

    public static setControllerKey(action: GameAction, buttonCode: string): boolean {
        // Allow duplicates for controller? Maybe not.
        // Check overlap
        for (const [existingAction, existingKey] of Object.entries(this.controllerBindings)) {
            if (existingKey === buttonCode && existingAction !== action) {
                // Steal binding
                this.controllerBindings[existingAction as GameAction] = '';
            }
        }
        this.controllerBindings[action] = buttonCode;
        this.save();
        return true;
    }

    public static getAllBindings(): KeyBindings {
        return { ...this.bindings };
    }

    public static resetToDefaults(): void {
        this.bindings = { ...this.DEFAULT_BINDINGS };
        this.controllerBindings = { ...this.DEFAULT_CONTROLLER_BINDINGS };
        this.save();
    }

    public static save(): void {
        localStorage.setItem('puyolive_controls', JSON.stringify(this.bindings));
        localStorage.setItem('puyolive_controller_bindings', JSON.stringify(this.controllerBindings));
    }

    public static load(): void {
        const data = localStorage.getItem('puyolive_controls');
        if (data) {
            try {
                const parsed = JSON.parse(data);
                // Merge with defaults to ensure new keys (like 'pause') exist even if local storage is old
                this.bindings = { ...this.DEFAULT_BINDINGS, ...parsed };
            } catch (e) {
                console.error('Failed to load controls:', e);
            }
        }

        const cData = localStorage.getItem('puyolive_controller_bindings');
        if (cData) {
            try {
                const parsed = JSON.parse(cData);
                // Merge with defaults to ensure new keys exist
                this.controllerBindings = { ...this.DEFAULT_CONTROLLER_BINDINGS, ...parsed };
            } catch (e) {
                console.error('Failed to load controller bindings:', e);
            }
        }
    }

    // Get a readable name for a key code
    public static getKeyName(keyCode: string): string {
        if (!keyCode || keyCode === '') return '---';

        const keyMap: { [key: string]: string } = {
            'ArrowLeft': '←',
            'ArrowRight': '→',
            'ArrowUp': '↑',
            'ArrowDown': '↓',
            'Space': 'Space',
            'KeyZ': 'Z',
            'KeyX': 'X',
            'KeyA': 'A',
            'KeyS': 'S',
            'KeyD': 'D',
            'KeyW': 'W',
            'Shift': 'Shift',
            'Control': 'Ctrl',
            'Alt': 'Alt',
            'Enter': 'Enter',
            'Escape': 'Esc'
        };

        if (keyCode.startsWith('GP_')) {
            const btnIndex = parseInt(keyCode.replace('GP_', ''));
            const gpMap: { [key: number]: string } = {
                0: 'A', 1: 'B', 2: 'X', 3: 'Y',
                4: 'LB', 5: 'RB', 6: 'LT', 7: 'RT',
                8: 'Back', 9: 'Start',
                12: 'D-Up', 13: 'D-Down', 14: 'D-Left', 15: 'D-Right'
            };
            return gpMap[btnIndex] || `Btn ${btnIndex}`;
        }

        return keyMap[keyCode] || keyCode.replace('Key', '');
    }

    // Get action name for display
    public static getActionName(action: GameAction): string {
        const actionNames: { [key in GameAction]: string } = {
            moveLeft: 'Move Left',
            moveRight: 'Move Right',
            softDrop: 'Soft Drop',
            hardDrop: 'Hard Drop',
            rotateCCW: 'Rotate CCW',
            rotateCW: 'Rotate CW',
            pause: 'Pause'
        };

        return actionNames[action];
    }

    public static getDefaultKey(action: GameAction): string {
        return this.DEFAULT_BINDINGS[action];
    }

    public static getDefaultControllerKey(action: GameAction): string {
        return this.DEFAULT_CONTROLLER_BINDINGS[action];
    }

    public static getAllControllerBindings(): ControllerBindings {
        return { ...this.controllerBindings };
    }
}

// Load on startup
ControlsManager.load();
