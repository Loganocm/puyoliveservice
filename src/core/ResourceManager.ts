import { Assets, Texture, Rectangle, groupD8 } from 'pixi.js';
import { PuyoColor } from './Constants';
import puyoPng from '../resources/puyo.png';
// // import playbgPng from '../resources/playbg.png'; // Removed per user request // Removed per user request

export class ResourceManager {
  private static sheetTexture: Texture;
  public static backgroundTexture: Texture;
  private static puyoTextures: Map<string, Texture> = new Map();

  public static async load() {
    this.sheetTexture = await Assets.load(puyoPng);
    try {
      // Load the play background
      // this.backgroundTexture = await Assets.load(playbgPng);
      this.backgroundTexture = Texture.WHITE;
    } catch (e) {
      console.warn("Failed to load high-res background, falling back/ignoring", e);
      // Fallback or empty? dynamic graphics will be used if this is null usually,
      // but we'll handle it in GameScene
      this.backgroundTexture = Texture.WHITE; // Placeholder
    }
  }

  public static getPuyoTexture(color: PuyoColor, neighbors: number = 0): Texture {
    if (color === PuyoColor.None) return Texture.EMPTY;

    // Map PuyoColor to Row
    let row = 0;
    switch (color) {
      case PuyoColor.Red: row = 0; break;
      case PuyoColor.Green: row = 1; break;
      case PuyoColor.Blue: row = 2; break;
      case PuyoColor.Yellow: row = 3; break;
      case PuyoColor.Purple: row = 4; break;
      case PuyoColor.Garbage:
        // Garbage is a single sprite
        // User specified: Row 9, Col 10
        return this.getFixedPuyoTexture(9, 10);
      default: return Texture.EMPTY;
    }

    // Neighbors bitmask: Top(1), Right(2), Bottom(4), Left(8)
    // Image Format (Standard Puyo): Down(1), Up(2), Right(4), Left(8)
    // Neigbor Top(1) -> Needs Up(2)
    // Neighbor Right(2) -> Needs Right(4)
    // Neighbor Bottom(4) -> Needs Down(1)
    // Neighbor Left(8) -> Needs Left(8)

    let mappedCol = 0;
    if (neighbors & 1) mappedCol |= 2;
    if (neighbors & 2) mappedCol |= 4;
    if (neighbors & 4) mappedCol |= 1;
    if (neighbors & 8) mappedCol |= 8;

    const col = mappedCol;

    // Cache key
    const key = `${row}_${col}`;
    if (this.puyoTextures.has(key)) {
      return this.puyoTextures.get(key)!;
    }

    // Create texture format
    // If sprite sheet logic:
    // x = col * width
    // y = row * height
    // But we need to know the actual dimensions of the loaded image to be sure of SPRITE_SIZE?
    // Let's rely on constant for now. 
    // If the image is 512 wide, 512/16 = 32.

    // Auto-detect size if needed, but simpler to fix it.
    const size = this.sheetTexture.width / 16;

    // Add 0.5 pixel inset to prevent texture bleeding from adjacent sprites
    const inset = 0.5;
    const rect = new Rectangle(
      col * size + inset,
      row * size + inset,
      size - inset * 2,
      size - inset * 2
    );
    const texture = new Texture({
      source: this.sheetTexture.source,
      frame: rect
    });

    this.puyoTextures.set(key, texture);
    return texture;
  }

  private static getFixedPuyoTexture(row: number, col: number): Texture {
    const size = this.sheetTexture.width / 16;
    const key = `${row}_${col}`;
    if (this.puyoTextures.has(key)) return this.puyoTextures.get(key)!;

    // Add 0.5 pixel inset to prevent texture bleeding
    const inset = 0.5;
    const rect = new Rectangle(
      col * size + inset,
      row * size + inset,
      size - inset * 2,
      size - inset * 2
    );
    const texture = new Texture({
      source: this.sheetTexture.source,
      frame: rect
    });
    this.puyoTextures.set(key, texture);
    return texture;
  }

  public static getGarbageIconTexture(type: 'small' | 'big' | 'rock' | 'star' | 'moon' | 'crown'): Texture {
    // Row 11 contains the Garbage Puyo (Col 0) and Icons (Col 1+)
    const row = 11;
    let col = 1;

    switch (type) {
      case 'small': col = 1; break;
      case 'big': col = 2; break;
      case 'rock': col = 3; break;
      case 'star': col = 4; break;
      case 'moon': col = 5; break;
      case 'crown': col = 6; break;
    }

    return this.getFixedPuyoTexture(row, col);
  }

  public static getXMarkerTexture(): Texture {
    // X marker for death cell - Row 12 contains the X patterns (cols 7-11)
    return this.getFixedPuyoTexture(12, 7);
  }

  public static getXMarkerTextures(): Texture[] {
    const textures: Texture[] = [];

    const getTex = (col: number, rot: number) => {
      const size = this.sheetTexture.width / 16;
      const inset = 0.5;
      const rect = new Rectangle(
        col * size + inset,
        12 * size + inset,
        size - inset * 2,
        size - inset * 2
      );
      return new Texture({
        source: this.sheetTexture.source,
        frame: rect,
        rotate: rot
      });
    }

    // X Marker Loop Logic (PPT Style)
    // Sequence: 7->8->9->10->11 (Forward) -> 11->10->9->8->7 (Reverse + Mirror)
    // This creates a full 10-frame rotation loop.

    // Pass 1: Forward (Frames 7-11)
    for (let i = 7; i <= 11; i++) {
      textures.push(getTex(i, 0));
    }

    // Pass 2: Reverse + Mirror Horizontal (Frames 11-7)
    // Flipping the animation and playing in reverse creates the "back half" of the rotation
    for (let i = 11; i >= 7; i--) {
      textures.push(getTex(i, groupD8.MIRROR_HORIZONTAL));
    }

    return textures;
  }
}
