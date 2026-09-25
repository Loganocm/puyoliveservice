/**
 * Composing a skin into the board's texture atlas (layout in ./atlas.ts).
 *
 * For each slot the plan (format.planSkin) names a source: a frame of one of
 * the skin's images, a white image tinted with the piece colour, or the
 * skin's painter. Images are drawn at the atlas cell size, so vector (SVG)
 * art stays sharp at any resolution. Colours the skin does not set are
 * sampled from its art, so effects match imported pieces.
 */

import type { GlyphStyle, PieceStyle, Theme } from '../theme/tokens';
import {
    ATLAS_COLUMNS, ATLAS_ROWS, GHOST_ROW, ICON_ROW, ICONS, JUNCTION_COLUMN, MARKER_FRAMES, MARKER_ROW,
    PARTICLE_COLUMN, RING_COLUMN,
} from './atlas';
import { darkOf, lightOf, toHex } from './color';
import { COLOR_NAMES, COLOR_OF, DEFAULT_SYMBOLS, LIMITS, paletteOf, planSkin } from './format';
import type { ColorName, Frame, ImageInfo, PieceColorName, SkinManifest, SkinPlan, SlotSource } from './format';
import { painterFor } from './painters';
import { drawGlyph, drawIcon, drawMarker, drawParticle, drawRing } from './painters/shared';

/** A skin's files, as the loader hands them over: a URL (built-in) or a Blob (imported). */
export type SkinSource = { name: string; url: string } | { name: string; blob: Blob };

export interface ComposedSkin {
    canvas: HTMLCanvasElement;
    palette: Record<number, PieceStyle>;
    problems: string[];
}

interface Loaded { image: HTMLImageElement; info: ImageInfo; svg: boolean }

async function loadImage(source: SkinSource): Promise<Loaded> {
    const url = 'url' in source ? source.url : URL.createObjectURL(source.blob);
    try {
        const image = new Image();
        image.decoding = 'async';
        image.src = url;
        await image.decode();
        const width = image.naturalWidth, height = image.naturalHeight;
        if (!width || !height) throw new Error(`${source.name} has no size (an SVG needs width and height, or a viewBox).`);
        if (width > LIMITS.imageSide || height > LIMITS.imageSide) throw new Error(`${source.name} is larger than ${LIMITS.imageSide} pixels a side.`);
        return { image, info: { width, height }, svg: source.name.endsWith('.svg') };
    } finally {
        // The decoded image keeps its pixels; the blob URL is no longer needed.
        if (!('url' in source)) setTimeout(() => URL.revokeObjectURL(url), 0);
    }
}

/** Draw one frame of an image into the square (0, 0, s, s). */
function drawFrame(ctx: CanvasRenderingContext2D, s: number, loaded: Loaded, f: Frame): void {
    const fw = loaded.info.width / f.cols;
    const fh = loaded.info.height / f.rows;
    ctx.save();
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = 'high';
    if (f.flip) { ctx.translate(s, 0); ctx.scale(-1, 1); }
    if (loaded.svg) {
        // Rasterise the vector at the size it is shown, clipped to the frame.
        ctx.beginPath(); ctx.rect(0, 0, s, s); ctx.clip();
        ctx.drawImage(loaded.image, -f.col * s, -f.row * s, f.cols * s, f.rows * s);
    } else {
        ctx.drawImage(loaded.image, f.col * fw, f.row * fh, fw, fh, 0, 0, s, s);
    }
    ctx.restore();
}

/** A white or greyscale image multiplied by `color`, keeping its own transparency. */
function drawTinted(ctx: CanvasRenderingContext2D, s: number, loaded: Loaded, color: string): void {
    const tmp = document.createElement('canvas');
    tmp.width = tmp.height = s;
    const t = tmp.getContext('2d')!;
    drawFrame(t, s, loaded, { file: '', cols: 1, rows: 1, col: 0, row: 0 });
    t.globalCompositeOperation = 'multiply';
    t.fillStyle = color;
    t.fillRect(0, 0, s, s);
    t.globalCompositeOperation = 'destination-in';
    drawFrame(t, s, loaded, { file: '', cols: 1, rows: 1, col: 0, row: 0 });
    ctx.drawImage(tmp, 0, 0);
}

/** The average colour of the opaque pixels of a frame, as a piece's base. */
function sampleColor(loaded: Loaded, f: Frame): string | null {
    const n = 24;
    const tmp = document.createElement('canvas');
    tmp.width = tmp.height = n;
    const t = tmp.getContext('2d', { willReadFrequently: true })!;
    drawFrame(t, n, loaded, f);
    let r = 0, g = 0, b = 0, w = 0;
    try {
        const px = t.getImageData(0, 0, n, n).data;
        for (let i = 0; i < px.length; i += 4) {
            const a = px[i + 3] / 255;
            if (a < 0.5) continue;
            r += px[i] * a; g += px[i + 1] * a; b += px[i + 2] * a; w += a;
        }
    } catch {
        return null;
    }
    return w > 0 ? toHex({ r: r / w, g: g / w, b: b / w }) : null;
}

/**
 * Compose a skin into an atlas with cells `cell` pixels across. Never
 * throws: an image that cannot be read falls back to the painter and is
 * reported in `problems`.
 */
export async function composeSkin(
    manifest: SkinManifest, sources: readonly SkinSource[], theme: Theme, cell: number, glyphs: GlyphStyle,
): Promise<ComposedSkin> {
    const problems: string[] = [];
    const images = new Map<string, Loaded>();
    await Promise.all(sources.map(async source => {
        try {
            images.set(source.name, await loadImage(source));
        } catch (e) {
            problems.push(e instanceof Error ? e.message : `${source.name} could not be read.`);
        }
    }));

    const plan: SkinPlan = planSkin(manifest, new Map([...images].map(([name, l]) => [name, l.info])));
    problems.push(...plan.problems.map(p => p.message));

    // Colours: the skin's own, or sampled from its art.
    const colors = structuredClone(manifest.colors);
    for (const name of plan.sampleColors) {
        const src = plan.pieces[name][0];
        if (src.from !== 'frame') continue;
        const loaded = images.get(src.frame.file);
        const base = loaded && sampleColor(loaded, src.frame);
        if (base) colors[name] = { base, light: lightOf(base), dark: darkOf(base) };
    }
    const palette = paletteOf(colors, manifest.symbols);
    const styleOf = (name: ColorName): PieceStyle => palette[COLOR_OF[name]];

    const canvas = document.createElement('canvas');
    canvas.width = cell * ATLAS_COLUMNS;
    canvas.height = cell * ATLAS_ROWS;
    const ctx = canvas.getContext('2d')!;
    const painter = painterFor(manifest);

    const at = (col: number, row: number, draw: () => void) => {
        ctx.save();
        ctx.translate(col * cell, row * cell);
        ctx.beginPath(); ctx.rect(0, 0, cell, cell); ctx.clip();
        draw();
        ctx.restore();
    };
    const fromSource = (src: SlotSource, color: string, paint: () => void) => {
        if (src.from === 'frame') {
            const loaded = images.get(src.frame.file);
            if (loaded) return drawFrame(ctx, cell, loaded, src.frame);
        } else if (src.from === 'tinted') {
            const loaded = images.get(src.file);
            if (loaded) return drawTinted(ctx, cell, loaded, color);
        }
        paint();
    };

    COLOR_NAMES.forEach((name, row) => {
        const style = styleOf(name);
        const glyph = name === 'garbage' ? null : manifest.symbols[name];
        for (let mask = 0; mask < 16; mask++) {
            const src = plan.pieces[name][mask];
            at(mask, row, () => {
                if (name === 'garbage') return fromSource(src, style.base, () => painter.garbage(ctx, cell, style));
                fromSource(src, style.base, () => painter.piece(ctx, cell, style, mask, glyph, glyphs));
                // Art from a file carries no symbols unless it says so: add them
                // for players who asked for bold ones.
                if (src.from !== 'painter' && glyph && glyphs === 'bold' && !manifest.symbolsInArt) {
                    drawGlyph(ctx, glyph, cell / 2, cell / 2, cell * 0.3, style, 'bold');
                }
            });
        }
    });

    ICONS.forEach((icon, i) => at(i, ICON_ROW, () =>
        fromSource(plan.tray[icon], '#FFFFFF', () => drawIcon(ctx, cell, icon, styleOf('garbage'), {
            red: styleOf('red'), yellow: styleOf('yellow'), purple: styleOf('purple'),
        }, theme))));
    at(PARTICLE_COLUMN, ICON_ROW, () => fromSource(plan.particle, '#FFFFFF', () => drawParticle(ctx, cell)));
    at(RING_COLUMN, ICON_ROW, () => fromSource(plan.ring, '#FFFFFF', () => drawRing(ctx, cell)));

    for (let f = 0; f < MARKER_FRAMES; f++) {
        at(f, MARKER_ROW, () => {
            const t = f / MARKER_FRAMES;
            const m = plan.marker;
            if (m.from === 'painter') return drawMarker(ctx, cell, t, theme);
            const frame = m.frames[Math.floor(t * m.frames.length)];
            const loaded = images.get(frame.file);
            if (!loaded) return drawMarker(ctx, cell, t, theme);
            if (m.pulse) {
                // One still image: the game makes it breathe.
                const pulse = 0.5 + 0.5 * Math.sin(t * Math.PI * 2);
                const k = 0.9 + 0.1 * pulse;
                ctx.globalAlpha = 0.55 + 0.45 * pulse;
                ctx.translate(cell * (1 - k) / 2, cell * (1 - k) / 2);
                ctx.scale(k, k);
            }
            drawFrame(ctx, cell, loaded, frame);
        });
    }

    (Object.keys(DEFAULT_SYMBOLS) as PieceColorName[]).forEach((name, i) => {
        const style = styleOf(name);
        at(i, GHOST_ROW, () => fromSource(plan.ghosts[name], style.base, () => painter.ghost(ctx, cell, style)));
        const junction = plan.junctions[name];
        if (junction.from !== 'none') at(JUNCTION_COLUMN + i, GHOST_ROW, () => fromSource(junction, style.base, () => painter.junction(ctx, cell, style)));
    });

    return { canvas, palette, problems };
}
