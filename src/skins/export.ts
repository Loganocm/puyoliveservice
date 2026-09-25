/**
 * Export a skin as a template: every element as its own PNG at a generous
 * size, a skin.json, and a README, zipped. A skin author edits the images
 * and imports the folder or the zip back. The files are exactly the element
 * names the importer reads (./format.ts), so a template round-trips.
 */

import { zipSync } from 'fflate';
import type { Theme } from '../theme/tokens';
import { GHOST_ROW, ICON_ROW, ICONS, JUNCTION_COLUMN, MARKER_FRAMES, MARKER_ROW, PARTICLE_COLUMN, RING_COLUMN } from './atlas';
import { composeSkin } from './compose';
import { COLOR_NAMES, COLOR_OF, DEFAULT_SYMBOLS, SKIN_FORMAT } from './format';
import type { SkinEntry } from './registry';

const CELL = 128;

const README = `Puyo Live skin template
=======================

Edit these images, keep the names, then import the folder or a .zip of it in
Settings > Display > Skin. Any file you delete is drawn by the skin's style
instead, so you can change only what you want.

puyo-<colour>.png   16 frames of 128x128 in a row: the piece joined to its
                    same-colour neighbours. Frame number = sum of
                    1 (up) + 2 (right) + 4 (down) + 8 (left).
                    A single square image is used for every frame.
garbage.png         one frame.
junction-<colour>.png  drawn centred on the corner shared by a 2x2 block of
                    one colour, to fill any gap your joins leave there.
                    Delete it if your joins leave none.
ghost-<colour>.png  where a pair will land. ghost.png alone is tinted per colour.
tray-<icon>.png     pending-garbage icons: small, big, rock, star, moon, crown.
marker.png          the death-cell marker: one frame, or a strip of frames.
particle.png, ring.png  white; the game tints them.
skin.json           name, author, colours, symbols. Colours drive effects.

SVG works too, and stays sharp at any size. Full specification:
website/src/content/docs/reference/skins.md in the Puyo Live repository.
`;

async function png(canvas: HTMLCanvasElement): Promise<Uint8Array> {
    const blob = await new Promise<Blob | null>(resolve => canvas.toBlob(resolve, 'image/png'));
    if (!blob) throw new Error('The browser could not encode an image.');
    return new Uint8Array(await blob.arrayBuffer());
}

/** Copy `count` cells from row `row` of the atlas, starting at `col`, into a strip. */
function slice(atlas: HTMLCanvasElement, col: number, row: number, count: number): HTMLCanvasElement {
    const c = document.createElement('canvas');
    c.width = CELL * count;
    c.height = CELL;
    c.getContext('2d')!.drawImage(atlas, col * CELL, row * CELL, CELL * count, CELL, 0, 0, CELL * count, CELL);
    return c;
}

/** The template for `skin` as a .zip, ready to download. */
export async function exportSkinTemplate(skin: SkinEntry, theme: Theme): Promise<Blob> {
    // Symbols are left out of the art: the manifest names them, and the game
    // adds them for players who want them.
    const { canvas: atlas, palette } = await composeSkin(skin.manifest, skin.sources, theme, CELL, 'off');
    const files: Record<string, Uint8Array> = {};

    for (let row = 0; row < COLOR_NAMES.length; row++) {
        const name = COLOR_NAMES[row];
        files[name === 'garbage' ? 'garbage.png' : `puyo-${name}.png`] = await png(slice(atlas, 0, row, name === 'garbage' ? 1 : 16));
    }
    const ghostColors = Object.keys(DEFAULT_SYMBOLS);
    for (let i = 0; i < ghostColors.length; i++) {
        files[`ghost-${ghostColors[i]}.png`] = await png(slice(atlas, i, GHOST_ROW, 1));
        files[`junction-${ghostColors[i]}.png`] = await png(slice(atlas, JUNCTION_COLUMN + i, GHOST_ROW, 1));
    }
    for (let i = 0; i < ICONS.length; i++) files[`tray-${ICONS[i]}.png`] = await png(slice(atlas, i, ICON_ROW, 1));
    files['marker.png'] = await png(slice(atlas, 0, MARKER_ROW, MARKER_FRAMES));
    files['particle.png'] = await png(slice(atlas, PARTICLE_COLUMN, ICON_ROW, 1));
    files['ring.png'] = await png(slice(atlas, RING_COLUMN, ICON_ROW, 1));

    const colors: Record<string, { base: string; light: string; dark: string }> = {};
    for (const name of COLOR_NAMES) {
        const p = palette[COLOR_OF[name]];
        colors[name] = { base: p.base, light: p.light, dark: p.dark };
    }
    const manifest = {
        format: SKIN_FORMAT,
        name: `${skin.manifest.name} template`.slice(0, 60),
        author: '',
        version: '1.0.0',
        description: `Started from ${skin.manifest.name}.`,
        style: skin.manifest.style,
        shape: skin.manifest.shape,
        colors,
        symbols: skin.manifest.symbols,
        symbolsInArt: false,
    };
    const enc = new TextEncoder();
    files['skin.json'] = enc.encode(JSON.stringify(manifest, null, 2) + '\n');
    files['README.txt'] = enc.encode(README);

    const folder = manifest.name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'skin';
    const zipped = zipSync(Object.fromEntries(Object.entries(files).map(([n, d]) => [`${folder}/${n}`, d])), { level: 6 });
    return new Blob([zipped as BlobPart], { type: 'application/zip' });
}
