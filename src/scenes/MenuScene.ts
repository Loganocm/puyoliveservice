import { Container } from 'pixi.js';
import { Input } from '../core/Input';
import { GameEvents } from '../core/GameEvents';
import type { IScene } from '../core/SceneManager';
import { SceneManager } from '../core/SceneManager';
import { Backdrop } from '../render/Backdrop';
import { onThemeChange } from '../theme/tokens';
import { ResourceManager } from '../core/ResourceManager';

/**
 * Behind the React menus: the same ambient field as a match, so moving
 * between menus and play never changes the world, only what is in front of
 * it. Replaces a random stock photograph per visit.
 */
export class MenuScene implements IScene {
  container: Container;
  private backdrop: Backdrop;
  private readonly unsubscribe: () => void;

  constructor() {
    this.container = new Container();
    this.backdrop = new Backdrop(SceneManager.screenWidth, SceneManager.screenHeight);
    this.container.addChild(this.backdrop.container);
    // Settings are changed from the menus: repaint the pieces for the next
    // game and restyle the backdrop now.
    this.unsubscribe = onThemeChange(() => {
      void ResourceManager.reload();
      this.backdrop.retheme();
    });
  }

  update(delta: number): void {
    this.backdrop.update(delta);
    // Poll for Menu Navigation Inputs
    if (Input.isActionPressed('menuBack') || Input.isActionPressed('pause')) {
      GameEvents.emit('menu_back');
    }
  }

  onResize(width: number, height: number): void {
    this.backdrop.resize(width, height);
  }

  destroy(): void {
    this.unsubscribe();
    this.backdrop.destroy();
  }
}
