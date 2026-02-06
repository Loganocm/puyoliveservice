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
// import { UIManager } from './ui/UIManager'; // Disabled for React Migration

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
