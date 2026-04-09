import React, { useEffect, useState } from "react";
import { APIClient } from "../api/client";
import { AuthManager } from "../core/AuthManager";
import { Clock, Calendar } from "lucide-react";

interface MatchHistoryEntry {
  id: number;
  opponent_username: string;
  result: "win" | "loss";
  elo_change: number;
  ended_at: string;
  duration_seconds: number;
}

export const ProfileScreen: React.FC<{
  onClose: () => void;
  onWatchReplay: () => void;
}> = ({ onClose, onWatchReplay }) => {
  const [user, setUser] = useState(AuthManager.currentUser);
  const [matches, setMatches] = useState<MatchHistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"stats" | "history">("history");

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    if (!user) return;
    try {
      setLoading(true);
      // Reload user stats
      const me = await APIClient.getMe();
      // AuthManager.currentUser = me; // Update global if needed, but safe to use local
      setUser(me);

      const history = await APIClient.getMatchHistory(me.id);
      setMatches(history.matches);
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 pointer-events-auto">
      <div className="w-full max-w-4xl bg-[#1a1a24] border border-white/10 rounded-2xl shadow-2xl overflow-hidden flex flex-col max-h-[85vh]">
        <div className="p-8 overflow-y-auto custom-scrollbar">
          {/* Header */}
          <div className="flex justify-between items-center mb-8">
            <div className="flex items-center gap-6">
              <div className="w-24 h-24 rounded-2xl bg-gradient-to-br from-blue-600 to-indigo-700 shadow-lg shadow-blue-500/20 flex items-center justify-center text-4xl font-bold border border-white/10">
                {user?.avatar_url ? (
                  <img
                    src={user.avatar_url}
                    alt={user.username}
                    className="w-full h-full object-cover rounded-2xl"
                  />
                ) : (
                  user?.username?.[0]?.toUpperCase()
                )}
              </div>
              <div>
                <h1 className="text-3xl font-bold text-white mb-2">
                  {user?.username}
                </h1>
                <div className="flex items-center gap-3">
                  <div className="bg-white/5 px-3 py-1 rounded-full border border-white/10 text-sm font-medium text-blue-300">
                    Level {user?.level}
                  </div>
                  <div className="bg-white/5 px-3 py-1 rounded-full border border-white/10 text-sm font-medium text-amber-400">
                    {user?.elo_rating} Elo
                  </div>
                </div>
              </div>
            </div>
            <button
              onClick={onClose}
              className="p-2 hover:bg-white/10 rounded-lg transition-colors text-white/60 hover:text-white"
            >
              <div className="text-sm font-medium uppercase tracking-wider">
                Close
              </div>
            </button>
          </div>

          {/* Tabs */}
          <div className="flex gap-1 bg-black/20 p-1 rounded-xl mb-8 w-fit">
            <button
              onClick={() => setActiveTab("history")}
              className={`px-6 py-2 rounded-lg text-sm font-bold transition-all ${
                activeTab === "history"
                  ? "bg-indigo-600 text-white shadow-lg"
                  : "text-white/40 hover:text-white hover:bg-white/5"
              }`}
            >
              Match History
            </button>
            <button
              onClick={() => setActiveTab("stats")}
              className={`px-6 py-2 rounded-lg text-sm font-bold transition-all ${
                activeTab === "stats"
                  ? "bg-indigo-600 text-white shadow-lg"
                  : "text-white/40 hover:text-white hover:bg-white/5"
              }`}
            >
              Statistics
            </button>
          </div>

          {/* Content */}
          {loading ? (
            <div className="text-center py-20 text-white/40 animate-pulse">
              Loading profile data...
            </div>
          ) : activeTab === "history" ? (
            <div className="space-y-3">
              {matches.length === 0 && (
                <div className="text-center py-12 border-2 border-dashed border-white/5 rounded-xl">
                  <div className="text-white/40 font-medium">
                    No matches played yet
                  </div>
                </div>
              )}
              {matches.map((match) => (
                <div
                  key={match.id}
                  className="group bg-white/5 border border-white/5 hover:border-white/10 p-4 rounded-xl flex items-center justify-between transition-all hover:bg-white/10"
                >
                  <div className="flex items-center gap-4">
                    <div
                      className={`w-1.5 h-12 rounded-full ${match.result === "win" ? "bg-green-500 shadow-[0_0_10px_rgba(34,197,94,0.4)]" : "bg-red-500 shadow-[0_0_10px_rgba(239,68,68,0.4)]"}`}
                    />
                    <div>
                      <div className="font-bold text-lg text-white flex items-center gap-2">
                        <span
                          className={
                            match.result === "win"
                              ? "text-green-400"
                              : "text-red-400"
                          }
                        >
                          {match.result === "win" ? "VICTORY" : "DEFEAT"}
                        </span>
                        <span className="text-white/20 text-sm">vs</span>
                        <span>{match.opponent_username}</span>
                      </div>
                      <div className="text-sm text-white/40 flex gap-4 mt-1">
                        <span className="flex items-center gap-1.5">
                          <Calendar size={12} />{" "}
                          {new Date(match.ended_at).toLocaleDateString()}
                        </span>
                        <span className="flex items-center gap-1.5">
                          <Clock size={12} />{" "}
                          {Math.floor(match.duration_seconds / 60)}m{" "}
                          {match.duration_seconds % 60}s
                        </span>
                        <span
                          className={`${match.elo_change > 0 ? "text-green-400" : "text-red-400"} font-medium`}
                        >
                          {match.elo_change > 0 ? "+" : ""}
                          {match.elo_change} Elo
                        </span>
                      </div>
                    </div>
                  </div>
                  <button
                    onClick={async () => {
                      if (loading) return;
                      try {
                        setLoading(true);
                        const replayData = await APIClient.getReplay(match.id);
                        console.log("[Replay] Data received:", {
                          version: replayData?.version,
                          duration: replayData?.duration,
                          inputCount: replayData?.inputs?.length,
                          fps: replayData?.fps,
                        });

                        // Validate replay data
                        if (
                          !replayData ||
                          replayData.version !== 2 ||
                          !Array.isArray(replayData.inputs) ||
                          replayData.inputs.length === 0 ||
                          !replayData.duration ||
                          !Number.isFinite(replayData.seed) ||
                          !Number.isFinite(replayData.fps) ||
                          !Array.isArray(replayData.players) ||
                          replayData.players.length < 2
                        ) {
                          console.warn(
                            "[Replay] Validation failed:",
                            JSON.stringify({
                              hasData: !!replayData,
                              version: replayData?.version,
                              isInputsArray: Array.isArray(replayData?.inputs),
                              inputCount: replayData?.inputs?.length,
                              duration: replayData?.duration,
                            }),
                          );
                          alert(
                            "This replay was recorded with an older version and cannot be played.\n\nNew matches will have working replays!",
                          );
                          setLoading(false);
                          return;
                        }

                        onClose(); // Close profile modal

                        // Initialize Replay Scene
                        const { SceneManager } =
                          await import("../core/SceneManager");
                        const { ReplayScene } =
                          await import("../scenes/ReplayScene");
                        SceneManager.changeScene(new ReplayScene(replayData));

                        onWatchReplay();
                      } catch (e) {
                        console.error("Failed to load replay", e);
                        setLoading(false);
                      }
                    }}
                    className="bg-white/10 hover:bg-white/20 text-white px-4 py-2 rounded-lg font-bold text-xs uppercase tracking-wider transition-colors border border-white/5"
                  >
                    Watch Replay
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-4">
              <div className="bg-white/5 border border-white/5 p-6 rounded-2xl">
                <div className="text-white/40 text-xs font-bold uppercase tracking-wider mb-2">
                  Total Games
                </div>
                <div className="text-4xl font-bold text-white">
                  {user?.games_played}
                </div>
              </div>
              <div className="bg-white/5 border border-white/5 p-6 rounded-2xl">
                <div className="text-white/40 text-xs font-bold uppercase tracking-wider mb-2">
                  Win Rate
                </div>
                <div className="text-4xl font-bold text-emerald-400">
                  {user?.games_played
                    ? Math.round((user.games_won / user.games_played) * 100)
                    : 0}
                  %
                </div>
              </div>
              <div className="bg-white/5 border border-white/5 p-6 rounded-2xl">
                <div className="text-white/40 text-xs font-bold uppercase tracking-wider mb-2">
                  Highest Chain
                </div>
                <div className="text-4xl font-bold text-amber-400">
                  {user?.highest_chain}
                </div>
              </div>
              <div className="bg-white/5 border border-white/5 p-6 rounded-2xl">
                <div className="text-white/40 text-xs font-bold uppercase tracking-wider mb-2">
                  Garbage Sent
                </div>
                <div className="text-4xl font-bold text-purple-400">
                  {user?.total_garbage_sent}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
