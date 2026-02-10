import React, { useEffect, useRef, useState, useCallback } from 'react';
import { GameEngine } from '../core/GameEngine';
import { APIClient } from '../api/client';
import { PuyoColor, COLS, TOTAL_ROWS, HIDDEN_ROWS } from '../core/Constants';
import { X, Play, Pause } from 'lucide-react';
// Button import removed // Ensure this exists or use HTML button

// Duplicate types since we can't import from server easily
type InputType = 'L' | 'R' | 'CW' | 'CC' | 'SD' | 'SU' | 'HD' | 'G';
interface ReplayInput {
    f: number;
    p: 0 | 1;
    i: InputType;
    a?: number;
}

interface ReplayFile {
    version: 2;
    seed: number;
    players: {
        id: string;
        username: string;
        userId?: number;
        elo?: number;
    }[];
    winner: 0 | 1 | null;
    duration: number;
    fps: number;
    inputs: ReplayInput[];
}

interface ReplayViewerProps {
    matchId: number;
    onClose: () => void;
}

export const ReplayViewer: React.FC<ReplayViewerProps> = ({ matchId, onClose }) => {
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState<string | null>(null);
    const [replayData, setReplayData] = useState<ReplayFile | null>(null);
    const [playing, setPlaying] = useState(true);
    const [speed, setSpeed] = useState(1);
    const [frame, setFrame] = useState(0);
    const [duration, setDuration] = useState(0);

    const canvasRef = useRef<HTMLCanvasElement>(null);
    const requestRef = useRef<number>();
    
    // Engine Refs
    const engine1Ref = useRef<GameEngine | null>(null);
    const engine2Ref = useRef<GameEngine | null>(null);

    // Fetch Replay
    useEffect(() => {
        const fetchReplay = async () => {
            try {
                setLoading(true);
                const data = await APIClient.getReplay(matchId);
                setReplayData(data);
                setDuration(data.duration);
                
                // Init Engines
                engine1Ref.current = new GameEngine(data.seed);
                engine2Ref.current = new GameEngine(data.seed); // Same seed for now, valid if shared RNG?
                // Wait, GameRoom uses ONE seed for both?
                // GameRoom.ts: this.seed = this.matchStats.startedAt.getTime();
                // GameEngine constructor takes seed.
                // If both engines initialized with SAME seed, they will spawn SAME pieces.
                // This is correct match behavior (shared bag usually, or same sequence).
                // Actually Puyo VS usually has shared sequence.

                // Load Inputs
                // Filter inputs for P1 (p=0) and P2 (p=1)
                // Need to change Inputs type in GameEngine if not done
                // GameEngine expects { f, i, a? }[]
                
                const inputs1 = data.inputs.filter((i: ReplayInput) => i.p === 0).map((i: ReplayInput) => ({ f: i.f, i: i.i, a: i.a }));
                const inputs2 = data.inputs.filter((i: ReplayInput) => i.p === 1).map((i: ReplayInput) => ({ f: i.f, i: i.i, a: i.a }));

                engine1Ref.current.loadReplay({ seed: data.seed, inputs: inputs1 });
                engine2Ref.current.loadReplay({ seed: data.seed, inputs: inputs2 });

            } catch (err: any) {
                setError(err.message || "Failed to load replay");
            } finally {
                setLoading(false);
            }
        };
        fetchReplay();
    }, [matchId]);

    // Game Loop
    const tick = useCallback(() => {
        if (!playing || !replayData || !engine1Ref.current || !engine2Ref.current) return;

        // Skip logic based on speed (simple frame skip or multiple updates)
        const updates = Math.floor(speed);
        
        for(let i=0; i<updates; i++) {
            if (frame >= duration) {
                setPlaying(false);
                break;
            }

            engine1Ref.current.update(); // Engine handles replay processing internally if isReplaying=true?
            // Wait, GameEngine.update calls processReplayFrame.
            // But we need to sync frame numbers.
            // GameEngine.frameCount increments on update().
            
            engine2Ref.current.update();
            
            setFrame(f => f + 1);
        }
        
        // Draw
        draw();

        requestRef.current = requestAnimationFrame(tick);
    }, [playing, speed, replayData, frame, duration]);

    useEffect(() => {
        if (playing) {
            requestRef.current = requestAnimationFrame(tick);
        } else {
            draw(); // Draw static frame
        }
        return () => {
            if (requestRef.current) cancelAnimationFrame(requestRef.current);
        };
    }, [playing, speed, tick]);

    // Manual Seek Logic
    const seek = (targetFrame: number) => {
        if (!replayData || !engine1Ref.current || !engine2Ref.current) return;
        
        // Reset and fast forward
        // Inefficient but accurate
        engine1Ref.current.loadReplay({ seed: replayData.seed, inputs: replayData.inputs.filter((i: ReplayInput) => i.p === 0).map((i: ReplayInput) => ({ f: i.f, i: i.i, a: i.a })) });
        engine2Ref.current.loadReplay({ seed: replayData.seed, inputs: replayData.inputs.filter((i: ReplayInput) => i.p === 1).map((i: ReplayInput) => ({ f: i.f, i: i.i, a: i.a })) });

        let range = targetFrame;
        // Batch updates for performance
        while(range > 0) {
            // Safety break
            engine1Ref.current.update();
            engine2Ref.current.update();
            range--;
        }
        setFrame(targetFrame);
        draw();
    };

    const draw = () => {
        const cvs = canvasRef.current;
        if (!cvs) return;
        const ctx = cvs.getContext('2d');
        if (!ctx) return;

        // Clear
        ctx.fillStyle = '#111';
        ctx.fillRect(0, 0, cvs.width, cvs.height);

        if (!engine1Ref.current || !engine2Ref.current) return;

        // Draw Player 1 (Left)
        drawBoard(ctx, engine1Ref.current, 50, 50);

        // Draw Player 2 (Right)
        drawBoard(ctx, engine2Ref.current, 450, 50); 
    };

    const drawBoard = (ctx: CanvasRenderingContext2D, engine: GameEngine, startX: number, startY: number) => {
        // Draw Grid
        // Use ResourceManager textures? Mapping PuyoColor to Image/Canvas Pattern/RGB?
        // Accessing PIXI texture source is hard from 2D Context.
        // Fallback to simple colors for ReplayViewer v1 to save complexity?
        // Or render textures if available as HTMLImageElement.
        
        // Let's use simple colors matching Constants
        const getColor = (c: PuyoColor) => {
            switch(c) {
                case PuyoColor.Red: return '#ff0000';
                case PuyoColor.Green: return '#00ff00';
                case PuyoColor.Blue: return '#0000ff';
                case PuyoColor.Yellow: return '#ffff00';
                case PuyoColor.Purple: return '#800080';
                case PuyoColor.Garbage: return '#888888';
                case PuyoColor.None: return null;
                default: return '#fff';
            }
        };

        const cellSize = 24; // Smaller for replay

        // Draw Board Background
        ctx.fillStyle = '#0008';
        ctx.fillRect(startX, startY, COLS * cellSize, (TOTAL_ROWS - HIDDEN_ROWS) * cellSize);
        ctx.strokeStyle = '#fff';
        ctx.lineWidth = 1;
        ctx.strokeRect(startX, startY, COLS * cellSize, (TOTAL_ROWS - HIDDEN_ROWS) * cellSize);

        // Draw Puyos
        for (let x = 0; x < COLS; x++) {
            for (let y = HIDDEN_ROWS; y < TOTAL_ROWS; y++) {
                const color = engine.board.grid[x][y];
                const c = getColor(color);
                if (c) {
                    ctx.fillStyle = c;
                    ctx.beginPath();
                    ctx.arc(startX + x * cellSize + cellSize/2, startY + (y - HIDDEN_ROWS) * cellSize + cellSize/2, cellSize/2 - 2, 0, Math.PI * 2);
                    ctx.fill();
                }
            }
        }

        // Draw Active Piece
        if (engine.activePiece) {
            const { x, y, mainColor, subColor, rot } = engine.activePiece;
            // const sub = engine.getSubPos(x, y, rot); // Helper available if needed
            // activePiece pos x,y is MAIN.
            // sub pos depends on rot.
            // offsets: 0:(0,-1), 1:(1,0), 2:(0,1), 3:(-1,0)
            const offsets = [{x:0, y:-1}, {x:1, y:0}, {x:0, y:1}, {x:-1, y:0}];
            const sX = x + offsets[rot].x;
            const sY = y + offsets[rot].y;

            const drawPuyo = (px: number, py: number, pc: PuyoColor) => {
                if (py < HIDDEN_ROWS) return; // Don't draw if hidden
                const c = getColor(pc);
                if (c) {
                    ctx.fillStyle = c;
                    ctx.beginPath();
                    ctx.arc(startX + px * cellSize + cellSize/2, startY + (py - HIDDEN_ROWS) * cellSize + cellSize/2, cellSize/2 - 2, 0, Math.PI * 2);
                    ctx.fill();
                    ctx.strokeStyle = '#fff';
                    ctx.lineWidth = 2;
                    ctx.stroke();
                }
            };
            drawPuyo(x, y, mainColor);
            drawPuyo(sX, sY, subColor);
        }

        // Score
        ctx.fillStyle = '#fff';
        ctx.font = '16px Arial';
        ctx.fillText(`Score: ${engine.stats.score}`, startX, startY - 10);
        ctx.fillText(`Chain: ${engine.stats.maxChain}`, startX, startY - 30);
    };

    if (loading) return <div className="fixed inset-0 bg-black/80 flex items-center justify-center text-white">Loading Replay...</div>;
    if (error) return <div className="fixed inset-0 bg-black/80 flex items-center justify-center text-red-500">{error} <button onClick={onClose} className="ml-4 underline">Close</button></div>;

    return (
        <div className="fixed inset-0 z-50 bg-black/90 flex flex-col items-center justify-center">
            {/* Header */}
            <div className="absolute top-4 right-4">
                <button onClick={onClose} className="text-white hover:text-red-500 transition"><X size={32} /></button>
            </div>
            
            <div className="text-white text-xl font-bold mb-4">
                {replayData?.players[0].username} vs {replayData?.players[1].username}
            </div>

            {/* Canvas */}
            <canvas 
                ref={canvasRef} 
                width={800} 
                height={600} 
                className="bg-gray-900 rounded-lg shadow-2xl border border-gray-700"
            />

            {/* Controls */}
            <div className="mt-6 flex items-center gap-4 bg-gray-800 p-4 rounded-full">
                <button onClick={() => setPlaying(!playing)} className="p-2 hover:bg-gray-700 rounded-full transition text-white">
                    {playing ? <Pause /> : <Play />}
                </button>
                
                {/* Seek Bar */}
                <input 
                    type="range" 
                    min={0} 
                    max={duration} 
                    value={frame} 
                    onChange={(e) => {
                        setPlaying(false);
                        seek(parseInt(e.target.value));
                    }}
                    className="w-64 accent-orange-500"
                />
                <span className="text-white font-mono w-20 text-center">{Math.floor(frame/60)}s / {Math.floor(duration/60)}s</span>

                {/* Speed */}
                <select 
                    value={speed} 
                    onChange={(e) => setSpeed(Number(e.target.value))}
                    className="bg-gray-700 text-white rounded px-2 py-1 outline-none"
                >
                    <option value={0.5}>0.5x</option>
                    <option value={1}>1x</option>
                    <option value={2}>2x</option>
                    <option value={4}>4x</option>
                </select>
            </div>
        </div>
    );
};
