import { Container, Application } from 'pixi.js';

export interface IScene {
  container: Container;
  update(delta: number): void;
  destroy(): void;
  onResize?(width: number, height: number): void; // Optional resize callback
}

export class SceneManager {
  private static app: Application;
  private static currentScene: IScene;

  // Expose screen dimensions for responsive positioning
  public static screenWidth: number = 1000;
  public static screenHeight: number = 900;

  // Base game dimensions (logical size for game elements). Tall enough for
  // the rows above the board where pieces spawn to be on screen: at 900 the
  // pair appeared off the top edge and was invisible for its first second.
  public static readonly BASE_WIDTH = 1000;
  public static readonly BASE_HEIGHT = 1000;

  public static async init(_width: number, _height: number, el: HTMLElement) {
    this.app = new Application();

    // Initialize with full window size
    // Render at the screen's pixel density (capped at 2: beyond that the
    // fill cost grows faster than anyone can see), with CSS size kept at the
    // window size. Without this the canvas rendered at 1x and was stretched
    // on high-density screens, which is why pieces and text looked soft.
    await this.app.init({
      width: window.innerWidth,
      height: window.innerHeight,
      resolution: Math.min(window.devicePixelRatio || 1, 2),
      autoDensity: true,
      antialias: true,
      backgroundAlpha: 0,
      clearBeforeRender: true,
      preserveDrawingBuffer: false,
      preference: 'webgl',
      resizeTo: window // Auto-resize with window
    });

    // Force renderer transparency
    this.app.renderer.background.alpha = 0;
    this.app.renderer.background.color = 0x000000;

    // DOM style overrides for fullscreen
    this.app.canvas.style.position = 'fixed';
    this.app.canvas.style.top = '0';
    this.app.canvas.style.left = '0';
    this.app.canvas.style.width = '100vw';
    this.app.canvas.style.height = '100vh';
    this.app.canvas.style.zIndex = '0';
    this.app.canvas.style.background = 'transparent';
    this.app.canvas.style.backgroundColor = 'transparent';

    // Clear any potential stage filters
    this.app.stage.filters = [];

    el.appendChild(this.app.canvas);

    // Initial Resize
    this.resize();
    // Listen
    window.addEventListener('resize', () => this.resize());
  }

  public static resize() {
    if (!this.app || !this.app.renderer) return;

    // Update stored dimensions
    this.screenWidth = window.innerWidth;
    this.screenHeight = window.innerHeight;

    // Resize the renderer to fill viewport
    this.app.renderer.resize(this.screenWidth, this.screenHeight);

    // Calculate scale for CSS-based elements (React overlay)
    const scale = Math.min(
      this.screenWidth / this.BASE_WIDTH,
      this.screenHeight / this.BASE_HEIGHT
    );
    document.documentElement.style.setProperty('--game-scale', String(scale));

    // Notify current scene of resize
    if (this.currentScene?.onResize) {
      this.currentScene.onResize(this.screenWidth, this.screenHeight);
    }
  }

  public static changeScene(newScene: IScene) {
    if (this.currentScene) {
      this.app.stage.removeChild(this.currentScene.container);
      this.currentScene.destroy();
    }

    this.currentScene = newScene;
    console.log(`[SceneManager] Changed scene to ${newScene.constructor.name}`);
    this.app.stage.addChild(this.currentScene.container);
  }

  public static get appInstance() {
    return this.app;
  }

  public static update(delta: number) {
    if (this.currentScene) {
      this.currentScene.update(delta);
    }
  }
}
