import { describe, expect, it } from 'vitest';
import { zipSync } from 'fflate';
import { importedSkinId, readSkinFiles, unzipSkin } from '../../src/skins/archive';
import { LIMITS } from '../../src/skins/format';
import { BUILTIN_SKINS, DEFAULT_SKIN_ID } from '../../src/skins/registry';

const bytes = (text: string) => new TextEncoder().encode(text);
const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47]);
const json = (value: unknown) => bytes(JSON.stringify(value));

describe('reading a skin folder', () => {
    it('finds skin.json and the element files inside a top folder, and lists the rest as ignored', () => {
        const read = readSkinFiles([
            { path: 'mine/skin.json', data: json({ format: 1, name: 'Mine' }) },
            { path: 'mine/Puyo-Red.PNG', data: png },
            { path: 'mine/ghost.svg', data: bytes('<svg/>') },
            { path: 'mine/notes.txt', data: bytes('hi') },
            { path: '__MACOSX/mine/._puyo-red.png', data: png },
            { path: 'mine/.DS_Store', data: png },
        ]);
        expect(read.manifest?.name).toBe('Mine');
        expect(read.files.map(f => [f.name, f.type])).toEqual([['puyo-red.png', 'image/png'], ['ghost.svg', 'image/svg+xml']]);
        expect(read.ignored).toEqual(['notes.txt']);
        expect(read.problems).toEqual([]);
    });

    it('reports a skin.json that is not JSON, or not a skin', () => {
        expect(readSkinFiles([{ path: 'skin.json', data: bytes('{nope') }]).problems[0].message).toMatch(/not valid JSON/);
        const noName = readSkinFiles([{ path: 'skin.json', data: json({ format: 1 }) }]);
        expect(noName.manifest).toBeNull();
    });

    it('reads a folder with only a puyo.png as a classic community sheet', () => {
        const read = readSkinFiles([{ path: 'Blue Skin/puyo.png', data: png }, { path: 'Blue Skin/readme.txt', data: bytes('x') }], 'Blue Skin');
        expect(read.manifest?.name).toBe('Blue Skin');
        expect(read.files.map(f => f.name)).toEqual(['puyo.png']);
        expect(read.problems.map(p => p.level)).toEqual(['warning']);
    });

    it('reads one image on its own, whatever its name, as a community sheet', () => {
        const read = readSkinFiles([{ path: 'ppvs2-fever.png', data: png }]);
        expect(read.manifest?.name).toBe('ppvs2-fever');
        expect(read.files.map(f => f.name)).toEqual(['puyo.png']);
    });

    it('refuses a folder with nothing to read', () => {
        const read = readSkinFiles([{ path: 'a.txt', data: bytes('x') }, { path: 'b.txt', data: bytes('y') }]);
        expect(read.manifest).toBeNull();
        expect(read.problems[0].level).toBe('error');
    });

    it('refuses too many files and files that are too large', () => {
        const many = Array.from({ length: LIMITS.files + 1 }, (_, i) => ({ path: `f${i}.png`, data: png }));
        expect(readSkinFiles(many).problems[0].message).toMatch(/Too many files/);
        const big = readSkinFiles([
            { path: 'skin.json', data: json({ format: 1, name: 'Big' }) },
            { path: 'puyo-red.png', data: new Uint8Array(LIMITS.fileBytes + 1) },
        ]);
        expect(big.manifest).toBeNull();
        expect(big.problems.some(p => /larger than/.test(p.message))).toBe(true);
    });

    it('keeps the first of two files with the same name', () => {
        const read = readSkinFiles([
            { path: 'skin.json', data: json({ format: 1, name: 'Twice' }) },
            { path: 'a/puyo-red.png', data: png },
            { path: 'b/puyo-red.png', data: png },
        ]);
        expect(read.files).toHaveLength(1);
        expect(read.problems[0].level).toBe('warning');
    });
});

describe('reading a skin zip', () => {
    it('unzips a skin, skipping system files', () => {
        const zip = zipSync({
            'neon/skin.json': json({ format: 1, name: 'Neon' }),
            'neon/puyo-red.png': png,
            '__MACOSX/neon/._skin.json': png,
        });
        const { files, problems } = unzipSkin(zip);
        expect(problems).toEqual([]);
        expect(files.map(f => f.path).sort()).toEqual(['neon/puyo-red.png', 'neon/skin.json']);
        expect(readSkinFiles(files).manifest?.name).toBe('Neon');
    });

    it('refuses what is not a zip', () => {
        expect(unzipSkin(bytes('not a zip')).problems[0].message).toMatch(/not a readable/);
    });

    it('refuses an archive with too many files, before inflating it', () => {
        const entries = Object.fromEntries(Array.from({ length: LIMITS.files + 1 }, (_, i) => [`f${i}.png`, png]));
        const { files, problems } = unzipSkin(zipSync(entries));
        expect(files).toEqual([]);
        expect(problems[0].message).toMatch(/too large/);
    });
});

describe('imported skin ids', () => {
    it('never collide with a built-in or an earlier import', () => {
        const taken = new Set(['circuit', 'user-neon']);
        expect(importedSkinId('Neon', taken)).toBe('user-neon-2');
        expect(importedSkinId('Circuit', taken)).toBe('user-circuit');
        expect(importedSkinId('Ünïcode Skin!!', new Set())).toBe('user-unicode-skin');
        expect(importedSkinId('***', new Set())).toBe('user-skin');
    });
});

describe('built-in skins', () => {
    it('all parse cleanly, and the default is among them', () => {
        expect(BUILTIN_SKINS.map(s => s.id)).toEqual(['circuit', 'tile', 'contrast', 'gel']);
        expect(BUILTIN_SKINS.some(s => s.id === DEFAULT_SKIN_ID)).toBe(true);
        for (const skin of BUILTIN_SKINS) expect(skin.manifest.name.length).toBeGreaterThan(0);
    });
});
