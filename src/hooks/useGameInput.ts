import { useEffect, useRef } from 'react';
import { Input } from '@/core/Input';
import type { GameAction } from '@/core/ControlsManager';

export function useGameInput(action: string, callback: () => void) {
    const callbackRef = useRef(callback);

    useEffect(() => {
        callbackRef.current = callback;
    }, [callback]);

    useEffect(() => {
        let animationFrameId: number;

        const checkInput = () => {
            // Poll the Input singleton
            // We assume Input.update() is being called by the main Game Loop
            if (Input.isActionPressed(action as GameAction)) {
                callbackRef.current();
            }
            animationFrameId = requestAnimationFrame(checkInput);
        };

        animationFrameId = requestAnimationFrame(checkInput);

        return () => {
            cancelAnimationFrame(animationFrameId);
        };
    }, [action]);
}
