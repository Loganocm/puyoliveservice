/**
 * QuickPlayScreen - React overlay for "Puyo Mines" FFA mode
 *
 * Displays:
 * - Player list sidebar (Roblox-style, showing depth, alive status, KOs)
 * - Targeting mode selector (Random / Attackers / Badges / Vulnerable)
 * - Death/respawn overlay
 * - Depth HUD and KO counter
 * - Kill feed notifications
 */

import { useState, useEffect, useCallback, useRef } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  Users,
  Crosshair,
  Shield,
  Trophy,
  AlertTriangle,
  Shuffle,
  Skull,
  ChevronDown,
  ArrowDown,
} from "lucide-react";
import { NetworkManager } from "@/core/NetworkManager";
import { GameEvents } from "@/core/GameEvents";

type TargetingMode = "random" | "attackers" | "badges" | "vulnerable";

/** Depth level thresholds (must match server/QuickPlayScene) */
const DEPTH_LEVELS = [
  { depth: 0, level: 1, name: "Surface", color: "#4ade80" },
  { depth: 500, level: 2, name: "Shallow Mines", color: "#22d3ee" },
  { depth: 1000, level: 3, name: "Deep Caverns", color: "#818cf8" },
  { depth: 2000, level: 4, name: "Crystal Veins", color: "#a78bfa" },
  { depth: 3500, level: 5, name: "Magma Layer", color: "#f97316" },
  { depth: 5000, level: 6, name: "The Abyss", color: "#ef4444" },
  { depth: 7500, level: 7, name: "Void Core", color: "#dc2626" },
  { depth: 10000, level: 8, name: "Bedrock", color: "#991b1b" },
];

function getDepthLevel(depth: number) {
  for (let i = DEPTH_LEVELS.length - 1; i >= 0; i--) {
    if (depth >= DEPTH_LEVELS[i].depth) return DEPTH_LEVELS[i];
  }
  return DEPTH_LEVELS[0];
}

interface MinesPlayerEntry {
  socketId: string;
  username: string;
  depth: number;
  alive: boolean;
  kos: number;
  attackers: number;
  isBot?: boolean;
  depthLevel: number;
}

interface KillFeedEntry {
  id: number;
  username: string;
  depth: number;
  timestamp: number;
}

interface QuickPlayScreenProps {
  onLeave: () => void;
}

export function QuickPlayScreen({ onLeave }: QuickPlayScreenProps) {
  const [players, setPlayers] = useState<MinesPlayerEntry[]>([]);
  const [mySocketId, setMySocketId] = useState<string>("");
  const [targetingMode, setTargetingMode] = useState<TargetingMode>("random");
  const [isDead, setIsDead] = useState(false);
  const [deathStats, setDeathStats] = useState<{
    depth: number;
    kos: number;
    score: number;
  } | null>(null);
  const [killFeed, setKillFeed] = useState<KillFeedEntry[]>([]);
  const [showTargetMenu, setShowTargetMenu] = useState(false);
  const [levelUpNotif, setLevelUpNotif] = useState<{
    level: number;
    name: string;
  } | null>(null);
  const killFeedId = useRef(0);
  const levelUpTimer = useRef<ReturnType<typeof setTimeout>>();

  // Setup network listeners
  useEffect(() => {
    const onJoined = (data: { yourSocketId: string }) => {
      setMySocketId(data.yourSocketId);
    };

    const onPlayerList = (list: MinesPlayerEntry[]) => {
      setPlayers(list);
    };

    const onDied = (data: { depth: number; kos: number; score: number }) => {
      setIsDead(true);
      setDeathStats(data);
    };

    const onDiedBroadcast = (data: {
      socketId: string;
      username: string;
      depth: number;
    }) => {
      // Add to kill feed
      const id = ++killFeedId.current;
      setKillFeed((prev) => [
        {
          id,
          username: data.username,
          depth: data.depth,
          timestamp: Date.now(),
        },
        ...prev.slice(0, 7),
      ]);
    };

    const onLeft = () => {
      onLeave();
    };

    const onTargetUpdated = (data: { mode: string }) => {
      setTargetingMode(data.mode as TargetingMode);
    };

    const onLevelUp = (data: { level: number; name: string }) => {
      setLevelUpNotif({ level: data.level, name: data.name });
      if (levelUpTimer.current) clearTimeout(levelUpTimer.current);
      levelUpTimer.current = setTimeout(() => setLevelUpNotif(null), 3000);
    };

    NetworkManager.on("mines_joined", onJoined);
    NetworkManager.on("mines_player_list", onPlayerList);
    NetworkManager.on("mines_target_updated", onTargetUpdated);
    NetworkManager.on("mines_player_died_broadcast", onDiedBroadcast);
    GameEvents.on("mines_died", onDied);
    GameEvents.on("mines_left", onLeft);
    GameEvents.on("mines_level_up", onLevelUp);

    return () => {
      NetworkManager.off("mines_joined", onJoined);
      NetworkManager.off("mines_player_list", onPlayerList);
      NetworkManager.off("mines_target_updated", onTargetUpdated);
      NetworkManager.off("mines_player_died_broadcast", onDiedBroadcast);
      GameEvents.off("mines_died", onDied);
      GameEvents.off("mines_left", onLeft);
      GameEvents.off("mines_level_up", onLevelUp);
    };
  }, [onLeave]);

  // Clean up old kill feed entries
  useEffect(() => {
    const interval = setInterval(() => {
      const cutoff = Date.now() - 5000;
      setKillFeed((prev) => prev.filter((e) => e.timestamp > cutoff));
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  const handleRespawn = useCallback(() => {
    setIsDead(false);
    setDeathStats(null);
    NetworkManager.minesRespawn();
  }, []);

  const handleTargetChange = useCallback((mode: TargetingMode) => {
    setTargetingMode(mode);
    setShowTargetMenu(false);
    NetworkManager.minesSetTarget(mode);
  }, []);

  const handleLeave = useCallback(() => {
    NetworkManager.leaveMines();
  }, []);

  const targetingModes: {
    id: TargetingMode;
    label: string;
    icon: React.ElementType;
    desc: string;
    color: string;
  }[] = [
    {
      id: "random",
      label: "Random",
      icon: Shuffle,
      desc: "Target a random player",
      color: "text-blue-400",
    },
    {
      id: "attackers",
      label: "Attackers",
      icon: Shield,
      desc: "Counter those targeting you",
      color: "text-red-400",
    },
    {
      id: "badges",
      label: "Badges",
      icon: Trophy,
      desc: "Target player with most KOs",
      color: "text-yellow-400",
    },
    {
      id: "vulnerable",
      label: "Vulnerable",
      icon: AlertTriangle,
      desc: "Target most filled board",
      color: "text-orange-400",
    },
  ];

  const currentTarget = targetingModes.find((m) => m.id === targetingMode)!;
  const activePlayers = players.filter((p) => p.alive);
  const deadPlayers = players.filter((p) => !p.alive);
  const myPlayer = players.find((p) => p.socketId === mySocketId);

  return (
    <div className="fixed inset-0 z-40 pointer-events-none">
      {/* ── Player List Sidebar (Right) ── */}
      <div className="absolute top-4 right-4 w-56 pointer-events-auto">
        {/* Header */}
        <div className="bg-black/60 backdrop-blur-sm border border-white/10 rounded-t-xl px-3 py-2 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Users size={14} className="text-indigo-400" />
            <span className="text-xs font-bold text-white/70 uppercase tracking-wider">
              Miners
            </span>
          </div>
          <span className="text-xs font-bold text-indigo-400">
            {activePlayers.length}/{players.length}
          </span>
        </div>

        {/* Player List */}
        <div className="bg-black/50 backdrop-blur-sm border-x border-b border-white/10 rounded-b-xl max-h-[60vh] overflow-y-auto custom-scrollbar">
          {activePlayers.map((p, i) => (
            <div
              key={p.socketId}
              className={`flex items-center gap-2 px-3 py-1.5 border-b border-white/5 last:border-0 ${
                p.socketId === mySocketId
                  ? "bg-indigo-500/15"
                  : "hover:bg-white/5"
              }`}
            >
              {/* Rank indicator */}
              <span className="text-[10px] font-bold text-white/20 w-4 text-right shrink-0">
                {i + 1}
              </span>

              {/* Status dot */}
              <div
                className={`w-1.5 h-1.5 rounded-full shrink-0 ${
                  p.socketId === mySocketId
                    ? "bg-indigo-400"
                    : p.attackers > 0
                      ? "bg-red-400 animate-pulse"
                      : "bg-emerald-400"
                }`}
              />

              {/* Name + depth */}
              <div className="flex-1 min-w-0">
                <div className="text-xs font-bold truncate">
                  {p.socketId === mySocketId ? (
                    <span className="text-indigo-300">{p.username}</span>
                  ) : p.isBot ? (
                    <span className="text-amber-400/80">{p.username}</span>
                  ) : (
                    p.username
                  )}
                </div>
              </div>

              {/* Depth */}
              <div className="flex items-center gap-1 shrink-0">
                <ArrowDown size={10} className="text-cyan-400/60" />
                <span className="text-xs font-bold text-cyan-400/80">
                  {p.depth}m
                </span>
              </div>

              {/* KOs badge */}
              {p.kos > 0 && (
                <span className="text-[9px] font-bold bg-red-500/20 text-red-400 px-1 rounded shrink-0">
                  {p.kos}
                </span>
              )}
            </div>
          ))}

          {/* Dead players (dimmed) */}
          {deadPlayers.length > 0 && (
            <>
              <div className="px-3 py-1 text-[9px] uppercase tracking-wider text-white/20 font-bold bg-white/[0.02]">
                Eliminated
              </div>
              {deadPlayers.map((p) => (
                <div
                  key={p.socketId}
                  className="flex items-center gap-2 px-3 py-1 opacity-40"
                >
                  <span className="text-[10px] text-white/20 w-4 shrink-0" />
                  <Skull size={10} className="text-red-400/50 shrink-0" />
                  <span className="text-[10px] truncate flex-1">
                    {p.username}
                  </span>
                  <span className="text-[10px] text-white/20">{p.depth}m</span>
                </div>
              ))}
            </>
          )}
        </div>
      </div>

      {/* ── Targeting Mode (Bottom Center) ── */}
      <div className="absolute bottom-4 left-1/2 -translate-x-1/2 pointer-events-auto">
        <div className="relative">
          <button
            onClick={() => setShowTargetMenu(!showTargetMenu)}
            className="flex items-center gap-2 px-4 py-2 bg-black/60 backdrop-blur-sm border border-white/10 rounded-xl hover:bg-white/10 transition-colors"
          >
            <Crosshair size={14} className="text-red-400" />
            <currentTarget.icon size={14} className={currentTarget.color} />
            <span className="text-xs font-bold">{currentTarget.label}</span>
            <ChevronDown
              size={12}
              className={`text-white/40 transition-transform ${showTargetMenu ? "rotate-180" : ""}`}
            />
          </button>

          <AnimatePresence>
            {showTargetMenu && (
              <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: 10 }}
                transition={{ duration: 0.15 }}
                className="absolute bottom-full left-1/2 -translate-x-1/2 mb-2 w-56 bg-[#1a1a2e] border border-white/10 rounded-xl overflow-hidden shadow-2xl"
              >
                {targetingModes.map((mode) => (
                  <button
                    key={mode.id}
                    onClick={() => handleTargetChange(mode.id)}
                    className={`w-full flex items-center gap-3 px-4 py-3 text-left transition-colors ${
                      targetingMode === mode.id
                        ? "bg-indigo-500/20 border-l-2 border-indigo-400"
                        : "hover:bg-white/5 border-l-2 border-transparent"
                    }`}
                  >
                    <mode.icon size={16} className={mode.color} />
                    <div>
                      <div className="text-sm font-bold">{mode.label}</div>
                      <div className="text-[10px] text-white/30">
                        {mode.desc}
                      </div>
                    </div>
                  </button>
                ))}
              </motion.div>
            )}
          </AnimatePresence>
        </div>
      </div>

      {/* ── Leave Button (Top Left) ── */}
      <button
        onClick={handleLeave}
        className="absolute top-4 left-4 px-3 py-2 bg-black/60 backdrop-blur-sm border border-white/10 rounded-lg text-xs font-bold text-white/60 hover:text-white hover:bg-red-500/20 hover:border-red-500/30 transition-colors pointer-events-auto"
      >
        ← Leave Mines
      </button>

      {/* ── Kill Feed (Top Center) ── */}
      <div className="absolute top-4 left-1/2 -translate-x-1/2 flex flex-col items-center gap-1 pointer-events-none">
        <AnimatePresence>
          {killFeed.map((entry) => (
            <motion.div
              key={entry.id}
              initial={{ opacity: 0, y: -10, scale: 0.9 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -5, scale: 0.9 }}
              transition={{ duration: 0.2 }}
              className="flex items-center gap-2 px-3 py-1.5 bg-black/50 backdrop-blur-sm border border-white/10 rounded-lg"
            >
              <Skull size={12} className="text-red-400" />
              <span className="text-xs font-bold text-white/70">
                {entry.username}
              </span>
              <span className="text-[10px] text-white/30">
                depth {entry.depth}m
              </span>
            </motion.div>
          ))}
        </AnimatePresence>
      </div>

      {/* ── My Depth HUD (Bottom Left) ── */}
      {myPlayer && (
        <div className="absolute bottom-4 left-4 pointer-events-none">
          <div className="bg-black/50 backdrop-blur-sm border border-white/10 rounded-xl px-4 py-3">
            <div className="text-[10px] uppercase tracking-wider text-cyan-400/60 font-bold">
              Depth
            </div>
            <div className="text-2xl font-black text-cyan-400 tabular-nums">
              {myPlayer.depth}m
            </div>
            <div
              className="text-[10px] font-bold mt-1"
              style={{ color: getDepthLevel(myPlayer.depth).color }}
            >
              Lv.{getDepthLevel(myPlayer.depth).level}{" "}
              {getDepthLevel(myPlayer.depth).name}
            </div>
            {myPlayer.kos > 0 && (
              <div className="text-[10px] text-red-400/80 font-bold mt-1">
                {myPlayer.kos} KO{myPlayer.kos !== 1 ? "s" : ""}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Level Up Notification ── */}
      <AnimatePresence>
        {levelUpNotif && (
          <motion.div
            initial={{ opacity: 0, y: 30, scale: 0.9 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -20, scale: 0.9 }}
            transition={{ duration: 0.4, ease: "easeOut" }}
            className="absolute bottom-20 left-1/2 -translate-x-1/2 pointer-events-none"
          >
            <div className="bg-black/70 backdrop-blur-sm border border-white/20 rounded-xl px-6 py-3 text-center">
              <div className="text-[10px] uppercase tracking-widest text-white/40 font-bold">
                New Depth Level
              </div>
              <div
                className="text-xl font-black mt-1"
                style={{
                  color:
                    DEPTH_LEVELS.find((l) => l.level === levelUpNotif.level)
                      ?.color ?? "#fff",
                }}
              >
                Level {levelUpNotif.level}: {levelUpNotif.name}
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* ── Death / Respawn Overlay ── */}
      <AnimatePresence>
        {isDead && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 bg-black/70 flex items-center justify-center pointer-events-auto"
          >
            <motion.div
              initial={{ scale: 0.9, y: 20 }}
              animate={{ scale: 1, y: 0 }}
              exit={{ scale: 0.9, y: 20 }}
              className="bg-[#12121a] border border-white/10 rounded-2xl p-8 max-w-sm w-full mx-4 text-center"
            >
              <Skull className="w-12 h-12 mx-auto mb-4 text-red-400" />
              <h2 className="text-2xl font-black mb-1 text-red-400">CRUSHED</h2>
              <p className="text-white/40 text-sm mb-1">
                You were buried at depth {deathStats?.depth ?? 0}m
              </p>
              {deathStats && (
                <p
                  className="text-xs font-bold mb-5"
                  style={{
                    color: getDepthLevel(deathStats.depth).color,
                  }}
                >
                  Reached Level {getDepthLevel(deathStats.depth).level}:{" "}
                  {getDepthLevel(deathStats.depth).name}
                </p>
              )}

              {deathStats && (
                <div className="grid grid-cols-3 gap-3 mb-6">
                  <div className="bg-white/5 rounded-lg p-3">
                    <div className="text-lg font-bold text-cyan-400">
                      {deathStats.depth}m
                    </div>
                    <div className="text-[10px] text-white/30 uppercase">
                      Depth
                    </div>
                  </div>
                  <div className="bg-white/5 rounded-lg p-3">
                    <div className="text-lg font-bold text-red-400">
                      {deathStats.kos}
                    </div>
                    <div className="text-[10px] text-white/30 uppercase">
                      KOs
                    </div>
                  </div>
                  <div className="bg-white/5 rounded-lg p-3">
                    <div className="text-lg font-bold text-amber-400">
                      {deathStats.score.toLocaleString()}
                    </div>
                    <div className="text-[10px] text-white/30 uppercase">
                      Score
                    </div>
                  </div>
                </div>
              )}

              <div className="flex gap-3">
                <button
                  onClick={handleRespawn}
                  className="flex-1 py-3 bg-indigo-600 hover:bg-indigo-500 rounded-xl font-bold text-sm transition-colors"
                >
                  Respawn
                </button>
                <button
                  onClick={handleLeave}
                  className="px-4 py-3 bg-white/5 hover:bg-white/10 border border-white/10 rounded-xl font-bold text-sm text-white/60 transition-colors"
                >
                  Leave
                </button>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
