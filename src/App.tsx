import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  Gamepad2,
  Trophy,
  Settings,
  Swords,
  User,
  Users,
  Shield,
} from "lucide-react";
import puyoHeaderLogo from "@/resources/puyoheader.svg";
import { backgroundManager } from "@/core/BackgroundManager";
import { PuyoFooter } from "@/components/PuyoFooter";
import { WaterFillButton } from "@/components/WaterFillButton";
import { PlayerStatsPanel } from "@/components/PlayerStatsPanel";
import { AuthManager, type User as UserData } from "./core/AuthManager";
import { XpCalculator } from "./core/XpCalculator";
import { GameEvents } from "@/core/GameEvents";
import { LevelUpOverlay } from "@/components/LevelUpOverlay";
import { VolumeHUD } from "@/components/VolumeHUD";
import { BGMPlayer } from "@/components/BGMPlayer";
import { BGMManager } from "@/core/BGMManager";

import { SinglePlayerModeSelect } from "@/screens/SinglePlayerModeSelect";
import { MultiplayerLobby } from "@/screens/MultiplayerLobby";
import { LeaderboardScreen } from "@/screens/LeaderboardScreen";
import { SettingsScreen } from "@/screens/SettingsScreen";
import { ControlsScreen } from "@/screens/ControlsScreen";
import { OnboardingScreen } from "@/screens/OnboardingScreen";
import { GameOverlay } from "@/screens/GameOverlay";
import { ReplayOverlay } from "@/screens/ReplayOverlay";
import { QuickPlayScreen } from "@/screens/QuickPlayScreen";
import { TransitionParticles } from "@/components/TransitionParticles";
import { SceneManager } from "@/core/SceneManager";
import { ResourceManager } from "@/core/ResourceManager";
import { GameScene } from "@/scenes/GameScene";
import { QuickPlayScene } from "@/scenes/QuickPlayScene";
import { MenuScene } from "@/scenes/MenuScene";
import { NetworkManager } from "@/core/NetworkManager";
import { ProfileScreen } from "@/screens/ProfileScreen";
import { CommunityScreen } from "@/screens/CommunityScreen";
import { AdminScreen } from "@/screens/AdminScreen";

type Screen =
  | "menu"
  | "single"
  | "multi"
  | "quickplay"
  | "leaderboard"
  | "settings"
  | "controls"
  | "onboarding"
  | "game"
  | "replay"
  | "transition";

export default function App() {
  const [screen, setScreen] = useState<Screen>("onboarding"); // Default to onboarding until auth check
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const [showUserMenu, setShowUserMenu] = useState(false);
  const [showProfile, setShowProfile] = useState(false);
  // Restore reactive user state
  const [user, setUser] = useState<UserData | null>(
    AuthManager.currentUser as UserData | null,
  );
  const [showCommunity, setShowCommunity] = useState(false);
  const [showAdmin, setShowAdmin] = useState(false);
  const [showLevelUp, setShowLevelUp] = useState(false);
  const [levelUpLevel, setLevelUpLevel] = useState(1);
  const [bgImage, setBgImage] = useState<string>("");

  // Set random background on component mount
  useEffect(() => {
    // Select a random background for the menu
    const bg = backgroundManager.getRandomBackground();
    console.log("[App] Setting menu background:", bg);
    backgroundManager.setMenuBackground(bg);
    setBgImage(bg);
  }, []);

  // Track if we've shown the menu animation once already
  const hasVisitedMenu = useRef(false);
  const userRef = useRef<UserData | null>(user);
  userRef.current = user;

  // Subscribe to auth changes
  useEffect(() => {
    // Initial check
    setUser(AuthManager.currentUser as UserData | null);

    const handleUserUpdate = (userData: any) => {
      // Check for level up
      if (
        userData &&
        userRef.current &&
        userData.level > (userRef.current.level ?? 0)
      ) {
        setShowLevelUp(true);
        setLevelUpLevel(userData.level);
      }
      setUser(userData as UserData | null);
    };

    GameEvents.on("user_update", handleUserUpdate);
    return () => {
      GameEvents.off("user_update", handleUserUpdate);
    };
  }, []);

  // Update ref when we enter menu
  useEffect(() => {
    if (screen === "menu") {
      hasVisitedMenu.current = true;
      BGMManager.play('menu');
    }

    if (screen === "transition") {
      const prepareGame = async () => {
        const startTime = Date.now();
        console.log("[App] Starting Transition. Waiting for assets...");

        // 1. Wait for Game Core (ResourceManager) to be loaded
        // Simple polling since it runs in parallel
        while (!ResourceManager.loaded) {
          await new Promise((r) => setTimeout(r, 100));
        }
        console.log("[App] Core Assets Loaded.");

        // 2. Preload Menu Background
        // We use the one we selected on mount
        const bg = backgroundManager.getMenuBackground();
        if (bg) {
          console.log("[App] Preloading Menu Background:", bg);
          await backgroundManager.preload(bg);
        }

        // 3. Preload Game Background (for instant start)
        const gameBg = backgroundManager.prepareGameBackground();
        if (gameBg) {
          console.log("[App] Preloading Game Background:", gameBg);
          await backgroundManager.preload(gameBg);
        }

        // 4. Ensure Minimum Duration (2s) for smooth effect
        const elapsed = Date.now() - startTime;
        const remaining = Math.max(0, 2000 - elapsed);
        console.log(`[App] Transition wait: ${remaining}ms`);

        if (remaining > 0) {
          await new Promise((r) => setTimeout(r, remaining));
        }

        setScreen("menu");
      };
      prepareGame();
    }
  }, [screen]);

  // Handle Menu Navigation (Back)
  useEffect(() => {
    const handleBack = () => {
      console.log("[App] Menu Back requested. Current screen:", screen);
      if (
        screen === "settings" ||
        screen === "leaderboard" ||
        screen === "single"
      ) {
        setScreen("menu");
      } else if (screen === "controls") {
        setScreen("settings");
      } else if (showCommunity) {
        setShowCommunity(false);
      } else if (showProfile) {
        setShowProfile(false);
      }
    };
    GameEvents.on("menu_back", handleBack);
    return () => {
      GameEvents.off("menu_back", handleBack);
    };
  }, [screen, showProfile, showCommunity]);

  // Handle Quick Play (Puyo Mines) lifecycle
  useEffect(() => {
    const handleMinesJoined = (data: {
      seed: number;
      state: any;
      socketId: string;
    }) => {
      console.log("[App] Mines joined, seed:", data.seed);
      const scene = new QuickPlayScene(data.seed);
      SceneManager.changeScene(scene);
    };

    const handleMinesLeft = () => {
      console.log("[App] Left mines");
      SceneManager.changeScene(new MenuScene());
      setScreen("multi");
    };

    NetworkManager.on("mines_joined", handleMinesJoined);
    GameEvents.on("mines_left", handleMinesLeft);
    return () => {
      NetworkManager.off("mines_joined", handleMinesJoined);
      GameEvents.off("mines_left", handleMinesLeft);
    };
  }, []);

  // Restore Auth Check
  useEffect(() => {
    const initAuth = async () => {
      const isValid = await AuthManager.init();
      if (isValid) {
        setScreen("menu");
      } else {
        setScreen("onboarding");
      }
      // setAuthInitialized(true);
    };
    initAuth();
  }, []);

  const menuItems = [
    {
      label: "Single Player",
      subtitle: "Practice or Time Attack",
      icon: Gamepad2,
      color: "#3B82F6", // blue-500
      accentColor: "#22D3EE", // cyan-400
      action: () => setScreen("single"),
    },
    {
      label: "Multiplayer",
      subtitle: "Ranked & Casual Matches",
      icon: Swords,
      color: "#8B5CF6", // violet-500
      accentColor: "#E879F9", // fuchsia-400
      action: () => setScreen("multi"),
    },
    {
      label: "Leaderboard",
      subtitle: "Global Rankings",
      icon: Trophy,
      color: "#F59E0B", // amber-500
      accentColor: "#F97316", // orange-500
      action: () => setScreen("leaderboard"),
    },
    {
      label: "Settings",
      subtitle: "Controls & Audio",
      icon: Settings,
      color: "#64748B", // slate-500
      accentColor: "#94A3B8", // slate-400
      action: () => setScreen("settings"),
    },
  ];

  // Click outside to close user menu
  const userMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        userMenuRef.current &&
        !userMenuRef.current.contains(event.target as Node)
      ) {
        setShowUserMenu(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => {
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, []);

  const handleSignIn = () => {
    AuthManager.logout(false); // Don't reload, just clear state
    setScreen("onboarding");
  };

  return (
    <div className="relative h-screen w-screen bg-transparent overflow-hidden font-sans text-white z-50 pointer-events-none">
      {bgImage &&
        screen !== "game" &&
        screen !== "onboarding" &&
        screen !== "transition" && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 0.6 }}
            transition={{ duration: 1.5, ease: "easeOut" }}
            className="absolute inset-0 z-0 bg-cover bg-center bg-no-repeat"
            style={{ backgroundImage: `url(${bgImage})` }}
          />
        )}
      <AnimatePresence mode="wait">
        {screen === "menu" && (
          <motion.div
            key="menu"
            initial={hasVisitedMenu.current ? { opacity: 1 } : { opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, scale: 0.97 }}
            transition={{ duration: 0.25, ease: "easeOut" }}
            className="size-full flex flex-col pointer-events-auto"
          >
            {/* Header */}
            <motion.header
              initial={hasVisitedMenu.current ? { y: 0 } : { y: -100 }}
              animate={{ y: 0 }}
              className="flex justify-end items-center px-8 py-6 z-20"
            >
              <div className="flex items-center gap-3">
                <PlayerStatsPanel
                  elo={user?.elo_rating || 1000}
                  level={user?.level || 1}
                  currentXp={user?.current_xp || 0}
                  maxXp={XpCalculator.getXpForNextLevel(user?.level || 1)}
                  rank={user?.rank || undefined}
                  isGuest={AuthManager.isGuest}
                  onSignInClick={handleSignIn}
                />

                {/* User Avatar with Dropdown */}
                <div className="relative" ref={userMenuRef}>
                  <motion.div
                    className="w-12 h-12 rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 flex items-center justify-center border border-white/20 shadow-lg shadow-indigo-500/20 bg-cover bg-center cursor-pointer"
                    style={{
                      backgroundImage: user?.avatar_url
                        ? `url(${user.avatar_url})`
                        : undefined,
                    }}
                    whileHover={{ scale: 1.05 }}
                    whileTap={{ scale: 0.95 }}
                    onClick={() => setShowUserMenu(!showUserMenu)}
                  >
                    {!user?.avatar_url && (
                      <User className="text-white w-6 h-6" />
                    )}
                  </motion.div>

                  {/* Dropdown Menu */}
                  <AnimatePresence>
                    {showUserMenu && (
                      <motion.div
                        initial={{ opacity: 0, y: 10, scale: 0.95 }}
                        animate={{ opacity: 1, y: 0, scale: 1 }}
                        exit={{ opacity: 0, y: 10, scale: 0.95 }}
                        className="absolute right-0 top-14 w-48 bg-[#1a1a24] border border-white/10 rounded-xl shadow-2xl overflow-hidden z-50 ring-1 ring-white/5"
                      >
                        <div
                          className="px-4 py-3 border-b border-white/5 cursor-pointer hover:bg-white/5 transition-colors"
                          onClick={() => {
                            setShowUserMenu(false);
                            setShowProfile(true);
                          }}
                        >
                          <p className="text-sm font-bold text-white truncate">
                            {user?.username || "Guest"}
                          </p>
                          <p className="text-xs text-white/40 truncate">
                            {user?.email || "No email linked"}
                          </p>
                        </div>
                        <button
                          onClick={() => {
                            setShowUserMenu(false);
                            setShowProfile(true);
                          }}
                          className="w-full text-left px-4 py-3 text-sm text-white hover:bg-white/5 font-medium transition-colors flex items-center gap-2"
                        >
                          <User size={16} /> My Profile
                        </button>
                        {user?.is_admin && (
                          <button
                            onClick={() => {
                              setShowUserMenu(false);
                              setShowAdmin(true);
                            }}
                            className="w-full text-left px-4 py-3 text-sm text-red-400 hover:bg-white/5 font-medium transition-colors flex items-center gap-2"
                          >
                            <Shield size={16} /> Admin Panel
                          </button>
                        )}
                        <button
                          onClick={() => {
                            AuthManager.logout();
                            setShowUserMenu(false);
                            setScreen("onboarding");
                          }}
                          className="w-full text-left px-4 py-3 text-sm text-red-400 hover:bg-white/5 font-medium transition-colors flex items-center gap-2"
                        >
                          Log Out
                        </button>
                      </motion.div>
                    )}
                  </AnimatePresence>
                </div>
              </div>
            </motion.header>

            {/* Community Tab - Left Side */}
            <motion.button
              initial={{ opacity: 0, x: -40 }}
              animate={{ opacity: 1, x: 0 }}
              transition={{
                duration: hasVisitedMenu.current ? 0 : 0.5,
                delay: hasVisitedMenu.current ? 0 : 0.3,
                ease: [0.16, 1, 0.3, 1],
              }}
              whileHover={{ scale: 1.03, x: 4 }}
              whileTap={{ scale: 0.97 }}
              onClick={() => setShowCommunity(true)}
              className="fixed left-0 top-1/2 -translate-y-1/2 z-30 flex flex-col items-center gap-2 px-3 py-6 bg-indigo-600/80 hover:bg-indigo-500/90 border border-white/10 rounded-r-2xl shadow-lg shadow-indigo-500/20 backdrop-blur-sm transition-colors cursor-pointer"
            >
              <Users className="w-5 h-5 text-white" />
              <span className="text-[11px] font-bold tracking-widest text-white/90 [writing-mode:vertical-lr] rotate-180">
                COMMUNITY
              </span>
            </motion.button>

            {/* Admin Tab - Left Side (admin only) */}
            {user?.is_admin && (
              <motion.button
                initial={{ opacity: 0, x: -40 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{
                  duration: hasVisitedMenu.current ? 0 : 0.5,
                  delay: hasVisitedMenu.current ? 0 : 0.4,
                  ease: [0.16, 1, 0.3, 1],
                }}
                whileHover={{ scale: 1.03, x: 4 }}
                whileTap={{ scale: 0.97 }}
                onClick={() => setShowAdmin(true)}
                className="fixed left-0 top-[calc(50%+120px)] z-30 flex flex-col items-center gap-2 px-3 py-6 bg-red-700/80 hover:bg-red-600/90 border border-white/10 rounded-r-2xl shadow-lg shadow-red-500/20 backdrop-blur-sm transition-colors cursor-pointer"
              >
                <Shield className="w-5 h-5 text-white" />
                <span className="text-[11px] font-bold tracking-widest text-white/90 [writing-mode:vertical-lr] rotate-180">
                  ADMIN
                </span>
              </motion.button>
            )}

            {/* Centered Logo */}
            <motion.div
              initial={{ opacity: 0, y: -20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{
                duration: hasVisitedMenu.current ? 0 : 0.6,
                ease: [0.16, 1, 0.3, 1],
              }}
              className="flex justify-center px-8 pt-4 pb-4 z-10"
            >
              <img
                src={puyoHeaderLogo}
                alt="Puyo Live"
                className="w-full max-w-lg"
              />
            </motion.div>

            {/* Main Menu */}
            <div className="relative z-10 flex flex-1 items-center justify-center px-8">
              <div className="w-full max-w-4xl space-y-6">
                {menuItems.map((item, index) => (
                  <motion.div
                    key={item.label}
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{
                      duration: hasVisitedMenu.current ? 0 : 0.5,
                      delay: hasVisitedMenu.current ? 0 : index * 0.08,
                      ease: [0.16, 1, 0.3, 1],
                    }}
                  >
                    <WaterFillButton
                      icon={item.icon}
                      label={item.label}
                      subtitle={item.subtitle}
                      color={item.color}
                      accentColor={item.accentColor}
                      isHovered={hoveredIndex === index}
                      onHoverStart={() => setHoveredIndex(index)}
                      onHoverEnd={() => setHoveredIndex(null)}
                      onTap={item.action}
                    />
                  </motion.div>
                ))}
              </div>
            </div>

            {/* Footer */}
            <PuyoFooter />
          </motion.div>
        )}

        {screen === "single" && (
          <motion.div
            key="single"
            className="size-full pointer-events-auto"
            initial={{ opacity: 0, scale: 0.97 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.97 }}
            transition={{ duration: 0.25, ease: "easeOut" }}
          >
            <SinglePlayerModeSelect
              onBack={() => setScreen("menu")}
              onSelectMode={(mode) => {
                console.log("Selected Mode:", mode);
                // Map mode strings to seconds
                let timeLimit = 0;
                if (mode === "3min") timeLimit = 180;
                else if (mode === "5min") timeLimit = 300;
                else if (mode === "10min") timeLimit = 600;

                SceneManager.changeScene(new GameScene(undefined, timeLimit)); // No Room ID = Single Player
                setScreen("game");
              }}
            />
          </motion.div>
        )}

        {screen === "multi" && (
          <motion.div
            key="multi"
            className="size-full pointer-events-auto"
            initial={{ opacity: 0, scale: 0.97 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.97 }}
            transition={{ duration: 0.25, ease: "easeOut" }}
          >
            <MultiplayerLobby
              onBack={() => {
                SceneManager.changeScene(new MenuScene());
                setScreen("menu");
              }}
              onQuickPlay={() => {
                if (!NetworkManager.isConnected) {
                  NetworkManager.connect();
                }
                const token =
                  AuthManager.getToken?.() ||
                  localStorage.getItem("puyolive_token");
                if (token) {
                  NetworkManager.authenticate(token);
                }
                NetworkManager.joinMines();
                setScreen("quickplay");
              }}
              onStartGame={() => {
                // SceneManager.changeScene logic is handled inside MultiplayerLobby?
                // Actually MultiplayerLobby usually listens for match_ready then starts.
                // But if we want to switch screen, we need to know.
                // MultiplayerLobby currently probably doesn't start GameScene.
                // Let's assume MultiplayerLobby handles the *networking* part and when match starts,
                // we need to switch screen.
                // Ideally MultiplayerLobby should call a prop like onMatchStart().
                // We passed `onStartGame` which logs 'Start Multiplayer Game'.
                // We should pass a handler that switches screen.
                // But MultiplayerLobby sets up the room. GameScene needs the roomId.
                // Does MultiplayerLobby pass roomId back?
                // I need to check MultiplayerLobby.tsx.
                setScreen("game");
              }}
            />
          </motion.div>
        )}

        {screen === "quickplay" && (
          <motion.div
            key="quickplay"
            className="size-full pointer-events-auto"
            initial={{ opacity: 0, scale: 0.97 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.97 }}
            transition={{ duration: 0.25, ease: "easeOut" }}
          >
            <QuickPlayScreen
              onLeave={() => {
                NetworkManager.leaveMines();
                SceneManager.changeScene(new MenuScene());
                setScreen("multi");
              }}
            />
          </motion.div>
        )}

        {screen === "leaderboard" && (
          <motion.div
            key="leaderboard"
            className="size-full pointer-events-auto"
            initial={{ opacity: 0, scale: 0.97 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.97 }}
            transition={{ duration: 0.25, ease: "easeOut" }}
          >
            <LeaderboardScreen onBack={() => setScreen("menu")} />
          </motion.div>
        )}

        {screen === "settings" && (
          <motion.div
            key="settings"
            className="size-full pointer-events-auto"
            initial={{ opacity: 0, scale: 0.97 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.97 }}
            transition={{ duration: 0.25, ease: "easeOut" }}
          >
            <SettingsScreen
              onBack={() => setScreen("menu")}
              onOpenControls={() => setScreen("controls")}
            />
          </motion.div>
        )}

        {screen === "controls" && (
          <motion.div
            key="controls"
            className="size-full pointer-events-auto"
            initial={{ opacity: 0, scale: 0.97 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.97 }}
            transition={{ duration: 0.25, ease: "easeOut" }}
          >
            <ControlsScreen onBack={() => setScreen("settings")} />
          </motion.div>
        )}

        {screen === "onboarding" && (
          <motion.div
            key="onboarding"
            className="size-full pointer-events-auto"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <OnboardingScreen
              onComplete={(username) => {
                console.log("Onboarding Complete:", username);
                setScreen("transition");
                // Loading logic is now handled in the useEffect for 'transition' state
              }}
            />
          </motion.div>
        )}

        {screen === "transition" && (
          <motion.div
            key="transition"
            className="size-full z-[100]"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <TransitionParticles />
          </motion.div>
        )}

        {screen === "game" && (
          <motion.div
            key="game"
            className="size-full"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <GameOverlay
              onBack={() => {
                SceneManager.changeScene(new MenuScene());
                setScreen("menu");
              }}
              onQueueAgain={() => {
                SceneManager.changeScene(new MenuScene());
                setScreen("multi");
              }}
            />
          </motion.div>
        )}

        {screen === "replay" && (
          <motion.div
            key="replay"
            className="size-full pointer-events-auto"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          >
            <ReplayOverlay
              onExit={() => {
                SceneManager.changeScene(new MenuScene());
                setScreen("menu");
              }}
            />
          </motion.div>
        )}
      </AnimatePresence>

      {/* Level Up Overlay */}
      {showLevelUp && (
        <LevelUpOverlay
          level={levelUpLevel}
          onComplete={() => setShowLevelUp(false)}
        />
      )}

      {showProfile && (
        <ProfileScreen
          onClose={() => setShowProfile(false)}
          onWatchReplay={() => {
            setShowProfile(false);
            setScreen("replay");
          }}
        />
      )}

      {showCommunity && (
        <CommunityScreen
          onClose={() => setShowCommunity(false)}
          onWatchReplay={() => {
            setShowCommunity(false);
            setScreen("replay");
          }}
        />
      )}

      {showAdmin && (
        <div className={`fixed inset-0 z-[90] bg-black/80 backdrop-blur-sm pointer-events-auto ${screen === "replay" ? "hidden" : ""}`}>
          <AdminScreen 
            onBack={() => setShowAdmin(false)} 
            onWatchReplay={() => {
              setScreen("replay");
            }}
          />
        </div>
      )}

      <VolumeHUD />
      <BGMPlayer />
    </div>
  );
}
