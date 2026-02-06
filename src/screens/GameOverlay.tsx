import { useState, useEffect } from 'react';
import { AnimatePresence } from 'motion/react';
import { GameEvents } from '../core/GameEvents';
import { GameOverScreen } from './GameOverScreen';
import { PauseScreen } from './PauseScreen';
import { SceneManager } from '../core/SceneManager';
import { GameScene } from '../scenes/GameScene';
import { XpCalculator } from '../core/XpCalculator';
import { AuthManager } from '../core/AuthManager';

interface GameOverlayProps {
    onBack: () => void;
    onQueueAgain?: () => void;
}

interface GameOverState {
    score: number;
    message: string;
    isTimeTrial: boolean;
    maxChain: number;
    puyosCleared: number;
    timeLimit: number;
    isMultiplayer: boolean;
    xpGained?: number;
}

export function GameOverlay({ onBack, onQueueAgain }: GameOverlayProps) {
    const [isPaused, setIsPaused] = useState(false);
    const [gameOverState, setGameOverState] = useState<GameOverState | null>(null);
    const [pauseTimeLimit, setPauseTimeLimit] = useState(0); // Track time limit for pause restart

    useEffect(() => {
        const handleExitGame = () => {
            setIsPaused(false);
            setGameOverState(null);
            onBack();
        };

        const handleGameOver = (data: {
            score: number;
            message: string;
            isTimeTrial?: boolean;
            maxChain?: number;
            puyosCleared?: number;
            timeLimit?: number;
            isMultiplayer?: boolean;
        }) => {
            setIsPaused(false);
            setGameOverState({
                score: data.score,
                message: data.message,
                isTimeTrial: data.isTimeTrial || false,
                maxChain: data.maxChain || 0,
                puyosCleared: data.puyosCleared || 0,
                timeLimit: data.timeLimit || 0,
                isMultiplayer: data.isMultiplayer || false,
                xpGained: !AuthManager.isGuest 
                    ? (data.isMultiplayer 
                        ? undefined // Wait for match_result from server
                        : XpCalculator.calculateSingleplayerXp(data.score))
                    : undefined
            });
        };

        const handlePause = (data: { timeLimit: number }) => {
            setIsPaused(true);
            setPauseTimeLimit(data.timeLimit); // Store time limit for restart
        };

        const handleResumeEvent = () => {
            setIsPaused(false);
        };

        const handleMatchResult = (data: { xp_gained: number }) => {
            setGameOverState(prev => {
                // If we are on the game over screen, update the XP
                if (prev) {
                    return {
                        ...prev,
                        xpGained: data.xp_gained
                    };
                }
                return prev;
            });
        };

        GameEvents.on('exit_game', handleExitGame);
        GameEvents.on('game_over', handleGameOver);
        GameEvents.on('game_pause', handlePause);
        GameEvents.on('game_resume', handleResumeEvent);
        GameEvents.on('match_result', handleMatchResult);

        return () => {
            GameEvents.off('exit_game', handleExitGame);
            GameEvents.off('game_over', handleGameOver);
            GameEvents.off('game_pause', handlePause);
            GameEvents.off('game_resume', handleResumeEvent);
            GameEvents.off('match_result', handleMatchResult);
        };
    }, [onBack]);

    const handleRestart = () => {
        // If multiplayer and onQueueAgain provided, use that instead of restart
        if (gameOverState?.isMultiplayer && onQueueAgain) {
            setGameOverState(null);
            setIsPaused(false);
            onQueueAgain();
            return;
        }

        // Get current game settings from game over state
        const timeLimit = gameOverState?.timeLimit || 0;
        setGameOverState(null);
        setIsPaused(false);
        
        // Create new game with same settings
        SceneManager.changeScene(new GameScene(undefined, timeLimit));
    };

    const handleExit = () => {
        setGameOverState(null);
        setIsPaused(false);
        // Call onBack to update React screen state AND change scene
        onBack();
    };

    const handleResume = () => {
        setIsPaused(false);
        GameEvents.emit('game_resume');
    };

    const handlePauseRestart = () => {
        setIsPaused(false);
        // Use the stored time limit from when pause was triggered
        SceneManager.changeScene(new GameScene(undefined, pauseTimeLimit));
    };

    return (
        <AnimatePresence>
            {gameOverState && (
                <GameOverScreen
                    score={gameOverState.score}
                    message={gameOverState.message}
                    isTimeTrial={gameOverState.isTimeTrial}
                    maxChain={gameOverState.maxChain}
                    puyosCleared={gameOverState.puyosCleared}
                    onRestart={handleRestart}
                    onExit={handleExit}
                    isMultiplayer={gameOverState.isMultiplayer}
                    xpGained={gameOverState.xpGained}
                />
            )}
            {isPaused && !gameOverState && (
                <PauseScreen
                    onResume={handleResume}
                    onRestart={handlePauseRestart}
                    onExit={handleExit}
                />
            )}
        </AnimatePresence>
    );
}
