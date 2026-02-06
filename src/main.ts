import { SceneManager } from './core/SceneManager';
import { MenuScene } from './scenes/MenuScene';
import { Input } from './core/Input';
import { ResourceManager } from './core/ResourceManager';
import { SoundManager } from './core/SoundManager';
import { NetworkManager } from './core/NetworkManager';
import { UIManager } from './ui/UIManager';
import './style.css';

const appDiv = document.querySelector<HTMLElement>('#app')!;

const initGame = async () => {
  NetworkManager.connect(); // Connect to server
  await SceneManager.init(1000, 900, appDiv);
  await UIManager.init();
  await ResourceManager.load();
  await SoundManager.load();
  SceneManager.changeScene(new MenuScene());

  // Game Loop
  SceneManager.appInstance.ticker.add((ticker) => {
    SceneManager.update(ticker.deltaTime);
    Input.update();
    UIManager.update();
  });
};

initGame();

