import { Container } from 'pixi.js';
import type { IScene } from '../core/SceneManager';


export class MenuScene implements IScene {
  container: Container;

  constructor() {
    this.container = new Container();
  }

  update(_delta: number): void {
    // UIManager.update(); // Legacy UI disabled
  }

  destroy(): void {
  }
}

