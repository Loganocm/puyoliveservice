import { describe, expect, it } from 'vitest';
import { PuyoColor } from '@puyolive/engine';
import {
    classicColumn, COLOR_NAMES, DEFAULT_COLORS, DEFAULT_PALETTE, elementOf, LIMITS, parseManifest, planSkin,
} from '../../src/skins/format';
import type { ImageInfo, SkinManifest } from '../../src/skins/format';
import { darkOf, isHexColor, lightOf, luminance, mix, toHex } from '../../src/skins/color';

const manifest = (extra: Record<string, unknown> = {}): SkinManifest => {
    const { manifest: m } = parseManifest({ format: 1, name: 'Test', ...extra });
    if (!m) throw new Error('fixture failed to parse');
    return m;
};
const images = (entries: Record<string, [number, number]>) =>
    new Map<string, ImageInfo>(Object.entries(entries).map(([k, [width, height]]) => [k, { width, height }]));

describe('skin.json', () => {
    it('fills every default from a name alone', () => {
        const { manifest: m, problems } = parseManifest({ format: 1, name: 'Plain' });
        expect(problems).toEqual([]);
        expect(m).toMatchObject({ name: 'Plain', style: 'circuit', shape: 'round', symbolsInArt: false, explicitColors: [] });
        expect(m!.colors).toEqual(DEFAULT_COLORS);
        expect(m!.symbols).toEqual({ red: 'circle', green: 'triangle', blue: 'square', yellow: 'diamond', purple: 'plus' });
    });

    it('refuses what it cannot read', () => {
        expect(parseManifest(null).manifest).toBeNull();
        expect(parseManifest([]).manifest).toBeNull();
        expect(parseManifest({ format: 1 }).problems[0].message).toMatch(/name/);
        expect(parseManifest({ format: 2, name: 'Future' }).problems[0].message).toMatch(/Format 2/);
    });

    it('reads a missing format as the current one, with a warning', () => {
        const { manifest: m, problems } = parseManifest({ name: 'Old' });
        expect(m?.format).toBe(1);
        expect(problems.map(p => p.level)).toEqual(['warning']);
    });

    it('accepts colours as a base alone or as three shades, and derives what is missing', () => {
        const m = manifest({ colors: { red: '#ff0000', blue: { base: '#0000FF', dark: '#000011' } } });
        expect(m.colors.red).toEqual({ base: '#FF0000', light: lightOf('#FF0000'), dark: darkOf('#FF0000') });
        expect(m.colors.blue).toEqual({ base: '#0000FF', light: lightOf('#0000FF'), dark: '#000011' });
        expect(m.colors.green).toEqual(DEFAULT_COLORS.green);
        expect(m.explicitColors.sort()).toEqual(['blue', 'red']);
    });

    it('keeps defaults, with warnings, for colours, styles and symbols it does not understand', () => {
        const { manifest: m, problems } = parseManifest({
            format: 1, name: 'Odd', style: 'neon', shape: 'hex',
            colors: { red: 'red', teal: '#00FFFF', green: { base: '#00FF00', light: 'bright' } },
            symbols: { red: 'heart', blue: 'circle', garbage: 'plus' },
            flavour: 'mint',
        });
        expect(m).not.toBeNull();
        expect(m!.style).toBe('circuit');
        expect(m!.shape).toBe('round');
        expect(m!.colors.red).toEqual(DEFAULT_COLORS.red);
        expect(m!.colors.green.light).toBe(lightOf('#00FF00'));
        expect(m!.symbols.red).toBe('circle');
        expect(m!.symbols.blue).toBe('circle');
        expect(problems.every(p => p.level === 'warning')).toBe(true);
        expect(problems.length).toBeGreaterThanOrEqual(7);
    });

    it('cleans and bounds free text', () => {
        const m = manifest({ name: `  A\u0000B${'x'.repeat(200)}`, description: 'd'.repeat(1000) });
        expect(m.name.startsWith('A B')).toBe(true);
        expect(m.name.length).toBe(LIMITS.name);
        expect(m.description.length).toBe(LIMITS.description);
    });

    it('lets a skin move the classic sheet\'s extra elements', () => {
        const m = manifest({ classic: { garbage: [5, 0], markerFrames: 3, tray: 'nowhere' } });
        expect(m.classic.garbage).toEqual([5, 0]);
        expect(m.classic.markerFrames).toBe(3);
        expect(m.classic.tray).toEqual([11, 1]);
    });

    it('gives the default palette to the renderer, garbage without a symbol', () => {
        expect(DEFAULT_PALETTE[PuyoColor.Red]).toEqual({ ...DEFAULT_COLORS.red, glyph: 'circle' });
        expect(DEFAULT_PALETTE[PuyoColor.Garbage].glyph).toBeNull();
    });
});

describe('element files', () => {
    it('are recognised by name, in any case, as images only', () => {
        expect(elementOf('pieces.png')).toEqual({ kind: 'sheet' });
        expect(elementOf('PUYO.PNG')).toEqual({ kind: 'classic' });
        expect(elementOf('skins/mine/puyo-red.svg')).toEqual({ kind: 'piece', color: 'red' });
        expect(elementOf('garbage.webp')).toEqual({ kind: 'piece', color: 'garbage' });
        expect(elementOf('ghost.png')).toEqual({ kind: 'ghost', color: null });
        expect(elementOf('ghost-purple.png')).toEqual({ kind: 'ghost', color: 'purple' });
        expect(elementOf('tray-crown.jpg')).toEqual({ kind: 'tray', icon: 'crown' });
        expect(elementOf('junction-blue.png')).toEqual({ kind: 'junction', color: 'blue' });
        expect(elementOf('marker.svg')).toEqual({ kind: 'marker' });
        for (const name of ['puyo-orange.png', 'ghost-garbage.png', 'tray-sun.png', 'puyo-red.gif', 'readme.txt', 'skin.json', '.png', 'junction.png']) {
            expect(elementOf(name), name).toBeNull();
        }
    });
});

describe('masks', () => {
    it('map one-to-one onto the classic sheet\'s columns', () => {
        const columns = Array.from({ length: 16 }, (_, m) => classicColumn(m));
        expect(new Set(columns).size).toBe(16);
        expect(classicColumn(0)).toBe(0);
        expect(classicColumn(1)).toBe(2);  // up
        expect(classicColumn(2)).toBe(4);  // right
        expect(classicColumn(4)).toBe(1);  // down
        expect(classicColumn(8)).toBe(8);  // left
        expect(classicColumn(15)).toBe(15);
    });
});

describe('planning a skin', () => {
    it('paints everything when there are no files', () => {
        const plan = planSkin(manifest(), images({}));
        for (const color of COLOR_NAMES) expect(plan.pieces[color].every(s => s.from === 'painter')).toBe(true);
        expect(plan.marker).toEqual({ from: 'painter' });
        expect(plan.junctions.red).toEqual({ from: 'painter' });
        expect(plan.sampleColors).toEqual([]);
    });

    it('reads a 16-frame strip by mask, and repeats a single frame for every mask', () => {
        const plan = planSkin(manifest(), images({ 'puyo-red.png': [2048, 128], 'puyo-blue.svg': [64, 64] }));
        expect(plan.pieces.red[5]).toEqual({ from: 'frame', frame: { file: 'puyo-red.png', cols: 16, rows: 1, col: 5, row: 0 } });
        expect(plan.pieces.blue[5]).toEqual({ from: 'frame', frame: { file: 'puyo-blue.svg', cols: 1, rows: 1, col: 0, row: 0 } });
        expect(plan.pieces.green[5]).toEqual({ from: 'painter' });
    });

    it('prefers a colour\'s own file, then the full sheet, then the classic sheet', () => {
        const plan = planSkin(manifest(), images({ 'puyo-red.png': [1024, 64], 'pieces.png': [1024, 384], 'puyo.png': [512, 512] }));
        expect(plan.pieces.red[3].from === 'frame' && plan.pieces.red[3].frame.file).toBe('puyo-red.png');
        expect(plan.pieces.green[3]).toEqual({ from: 'frame', frame: { file: 'pieces.png', cols: 16, rows: 6, col: 3, row: 1 } });
        expect(plan.pieces.garbage[7]).toEqual({ from: 'frame', frame: { file: 'pieces.png', cols: 16, rows: 6, col: 0, row: 5 } });
    });

    it('reads the classic community sheet in its own layout', () => {
        const plan = planSkin(manifest(), images({ 'puyo.png': [512, 512] }));
        expect(plan.pieces.yellow[1]).toEqual({ from: 'frame', frame: { file: 'puyo.png', cols: 16, rows: 16, col: 2, row: 3 } });
        expect(plan.pieces.garbage[0]).toEqual({ from: 'frame', frame: { file: 'puyo.png', cols: 16, rows: 16, col: 10, row: 9 } });
        expect(plan.tray.star).toEqual({ from: 'frame', frame: { file: 'puyo.png', cols: 16, rows: 16, col: 4, row: 11 } });
        expect(plan.marker.from).toBe('frames');
        if (plan.marker.from === 'frames') {
            expect(plan.marker.frames.map(f => `${f.col}${f.flip ? 'm' : ''}`)).toEqual(['7', '8', '9', '10', '11', '11m', '10m', '9m', '8m', '7m']);
            expect(plan.marker.pulse).toBe(false);
        }
        // Art without colours in skin.json: sample them. Its joins are its own: no filler.
        expect(plan.sampleColors).toEqual([...COLOR_NAMES]);
        expect(plan.junctions.red).toEqual({ from: 'none' });
    });

    it('does not sample colours the skin set', () => {
        const plan = planSkin(manifest({ colors: { red: '#FF0000' } }), images({ 'puyo.png': [512, 512] }));
        expect(plan.sampleColors).not.toContain('red');
        expect(plan.sampleColors).toContain('green');
    });

    it('tints one ghost for every colour, unless a colour has its own', () => {
        const plan = planSkin(manifest(), images({ 'ghost.png': [64, 64], 'ghost-red.png': [64, 64] }));
        expect(plan.ghosts.red).toEqual({ from: 'frame', frame: { file: 'ghost-red.png', cols: 1, rows: 1, col: 0, row: 0 } });
        expect(plan.ghosts.blue).toEqual({ from: 'tinted', file: 'ghost.png' });
    });

    it('reads a marker strip frame by frame, and pulses a single marker', () => {
        const strip = planSkin(manifest(), images({ 'marker.png': [512, 128] }));
        expect(strip.marker.from === 'frames' && strip.marker.frames.length).toBe(4);
        expect(strip.marker.from === 'frames' && strip.marker.pulse).toBe(false);
        const single = planSkin(manifest(), images({ 'marker.png': [128, 128] }));
        expect(single.marker.from === 'frames' && single.marker.pulse).toBe(true);
    });

    it('uses a skin\'s junction file, even for art pieces', () => {
        const plan = planSkin(manifest(), images({ 'puyo-red.png': [2048, 128], 'junction-red.png': [128, 128] }));
        expect(plan.junctions.red).toEqual({ from: 'frame', frame: { file: 'junction-red.png', cols: 1, rows: 1, col: 0, row: 0 } });
    });

    it('warns when two files are the same element, and uses one', () => {
        const plan = planSkin(manifest(), images({ 'puyo-red.png': [64, 64], 'puyo-red.svg': [64, 64] }));
        expect(plan.problems).toHaveLength(1);
        expect(plan.pieces.red[0].from).toBe('frame');
    });
});

describe('colour arithmetic', () => {
    it('parses, mixes and formats', () => {
        expect(isHexColor('#abc')).toBe(true);
        expect(isHexColor('#ABCDEF')).toBe(true);
        expect(isHexColor('abc')).toBe(false);
        expect(isHexColor('#abcd')).toBe(false);
        expect(mix('#000000', '#FFFFFF', 0.5)).toBe('#808080');
        expect(mix('#FF0000', '#0000FF', 0)).toBe('#FF0000');
        expect(toHex({ r: 300, g: -4, b: 17.6 })).toBe('#FF0012');
    });

    it('derives a lighter and a darker shade', () => {
        const base = '#4C8DFF';
        expect(luminance(lightOf(base))).toBeGreaterThan(luminance(base));
        expect(luminance(darkOf(base))).toBeLessThan(luminance(base));
    });
});
