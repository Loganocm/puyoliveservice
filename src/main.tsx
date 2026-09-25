import { createRoot } from "react-dom/client";
import App from "./App";
import { ErrorBoundary } from "./components/ErrorBoundary";
import "@fontsource-variable/fredoka";
import "./index.css";
import { applyThemeToDocument, FONTS } from './theme/tokens';

// Game Imports
import { SceneManager } from './core/SceneManager';
import { MenuScene } from './scenes/MenuScene';
import { Input } from './core/Input';
import { ResourceManager } from './core/ResourceManager';
import { SoundManager } from './core/SoundManager';
import { NetworkManager } from './core/NetworkManager';
import { BGMManager } from './core/BGMManager';

// BGM Imports
import menuBgmUrl from './resources/bgm/menu/melatonin2.m4a';
import gameBgm1 from './resources/bgm/gameplay/abc123.mp3';
import gameBgm2 from './resources/bgm/gameplay/dnbfart.mp3';
import gameBgm3 from './resources/bgm/gameplay/flemnco.mp3';

// Quiet the console in production builds.
//
// This is noise control, NOT a security measure: anyone can read the bundle
// or set the override below. The previous version replaced every console
// method with a no-op "to prevent exploitation", which stopped no attacker
// and made it impossible to diagnose a bug from a user's browser.
//
// Errors and warnings are always kept -- they are what you need when
// something breaks in the wild. Verbose levels can be restored at runtime
// with `localStorage.setItem('puyolive_debug', '1')` and a reload.
// See README section "Logging".
const debugEnabled =
  import.meta.env.DEV || localStorage.getItem('puyolive_debug') === '1';

if (!debugEnabled) {
  const noop = () => {};
  for (const method of ['log', 'info', 'debug', 'dir', 'trace'] as const) {
    (console as any)[method] = noop;
  }
}

/**
 * /?lab=<scenario> plays one animation-catalogue scenario in the real game
 * scene for the recorder, with no network, menus or music. The lab module is
 * only fetched when asked for. See src/lab/LabDriver.ts.
 */
const labId = new URLSearchParams(window.location.search).get('lab');

const initGame = async () => {
  const appDiv = document.getElementById('app');
  if (!appDiv) {
    console.error("Canvas container #app not found!");
    return;
  }

  // console.log("Initializing Game Engine...");
  
  try {
    if (!labId) NetworkManager.connect(); // Connect to server
    // Canvas text is rasterised once, so the display face must be loaded
    // before the first scene draws any. Bounded so a font failure cannot
    // hold the game back: the fallback stack is fine.
    await Promise.race([
      document.fonts.load(`600 32px ${FONTS.display}`),
      new Promise(resolve => setTimeout(resolve, 1500)),
    ]).catch(() => undefined);
    await SceneManager.init(1000, 900, appDiv);
    await ResourceManager.load();
    // Sound effects load in the background; the first screen does not wait.
    void SoundManager.load();

    if (labId) {
      const { labScenarioFromUrl, createLabDriver } = await import('./lab/LabDriver');
      const { GameScene } = await import('./scenes/GameScene');
      const scenario = labScenarioFromUrl();
      if (!scenario) {
        console.error(`[lab] unknown scenario "${labId}"`);
        return;
      }
      const driver = createLabDriver(scenario);
      SceneManager.changeScene(new GameScene(undefined, 0, scenario.seed, undefined, driver));
      SceneManager.appInstance?.ticker.add((ticker) => {
        SceneManager.update(ticker.deltaTime);
        Input.update();
      });
      return;
    }

    // Setup BGM
    BGMManager.init();
    BGMManager.registerTrack('menu', menuBgmUrl);
    BGMManager.registerTrack('game', gameBgm1);
    BGMManager.registerTrack('game', gameBgm2);
    BGMManager.registerTrack('game', gameBgm3);

    // Add global interaction listener to start BGM smoothly 
    const startBgm = () => {
      if (BGMManager.initialized) {
        // Will properly play whenever the context is set via Scene changes
        BGMManager.resume();
      }
      window.removeEventListener('click', startBgm);
      window.removeEventListener('keydown', startBgm);
    };
    window.addEventListener('click', startBgm);
    window.addEventListener('keydown', startBgm);

    SceneManager.changeScene(new MenuScene());

    // Game Loop
    if (SceneManager.appInstance) {
      SceneManager.appInstance.ticker.add((ticker) => {
        SceneManager.update(ticker.deltaTime);
        Input.update();
      });
    }
  } catch (error) {
    console.error("Failed to initialize game:", error);
  }
};

applyThemeToDocument();

// Render React UI
createRoot(document.getElementById("root")!).render(<ErrorBoundary><App /></ErrorBoundary>);

// Initialize Game Engine (Background)
initGame();
