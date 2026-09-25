import { Texture, Rectangle } from 'pixi.js';
import { PuyoColor } from '@puyolive/engine';
import { CELL_SIZE } from './RenderConstants';
import {
    paintAtlas, ORB_ROWS, ICONS, ICON_ROW, MARKER_ROW, MARKER_FRAMES, PARTICLE_COLUMN,
    RING_COLUMN, GHOST_ROW,
} from './PieceArt';
import type { GarbageIcon } from './PieceArt';
import { getTheme } from '../theme/tokens';

/**
 * Textures for the board, generated rather than downloaded.
 *
 * This used to slice a recycled sprite sheet (src/resources/puyo.png, 1.7 MB,
 * of unverified origin; CLI-14, LEG-01). It now serves Puyo Live's own art,
 * painted at start-up by PieceArt into one atlas at the device's pixel
 * density. The public methods are unchanged, so every scene that draws pieces
 * works as before.
 */
export class ResourceManager {
    private static atlas: Texture | null = null;
    private static cellPx = CELL_SIZE * 2;
    private static cache = new Map<string, Texture>();
    private static markerFrames: Texture[] | null = null;
    public static loaded = false;

    /** Pixel size of one texture cell in the atlas. */
    public static get spriteSize(): number {
        return this.cellPx;
    }

    /** Paint the atlas for the current theme. Synchronous and fast; no network. */
    public static async load(): Promise<void> {
        const dpr = Math.min(2, typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1);
        // Two texels per board pixel at DPR 1 keeps orbs crisp when the scene is scaled up.
        this.cellPx = Math.round(CELL_SIZE * Math.max(2, dpr * 1.5));
        const canvas = paintAtlas(getTheme(), this.cellPx);
        this.atlas?.destroy(true);
        this.atlas = Texture.from(canvas);
        this.cache.clear();
        this.markerFrames = null;
        this.loaded = true;
    }

    /** Repaint after a theme change. */
    public static async reload(): Promise<void> {
        await this.load();
    }

    private static frame(col: number, row: number): Texture {
        const key = `${col}_${row}`;
        const hit = this.cache.get(key);
        if (hit) return hit;
        const s = this.cellPx;
        const texture = new Texture({
            source: this.atlas!.source,
            frame: new Rectangle(col * s, row * s, s, s),
        });
        this.cache.set(key, texture);
        return texture;
    }

    /**
     * A piece of `color` joined to its same-colour neighbours.
     * `neighbors` bits: 1 up, 2 right, 4 down, 8 left.
     */
    public static getPuyoTexture(color: PuyoColor, neighbors: number = 0): Texture {
        if (color === PuyoColor.None || !this.atlas) return Texture.EMPTY;
        const row = ORB_ROWS.indexOf(color);
        if (row < 0) return Texture.EMPTY;
        return this.frame(color === PuyoColor.Garbage ? 0 : neighbors & 15, row);
    }

    public static getGarbageIconTexture(type: GarbageIcon): Texture {
        if (!this.atlas) return Texture.EMPTY;
        return this.frame(ICONS.indexOf(type), ICON_ROW);
    }

    /** A soft white dot, tinted per particle. */
    public static getParticleTexture(): Texture {
        if (!this.atlas) return Texture.WHITE;
        return this.frame(PARTICLE_COLUMN, ICON_ROW);
    }

    /** A thin white ring, tinted per use (pop bursts). */
    public static getRingTexture(): Texture {
        if (!this.atlas) return Texture.EMPTY;
        return this.frame(RING_COLUMN, ICON_ROW);
    }

    /** The landing preview for a piece of `color`. */
    public static getGhostTexture(color: PuyoColor): Texture {
        const col = ORB_ROWS.indexOf(color);
        if (col < 0 || color === PuyoColor.Garbage || !this.atlas) return Texture.EMPTY;
        return this.frame(col, GHOST_ROW);
    }

    public static getXMarkerTexture(): Texture {
        return this.frame(0, MARKER_ROW);
    }

    /** The death-cell marker's animation loop. */
    public static getXMarkerTextures(): Texture[] {
        if (!this.atlas) return [Texture.EMPTY];
        return this.markerFrames ??= Array.from({ length: MARKER_FRAMES }, (_, f) => this.frame(f, MARKER_ROW));
    }
}
