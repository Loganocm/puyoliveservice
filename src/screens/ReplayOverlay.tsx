import React, { useEffect, useState, useRef, useCallback } from "react";
import { Play, Pause, FastForward, Rewind, X } from "lucide-react";
import { GameEvents } from "../core/GameEvents";

interface ReplayOverlayProps {
  onExit: () => void;
}

export const ReplayOverlay: React.FC<ReplayOverlayProps> = ({ onExit }) => {
  const [isPlaying, setIsPlaying] = useState(true);
  const [currentFrame, setCurrentFrame] = useState(0);
  const [totalFrames, setTotalFrames] = useState(1);
  const [speed, setSpeed] = useState(1);
  const [uiVisible, setUiVisible] = useState(true);
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
    }) => {
      setCurrentFrame(data.currentFrame);
      setTotalFrames(data.totalFrames);
      setIsPlaying(!data.isPaused);
      setSpeed(data.speed);
      currentFrameRef.current = data.currentFrame;
      totalFramesRef.current = data.totalFrames;
      isPlayingRef.current = !data.isPaused;
    };

    GameEvents.on("replay_update", handleUpdate);

    return () => {
      GameEvents.off("replay_update", handleUpdate);
    };
  }, []);

  // Auto-hide UI
  useEffect(() => {
    const resetHideTimer = () => {
      setUiVisible(true);
      if (hideTimeoutRef.current) clearTimeout(hideTimeoutRef.current);
      hideTimeoutRef.current = setTimeout(() => {
        if (isPlayingRef.current) setUiVisible(false);
      }, 3000);
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
      if (e.code === "Space") {
        e.preventDefault();
        if (isPlayingRef.current) {
          GameEvents.emit("replay_control", { action: "pause" });
        } else {
          GameEvents.emit("replay_control", { action: "play" });
        }
      } else if (e.code === "ArrowRight") {
        e.preventDefault();
        GameEvents.emit("replay_control", {
          action: "seek",
          value: Math.min(
            totalFramesRef.current,
            currentFrameRef.current + 180,
          ),
        });
      } else if (e.code === "ArrowLeft") {
        e.preventDefault();
        GameEvents.emit("replay_control", {
          action: "seek",
          value: Math.max(0, currentFrameRef.current - 180),
        });
      } else if (e.code === "Escape") {
        e.preventDefault();
        GameEvents.emit("replay_control", { action: "exit" });
        onExit();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [onExit]);

  const sendControl = useCallback(
    (action: "play" | "pause" | "seek" | "speed" | "exit", value?: number) => {
      GameEvents.emit("replay_control", { action, value });
      if (action === "exit") onExit();
    },
    [onExit],
  );

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const frame = parseInt(e.target.value);
    setCurrentFrame(frame);
    sendControl("seek", frame);
  };

  const togglePlay = () => {
    if (isPlaying) sendControl("pause");
    else sendControl("play");
  };

  const formatFrameTime = (f: number) => {
    const totalSeconds = Math.floor(f / 60);
    const m = Math.floor(totalSeconds / 60);
    const s = totalSeconds % 60;
    return `${m}:${s.toString().padStart(2, "0")}`;
  };

  return (
    <div
      className={`fixed inset-0 pointer-events-none transition-opacity duration-300 ${uiVisible ? "opacity-100" : "opacity-0"}`}
    >
      {/* Header / Top Bar */}
      <div className="absolute top-0 left-0 w-full p-6 flex justify-between items-start pointer-events-auto bg-gradient-to-b from-black/80 to-transparent">
        <div>
          <h2 className="text-white text-2xl font-bold tracking-wider font-mono">
            REPLAY VIEWER
          </h2>
          <div className="text-white/60 text-sm">Competitive Mode</div>
        </div>
        <button
          onClick={() => sendControl("exit")}
          className="bg-white/10 hover:bg-white/20 p-2 rounded-full text-white transition-colors"
        >
          <X size={32} />
        </button>
      </div>

      {/* Bottom Controls */}
      <div className="absolute bottom-0 left-0 w-full p-8 pb-12 pointer-events-auto bg-gradient-to-t from-black/90 via-black/60 to-transparent">
        <div className="max-w-4xl mx-auto flex flex-col gap-4">
          {/* Timeline */}
          <div className="flex items-center gap-4">
            <span className="text-white font-mono w-16 text-right">
              {formatFrameTime(currentFrame)}
            </span>
            <div className="relative flex-1 group">
              <input
                type="range"
                min={0}
                max={totalFrames}
                value={currentFrame}
                onChange={handleSeek}
                className="w-full h-2 bg-white/20 rounded-full appearance-none cursor-pointer [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:w-4 [&::-webkit-slider-thumb]:h-4 [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:bg-orange-500 [&::-webkit-slider-thumb]:transition-transform group-hover:[&::-webkit-slider-thumb]:scale-125"
              />
              {/* Buffer/Segments could go here */}
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
