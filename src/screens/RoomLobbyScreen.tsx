import { motion } from 'motion/react';
import { Users, Play, LogOut, Check, X } from 'lucide-react';
import { GameButton } from '@/components/GameButton';
import { NetworkManager } from '@/core/NetworkManager';
import { useEffect, useState } from 'react';

interface RoomLobbyScreenProps {
    roomId: string;
    isHost: boolean;
    onStart: () => void;
    onLeave: () => void;
}

interface PlayerInfo {
    id: string;
    username: string;
    ready: boolean;
    isHost: boolean;
    elo?: number;
    avatarUrl?: string;
}

export function RoomLobbyScreen({ roomId, isHost, onStart, onLeave }: RoomLobbyScreenProps) {
    const [players, setPlayers] = useState<PlayerInfo[]>([]);
    const [isReady, setIsReady] = useState(false);

    useEffect(() => {
        // Initial fetch
        NetworkManager.getRoomDetails(roomId);

        // Handle full room state update
        const handleRoomUpdate = (data: { players: any[], maxPlayers: number }) => {
            console.log("Lobby: Room Update", data);
            setPlayers(data.players.map(p => ({
                id: p.id,
                username: p.username,
                ready: p.ready,
                isHost: p.isHost,
                elo: p.elo,
                avatarUrl: p.avatarUrl
            })));
        };

        const handleGameStart = () => {
            onStart();
        };

        // Listeners
        NetworkManager.on('room_update', handleRoomUpdate);
        NetworkManager.on('game_start', handleGameStart);
        
        // We can also listen for 'player_joined' to trigger a refresh if needed, for robustness,
        // but 'room_update' is broadcast on join/leave/ready toggles by the server now.
        const refreshRoom = () => NetworkManager.getRoomDetails(roomId);
        NetworkManager.on('player_joined', refreshRoom);
        NetworkManager.on('opponent_left', refreshRoom);

        return () => {
             NetworkManager.off('room_update', handleRoomUpdate);
             NetworkManager.off('game_start', handleGameStart);
             NetworkManager.off('player_joined', refreshRoom);
             NetworkManager.off('opponent_left', refreshRoom);
        };
    }, [roomId, onStart]);

    const toggleReady = () => {
        const newReadyState = !isReady;
        setIsReady(newReadyState);
        NetworkManager.toggleReady(roomId, newReadyState);
    };

    return (
        <div className="size-full flex flex-col items-center justify-center p-8 relative">
             {/* Background effects */}
            <div 
                className="absolute inset-0 opacity-[0.03] pointer-events-none"
                    style={{
                    backgroundImage: `
                        linear-gradient(rgba(52, 211, 153, 0.3) 1px, transparent 1px),
                        linear-gradient(90deg, rgba(52, 211, 153, 0.3) 1px, transparent 1px)
                    `,
                    backgroundSize: '40px 40px',
                }}
            />

            <motion.div 
                className="w-full max-w-4xl bg-[#0a0a12]/90 border border-white/10 rounded-2xl p-8 backdrop-blur-xl shadow-2xl"
                initial={{ opacity: 0, scale: 0.95 }}
                animate={{ opacity: 1, scale: 1 }}
            >
                {/* Header */}
                <div className="flex justify-between items-center mb-12 border-b border-white/10 pb-6">
                    <div>
                        <h2 className="text-3xl font-black text-white tracking-tighter italic">LOBBY</h2>
                        <div className="text-white/40 font-mono mt-1">ROOM ID: <span className="text-emerald-400 select-all">{roomId}</span></div>
                    </div>
                    <div className="flex gap-4">
                        <div className="px-4 py-2 bg-white/5 rounded-lg border border-white/10 flex items-center gap-2">
                            <Users className="w-4 h-4 text-white/60" />
                            <span className="font-bold text-white">{players.length}/2</span>
                        </div>
                    </div>
                </div>

                {/* Player Slots */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-12">
                    {/* Render empty slots if needed */}
                    {[0, 1].map((idx) => {
                        const player = players[idx];
                        return (
                            <div key={idx} className={`
                                h-48 rounded-xl border-2 flex flex-col items-center justify-center gap-4 transition-all
                                ${player ? 'border-emerald-500/20 bg-emerald-500/5' : 'border-dashed border-white/10 bg-white/5'}
                            `}>
                                {player ? (
                                    <>
                                        <div className="relative">
                                             <div className="w-20 h-20 rounded-full bg-slate-800 border-2 border-white/20 overflow-hidden">
                                                {/* Avatar */}
                                             </div>
                                             {player.isHost && (
                                                 <div className="absolute -bottom-2 -right-2 bg-yellow-500 text-black text-[10px] font-bold px-2 py-0.5 rounded-full">HOST</div>
                                             )}
                                        </div>
                                        <div className="text-center">
                                            <div className="font-bold text-xl text-white">{player.username}</div>
                                            <div className="text-white/40 text-sm font-mono">{player.elo || 1000} ELO</div>
                                        </div>
                                    </>
                                ) : (
                                    <>
                                        <div className="w-16 h-16 rounded-full bg-white/5 flex items-center justify-center">
                                            <Users className="w-6 h-6 text-white/20" />
                                        </div>
                                        <div className="text-white/20 font-bold tracking-widest">WAITING...</div>
                                    </>
                                )}
                            </div>
                        );
                    })}
                </div>

                {/* Actions */}
                <div className="flex justify-between items-center">
                    <GameButton 
                        variant="danger" 
                        onClick={onLeave}
                        className="w-40"
                        icon={LogOut}
                    >
                        LEAVE
                    </GameButton>

                    <div className="flex gap-4">
                         {/* Toggle Ready Button (for Guest) or Start (for Host) */}
                         {!isHost ? (
                             <GameButton 
                                variant={isReady ? 'primary' : 'secondary'}
                                onClick={toggleReady}
                                className="w-48"
                                icon={isReady ? Check : X}
                             >
                                 {isReady ? 'READY!' : 'NOT READY'}
                             </GameButton>
                         ) : (
                            <GameButton 
                                variant="primary"
                                onClick={() => NetworkManager.startGame(roomId)}
                                disabled={players.length < 2} // TODO: Add check for opponent ready
                                className="w-64"
                                icon={Play}
                            >
                                START GAME
                            </GameButton>
                         )}
                    </div>
                </div>

            </motion.div>
        </div>
    );
}
