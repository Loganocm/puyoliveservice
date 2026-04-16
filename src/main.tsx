import { createRoot } from "react-dom/client";
import App from "./App";
import "./index.css";

// Game Imports
import { SceneManager } from './core/SceneManager';
import { MenuScene } from './scenes/MenuScene';
import { Input } from './core/Input';
import { ResourceManager } from './core/ResourceManager';
import { SoundManager } from './core/SoundManager';
import { NetworkManager } from './core/NetworkManager';
import { BGMManager } from './core/BGMManager';

// BGM Imports
import menuBgmUrl from './resources/bgm/menu/melatonin2.wav';
import gameBgm1 from './resources/bgm/gameplay/abc123.mp3';
import gameBgm2 from './resources/bgm/gameplay/dnbfart.mp3';
import gameBgm3 from './resources/bgm/gameplay/flemnco.mp3';

// Disable console methods to prevent easy exploitation in the browser
const noop = () => {};
['log', 'warn', 'error', 'info', 'debug', 'dir', 'trace'].forEach(method => {
  (console as any)[method] = noop;
});

const initGame = async () => {
  const appDiv = document.getElementById('app');
  if (!appDiv) {
    console.error("Canvas container #app not found!");
    return;
  }

  // console.log("Initializing Game Engine...");
  
  try {
    NetworkManager.connect(); // Connect to server
    await SceneManager.init(1000, 900, appDiv);
    // await UIManager.init(); // Legacy UI disabled
    await ResourceManager.load();
    await SoundManager.load();

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
        // UIManager.update(); // Legacy UI disabled
      });
    }
  } catch (error) {
    console.error("Failed to initialize game:", error);
  }
};

// Render React UI
createRoot(document.getElementById("root")!).render(<App />);

// Initialize Game Engine (Background)
initGame();
