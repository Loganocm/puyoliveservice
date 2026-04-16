import { Container } from 'pixi.js';
import { Input } from '../core/Input';
import { GameEvents } from '../core/GameEvents';
import type { IScene } from '../core/SceneManager';

export class MenuScene implements IScene {
  container: Container;

  constructor() {
    this.container = new Container();
  }

  update(_delta: number): void {
    // Poll for Menu Navigation Inputs
    if (Input.isActionPressed('menuBack') || Input.isActionPressed('pause')) {
      GameEvents.emit('menu_back');
    }
  }

  destroy(): void {
  }
}

