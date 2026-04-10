import { motion, AnimatePresence } from "motion/react";
import { useState, useEffect } from "react";
import { Swords, Trophy, Target, Zap, User } from "lucide-react";

export interface VSPlayerData {
  username: string;
  avatarUrl?: string | null;
  gamesPlayed: number;
  garbageSent: number;
  elo?: number;
  rank?: number | null;
  isGuest: boolean;
}

interface VSScreenProps {
  players: VSPlayerData[];
  isRanked: boolean;
  onCountdownComplete: () => void;
}

export function VSScreen({
  players,
  isRanked,
  onCountdownComplete,
}: VSScreenProps) {
  const [countdown, setCountdown] = useState(3);
  const [showCountdown, setShowCountdown] = useState(false);

  useEffect(() => {
    // Show player cards briefly, then start countdown after 1s
    const startDelay = setTimeout(() => {
      setShowCountdown(true);
    }, 1000);

    return () => clearTimeout(startDelay);
  }, []);

  useEffect(() => {
    if (!showCountdown) return;

    if (countdown === 0) {
      // Immediately trigger game start on "GO!"
      const goDelay = setTimeout(() => {
        onCountdownComplete();
      }, 300);
      return () => clearTimeout(goDelay);
    }

    const timer = setTimeout(() => {
      setCountdown((prev) => prev - 1);
    }, 500);

    return () => clearTimeout(timer);
  }, [countdown, showCountdown, onCountdownComplete]);

  const player1 = players[0] || {
    username: "Player 1",
    gamesPlayed: 0,
    garbageSent: 0,
    isGuest: true,
  };
  const player2 = players[1] || {
    username: "Player 2",
    gamesPlayed: 0,
    garbageSent: 0,
    isGuest: true,
  };

  const getRankDisplay = (rank: number | null | undefined) => {
    if (!rank) return null;
    if (rank <= 3) return ["🥇", "🥈", "🥉"][rank - 1];
    return `#${rank}`;
  };

  const PlayerCard = ({
    player,
    side,
  }: {
    player: VSPlayerData;
    side: "left" | "right";
  }) => (
    <motion.div
      className="flex flex-col items-center gap-4 w-64"
      initial={{ x: side === "left" ? -100 : 100, opacity: 0 }}
      animate={{ x: 0, opacity: 1 }}
      transition={{
        duration: 0.3,
        delay: side === "left" ? 0.05 : 0.1,
        type: "spring",
      }}
    >
      {/* Avatar */}
      <motion.div
        className="relative"
        initial={{ scale: 0 }}
        animate={{ scale: 1 }}
        transition={{
          delay: side === "left" ? 0.15 : 0.2,
          type: "spring",
          stiffness: 200,
        }}
      >
        <div className="w-24 h-24 rounded-full overflow-hidden border-4 border-white/20 bg-gradient-to-br from-purple-600/50 to-blue-600/50 backdrop-blur-sm">
          {player.avatarUrl && !player.isGuest ? (
            <img
              src={player.avatarUrl}
              alt={player.username}
              className="w-full h-full object-cover"
            />
          ) : (
            <div className="w-full h-full flex items-center justify-center">
              <User className="w-12 h-12 text-white/60" />
            </div>
          )}
        </div>
        {/* Rank badge */}
        {isRanked && player.rank && (
          <div className="absolute -bottom-2 -right-2 bg-gradient-to-r from-amber-500 to-yellow-500 text-black font-black text-sm px-2 py-0.5 rounded-full shadow-lg">
            {getRankDisplay(player.rank)}
          </div>
        )}
      </motion.div>

      {/* Name */}
      <motion.div
        className="text-center"
        initial={{ y: 20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ delay: side === "left" ? 0.2 : 0.25 }}
      >
        <h2 className="text-2xl font-black text-white tracking-tight">
          {player.isGuest ? "Guest" : player.username}
        </h2>
        {isRanked && player.elo && (
          <div className="flex items-center justify-center gap-1 mt-1">
            <Trophy className="w-4 h-4 text-amber-400" />
            <span className="text-amber-400 font-bold">{player.elo} ELO</span>
          </div>
        )}
      </motion.div>

      {/* Stats */}
      <motion.div
        className="grid grid-cols-2 gap-3 w-full"
        initial={{ y: 20, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ delay: side === "left" ? 0.25 : 0.3 }}
      >
        <div className="bg-white/5 border border-white/10 rounded-lg p-3 text-center">
          <div className="flex items-center justify-center gap-1 text-white/60 text-xs mb-1">
            <Target className="w-3 h-3" />
            <span>GAMES</span>
          </div>
          <div className="text-white font-black text-lg">
            {player.gamesPlayed}
          </div>
        </div>
        <div className="bg-white/5 border border-white/10 rounded-lg p-3 text-center">
          <div className="flex items-center justify-center gap-1 text-white/60 text-xs mb-1">
            <Zap className="w-3 h-3" />
            <span>GARBAGE</span>
          </div>
          <div className="text-white font-black text-lg">
            {player.garbageSent}
          </div>
        </div>
      </motion.div>
    </motion.div>
  );

  return (
    <motion.div
      className="fixed inset-0 z-[100] flex items-center justify-center pointer-events-auto"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
    >
      {/* Background */}
      {/* Background - Toned down */}
      <div className="absolute inset-0 bg-[#0a0a12]" />
      <div
        className="absolute inset-0 opacity-[0.02]"
        style={{
          backgroundImage: `
            linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px),
            linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px)
          `,
          backgroundSize: "40px 40px",
        }}
      />

      {/* Content */}
      <div className="relative flex items-center justify-center gap-8 md:gap-16">
        {/* Player 1 */}
        <PlayerCard player={player1} side="left" />

        {/* VS */}
        <motion.div
          className="flex flex-col items-center"
          initial={{ scale: 0, rotate: -180 }}
          animate={{ scale: 1, rotate: 0 }}
          transition={{ delay: 0.15, type: "spring", stiffness: 200 }}
        >
          <div className="relative">
            <Swords className="w-12 h-12 text-white/20" />
          </div>
          <motion.span
            className="text-4xl font-black text-white mt-2 tracking-widest"
            initial={{ y: 20, opacity: 0 }}
            animate={{ y: 0, opacity: 1 }}
            transition={{ delay: 0.2 }}
          >
            VS
          </motion.span>
          {isRanked && (
            <motion.span
              className="text-xs font-bold text-[#FF5733] tracking-wider mt-1"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ delay: 0.25 }}
            >
              RANKED MATCH
            </motion.span>
          )}
        </motion.div>

        {/* Player 2 */}
        <PlayerCard player={player2} side="right" />
      </div>

      {/* Countdown Overlay */}
      <AnimatePresence>
        {showCountdown && (
          <motion.div
            className="absolute inset-0 flex items-center justify-center bg-black/60 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <motion.div
              key={countdown}
              className="text-[12rem] font-black"
              style={{
                color: countdown === 0 ? "#22C55E" : "#FF5733",
                textShadow:
                  countdown === 0
                    ? "0 0 60px rgba(34, 197, 94, 0.8)"
                    : "0 0 60px rgba(255, 87, 51, 0.8)",
              }}
              initial={{ scale: 2, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.5, opacity: 0 }}
              transition={{ duration: 0.3, type: "spring", stiffness: 300 }}
            >
              {countdown === 0 ? "GO!" : countdown}
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}
