import { motion, AnimatePresence } from "motion/react";
import { useState, useEffect, useRef } from "react";
import { useMenuInput } from "@/hooks/useMenuInput";
import {
  Users,
  Loader2,
  Play,
  Hash,
  Plus,
  Trophy,
  Pickaxe,
} from "lucide-react";
import { MenuBanner } from "@/components/MenuBanner";
import { BackButton } from "@/components/BackButton";
import { GameButton } from "@/components/GameButton";
import { RoomList, type RoomData } from "@/components/RoomList";
import { NetworkManager } from "@/core/NetworkManager";
import { AuthManager } from "@/core/AuthManager";
import { SceneManager } from "@/core/SceneManager";
import { GameScene } from "@/scenes/GameScene";
import { VSScreen } from "@/screens/VSScreen";
import type { VSPlayerData } from "@/screens/VSScreen";

interface MultiplayerLobbyProps {
  onBack: () => void;
  onStartGame?: () => void;
  onQuickPlay?: () => void;
}

import { RoomLobbyScreen } from "@/screens/RoomLobbyScreen";
import { GameEvents } from "@/core/GameEvents";

export function MultiplayerLobby({
  onBack,
  onStartGame,
  onQuickPlay,
}: MultiplayerLobbyProps) {
  const [queueMode, setQueueMode] = useState<"ranked" | "unranked">(
    AuthManager.isGuest ? "unranked" : "ranked",
  );
  const [showPrivateOptions, setShowPrivateOptions] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [isConnected, setIsConnected] = useState(NetworkManager.isConnected);

  // Room List State
  const [rooms, setRooms] = useState<RoomData[]>([]);
  const [isLoadingRooms, setIsLoadingRooms] = useState(false);

  // Queue State
  const [isSearching, setIsSearchingState] = useState(false);
  const isSearchingRef = useRef(false);
  const setIsSearching = (val: boolean) => {
    isSearchingRef.current = val;
    setIsSearchingState(val);
  };
  const [queueCounts, setQueueCounts] = useState({ ranked: 0, unranked: 0 });

  // Lobby State (for Custom Games)
  const [activeRoomId, setActiveRoomId] = useState<string | null>(null);
  const [isHost, setIsHost] = useState(false);

  // VS Screen State
  const [showVSScreen, setShowVSScreen] = useState(false);
  const [vsPlayers, setVsPlayers] = useState<VSPlayerData[]>([]);
  const [vsRanked, setVsRanked] = useState(false);
  const pendingRoomId = useRef<string | null>(null);
  const pendingSeed = useRef<number | undefined>(undefined);
  const pendingOpponentId = useRef<string | undefined>(undefined);

  useMenuInput({
    onBack: () => {
      // If a modal is open, back should close the modal first
      if (showVSScreen) return; // Ignore back while VS screen transitions
      
      if (showCreateModal) {
        setShowCreateModal(false);
      } else if (showPrivateOptions) {
        setShowPrivateOptions(false);
      } else if (activeRoomId) {
        NetworkManager.leaveRoom(activeRoomId);
      } else if (isSearching || isSearchingRef.current) {
        NetworkManager.leaveQueue();
        setIsSearching(false);
      } else {
        onBack();
      }
    }
  }, [showCreateModal, showPrivateOptions, activeRoomId, isSearching, showVSScreen, onBack]);

  useEffect(() => {
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

    const onQueueUpdate = (data: {
      count: number;
      ranked: number;
      unranked: number;
    }) => {
      setQueueCounts({ ranked: data.ranked, unranked: data.unranked });
    };

    const onRoomListUpdate = (updatedRooms: any[]) => {
      setIsLoadingRooms(false);
      setRooms(
        updatedRooms.map((r) => ({
          id: r.id,
          name: r.name,
          players: r.players,
          maxPlayers: r.maxPlayers,
          status: r.status,
          isPrivate: r.isPrivate,
        })),
      );
    };

    const onMatchFound = (data: {
      roomId: string;
      ranked?: boolean;
      players?: any[];
    }) => {
      console.log("Lobby: Match Found!", data);
      setIsSearching(false);

      // Matchmaking matches go straight to VS screen -> Game
      pendingRoomId.current = data.roomId;
      setVsRanked(data.ranked || false);

      // Build player data for VS screen
      const players: VSPlayerData[] = (data.players || []).map((p: any) => ({
        username: p.username || "Player",
        avatarUrl: p.avatarUrl || null,
        gamesPlayed: p.gamesPlayed || 0,
        garbageSent: p.garbageSent || 0,
        elo: p.elo || 0,
        rank: p.rank || null,
        isGuest: !p.userId,
      }));

      // Default fallback if no player data
      if (players.length < 2) {
        while (players.length < 2) {
          players.push({
            username: "Player",
            gamesPlayed: 0,
            garbageSent: 0,
            isGuest: true,
          });
        }
      }

      setVsPlayers(players);
      setShowVSScreen(true);
    };

    const onRoomCreated = (data: { roomId: string }) => {
      console.log("Lobby: Room Created", data);
      // Custom Game: Go to Lobby Screen
      setActiveRoomId(data.roomId);
      setIsHost(true);
    };

    // Game ended - clean up lobby state
    const onGameEnded = (data: { roomId?: string }) => {
      console.log("Lobby: Game Ended", data);
      // Reset room state so we go back to lobby menu, not stale player list
      setActiveRoomId(null);
      setIsHost(false);
      // Refresh room list
      setIsLoadingRooms(true);
      NetworkManager.getRooms();
    };

    // game_start from server carries the seed and player IDs
    const onGameStart = (data: {
      seed?: number;
      roomId?: string;
      players?: string[];
    }) => {
      console.log("Lobby: Game Start (seed received)", data);
      if (data.seed !== undefined) {
        pendingSeed.current = data.seed;
      }
      // Identify opponent from player list
      if (data.players && Array.isArray(data.players)) {
        const myId = NetworkManager.getSocket()?.id;
        pendingOpponentId.current = data.players.find(
          (id: string) => id !== myId,
        );
      }
    };

    // Listen for queue errors (like not enough games played)
    const onError = (data: { message: string }) => {
      console.warn("Lobby Error:", data);
      setIsSearching(false);
      isSearchingRef.current = false;
      alert(data.message); // Inform the user why they couldn't join the queue
    };

    // Listeners
    NetworkManager.on("connect", onConnect);
    NetworkManager.on("disconnect", onDisconnect);
    NetworkManager.on("queue_update", onQueueUpdate);
    NetworkManager.on("room_list_update", onRoomListUpdate);
    NetworkManager.on("match_found", onMatchFound);
    NetworkManager.on("room_created", onRoomCreated);
    NetworkManager.on("game_ended", onGameEnded);
    NetworkManager.on("game_start", onGameStart);
    NetworkManager.on("error", onError);

    // Initial Rooms Fetch
    setIsLoadingRooms(true);
    NetworkManager.getRooms();
    
    // Request Queue Stats for Realtime Metric
    const socketRef = NetworkManager.getSocket();
    if (socketRef && socketRef.connected) {
      socketRef.emit('get_queue_stats');
    }

    return () => {
      // Leave queue if still searching when component unmounts
      if (isSearchingRef.current) {
        NetworkManager.leaveQueue();
      }
      NetworkManager.off("connect", onConnect);
      NetworkManager.off("disconnect", onDisconnect);
      NetworkManager.off("queue_update", onQueueUpdate);
      NetworkManager.off("room_list_update", onRoomListUpdate);
      NetworkManager.off("match_found", onMatchFound);
      NetworkManager.off("room_created", onRoomCreated);
      NetworkManager.off("game_ended", onGameEnded);
      NetworkManager.off("game_start", onGameStart);
      NetworkManager.off("error", onError);
    };
  }, []);

  // Menu Navigation: Listen for menu_back events from MenuScene
  // (MenuScene emits this on Escape press, which is the authoritative source)
  useEffect(() => {
    const handleMenuBack = () => {
      if (showCreateModal) {
        setShowCreateModal(false);
        return;
      }
      if (showPrivateOptions) {
        setShowPrivateOptions(false);
        return;
      }
      if (isSearching) {
        handleToggleSearch(); // Cancel search
        return;
      }
      if (activeRoomId) {
        return;
      }

      // Default: Go back to main menu
      onBack();
    };
    GameEvents.on("menu_back", handleMenuBack);
    return () => {
      GameEvents.off("menu_back", handleMenuBack);
    };
  }, [showCreateModal, showPrivateOptions, isSearching, activeRoomId, onBack]);

  const handleToggleSearch = () => {
    if (isSearching) {
      NetworkManager.leaveQueue();
      setIsSearching(false);
    } else {
      // Join Logic
      NetworkManager.joinQueue(queueMode === "ranked");
      setIsSearching(true);
    }
  };

  const handleJoinRoom = (roomId?: string) => {
    let targetId = roomId;
    if (typeof targetId !== "string") {
      targetId = prompt("Enter Room ID:") || undefined;
    }

    if (targetId) {
      NetworkManager.joinRoom(targetId);
      // For joining custom room, we assume success and go to lobby
      // Ideally we wait for a 'joined_room' event, but 'player_joined' might fire?
      // Let's set active immediately
      setActiveRoomId(targetId);
      setIsHost(false);
    }
  };

  const handleLobbyStart = () => {
    // Triggered by Lobby Screen when game actually starts (e.g. Host clicked start)
    if (activeRoomId) {
      SceneManager.changeScene(new GameScene(activeRoomId));
      if (onStartGame) onStartGame();
    }
  };

  const handleLobbyLeave = () => {
    if (activeRoomId) {
      NetworkManager.leaveRoom(activeRoomId);
      setActiveRoomId(null);
      setIsHost(false);
    }
  };

  // Render Lobby Screen if in a room
  if (activeRoomId) {
    return (
      <RoomLobbyScreen
        roomId={activeRoomId}
        isHost={isHost}
        onStart={handleLobbyStart}
        onLeave={handleLobbyLeave}
      />
    );
  }

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
          backgroundSize: "40px 40px",
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
                  <h3 className="text-2xl font-black text-white mb-2">
                    SEARCHING FOR OPPONENT...
                  </h3>
                  <p className="text-white/40 font-bold tracking-wider">
                    {queueMode === "ranked" ? "RANKED" : "CASUAL"} MATCH
                  </p>
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
          {/* Puyo Mines - FFA Survival */}
          <MenuBanner
            title="PUYO MINES"
            description="FFA SURVIVAL · DIG DEEPER · OUTLAST EVERYONE"
            icon={Pickaxe}
            color="#06B6D4"
            gradient="linear-gradient(135deg, rgba(6,182,212,0.4) 0%, transparent 100%)"
            onClick={() => onQuickPlay?.()}
            delay={0.05}
          />

          {/* Unranked Banner */}
          <MenuBanner
            title="UNRANKED"
            description="CASUAL 1V1 MATCHMAKING • NO RANKING ON THE LINE"
            icon={Play}
            color="#3B82F6"
            gradient="linear-gradient(135deg, rgba(59,130,246,0.4) 0%, transparent 100%)"
            onClick={() => {
              setQueueMode("unranked");
              if (!isSearching) {
                NetworkManager.joinQueue(false); // false = unranked
                setIsSearching(true);
              }
            }}
            playerCount={queueCounts.unranked}
            delay={0.1}
          />

          {/* Ranked Banner */}
          <MenuBanner
            title="RANKED"
            description={
              AuthManager.isGuest
                ? "LOGIN REQUIRED TO PLAY RANKED"
                : "COMPETITIVE MATCHMAKING • CLIMB THE LADDER"
            }
            icon={Trophy}
            color="#FF5733"
            gradient="linear-gradient(135deg, rgba(255,87,51,0.4) 0%, transparent 100%)"
            disabled={AuthManager.isGuest}
            onClick={() => {
              setQueueMode("ranked");
              if (!isSearching) {
                NetworkManager.joinQueue(true); // true = ranked
                setIsSearching(true);
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
                  animate={{ height: "auto", opacity: 1, marginTop: 12 }}
                  exit={{ height: 0, opacity: 0, marginTop: 0 }}
                  className="overflow-hidden grid grid-cols-2 gap-4 pl-4"
                >
                  <button
                    onClick={() => setShowCreateModal(true)}
                    className="p-6 bg-white/5 border border-white/10 rounded-xl text-left hover:bg-white/10 hover:border-white/30 transition-all group cursor-pointer"
                  >
                    <div className="flex items-center gap-3 mb-2 text-[#A855F7]">
                      <Plus className="w-6 h-6" />
                      <span className="font-black tracking-wider text-sm">
                        CREATE ROOM
                      </span>
                    </div>
                    <p className="text-white/40 text-xs font-medium">
                      Host a new game lobby
                    </p>
                  </button>

                  <button
                    onClick={() => handleJoinRoom()}
                    className="p-6 bg-white/5 border border-white/10 rounded-xl text-left hover:bg-white/10 hover:border-white/30 transition-all group cursor-pointer"
                  >
                    <div className="flex items-center gap-3 mb-2 text-[#A855F7]">
                      <Hash className="w-6 h-6" />
                      <span className="font-black tracking-wider text-sm">
                        JOIN ROOM
                      </span>
                    </div>
                    <p className="text-white/40 text-xs font-medium">
                      Enter via Room ID
                    </p>
                  </button>
                </motion.div>
              )}
            </AnimatePresence>
          </div>

          {/* Room Listing */}
          <RoomList
            rooms={rooms}
            onJoin={handleJoinRoom}
            onRefresh={() => {
              setIsLoadingRooms(true);
              NetworkManager.getRooms();
            }}
            isLoading={isLoadingRooms}
          />
        </div>

        {/* Online Status Footer */}
        <div className="mt-8 flex items-center gap-2 text-emerald-400 text-xs font-bold opacity-60 uppercase tracking-widest">
          <div
            className={`w-2 h-2 rounded-full ${isConnected ? "bg-emerald-400 shadow-[0_0_5px_currentColor]" : "bg-red-500"} ${isConnected ? "animate-pulse" : ""}`}
          />
          <span>
            {isConnected ? "ONLINE & CONNECTED" : "OFFLINE - RECONNECTING..."}
          </span>
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
                SceneManager.changeScene(
                  new GameScene(
                    pendingRoomId.current,
                    0,
                    pendingSeed.current,
                    pendingOpponentId.current,
                  ),
                );
                if (onStartGame) onStartGame();
              }
            }}
          />
        )}
      </AnimatePresence>

      {/* Create Room Modal */}
      <AnimatePresence>
        {showCreateModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="absolute inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
            onClick={() => setShowCreateModal(false)}
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              onClick={(e) => e.stopPropagation()}
              className="bg-[#1a1a24] border border-white/10 p-8 rounded-3xl shadow-2xl w-full max-w-md"
            >
              <h3 className="text-3xl font-black text-white mb-6 italic text-center">
                CREATE ROOM
              </h3>

              <div className="grid grid-cols-1 gap-4">
                <button
                  onClick={() => {
                    NetworkManager.createRoom(false); // Public
                    setShowCreateModal(false);
                  }}
                  className="p-6 rounded-xl bg-gradient-to-r from-emerald-500/20 to-emerald-500/5 border border-emerald-500/30 hover:border-emerald-400 hover:from-emerald-500/30 transition-all group text-left"
                >
                  <div className="flex items-center gap-3 mb-1">
                    <Users className="w-6 h-6 text-emerald-400" />
                    <span className="font-bold text-white text-lg tracking-wider">
                      PUBLIC ROOM
                    </span>
                  </div>
                  <p className="text-emerald-200/60 text-sm">
                    Visible to everyone in the lobby list.
                  </p>
                </button>

                <button
                  onClick={() => {
                    NetworkManager.createRoom(true); // Private
                    setShowCreateModal(false);
                  }}
                  className="p-6 rounded-xl bg-gradient-to-r from-purple-500/20 to-purple-500/5 border border-purple-500/30 hover:border-purple-400 hover:from-purple-500/30 transition-all group text-left"
                >
                  <div className="flex items-center gap-3 mb-1">
                    <Hash className="w-6 h-6 text-purple-400" />
                    <span className="font-bold text-white text-lg tracking-wider">
                      PRIVATE ROOM
                    </span>
                  </div>
                  <p className="text-purple-200/60 text-sm">
                    Hidden from lobby. Invite via Room ID.
                  </p>
                </button>
              </div>

              <div className="mt-6 flex justify-center">
                <GameButton
                  variant="secondary"
                  onClick={() => setShowCreateModal(false)}
                >
                  CANCEL
                </GameButton>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
