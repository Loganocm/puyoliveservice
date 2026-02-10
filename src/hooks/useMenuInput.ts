import { useEffect } from 'react';
import { Input } from '../core/Input';

interface MenuInputHandlers {
    onBack?: () => void;
    onConfirm?: () => void;
    onUp?: () => void;
    onDown?: () => void;
    onLeft?: () => void;
    onRight?: () => void;
}

export function useMenuInput(handlers: MenuInputHandlers, deps: any[] = []) {
    useEffect(() => {
        let animationFrameId: number;

        const checkInput = () => {
            // Check actions
            // We use isActionPressed for one-shot triggers

            // Back (Escape / B)
            if (handlers.onBack && Input.isActionPressed('menuBack')) {
                handlers.onBack();
            }

            // Confirm (Enter / A)
            if (handlers.onConfirm && Input.isActionPressed('menuConfirm')) {
                handlers.onConfirm();
            }

            // Navigation (D-Pad / Sticks / Arrow Keys)
            // We might want to use isPressed for navigation to allow holding?
            // For now, simple press is safer to avoid scrolling too fast
            // ControlsManager doesn't have 'menuUp' etc, it relies on mapping 'moveLeft' etc?
            // Input.ts maps 'ArrowUp' to 'moveLeft'? No.
            // ControlsManager only has GameActions.
            // Let's assume standard keys for now or extend ControlsManager if usage requires 
            // moving selection. For "Back" specifically, we only need menuBack.

            // If we want complete menu navigation we need 'menuUp', 'menuDown' etc.
            // Input.ts handles raw keys too. 
            // But checking 'ArrowUp' won't check D-Pad Up unless we map it.
            // Input.ts maps specific keys.
            // For now, let's strictly solve the USER REQUEST: "pressing escape... back"

            animationFrameId = requestAnimationFrame(checkInput);
        };

        animationFrameId = requestAnimationFrame(checkInput);

        return () => {
            cancelAnimationFrame(animationFrameId);
        };
    }, deps);
}
