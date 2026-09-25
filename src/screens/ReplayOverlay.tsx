import React, { useEffect, useState, useRef, useCallback } from "react";
import { Play, Pause, FastForward, Rewind, X } from "lucide-react";
import { GameEvents } from "../core/GameEvents";
import { useMenuInput } from "../hooks/useMenuInput";

interface ReplayOverlayProps {
  onExit: () => void;
}

export const ReplayOverlay: React.FC<ReplayOverlayProps> = ({ onExit }) => {
  const [isPlaying, setIsPlaying] = useState(true);
  const [currentFrame, setCurrentFrame] = useState(0);
  const [totalFrames, setTotalFrames] = useState(1);
  const [speed, setSpeed] = useState(1);
  const [uiVisible, setUiVisible] = useState(true);
  const [isLoaded, setIsLoaded] = useState(false);
  const [matchResult, setMatchResult] = useState<{ winner: string } | null>(null);
  const hideTimeoutRef = useRef<ReturnType<typeof setTimeout>>();

  // Refs for stable closures in keyboard/mouse handlers
  const currentFrameRef = useRef(0);
  const totalFramesRef = useRef(1);
  const isPlayingRef = useRef(true);

  // Stable event handler — never re-registered
  useEffect(() => {
    const handleUpdate = (data: {
      currentFrame: number;
      totalFrames: number;
      isPaused: boolean;
      speed: number;
      isLoaded?: boolean; // Optional for backward compatibility with older events momentarily
    }) => {
      setCurrentFrame(data.currentFrame);
      setTotalFrames(data.totalFrames);
      setIsPlaying(!data.isPaused);
      setSpeed(data.speed);

      if (data.isLoaded !== undefined) {
        setIsLoaded(data.isLoaded);
      }

      currentFrameRef.current = data.currentFrame;
      totalFramesRef.current = data.totalFrames;
      isPlayingRef.current = !data.isPaused;
    };

    const handleLoaded = () => {
      setIsLoaded(true);
    };

    GameEvents.on("replay_update", handleUpdate);
    GameEvents.on("replay_loaded", handleLoaded);
    
    const handleMatchResult = (data: { winner: string }) => {
      setMatchResult(data);
    };
    
    const handleMatchResultClear = () => {
      setMatchResult(null);
    };

    GameEvents.on("replay_match_result", handleMatchResult);
    GameEvents.on("replay_match_result_clear", handleMatchResultClear);

    return () => {
      GameEvents.off("replay_update", handleUpdate);
      GameEvents.off("replay_loaded", handleLoaded);
      GameEvents.off("replay_match_result", handleMatchResult);
      GameEvents.off("replay_match_result_clear", handleMatchResultClear);
    };
  }, []);

  // Auto-hide UI
  useEffect(() => {
    const resetHideTimer = () => {
      setUiVisible(true);
      if (hideTimeoutRef.current) clearTimeout(hideTimeoutRef.current);
      hideTimeoutRef.current = setTimeout(() => setUiVisible(false), 3000);
    };

    window.addEventListener("mousemove", resetHideTimer);
    resetHideTimer();

    return () => {
      window.removeEventListener("mousemove", resetHideTimer);
      if (hideTimeoutRef.current) clearTimeout(hideTimeoutRef.current);
    };
  }, []);

  // Keyboard controls — uses refs, never needs re-registration
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === "Escape") {
        onExit();
        return;
      }
      if (e.code === "Space") {
        e.preventDefault();
        if (isPlayingRef.current) {
          GameEvents.emit("replay_control", { action: "pause" });
        } else {
          GameEvents.emit("replay_control", { action: "play" });
        }
      }
      if (e.code === "ArrowRight") {
        GameEvents.emit("replay_control", {
          action: "seek",
          value: Math.min(
            totalFramesRef.current,
            currentFrameRef.current + 300,
          ),
        });
      }
      if (e.code === "ArrowLeft") {
        GameEvents.emit("replay_control", {
          action: "seek",
          value: Math.max(0, currentFrameRef.current - 300),
        });
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onExit]);

  const handleExit = useCallback(() => {
    // All exit paths use the same handler
    GameEvents.emit("replay_control", { action: "exit" });
    onExit();
  }, [onExit]);

  useMenuInput(
    {
      onBack: handleExit,
    },
    [handleExit],
  );

  const sendControl = useCallback(
    (action: "play" | "pause" | "seek" | "speed" | "exit", value?: number) => {
      GameEvents.emit("replay_control", { action, value });
      if (action === "exit") onExit();
    },
    [onExit],
  );

  // Seeking is instant (snapshot-based) — no debounce needed
  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const frame = parseInt(e.target.value);
    setCurrentFrame(frame);
    sendControl("seek", frame);
  };

  const togglePlay = () => {
    if (isPlaying) sendControl("pause");
    else sendControl("play");
  };

  const formatFrameTime = (frame: number): string => {
    const totalSeconds = Math.floor(frame / 60);
    const m = Math.floor(totalSeconds / 60);
    const s = totalSeconds % 60;
    return `${m}:${s.toString().padStart(2, "0")}`;
  };

  // Loading state
  if (!isLoaded) {
    return (
      <div className="fixed inset-0 flex items-center justify-center bg-black/80 z-50">
        <div className="text-center">
          <div className="text-white text-2xl font-bold tracking-wider font-mono mb-4">
            LOADING REPLAY
          </div>
          <div className="w-64 h-2 bg-white/20 rounded-full overflow-hidden">
            <div
              className="h-full bg-orange-500 rounded-full animate-pulse"
              style={{ width: "100%" }}
            />
          </div>
        </div>
      </div>
    );
  }

  return (
    <div
      className={`fixed inset-0 pointer-events-none transition-opacity duration-300 ${uiVisible ? "opacity-100" : "opacity-0"}`}
    >
      {/* Header / Top Bar */}
      <div className="absolute top-0 left-0 w-full p-6 flex justify-between items-start pointer-events-auto z-50 bg-gradient-to-b from-black/80 to-transparent">
        <div>
          <h2 className="text-white text-2xl font-bold tracking-wider font-mono">
            REPLAY VIEWER
          </h2>
          <div className="text-white/60 text-sm">Competitive Mode</div>
        </div>
        <button
          onClick={handleExit}
          aria-label="Close replay"
          className="bg-white/10 hover:bg-white/20 p-2 rounded-full text-white transition-colors"
        >
          <X size={32} />
        </button>
      </div>

      {/* Match Result Overlay */}
      {matchResult && (
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none z-30 animate-in fade-in zoom-in duration-500" style={{ background: 'radial-gradient(circle, rgba(0,0,0,0.6) 0%, rgba(0,0,0,0.8) 100%)' }}>
          <div
            className="rounded-3xl p-12 backdrop-blur-xl text-center transform scale-110 pointer-events-auto shadow-2xl"
            style={{
              background: 'linear-gradient(135deg, rgba(20,20,30,0.8), rgba(10,10,20,0.9))',
              border: '2px solid rgba(78, 255, 78, 0.4)',
              boxShadow: '0 0 80px rgba(78, 255, 78, 0.2), 0 25px 50px rgba(0,0,0,0.8)',
            }}
          >
            <h1
              className="text-6xl font-black mb-4 tracking-wider"
              style={{
                color: '#4eff4e',
                textShadow: '0 0 40px rgba(78, 255, 78, 0.8)',
              }}
            >
              WINNER
            </h1>
            <p className="text-4xl font-bold text-white tracking-widest uppercase">
              {matchResult.winner}
            </p>
          </div>
        </div>
      )}

      {/* Bottom Controls */}
      <div className="absolute bottom-0 left-0 w-full p-8 pb-12 pointer-events-auto z-50 bg-gradient-to-t from-black/90 via-black/60 to-transparent">
        <div className="max-w-4xl mx-auto flex flex-col gap-4">
          {/* Timeline */}
          <div className="flex items-center gap-4">
            <span className="text-white font-mono w-16 text-right">
              {formatFrameTime(currentFrame)}
            </span>
            <div className="relative flex-1 group">
              <div className="relative h-2 w-full">
                {/* Track background */}
                <div className="absolute inset-0 bg-white/20 rounded-full" />
                {/* Orange progress fill */}
                <div
                  className="absolute top-0 left-0 h-full bg-orange-500 rounded-full pointer-events-none"
                  style={{
                    width:
                      totalFrames > 0
                        ? `${(currentFrame / totalFrames) * 100}%`
                        : "0%",
                  }}
                />
                {/* Range input */}
                <input
                  type="range"
                  min={0}
                  max={totalFrames}
                  value={currentFrame}
                  onChange={handleSeek}
                  className="absolute inset-0 w-full h-full appearance-none cursor-pointer bg-transparent [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-5 [&::-webkit-slider-thumb]:h-5 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-orange-500 [&::-webkit-slider-thumb]:border-2 [&::-webkit-slider-thumb]:border-white [&::-webkit-slider-thumb]:shadow-[0_0_6px_rgba(0,0,0,0.5)] [&::-webkit-slider-thumb]:transition-transform group-hover:[&::-webkit-slider-thumb]:scale-125"
                />
              </div>
            </div>
            <span className="text-white/60 font-mono w-16">
              {formatFrameTime(totalFrames)}
            </span>
          </div>

          {/* Controls Row */}
          <div className="flex justify-between items-center px-4">
            {/* Speed Controls */}
            <div className="flex items-center gap-2">
              <span className="text-white/40 text-xs font-bold uppercase mr-2">
                Speed
              </span>
              {[0.5, 1, 2, 4].map((s) => (
                <button
                  key={s}
                  onClick={() => sendControl("speed", s)}
                  className={`px-2 py-1 rounded text-sm font-bold transition-all ${speed === s ? "bg-orange-500 text-black" : "bg-white/10 text-white hover:bg-white/20"}`}
                >
                  {s}x
                </button>
              ))}
            </div>

            {/* Main Playback */}
            <div className="flex items-center gap-6">
              <button
                onClick={() =>
                  sendControl("seek", Math.max(0, currentFrame - 300))
                }
                className="text-white/60 hover:text-white transition-colors"
              >
                <Rewind size={24} />
              </button>

              <button
                onClick={togglePlay}
                aria-label={isPlaying ? "Pause replay" : "Play replay"}
                className="w-16 h-16 bg-white rounded-full flex items-center justify-center text-black hover:scale-105 transition-transform shadow-[0_0_20px_rgba(255,255,255,0.4)]"
              >
                {isPlaying ? (
                  <Pause fill="black" size={32} />
                ) : (
                  <Play fill="black ml-1" size={32} />
                )}
              </button>

              <button
                onClick={() =>
                  sendControl("seek", Math.min(totalFrames, currentFrame + 300))
                }
                className="text-white/60 hover:text-white transition-colors"
              >
                <FastForward size={24} />
              </button>
            </div>

            {/* Extra (Spacer) */}
            <div className="w-[200px]"></div>
          </div>
        </div>
      </div>
    </div>
  );
};
