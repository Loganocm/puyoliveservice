import { motion } from 'motion/react';
import { Users, Play, LogOut, Check, X, Settings, Copy, CheckCheck } from 'lucide-react';
import { GameButton } from '@/components/GameButton';
import { NetworkManager } from '@/core/NetworkManager';
import { useEffect, useState } from 'react';
import { useMenuInput } from '@/hooks/useMenuInput';

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

export interface RoomSettings {
    bestOf: 1 | 3 | 5;
    maxPlayers: 2 | 3 | 4;
    garbageMultiplier: number;
    marginTime: number;
}

const DEFAULT_SETTINGS: RoomSettings = {
    bestOf: 1,
    maxPlayers: 2,
    garbageMultiplier: 1,
    marginTime: 96,
};

export function RoomLobbyScreen({ roomId, isHost, onStart, onLeave }: RoomLobbyScreenProps) {
    const [players, setPlayers] = useState<PlayerInfo[]>([]);
    const [isReady, setIsReady] = useState(false);
    const [settings, setSettings] = useState<RoomSettings>(DEFAULT_SETTINGS);
    const [showSettings, setShowSettings] = useState(false);
    const [copied, setCopied] = useState(false);
    const [startError, setStartError] = useState<string | null>(null);

    // Menu back navigation
    useMenuInput({
        onBack: () => {
            onLeave();
        }
    }, [onLeave]);

    useEffect(() => {
        // Initial fetch
        NetworkManager.getRoomDetails(roomId);

        // Handle full room state update
        const handleRoomUpdate = (data: { players: any[], maxPlayers: number, settings?: RoomSettings }) => {
            console.log("Lobby: Room Update", data);
            setPlayers(data.players.map(p => ({
                id: p.id,
                username: p.username,
                ready: p.ready,
                isHost: p.isHost,
                elo: p.elo,
                avatarUrl: p.avatarUrl
            })));
            if (data.settings) {
                setSettings(data.settings);
            }
        };

        const handleGameStart = () => {
            onStart();
        };

        const handleSettingsUpdate = (data: { settings: RoomSettings }) => {
            setSettings(data.settings);
        };

        const handleError = (data: { message: string }) => {
            setStartError(data.message);
            setTimeout(() => setStartError(null), 3000);
        };

        // Listeners
        NetworkManager.on('room_update', handleRoomUpdate);
        NetworkManager.on('game_start', handleGameStart);
        NetworkManager.on('room_settings_update', handleSettingsUpdate);
        NetworkManager.on('error', handleError);
        
        const refreshRoom = () => NetworkManager.getRoomDetails(roomId);
        NetworkManager.on('player_joined', refreshRoom);
        NetworkManager.on('opponent_left', refreshRoom);

        return () => {
             NetworkManager.off('room_update', handleRoomUpdate);
             NetworkManager.off('game_start', handleGameStart);
             NetworkManager.off('room_settings_update', handleSettingsUpdate);
             NetworkManager.off('error', handleError);
             NetworkManager.off('player_joined', refreshRoom);
             NetworkManager.off('opponent_left', refreshRoom);
        };
    }, [roomId, onStart]);

    const toggleReady = () => {
        const newReadyState = !isReady;
        setIsReady(newReadyState);
        NetworkManager.toggleReady(roomId, newReadyState);
    };

    const handleCopyRoomId = () => {
        navigator.clipboard.writeText(roomId).then(() => {
            setCopied(true);
            setTimeout(() => setCopied(false), 2000);
        });
    };

    const allReady = players.length >= 2 && players.every(p => p.ready);

    const updateSetting = <K extends keyof RoomSettings>(key: K, value: RoomSettings[K]) => {
        const newSettings = { ...settings, [key]: value };
        setSettings(newSettings);
        NetworkManager.updateRoomSettings(roomId, newSettings);
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
                <div className="flex justify-between items-center mb-8 border-b border-white/10 pb-6">
                    <div>
                        <h2 className="text-3xl font-black text-white tracking-tighter italic">LOBBY</h2>
                        <button 
                            onClick={handleCopyRoomId}
                            className="text-white/40 font-mono mt-1 flex items-center gap-2 hover:text-white/60 transition-colors cursor-pointer group"
                        >
                            ROOM ID: <span className="text-emerald-400 select-all">{roomId}</span>
                            {copied ? (
                                <CheckCheck className="w-4 h-4 text-emerald-400" />
                            ) : (
                                <Copy className="w-4 h-4 opacity-0 group-hover:opacity-100 transition-opacity" />
                            )}
                        </button>
                    </div>
                    <div className="flex gap-4">
                        <div className="px-4 py-2 bg-white/5 rounded-lg border border-white/10 flex items-center gap-2">
                            <Users className="w-4 h-4 text-white/60" />
                            <span className="font-bold text-white">{players.length}/{settings.maxPlayers}</span>
                        </div>
                        {isHost && (
                            <button
                                onClick={() => setShowSettings(!showSettings)}
                                className={`px-4 py-2 rounded-lg border flex items-center gap-2 transition-all cursor-pointer ${
                                    showSettings 
                                        ? 'bg-emerald-500/20 border-emerald-500/30 text-emerald-400' 
                                        : 'bg-white/5 border-white/10 text-white/60 hover:bg-white/10'
                                }`}
                            >
                                <Settings className="w-4 h-4" />
                                <span className="font-bold text-sm">SETTINGS</span>
                            </button>
                        )}
                    </div>
                </div>

                {/* Settings Panel (host only, collapsible) */}
                {showSettings && isHost && (
                    <motion.div
                        initial={{ height: 0, opacity: 0 }}
                        animate={{ height: 'auto', opacity: 1 }}
                        exit={{ height: 0, opacity: 0 }}
                        className="mb-8 p-6 bg-white/5 border border-white/10 rounded-xl overflow-hidden"
                    >
                        <h3 className="text-sm font-black text-white/60 tracking-widest mb-4 uppercase">Room Settings</h3>
                        <div className="grid grid-cols-2 gap-6">
                            {/* Best Of */}
                            <div>
                                <label className="text-xs font-bold text-white/40 tracking-wider mb-2 block">BEST OF</label>
                                <div className="flex gap-2">
                                    {([1, 3, 5] as const).map(n => (
                                        <button
                                            key={n}
                                            onClick={() => updateSetting('bestOf', n)}
                                            className={`px-4 py-2 rounded-lg font-bold text-sm transition-all cursor-pointer ${
                                                settings.bestOf === n 
                                                    ? 'bg-emerald-500/20 border border-emerald-500/50 text-emerald-400' 
                                                    : 'bg-white/5 border border-white/10 text-white/60 hover:bg-white/10'
                                            }`}
                                        >
                                            BO{n}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* Max Players */}
                            <div>
                                <label className="text-xs font-bold text-white/40 tracking-wider mb-2 block">MAX PLAYERS</label>
                                <div className="flex gap-2">
                                    {([2, 3, 4] as const).map(n => (
                                        <button
                                            key={n}
                                            onClick={() => updateSetting('maxPlayers', n)}
                                            className={`px-4 py-2 rounded-lg font-bold text-sm transition-all cursor-pointer ${
                                                settings.maxPlayers === n 
                                                    ? 'bg-emerald-500/20 border border-emerald-500/50 text-emerald-400' 
                                                    : 'bg-white/5 border border-white/10 text-white/60 hover:bg-white/10'
                                            }`}
                                        >
                                            {n}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* Garbage Multiplier */}
                            <div>
                                <label className="text-xs font-bold text-white/40 tracking-wider mb-2 block">GARBAGE MULTIPLIER</label>
                                <div className="flex gap-2">
                                    {[0.5, 1, 1.5, 2].map(n => (
                                        <button
                                            key={n}
                                            onClick={() => updateSetting('garbageMultiplier', n)}
                                            className={`px-4 py-2 rounded-lg font-bold text-sm transition-all cursor-pointer ${
                                                settings.garbageMultiplier === n 
                                                    ? 'bg-emerald-500/20 border border-emerald-500/50 text-emerald-400' 
                                                    : 'bg-white/5 border border-white/10 text-white/60 hover:bg-white/10'
                                            }`}
                                        >
                                            {n}x
                                        </button>
                                    ))}
                                </div>
                            </div>

                            {/* Margin Time */}
                            <div>
                                <label className="text-xs font-bold text-white/40 tracking-wider mb-2 block">MARGIN TIME (sec)</label>
                                <div className="flex gap-2">
                                    {[60, 96, 128, 192].map(n => (
                                        <button
                                            key={n}
                                            onClick={() => updateSetting('marginTime', n)}
                                            className={`px-4 py-2 rounded-lg font-bold text-sm transition-all cursor-pointer ${
                                                settings.marginTime === n 
                                                    ? 'bg-emerald-500/20 border border-emerald-500/50 text-emerald-400' 
                                                    : 'bg-white/5 border border-white/10 text-white/60 hover:bg-white/10'
                                            }`}
                                        >
                                            {n}s
                                        </button>
                                    ))}
                                </div>
                            </div>
                        </div>
                    </motion.div>
                )}

                {/* Room Settings Display (guest view) */}
                {!isHost && (
                    <div className="mb-6 flex gap-4 flex-wrap">
                        <div className="px-3 py-1.5 bg-white/5 rounded-lg border border-white/10 text-xs font-bold text-white/50">
                            BO{settings.bestOf}
                        </div>
                        <div className="px-3 py-1.5 bg-white/5 rounded-lg border border-white/10 text-xs font-bold text-white/50">
                            {settings.garbageMultiplier}x GARBAGE
                        </div>
                        <div className="px-3 py-1.5 bg-white/5 rounded-lg border border-white/10 text-xs font-bold text-white/50">
                            MARGIN {settings.marginTime}s
                        </div>
                    </div>
                )}

                {/* Player Slots */}
                <div className={`grid grid-cols-1 ${settings.maxPlayers <= 2 ? 'md:grid-cols-2' : settings.maxPlayers === 3 ? 'md:grid-cols-3' : 'md:grid-cols-4'} gap-4 mb-8`}>
                    {Array.from({ length: settings.maxPlayers }).map((_, idx) => {
                        const player = players[idx];
                        return (
                            <div key={idx} className={`
                                h-44 rounded-xl border-2 flex flex-col items-center justify-center gap-3 transition-all
                                ${player 
                                    ? player.ready 
                                        ? 'border-emerald-500/30 bg-emerald-500/5' 
                                        : 'border-amber-500/20 bg-amber-500/5'
                                    : 'border-dashed border-white/10 bg-white/5'}
                            `}>
                                {player ? (
                                    <>
                                        <div className="relative">
                                             <div className="w-16 h-16 rounded-full bg-slate-800 border-2 border-white/20 overflow-hidden" />
                                             {player.isHost && (
                                                 <div className="absolute -bottom-1 -right-1 bg-yellow-500 text-black text-[9px] font-bold px-1.5 py-0.5 rounded-full">HOST</div>
                                             )}
                                        </div>
                                        <div className="text-center">
                                            <div className="font-bold text-lg text-white">{player.username}</div>
                                            <div className="text-white/40 text-xs font-mono">{player.elo || 1000} ELO</div>
                                        </div>
                                        {/* Ready Indicator */}
                                        <div className={`flex items-center gap-1.5 text-xs font-bold tracking-wider ${
                                            player.ready ? 'text-emerald-400' : 'text-amber-400'
                                        }`}>
                                            {player.ready ? <Check className="w-3.5 h-3.5" /> : <X className="w-3.5 h-3.5" />}
                                            {player.ready ? 'READY' : 'NOT READY'}
                                        </div>
                                    </>
                                ) : (
                                    <>
                                        <div className="w-14 h-14 rounded-full bg-white/5 flex items-center justify-center">
                                            <Users className="w-5 h-5 text-white/20" />
                                        </div>
                                        <div className="text-white/20 font-bold text-sm tracking-widest">WAITING...</div>
                                    </>
                                )}
                            </div>
                        );
                    })}
                </div>

                {/* Error Banner */}
                {startError && (
                    <motion.div 
                        initial={{ opacity: 0, y: -10 }}
                        animate={{ opacity: 1, y: 0 }}
                        className="mb-4 p-3 bg-red-500/20 border border-red-500/30 rounded-lg text-center text-red-300 text-sm font-bold"
                    >
                        {startError}
                    </motion.div>
                )}

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
                         {/* Ready Toggle (both host and guest) */}
                         <GameButton 
                            variant={isReady ? 'primary' : 'secondary'}
                            onClick={toggleReady}
                            className="w-48"
                            icon={isReady ? Check : X}
                         >
                             {isReady ? 'READY!' : 'NOT READY'}
                         </GameButton>

                         {/* Start Button (host only) */}
                         {isHost && (
                            <GameButton 
                                variant="primary"
                                onClick={() => NetworkManager.startGame(roomId)}
                                disabled={!allReady}
                                className="w-56"
                                icon={Play}
                            >
                                {!allReady ? 'WAITING...' : 'START GAME'}
                            </GameButton>
                         )}
                    </div>
                </div>

            </motion.div>
        </div>
    );
}
