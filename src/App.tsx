import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { 
  Gamepad2, 
  Trophy, 
  Settings,
  Swords, 
  User
} from 'lucide-react';
import { PuyoLogo, PuyoWordmark } from '@/components/PuyoLogo';
import { PuyoFooter } from '@/components/PuyoFooter';
import { WaterFillButton } from '@/components/WaterFillButton';
import { PlayerStatsPanel } from '@/components/PlayerStatsPanel';
import { AuthManager, type User as UserData } from './core/AuthManager';
import { XpCalculator } from './core/XpCalculator';
import { GameEvents } from '@/core/GameEvents';
import { LevelUpOverlay } from '@/components/LevelUpOverlay';

import { SinglePlayerModeSelect } from '@/screens/SinglePlayerModeSelect';
import { MultiplayerLobby } from '@/screens/MultiplayerLobby';
import { LeaderboardScreen } from '@/screens/LeaderboardScreen';
import { SettingsScreen } from '@/screens/SettingsScreen';
import { ControlsScreen } from '@/screens/ControlsScreen';
import { OnboardingScreen } from '@/screens/OnboardingScreen';
import { GameOverlay } from '@/screens/GameOverlay';
import { SceneManager } from '@/core/SceneManager';
import { GameScene } from '@/scenes/GameScene';
import { MenuScene } from '@/scenes/MenuScene';

type Screen = 'menu' | 'single' | 'multi' | 'leaderboard' | 'settings' | 'controls' | 'onboarding' | 'game';

export default function App() {
  const [screen, setScreen] = useState<Screen>('onboarding'); // Default to onboarding until auth check
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);
  const [showUserMenu, setShowUserMenu] = useState(false);
  // Restore reactive user state
  const [user, setUser] = useState<UserData | null>(AuthManager.currentUser as UserData | null);
  const [showLevelUp, setShowLevelUp] = useState(false);
  const [levelUpLevel, setLevelUpLevel] = useState(1);
  
  // Track if we've shown the menu animation once already
  const hasVisitedMenu = useRef(false);

  // Subscribe to auth changes
  useEffect(() => {
    // Initial check
    setUser(AuthManager.currentUser as UserData | null);

    const handleUserUpdate = (userData: any) => {
        // Check for level up
        if (userData && user && userData.level > user.level) {
             setShowLevelUp(true);
             setLevelUpLevel(userData.level);
        }
        setUser(userData as UserData | null);
    };

    GameEvents.on('user_update', handleUserUpdate);
    return () => {
        GameEvents.off('user_update', handleUserUpdate);
    };
  }, [user]);

  // Update ref when we enter menu
  useEffect(() => {
    if (screen === 'menu') {
       hasVisitedMenu.current = true;
    }
  }, [screen]);

  // Restore Auth Check
  useState(() => {
    const initAuth = async () => {
      const isValid = await AuthManager.init();
      if (isValid) {
        setScreen('menu');
      } else {
        setScreen('onboarding');
      }
      // setAuthInitialized(true);
    };
    initAuth();
  });

  const menuItems = [
    {
      label: 'Single Player',
      subtitle: 'Practice or Time Attack',
      icon: Gamepad2,
      color: '#3B82F6', // blue-500
      accentColor: '#22D3EE', // cyan-400
      action: () => setScreen('single')
    },
    {
      label: 'Multiplayer',
      subtitle: 'Ranked & Casual Matches',
      icon: Swords,
      color: '#8B5CF6', // violet-500
      accentColor: '#E879F9', // fuchsia-400
      action: () => setScreen('multi')
    },
    {
      label: 'Leaderboard',
      subtitle: 'Global Rankings',
      icon: Trophy,
      color: '#F59E0B', // amber-500
      accentColor: '#F97316', // orange-500
      action: () => setScreen('leaderboard')
    },
    {
      label: 'Settings',
      subtitle: 'Controls & Audio',
      icon: Settings,
      color: '#64748B', // slate-500
      accentColor: '#94A3B8', // slate-400
      action: () => setScreen('settings')
    }
  ];

  // Click outside to close user menu
  const userMenuRef = useRef<HTMLDivElement>(null);
  
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (userMenuRef.current && !userMenuRef.current.contains(event.target as Node)) {
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
    setScreen('onboarding');
  };

  return (
    <div className="relative h-screen w-screen bg-transparent overflow-hidden font-sans text-white z-50 pointer-events-none">
      <AnimatePresence mode="popLayout">
        {screen === 'menu' && (
          <motion.div 
            key="menu"
            initial={hasVisitedMenu.current ? { opacity: 1 } : { opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            className="size-full flex flex-col pointer-events-auto"
          >
            {/* Header */}
            <motion.header 
              initial={hasVisitedMenu.current ? { y: 0 } : { y: -100 }}
              animate={{ y: 0 }}
              className="flex justify-between items-center px-8 py-6 z-20"
            >
              <div className="flex items-center gap-3">
                <PuyoLogo size="medium" />
                <PuyoWordmark size="medium" />
              </div>
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
                      style={{ backgroundImage: user?.avatar_url ? `url(${user.avatar_url})` : undefined }}
                      whileHover={{ scale: 1.05 }}
                      whileTap={{ scale: 0.95 }}
                      onClick={() => setShowUserMenu(!showUserMenu)}
                  >
                     {!user?.avatar_url && <User className="text-white w-6 h-6" />}
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
                         <div className="px-4 py-3 border-b border-white/5">
                            <p className="text-sm font-bold text-white truncate">{user?.username || 'Guest'}</p>
                            <p className="text-xs text-white/40 truncate">{user?.email || 'No email linked'}</p>
                         </div>
                         <button
                            onClick={() => {
                              AuthManager.logout();
                              setShowUserMenu(false);
                              setScreen('onboarding');
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

            {/* Main Menu */}
            <div className="relative z-10 flex flex-1 items-center justify-center px-8" style={{ minHeight: 'calc(100vh - 240px)' }}>
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

            {/* About the Game – SEO Section */}
            <section
              aria-label="About Puyo Live"
              className="relative z-10 px-8 py-8 max-w-4xl mx-auto"
            >
              <div
                className="rounded-2xl border border-white/5 px-8 py-6"
                style={{
                  background: 'rgba(15, 15, 25, 0.6)',
                  backdropFilter: 'blur(12px)',
                }}
              >
                <h2 className="text-sm font-bold uppercase tracking-widest text-white/50 mb-3">
                  About the Game
                </h2>
                <p className="text-sm leading-relaxed text-white/40">
                  <strong className="text-white/60">Puyo Live</strong> is a free, browser-based
                  Puyo Puyo alternative built for competitive play. Experience classic match-4 puzzle
                  mechanics with low-latency, real-time multiplayer — no download required. Master
                  advanced techniques like <em>GTR</em>, <em>stairs</em>, and{' '}
                  <em>sandwich chaining</em> to bury your opponents in garbage. Whether you're a
                  casual player or a seasoned competitive stacker, Puyo Live delivers the fast-paced
                  chain battles you love, right in your web browser.
                </p>
              </div>
            </section>

            {/* Footer */}
            <PuyoFooter />
          </motion.div>
        )}


        {screen === 'single' && (
          <motion.div key="single" className="size-full pointer-events-auto" initial={{ opacity: 0, x: 50 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 50 }}>
            <SinglePlayerModeSelect 
              onBack={() => setScreen('menu')} 
              onSelectMode={(mode) => {
                console.log('Selected Mode:', mode);
                // Map mode strings to seconds
                let timeLimit = 0;
                if (mode === '3min') timeLimit = 180;
                else if (mode === '5min') timeLimit = 300;
                else if (mode === '10min') timeLimit = 600;

                SceneManager.changeScene(new GameScene(undefined, timeLimit)); // No Room ID = Single Player
                setScreen('game');
              }}
            />
          </motion.div>
        )}

        {screen === 'multi' && (
          <motion.div key="multi" className="size-full pointer-events-auto" initial={{ opacity: 0, x: 50 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 50 }}>
            <MultiplayerLobby 
              onBack={() => {
                SceneManager.changeScene(new MenuScene());
                setScreen('menu');
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
                 setScreen('game');
              }}
            />
          </motion.div>
        )}

        {screen === 'leaderboard' && (
          <motion.div key="leaderboard" className="size-full pointer-events-auto" initial={{ opacity: 0, x: 50 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 50 }}>
            <LeaderboardScreen onBack={() => setScreen('menu')} />
          </motion.div>
        )}

        {screen === 'settings' && (
          <motion.div key="settings" className="size-full pointer-events-auto" initial={{ opacity: 0, x: 50 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 50 }}>
            <SettingsScreen 
              onBack={() => setScreen('menu')} 
              onOpenControls={() => setScreen('controls')}
            />
          </motion.div>
        )}

        {screen === 'controls' && (
          <motion.div key="controls" className="size-full pointer-events-auto" initial={{ opacity: 0, x: 50 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: 50 }}>
            <ControlsScreen onBack={() => setScreen('settings')} />
          </motion.div>
        )}

        {screen === 'onboarding' && (
          <motion.div key="onboarding" className="size-full pointer-events-auto" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
            <OnboardingScreen onComplete={(username) => {
              console.log('Onboarding Complete:', username);
              setScreen('menu');
            }} />
          </motion.div>
        )}

        {screen === 'game' && (
          <motion.div key="game" className="size-full" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }}>
             <GameOverlay 
                onBack={() => {
                  SceneManager.changeScene(new MenuScene());
                  setScreen('menu');
                }}
                onQueueAgain={() => {
                  SceneManager.changeScene(new MenuScene());
                  setScreen('multi');
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
    </div>
  );
}
