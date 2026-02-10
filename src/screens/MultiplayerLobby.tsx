import { motion, AnimatePresence } from 'motion/react';
import { useState, useEffect, useRef } from 'react';
import { Users, Loader2, Play, Hash, Plus, Trophy } from 'lucide-react';
import { MenuBanner } from '@/components/MenuBanner';
import { BackButton } from '@/components/BackButton';
import { GameButton } from '@/components/GameButton';
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
    <div className="size-full relative overflow-hidden bg-transparent flex items-center justify-center pointer-events-auto">
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

      <BackButton onClick={onBack} />

      <div className="w-full max-w-5xl px-8 relative z-10 flex flex-col items-center">
        <motion.h1 
          className="text-6xl font-black text-white mb-12 tracking-tighter text-center italic drop-shadow-[0_0_15px_rgba(255,255,255,0.3)]"
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
        >
          MULTIPLAYER
        </motion.h1>

        {/* Searching Overlay Status */}
        <AnimatePresence>
            {isSearching && (
                <motion.div 
                    initial={{ opacity: 0, scale: 0.9 }}
                    animate={{ opacity: 1, scale: 1 }}
                    exit={{ opacity: 0, scale: 0.9 }}
                    className="absolute inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm rounded-3xl"
                >
                    <div className="flex flex-col items-center gap-6 p-8 bg-[#1a1a24] border border-white/10 rounded-2xl shadow-2xl">
                        <Loader2 className="w-12 h-12 text-[#FF5733] animate-spin" />
                        <div className="text-center">
                            <h3 className="text-2xl font-black text-white mb-2">SEARCHING FOR OPPONENT...</h3>
                            <p className="text-white/40 font-bold tracking-wider">{queueMode === 'ranked' ? 'RANKED' : 'CASUAL'} MATCH</p>
                        </div>
                        <GameButton 
                            variant="secondary"
                            onClick={handleToggleSearch}
                            className="rounded-full px-8"
                        >
                            CANCEL
                        </GameButton>
                    </div>
                </motion.div>
            )}
        </AnimatePresence>

        <div className="w-full max-w-4xl grid grid-cols-1 gap-4">
            {/* Quick Play Banner */}
            <MenuBanner
                title="QUICK PLAY"
                description="CASUAL MATCHMAKING • NO RANKING ON THE LINE"
                icon={Play}
                color="#3B82F6"
                gradient="linear-gradient(135deg, rgba(59,130,246,0.4) 0%, transparent 100%)"
                onClick={() => {
                    setQueueMode('unranked');
                    if (!isSearching) { // If not searching, start
                        // Note: state update is async, so we might need a useEffect or just call joinQueue directly with 'false'
                         NetworkManager.joinQueue(false); // false = unranked
                         setIsSearching(true);
                         setMatchStatus('Searching...');
                    }
                }}
                playerCount={queueCounts.unranked}
                delay={0.1}
            />

            {/* Ranked Banner */}
            <MenuBanner
                title="TETRA LEAGUE"
                description={AuthManager.isGuest ? "LOGIN REQUIRED TO PLAY RANKED" : "COMPETITIVE MATCHMAKING • CLIMB THE LADDER"}
                icon={Trophy}
                color="#FF5733"
                gradient="linear-gradient(135deg, rgba(255,87,51,0.4) 0%, transparent 100%)"
                disabled={AuthManager.isGuest}
                onClick={() => {
                    setQueueMode('ranked');
                    if (!isSearching) {
                        NetworkManager.joinQueue(true); // true = ranked
                        setIsSearching(true);
                        setMatchStatus('Searching...');
                    }
                }}
                playerCount={queueCounts.ranked}
                delay={0.2}
            />

            {/* Custom Game Banner */}
            <div className="relative">
                <MenuBanner
                    title="CUSTOM GAME"
                    description="CREATE PUBLIC AND PRIVATE ROOMS TO PLAY BY YOUR RULES"
                    icon={Users}
                    color="#A855F7"
                    gradient="linear-gradient(135deg, rgba(168,85,247,0.4) 0%, transparent 100%)"
                    onClick={() => setShowPrivateOptions(!showPrivateOptions)}
                    delay={0.3}
                />
                
                {/* Expandable Custom Options */}
                <AnimatePresence>
                    {showPrivateOptions && (
                        <motion.div
                            initial={{ height: 0, opacity: 0, marginTop: 0 }}
                            animate={{ height: 'auto', opacity: 1, marginTop: 12 }}
                            exit={{ height: 0, opacity: 0, marginTop: 0 }}
                            className="overflow-hidden grid grid-cols-2 gap-4 pl-4"
                        >
                             <button 
                                onClick={handleCreateRoom}
                                className="p-6 bg-white/5 border border-white/10 rounded-xl text-left hover:bg-white/10 hover:border-white/30 transition-all group"
                             >
                                <div className="flex items-center gap-3 mb-2 text-[#A855F7]">
                                    <Plus className="w-6 h-6" />
                                    <span className="font-black tracking-wider text-sm">CREATE ROOM</span>
                                </div>
                                <p className="text-white/40 text-xs font-medium">Host a new game lobby</p>
                             </button>
                             
                             <button 
                                onClick={handleJoinRoom}
                                className="p-6 bg-white/5 border border-white/10 rounded-xl text-left hover:bg-white/10 hover:border-white/30 transition-all group"
                             >
                                <div className="flex items-center gap-3 mb-2 text-[#A855F7]">
                                    <Hash className="w-6 h-6" />
                                    <span className="font-black tracking-wider text-sm">JOIN ROOM</span>
                                </div>
                                <p className="text-white/40 text-xs font-medium">Enter via Room ID</p>
                             </button>
                        </motion.div>
                    )}
                </AnimatePresence>
            </div>

            {/* Room Listing (Placeholder for now) */}
            <MenuBanner
                title="ROOM LISTING"
                description="JOIN PUBLIC GAMES"
                icon={Hash} // Using Hash as generic list icon for now
                color="#10B981"
                gradient="linear-gradient(135deg, rgba(16,185,129,0.4) 0%, transparent 100%)"
                onClick={() => alert("Room listing coming soon!")} // Placeholder
                playerCount={0} // Placeholder
                delay={0.4}
                disabled={true} // Disabled until implemented
            />

        </div>

        {/* Online Status Footer */}
        <div className="mt-8 flex items-center gap-2 text-emerald-400 text-xs font-bold opacity-60 uppercase tracking-widest">
            <div className={`w-2 h-2 rounded-full ${isConnected ? 'bg-emerald-400 shadow-[0_0_5px_currentColor]' : 'bg-red-500'} ${isConnected ? 'animate-pulse' : ''}`} />
            <span>{isConnected ? 'ONLINE & CONNECTED' : 'OFFLINE - RECONNECTING...'}</span>
        </div>

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
