
import { motion, AnimatePresence } from 'motion/react';
import { useState, useEffect, useRef } from 'react';
import { Users, Loader2, Play, Hash, Plus, Lock } from 'lucide-react';
import { NetworkManager } from '@/core/NetworkManager';
import { AuthManager } from '@/core/AuthManager';
import { SceneManager } from '@/core/SceneManager';
import { GameScene } from '@/scenes/GameScene';
import { VSScreen } from '@/screens/VSScreen';
import type { VSPlayerData } from '@/screens/VSScreen';

interface MultiplayerLobbyProps {
  onBack: () => void;
  onStartGame?: () => void;
}

export function MultiplayerLobby({ onBack, onStartGame }: MultiplayerLobbyProps) {
  const [queueMode, setQueueMode] = useState<'ranked' | 'unranked'>(AuthManager.isGuest ? 'unranked' : 'ranked');
  const [showPrivateOptions, setShowPrivateOptions] = useState(false);
  const [isConnected, setIsConnected] = useState(NetworkManager.isConnected);
  
  // Queue State
  const [isSearching, setIsSearching] = useState(false);
  const [queueCounts, setQueueCounts] = useState({ ranked: 0, unranked: 0 });
  const [matchStatus, setMatchStatus] = useState<string>('Idle');

  // VS Screen State
  const [showVSScreen, setShowVSScreen] = useState(false);
  const [vsPlayers, setVsPlayers] = useState<VSPlayerData[]>([]);
  const [vsRanked, setVsRanked] = useState(false);
  const pendingRoomId = useRef<string | null>(null);

  useEffect(() => {
    // Ensure we are connected
    // Ensure we are connected
    if (!NetworkManager.isConnected) {
        NetworkManager.connect();
    }
    
    // Force check if already connected (race condition fix)
    const socket = NetworkManager.getSocket();
    if (socket?.connected) {
        setIsConnected(true);
    }

    const onConnect = () => setIsConnected(true);
    const onDisconnect = () => setIsConnected(false);
    
    const onQueueUpdate = (data: { count: number, ranked: number, unranked: number }) => {
        setQueueCounts({ ranked: data.ranked, unranked: data.unranked });
    };

    const onMatchFound = (data: { roomId: string; ranked?: boolean; players?: any[] }) => {
        console.log("Lobby: Match Found!", data);
        setMatchStatus('Match Found!');
        setIsSearching(false);
        
        // Store room ID for later
        pendingRoomId.current = data.roomId;
        setVsRanked(data.ranked || false);
        
        // Build player data for VS screen
        const players: VSPlayerData[] = (data.players || []).map((p: any) => ({
          username: p.username || 'Player',
          avatarUrl: p.avatarUrl || null,
          gamesPlayed: p.gamesPlayed || 0,
          garbageSent: p.garbageSent || 0,
          elo: p.elo || 0,
          rank: p.rank || null,
          isGuest: !p.userId
        }));
        
        // Default fallback if no player data
        if (players.length < 2) {
          while (players.length < 2) {
            players.push({
              username: 'Player',
              gamesPlayed: 0,
              garbageSent: 0,
              isGuest: true
            });
          }
        }
        
        setVsPlayers(players);
        setShowVSScreen(true);
    };


    const onRoomCreated = (data: { roomId: string }) => {
        console.log("Lobby: Room Created", data);
        setMatchStatus(`Room Created: ${data.roomId}`);
        // For now, auto-join self? Usually server puts creator in room.
        // We might want to show a "Waiting Room" UI here instead of starting immediately?
        // But for this simplified flow, let's jump in.
        SceneManager.changeScene(new GameScene(data.roomId));
        if (onStartGame) onStartGame();
    };

    // Listeners
    NetworkManager.on('connect', onConnect);
    NetworkManager.on('disconnect', onDisconnect);
    NetworkManager.on('queue_update', onQueueUpdate);
    NetworkManager.on('match_found', onMatchFound);
    NetworkManager.on('room_created', onRoomCreated);

    return () => {
        NetworkManager.off('connect', onConnect);
        NetworkManager.off('disconnect', onDisconnect);
        NetworkManager.off('queue_update', onQueueUpdate);
        NetworkManager.off('match_found', onMatchFound);
        NetworkManager.off('room_created', onRoomCreated);
    };
  }, [onStartGame]);

  const handleToggleSearch = () => {
      if (isSearching) {
          NetworkManager.leaveQueue();
          setIsSearching(false);
          setMatchStatus('Idle');
      } else {
          // Join Logic
          NetworkManager.joinQueue(queueMode === 'ranked');
          setIsSearching(true);
          setMatchStatus('Searching...');
      }
  };

  const handleCreateRoom = () => {
      NetworkManager.createRoom();
      setMatchStatus('Creating Room...');
  };

  const handleJoinRoom = () => {
      const roomId = prompt("Enter Room ID:");
      if (roomId) {
          NetworkManager.joinRoom(roomId);
          // We need to listen for 'player_joined' or 'game_start' etc.
          // Assuming join_room succeeds, we should probably switch to a waiting room or the game scene.
          // For now, let's assume immediate jump or 'match_found' equivalent logic needs to trigger.
          // Actually, `NetworkManager.joinRoom` simply emits. 
          // If the room exists and we join, usually we get a success ack.
          // Let's rely on `match_found` or `game_start` events, OR just optimistically switch.
          // Better: switch to GameScene with roomId.
          SceneManager.changeScene(new GameScene(roomId));
          if (onStartGame) onStartGame();
      }
  };

  return (
    <div className="size-full relative overflow-hidden bg-[#0a0a12] flex items-center justify-center pointer-events-auto">
      {/* Background effects */}
      <div 
        className="absolute inset-0 opacity-[0.03]"
        style={{
          backgroundImage: `
            linear-gradient(rgba(139,92,246,0.3) 1px, transparent 1px),
            linear-gradient(90deg, rgba(139,92,246,0.3) 1px, transparent 1px)
          `,
          backgroundSize: '40px 40px',
        }}
      />

      <div className="w-full max-w-lg px-8 relative z-10">
        <motion.h1 
          className="text-5xl font-black text-white mb-10 tracking-tighter text-center italic drop-shadow-[0_0_15px_rgba(255,255,255,0.3)]"
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
        >
          MULTIPLAYER
        </motion.h1>

        {/* Queue Status */}
        <motion.div
            className="mb-8 p-8 bg-white/5 border border-white/10 rounded-2xl flex flex-col items-center relative backdrop-blur-sm shadow-2xl"
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, delay: 0.1 }}
        >
            <div className="flex flex-col items-center gap-2 mb-4 text-center">
            <div className="text-white font-black text-lg tracking-wide">
                QUEUE: <span className="text-[#FF5733] text-xl ml-2 drop-shadow-[0_0_8px_rgba(255,87,51,0.5)]">{queueMode === 'ranked' ? 'RANKED' : 'CASUAL'}</span> 
                <span className="text-white/40 ml-2 text-base font-normal">({queueMode === 'ranked' ? queueCounts.ranked : queueCounts.unranked})</span>
            </div>
            <div className="flex items-center gap-2 text-white/60 text-base h-8">
                {isSearching ? (
                    <>
                        <Loader2 className="w-5 h-5 animate-spin text-[#FF5733]" />
                        <span className="text-[#FF5733] font-bold tracking-wider">{matchStatus}</span>
                    </>
                ) : (
                    <span className="font-medium tracking-wide">{matchStatus === 'Idle' ? 'READY TO SEARCH' : matchStatus}</span>
                )}
            </div>
            </div>

            <div className="absolute bottom-3 left-4 flex items-center gap-2 text-emerald-400 text-[10px] font-bold opacity-60 uppercase tracking-widest">
            <div className={`w-1.5 h-1.5 rounded-full ${isConnected ? 'bg-emerald-400 shadow-[0_0_5px_currentColor]' : 'bg-red-500'} animate-pulse`} />
            <span>{isConnected ? 'ONLINE' : 'OFFLINE'}</span>
            </div>
        </motion.div>

        {/* Queue Mode Toggle */}
        <motion.div
           className="flex gap-4 mb-8"
           initial={{ opacity: 0, y: 20 }}
           animate={{ opacity: 1, y: 0 }}
           transition={{ duration: 0.4, delay: 0.2 }}
        >
           <button
             disabled={AuthManager.isGuest}
             className={`flex-1 py-4 px-6 rounded-xl font-black text-sm tracking-wider transition-all duration-200 flex items-center justify-center gap-2 border-2 ${
               AuthManager.isGuest
                 ? 'opacity-40 cursor-not-allowed bg-white/5 text-white/40 border-transparent'
                 : queueMode === 'ranked'
                   ? 'bg-[#FF5733] text-white border-[#FF5733] shadow-[0_4px_20px_rgba(255,87,51,0.3)] transform scale-105'
                   : 'bg-transparent text-white/60 border-white/10 hover:border-white/30 hover:bg-white/5'
             }`}
              onClick={() => {
                 if (!isSearching && !AuthManager.isGuest) setQueueMode('ranked');
             }}
           >
             {AuthManager.isGuest && <Lock className="w-3 h-3" />}
             RANKED
           </button>
           <button
             className={`flex-1 py-4 px-6 rounded-xl font-black text-sm tracking-wider transition-all duration-200 border-2 ${
               queueMode === 'unranked'
                 ? 'bg-white text-black border-white shadow-[0_4px_20px_rgba(255,255,255,0.2)] transform scale-105'
                 : 'bg-transparent text-white/60 border-white/10 hover:border-white/30 hover:bg-white/5'
             }`}
             onClick={() => {
                 if (!isSearching) setQueueMode('unranked');
             }}
           >
             UNRANKED
           </button>
        </motion.div>

        {/* PRIMARY ACTION: FIND MATCH */}
        <motion.button
           className={`w-full mb-6 px-8 py-6 rounded-2xl text-white font-black text-2xl tracking-widest transition-all duration-300 flex items-center justify-center gap-3 border-b-4 active:border-b-0 active:translate-y-1 ${
               isSearching 
               ? 'bg-red-500/10 border-red-500/50 text-red-400 hover:bg-red-500/20'
               : 'bg-gradient-to-r from-[#FF5733] to-[#ff8c33] border-[#cc4629] shadow-[0_8px_30px_rgba(255,87,51,0.4)] hover:shadow-[0_12px_40px_rgba(255,87,51,0.6)] hover:-translate-y-0.5'
           }`}
           onClick={handleToggleSearch}
           initial={{ opacity: 0 }}
           animate={{ opacity: 1 }}
           transition={{ duration: 0.3, delay: 0.25 }}
           whileTap={{ scale: 0.98 }}
        >
           {isSearching ? (
              <>
                STOP SEARCHING
              </>
           ) : (
              <>
                <Play className="w-6 h-6 fill-current" />
                FIND MATCH
              </>
           )}
        </motion.button>

        {/* Private Room Button */}
        <motion.button
           className="w-full mb-6 px-6 py-4 bg-white/5 border border-white/10 rounded-xl text-white/80 font-bold text-sm tracking-widest hover:bg-white/10 hover:border-white/20 hover:text-white transition-all duration-200 flex items-center justify-center gap-2 group"
           onClick={() => setShowPrivateOptions(!showPrivateOptions)}
           initial={{ opacity: 0 }}
           animate={{ opacity: 1 }}
           transition={{ duration: 0.4, delay: 0.3 }}
        >
           <Users className="w-4 h-4 group-hover:scale-110 transition-transform" />
           PRIVATE ROOM
        </motion.button>

        {/* Private Room Options */}
        <AnimatePresence>
           {showPrivateOptions && (
             <motion.div
               className="grid grid-cols-2 gap-3 mb-6"
               initial={{ opacity: 0, height: 0, marginBottom: 0 }}
               animate={{ opacity: 1, height: 'auto', marginBottom: 24 }}
               exit={{ opacity: 0, height: 0, marginBottom: 0 }}
               transition={{ duration: 0.3 }}
             >
               <button 
                 onClick={handleCreateRoom}
                 className="px-4 py-3 bg-white/5 border border-white/10 rounded-lg text-white font-bold text-xs tracking-wider hover:bg-white/10 hover:border-white/30 transition-all duration-200 flex items-center justify-center gap-2"
               >
                 <Plus className="w-3 h-3" />
                 CREATE
               </button>
               <button 
                 onClick={handleJoinRoom}
                 className="px-4 py-3 bg-white/5 border border-white/10 rounded-lg text-white font-bold text-xs tracking-wider hover:bg-white/10 hover:border-white/30 transition-all duration-200 flex items-center justify-center gap-2"
               >
                 <Hash className="w-3 h-3" />
                 JOIN
               </button>
             </motion.div>
           )}
        </AnimatePresence>

        <motion.button
           className="w-full py-4 text-white/30 hover:text-white font-bold text-xs tracking-[0.2em] uppercase transition-colors duration-200"
           onClick={onBack}
           initial={{ opacity: 0 }}
           animate={{ opacity: 1 }}
           transition={{ duration: 0.3, delay: 0.4 }}
        >
           GO BACK
        </motion.button>
      </div>

      {/* VS Screen Overlay */}
      <AnimatePresence>
        {showVSScreen && (
          <VSScreen
            players={vsPlayers}
            isRanked={vsRanked}
            onCountdownComplete={() => {
              setShowVSScreen(false);
              if (pendingRoomId.current) {
                SceneManager.changeScene(new GameScene(pendingRoomId.current));
                if (onStartGame) onStartGame();
              }
            }}
          />
        )}
      </AnimatePresence>
    </div>
  );
}
