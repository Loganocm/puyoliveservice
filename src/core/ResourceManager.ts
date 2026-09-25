import { Texture, Rectangle } from 'pixi.js';
import { PuyoColor } from '@puyolive/engine';
import { CELL_SIZE } from './RenderConstants';
import {
    ORB_ROWS, ICONS, ICON_ROW, MARKER_ROW, MARKER_FRAMES, PARTICLE_COLUMN, RING_COLUMN, GHOST_ROW, JUNCTION_COLUMN,
} from '../skins/atlas';
import type { GarbageIcon } from '../skins/atlas';
import { composeSkin } from '../skins/compose';
import { BUILTIN_SKINS, currentSkin, DEFAULT_SKIN_ID } from '../skins/registry';
import { getGlyphStyle, getTheme, setPiecePalette } from '../theme/tokens';

/**
 * Textures for the board, generated rather than downloaded.
 *
 * The board is drawn from one atlas composed from the player's skin
 * (src/skins/): the skin's own images where it has them, its painter for the
 * rest, at the device's pixel density. The public methods do not change with
 * the skin, so no scene knows which skin it draws. See
 * website/src/content/docs/reference/skins.md.
 */
export class ResourceManager {
    private static atlas: Texture | null = null;
    private static cellPx = CELL_SIZE * 2;
    private static cache = new Map<string, Texture>();
    private static markerFrames: Texture[] | null = null;
    /** Bumped per load, so a slow load cannot overwrite a newer one. */
    private static loadSeq = 0;
    public static loaded = false;

    /** Pixel size of one texture cell in the atlas. */
    public static get spriteSize(): number {
        return this.cellPx;
    }

    /** Compose the atlas for the chosen skin and theme. Falls back to the default skin if the chosen one fails. */
    public static async load(): Promise<void> {
        const dpr = Math.min(2, typeof window !== 'undefined' ? window.devicePixelRatio || 1 : 1);
        // Two texels per board pixel at DPR 1 keeps pieces crisp when the scene is scaled up.
        const cellPx = Math.round(CELL_SIZE * Math.max(2, dpr * 1.5));
        const seq = ++this.loadSeq;
        let skin = await currentSkin();
        let composed = await composeSkin(skin.manifest, skin.sources, getTheme(), cellPx, getGlyphStyle());
        if (composed.problems.length) {
            console.warn(`[Skin] ${skin.manifest.name}:`, composed.problems.join(' '));
            if (!skin.builtin && composed.problems.length >= skin.sources.length && skin.sources.length > 0) {
                // Nothing of the skin could be read: use the default rather than a half-drawn board.
                skin = BUILTIN_SKINS.find(s => s.id === DEFAULT_SKIN_ID)!;
                composed = await composeSkin(skin.manifest, skin.sources, getTheme(), cellPx, getGlyphStyle());
            }
        }
        // A newer load (the player changed something again) supersedes this one.
        if (seq !== this.loadSeq) return;
        this.cellPx = cellPx;
        setPiecePalette(composed.palette);
        const old = this.atlas;
        this.atlas = Texture.from(composed.canvas);
        this.cache.clear();
        this.markerFrames = null;
        this.loaded = true;
        old?.destroy(true);
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

    /**
     * Drawn centred on the corner shared by a 2x2 block of `color`, to fill
     * the gap the four joined pieces leave. Empty for skins that leave none.
     */
    public static getJunctionTexture(color: PuyoColor): Texture {
        const col = ORB_ROWS.indexOf(color);
        if (col < 0 || color === PuyoColor.Garbage || !this.atlas) return Texture.EMPTY;
        return this.frame(JUNCTION_COLUMN + col, GHOST_ROW);
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
