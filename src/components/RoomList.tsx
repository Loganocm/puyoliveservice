
import { motion, AnimatePresence } from 'motion/react';
import { Users, Lock, MonitorPlay, RefreshCw } from 'lucide-react';
import { GameButton } from './GameButton';

export interface RoomData {
  id: string;
  name?: string;
  players: number;
  maxPlayers: number;
  status: 'waiting' | 'playing';
  isPrivate: boolean;
}

interface RoomListProps {
  rooms: RoomData[];
  onJoin: (roomId: string) => void;
  onRefresh: () => void;
  isLoading?: boolean;
}

export function RoomList({ rooms, onJoin, onRefresh, isLoading = false }: RoomListProps) {
  return (
    <div className="w-full bg-black/20 border border-white/10 rounded-2xl overflow-hidden backdrop-blur-sm flex flex-col h-[400px]">
      {/* Header */}
      <div className="p-4 border-b border-white/10 flex items-center justify-between bg-white/5">
        <div className="flex items-center gap-2 text-white/80">
          <MonitorPlay className="w-5 h-5 text-emerald-400" />
          <h3 className="font-bold tracking-wider text-sm">PUBLIC ROOMS</h3>
        </div>
        <button 
          onClick={onRefresh}
          disabled={isLoading}
          className="p-2 hovered:bg-white/10 rounded-lg transition-colors text-white/60 hover:text-white disabled:opacity-50"
        >
          <RefreshCw className={`w-4 h-4 ${isLoading ? 'animate-spin' : ''}`} />
        </button>
      </div>

      {/* List Content */}
      <div className="flex-1 overflow-y-auto p-2 space-y-2 custom-scrollbar">
        <AnimatePresence mode='popLayout'>
          {rooms.length === 0 ? (
            <motion.div 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="h-full flex flex-col items-center justify-center text-white/30 gap-2"
            >
              <Users className="w-12 h-12 opacity-50" />
              <p className="font-bold text-sm tracking-widest">NO ACTIVE ROOMS</p>
            </motion.div>
          ) : (
            rooms.map((room, index) => (
              <motion.div
                key={room.id}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95 }}
                transition={{ delay: index * 0.05 }}
                className="group flex items-center justify-between p-3 rounded-xl bg-white/5 border border-white/5 hover:bg-white/10 hover:border-white/20 transition-all"
              >
                <div className="flex flex-col">
                   <div className="flex items-center gap-2">
                       <span className="font-bold text-white text-sm tracking-wide">
                          {room.name || `Room ${room.id.substring(0,6)}`}
                       </span>
                       {room.isPrivate && <Lock className="w-3 h-3 text-white/40" />}
                   </div>
                   <div className="flex items-center gap-2 text-xs font-medium mt-1">
                      <span className={`${room.status === 'playing' ? 'text-amber-400' : 'text-emerald-400'}`}>
                          {room.status === 'playing' ? 'IN PROGRESS' : 'WAITING'}
                      </span>
                      <span className="text-white/20">•</span>
                      <span className="text-white/60">
                          {room.players}/{room.maxPlayers} PLAYERS
                      </span>
                   </div>
                </div>

                <GameButton
                    variant={room.status === 'playing' || room.players >= room.maxPlayers ? "ghost" : "secondary"}
                    className="h-9 px-4 text-xs min-h-0"
                    onClick={() => onJoin(room.id)}
                    disabled={room.status === 'playing' || room.players >= room.maxPlayers}
                    fullWidth={false}
                >
                    {room.status === 'playing' ? 'SPECTATE' : 'JOIN'}
                </GameButton>
              </motion.div>
            ))
          )}
        </AnimatePresence>
      </div>
    </div>
  );
}
