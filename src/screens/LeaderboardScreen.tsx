import { motion } from 'motion/react';
import { Trophy } from 'lucide-react';

interface LeaderboardScreenProps {
  onBack: () => void;
}

interface Player {
  rank: number;
  username: string;
  elo: number;
  winRate: number;
}

import { useEffect, useState } from 'react';
import { APIClient } from '@/api/client';

// ... imports

export function LeaderboardScreen({ onBack }: LeaderboardScreenProps) {
  const [players, setPlayers] = useState<Player[]>([]);
  const [userStats, setUserStats] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    try {
      const [lbData, me] = await Promise.all([
        APIClient.getLeaderboard(20, 0),
        APIClient.getMe().catch(() => null)
      ]);

      const mappedPlayers = lbData.leaderboard.map((p: any) => ({
        rank: p.rank,
        username: p.username,
        elo: p.elo_rating,
        winRate: p.win_rate
      }));

      setPlayers(mappedPlayers);

      if (me) {
        setUserStats({
          rank: me.rank || '-',
          elo: me.elo_rating,
          winRate: me.games_played > 0 ? Math.round((me.games_won / me.games_played) * 100) : 0
        });
      }
    } catch (err) {
      console.error(err);
      setError('Failed to load leaderboard');
    } finally {
      setLoading(false);
    }
  };

  const getRankColor = (rank: number) => {
    if (rank === 1) return '#FFD700'; // Gold
    if (rank === 2) return '#C0C0C0'; // Silver
    if (rank === 3) return '#CD7F32'; // Bronze
    return '#666666'; // Default gray
  };

  return (
    <div className="size-full relative overflow-hidden bg-[#0a0a12] flex items-center justify-center">
      {/* Background effects */}
      <div 
        className="absolute inset-0 opacity-[0.03] pointer-events-none"
        style={{
          backgroundImage: `
            linear-gradient(rgba(236,72,153,0.3) 1px, transparent 1px),
            linear-gradient(90deg, rgba(236,72,153,0.3) 1px, transparent 1px)
          `,
          backgroundSize: '40px 40px',
        }}
      />

      <div className="w-full max-w-4xl px-8">
        <motion.h1 
          className="text-5xl font-black text-white mb-12 tracking-tighter text-center italic drop-shadow-[0_0_15px_rgba(255,255,255,0.3)]"
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
        >
          LEADERBOARD
        </motion.h1>

        {/* Leaderboard Table */}
        <motion.div
          className="bg-white/5 border border-white/10 rounded-2xl overflow-hidden mb-8 backdrop-blur-sm shadow-2xl"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.1 }}
        >
          {/* Header */}
          <div className="grid grid-cols-[80px_1fr_120px_100px] gap-6 px-8 py-5 bg-white/5 border-b border-white/10">
            <div className="text-[10px] font-black text-white/40 tracking-[0.2em]">RANK</div>
            <div className="text-[10px] font-black text-white/40 tracking-[0.2em]">PLAYER</div>
            <div className="text-[10px] font-black text-white/40 tracking-[0.2em] text-right">ELO</div>
            <div className="text-[10px] font-black text-white/40 tracking-[0.2em] text-right">WIN %</div>
          </div>

          {/* Loading / Error / Empty States */}
          {loading && (
             <div className="p-12 text-center text-white/40 font-bold tracking-wider animate-pulse">LOADING DATA...</div>
          )}
          
          {!loading && error && (
             <div className="p-12 text-center text-red-400 font-bold tracking-wider">{error}</div>
          )}

          {!loading && !error && players.length === 0 && (
             <div className="p-12 text-center text-white/40 font-bold tracking-wider">NO PLAYERS FOUND</div>
          )}

          {/* Rows */}
          {!loading && players.map((player, index) => (
            <motion.div
              key={player.username}
              className="grid grid-cols-[80px_1fr_120px_100px] gap-6 px-8 py-4 hover:bg-white/5 transition-colors duration-150 border-b border-white/5 last:border-b-0 items-center group"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.3, delay: 0.1 + index * 0.03 }}
            >
              <div 
                className="text-xl font-black flex items-center gap-3"
                style={{ color: getRankColor(player.rank) }}
              >
                {player.rank <= 3 && <Trophy className="w-5 h-5 drop-shadow-md" />}
                <span className="drop-shadow-sm">#{player.rank}</span>
              </div>
              <div className="text-base font-bold text-white group-hover:text-white transition-colors">{player.username}</div>
              <div className="text-lg font-black text-white text-right font-mono">{player.elo}</div>
              <div className="text-base font-bold text-white/60 text-right">{player.winRate}%</div>
            </motion.div>
          ))}
        </motion.div>

        {/* Your Stats */}
        {userStats && (
        <motion.div
          className="flex items-center justify-center gap-12 p-6 bg-gradient-to-r from-[#FF5733]/10 to-[#8B5CF6]/10 border border-[#FF5733]/20 rounded-2xl shadow-xl backdrop-blur-sm"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4, delay: 0.3 }}
        >
          <div className="text-center group">
            <div className="text-[10px] font-black text-white/40 tracking-[0.2em] mb-2 group-hover:text-white/60 transition-colors">YOUR RANKING</div>
            <div className="text-3xl font-black text-[#FF5733] drop-shadow-[0_0_10px_rgba(255,87,51,0.3)]">{typeof userStats.rank === 'number' ? '#' + userStats.rank : userStats.rank}</div>
          </div>
          <div className="w-px h-16 bg-gradient-to-b from-transparent via-white/10 to-transparent" />
          <div className="text-center group">
            <div className="text-[10px] font-black text-white/40 tracking-[0.2em] mb-2 group-hover:text-white/60 transition-colors">ELO RATING</div>
            <div className="text-3xl font-black text-white">{userStats.elo}</div>
          </div>
          <div className="w-px h-16 bg-gradient-to-b from-transparent via-white/10 to-transparent" />
          <div className="text-center group">
            <div className="text-[10px] font-black text-white/40 tracking-[0.2em] mb-2 group-hover:text-white/60 transition-colors">WIN RATE</div>
            <div className="text-3xl font-black text-white">{userStats.winRate}%</div>
          </div>
        </motion.div>
        )}

        <motion.button
          className="w-full mt-12 px-6 py-4 text-white/30 hover:text-white font-bold text-xs tracking-[0.2em] uppercase transition-colors duration-200 cursor-pointer"
          onClick={onBack}
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.3, delay: 0.4 }}
        >
          GO BACK
        </motion.button>
      </div>
    </div>
  );
}
