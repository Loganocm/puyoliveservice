import React, { useEffect, useState, useRef } from "react";
import { APIClient } from "../api/client";
import { useMenuInput } from "@/hooks/useMenuInput";
import { AuthManager } from "../core/AuthManager";
import { GameEvents } from "../core/GameEvents";
import {
  Clock,
  Calendar,
  Pencil,
  Check,
  X,
  Loader2,
  ShieldCheck,
} from "lucide-react";

interface MatchHistoryEntry {
  id: number;
  opponent_username: string;
  result: "win" | "loss";
  elo_change: number;
  ended_at: string;
  duration_seconds: number;
  has_valid_replay?: boolean;
}

export const ProfileScreen: React.FC<{
  onClose: () => void;
  onWatchReplay: () => void;
}> = ({ onClose, onWatchReplay }) => {
  const [user, setUser] = useState(AuthManager.currentUser);
  const [matches, setMatches] = useState<MatchHistoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<"stats" | "history">("history");
  const [percentiles, setPercentiles] = useState<{
    elo_percentile: number;
    win_rate_percentile: number;
    chain_percentile: number;
    garbage_percentile: number;
    games_percentile: number;
  } | null>(null);

  // Username editing
  const [editingName, setEditingName] = useState(false);
  const [newUsername, setNewUsername] = useState("");
  const [nameError, setNameError] = useState("");
  const [nameSaving, setNameSaving] = useState(false);
  const nameInputRef = useRef<HTMLInputElement>(null);
  const [error, setError] = useState<string | null>(null);

  useMenuInput({ onBack: () => {
      // If editing name, close the edit input
      if (editingName) {
        setEditingName(false);
      } else {
        onClose();
      }
  } }, [editingName, onClose]);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    if (!user) return;
    try {
      setLoading(true);
      setError(null);
      // Reload user stats
      const me = await APIClient.getMe();
      setUser(me);
      // Keep AuthManager and app state in sync (ensures is_admin propagates)
      AuthManager.currentUser = me;
      GameEvents.emit("user_update", me);

      const [history, pctData] = await Promise.all([
        APIClient.getMatchHistory(me.id),
        APIClient.getUserPercentiles(me.id).catch(() => null),
      ]);
      setMatches(history.matches);
      setPercentiles(pctData);
    } catch (e: any) {
      console.error("ProfileScreen load error:", e);
      setError(e?.message || "Failed to load match history");
    } finally {
      setLoading(false);
    }
  };

  const startEditingName = () => {
    setNewUsername(user?.username || "");
    setNameError("");
    setEditingName(true);
    setTimeout(() => nameInputRef.current?.focus(), 50);
  };

  const cancelEditingName = () => {
    setEditingName(false);
    setNameError("");
  };

  const saveUsername = async () => {
    const trimmed = newUsername.trim();

    // Client-side validation (matches server rules)
    if (trimmed.length < 3) {
      setNameError("Username must be at least 3 characters");
      return;
    }
    if (trimmed.length > 32) {
      setNameError("Username must be at most 32 characters");
      return;
    }
    if (!/^[a-zA-Z0-9_]+$/.test(trimmed)) {
      setNameError("Letters, numbers, and underscores only");
      return;
    }
    if (trimmed === user?.username) {
      setEditingName(false);
      return;
    }

    try {
      setNameSaving(true);
      setNameError("");
      const result = await APIClient.updateProfile(user!.id, {
        username: trimmed,
      });

      // Update token (server returns new JWT with updated username)
      if (result.token) {
        localStorage.setItem("puyolive_token", result.token);
      }

      // Refresh auth state so the rest of the app picks it up
      await AuthManager.refreshProfile();
      setUser(AuthManager.currentUser);
      setEditingName(false);
    } catch (e: any) {
      setNameError(e?.message || "Failed to update username");
    } finally {
      setNameSaving(false);
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
                {editingName ? (
                  <div className="mb-2">
                    <div className="flex items-center gap-2">
                      <input
                        ref={nameInputRef}
                        type="text"
                        value={newUsername}
                        onChange={(e) => {
                          setNewUsername(e.target.value);
                          setNameError("");
                        }}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") saveUsername();
                          if (e.key === "Escape") cancelEditingName();
                        }}
                        maxLength={32}
                        className="bg-white/10 border border-white/20 rounded-lg px-3 py-1.5 text-2xl font-bold text-white outline-none focus:border-indigo-500 transition-colors w-64"
                        disabled={nameSaving}
                      />
                      <button
                        onClick={saveUsername}
                        disabled={nameSaving}
                        className="p-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white transition-colors disabled:opacity-50"
                      >
                        {nameSaving ? (
                          <Loader2 size={18} className="animate-spin" />
                        ) : (
                          <Check size={18} />
                        )}
                      </button>
                      <button
                        onClick={cancelEditingName}
                        disabled={nameSaving}
                        aria-label="Cancel name change"
                        className="p-1.5 rounded-lg bg-white/10 hover:bg-white/20 text-white/60 transition-colors disabled:opacity-50"
                      >
                        <X size={18} />
                      </button>
                    </div>
                    {nameError && (
                      <p className="text-red-400 text-xs mt-1.5 font-medium">
                        {nameError}
                      </p>
                    )}
                  </div>
                ) : (
                  <div className="flex items-center gap-2 mb-2">
                    <h1 className="text-3xl font-bold text-white">
                      {user?.username}
                    </h1>
                    {!AuthManager.isGuest && (
                      <button
                        onClick={startEditingName}
                        className="p-1.5 rounded-lg hover:bg-white/10 text-white/30 hover:text-white/60 transition-colors"
                        title="Change username"
                      >
                        <Pencil size={16} />
                      </button>
                    )}
                  </div>
                )}
                <div className="flex items-center gap-3">
                  <div className="bg-white/5 px-3 py-1 rounded-full border border-white/10 text-sm font-medium text-blue-300">
                    Level {user?.level}
                  </div>
                  <div className="bg-white/5 px-3 py-1 rounded-full border border-white/10 text-sm font-medium text-amber-400">
                    {user?.elo_rating} Elo
                  </div>
                  {(user as any)?.is_admin && (
                    <div className="flex items-center gap-1 bg-red-500/15 border border-red-500/30 px-3 py-1 rounded-full">
                      <ShieldCheck size={13} className="text-red-400" />
                      <span className="text-xs font-bold text-red-400 uppercase tracking-wide">
                        Admin
                      </span>
                    </div>
                  )}
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
              {error && (
                <div className="text-center py-6 border-2 border-red-500/20 bg-red-500/10 rounded-xl">
                  <div className="text-red-400 font-medium">{error}</div>
                </div>
              )}
              {!error && matches.length === 0 && (
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
                  {match.has_valid_replay && (
                    <button
                      onClick={async () => {
                        if (loading) return;
                        try {
                          setLoading(true);
                          const replayData = await APIClient.getReplay(
                            match.id,
                          );

                          // Validate replay data before creating scene (V3 only)
                          if (
                            !replayData ||
                            replayData.version !== 3 ||
                            typeof replayData.engineVersion !== 'string' ||
                            !Array.isArray(replayData.inputs) ||
                            replayData.inputs.length === 0
                          ) {
                            console.error("Invalid replay data:", replayData);
                            alert("This replay cannot be viewed. Only V3 replays are supported.");
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
                  )}
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
                {percentiles && (
                  <div className="text-xs font-bold text-indigo-400 mt-1">
                    Top {percentiles.games_percentile}%
                  </div>
                )}
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
                {percentiles && (
                  <div className="text-xs font-bold text-indigo-400 mt-1">
                    Top {percentiles.win_rate_percentile}%
                  </div>
                )}
              </div>
              <div className="bg-white/5 border border-white/5 p-6 rounded-2xl">
                <div className="text-white/40 text-xs font-bold uppercase tracking-wider mb-2">
                  Highest Chain
                </div>
                <div className="text-4xl font-bold text-amber-400">
                  {user?.highest_chain}
                </div>
                {percentiles && (
                  <div className="text-xs font-bold text-indigo-400 mt-1">
                    Top {percentiles.chain_percentile}%
                  </div>
                )}
              </div>
              <div className="bg-white/5 border border-white/5 p-6 rounded-2xl">
                <div className="text-white/40 text-xs font-bold uppercase tracking-wider mb-2">
                  Garbage Sent
                </div>
                <div className="text-4xl font-bold text-purple-400">
                  {user?.total_garbage_sent}
                </div>
                {percentiles && (
                  <div className="text-xs font-bold text-indigo-400 mt-1">
                    Top {percentiles.garbage_percentile}%
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
