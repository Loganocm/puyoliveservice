/**
 * Every skin the player can choose, and which one is chosen.
 *
 * Built-in skins are folders under src/skins/builtin/, found at build time:
 * adding one is adding a folder. Imported skins live in IndexedDB
 * (./store.ts). The choice is kept in localStorage (`puyolive_skin`); the
 * animation lab always uses the default, so its recordings compare.
 */

import { notifyAppearanceChanged } from '../theme/tokens';
import { importedSkinId, readSkinFiles, unzipSkin } from './archive';
import type { InputFile } from './archive';
import type { SkinSource } from './compose';
import { parseManifest } from './format';
import type { SkinManifest, SkinProblem } from './format';
import { deleteStoredSkin, listStoredSkins, putStoredSkin } from './store';

export interface SkinEntry {
    id: string;
    builtin: boolean;
    manifest: SkinManifest;
    manifestJson: unknown;
    sources: SkinSource[];
}

export const DEFAULT_SKIN_ID = 'circuit';
const KEY = 'puyolive_skin';

const manifests = import.meta.glob('./builtin/*/skin.json', { eager: true, import: 'default' }) as Record<string, unknown>;
const assets = import.meta.glob('./builtin/*/*.{png,webp,jpg,jpeg,svg}', { eager: true, query: '?url', import: 'default' }) as Record<string, string>;

/** Built-in skins, in the order the picker shows them. */
const ORDER = ['circuit', 'tile', 'contrast', 'gel'];

export const BUILTIN_SKINS: readonly SkinEntry[] = Object.entries(manifests)
    .map(([path, json]) => {
        const id = path.split('/')[2];
        const { manifest, problems } = parseManifest(json);
        if (!manifest) throw new Error(`Built-in skin ${id}: ${problems.map(p => p.message).join(' ')}`);
        const sources: SkinSource[] = Object.entries(assets)
            .filter(([p]) => p.split('/')[2] === id)
            .map(([p, url]) => ({ name: p.split('/').pop()!.toLowerCase(), url }));
        return { id, builtin: true, manifest, manifestJson: json, sources };
    })
    .sort((a, b) => (ORDER.indexOf(a.id) + 1 || 99) - (ORDER.indexOf(b.id) + 1 || 99));

const inLab = () => {
    try { return new URLSearchParams(window.location.search).has('lab'); } catch { return false; }
};

/** The chosen skin's id. Players who chose the high-contrast theme before skins existed start on the Contrast skin. */
export function getSkinId(): string {
    if (inLab()) return DEFAULT_SKIN_ID;
    try {
        const id = localStorage.getItem(KEY);
        if (id) return id;
        if (localStorage.getItem('puyolive_theme') === 'contrast') return 'contrast';
    } catch { /* storage unavailable */ }
    return DEFAULT_SKIN_ID;
}

/** Choose a skin; the board repaints through the appearance listeners. */
export function setSkin(id: string): void {
    try { localStorage.setItem(KEY, id); } catch { /* not persisted */ }
    notifyAppearanceChanged();
}

/** Every skin: built-in first, then imported, newest last. */
export async function listSkins(): Promise<SkinEntry[]> {
    const stored = await listStoredSkins();
    const imported: SkinEntry[] = [];
    for (const s of stored.sort((a, b) => a.importedAt - b.importedAt)) {
        const { manifest } = parseManifest(s.manifestJson);
        if (!manifest) continue;
        imported.push({
            id: s.id, builtin: false, manifest, manifestJson: s.manifestJson,
            sources: s.files.map(f => ({ name: f.name, blob: f.blob })),
        });
    }
    return [...BUILTIN_SKINS, ...imported];
}

/** The chosen skin, or the default if it no longer exists. */
export async function currentSkin(): Promise<SkinEntry> {
    const id = getSkinId();
    const builtin = BUILTIN_SKINS.find(s => s.id === id);
    if (builtin) return builtin;
    const all = await listSkins();
    return all.find(s => s.id === id) ?? BUILTIN_SKINS.find(s => s.id === DEFAULT_SKIN_ID)!;
}

export interface ImportResult {
    entry: SkinEntry | null;
    problems: SkinProblem[];
    ignored: string[];
}

/**
 * Import a skin from what the player picked: one .zip, or the files of a
 * folder, or loose files (a skin.json and images, or a bare puyo.png).
 */
export async function importSkin(picked: readonly File[]): Promise<ImportResult> {
    let files: InputFile[];
    let name = '';
    if (picked.length === 1 && /\.zip$/i.test(picked[0].name)) {
        name = picked[0].name;
        const { files: unzipped, problems } = unzipSkin(new Uint8Array(await picked[0].arrayBuffer()));
        if (problems.some(p => p.level === 'error')) return { entry: null, problems, ignored: [] };
        files = unzipped;
    } else {
        files = await Promise.all(picked.map(async f => ({
            path: (f as File & { webkitRelativePath?: string }).webkitRelativePath || f.name,
            data: new Uint8Array(await f.arrayBuffer()),
        })));
        name = files[0]?.path.includes('/') ? files[0].path.split('/')[0] : picked[0]?.name ?? '';
    }

    const read = readSkinFiles(files, name);
    if (!read.manifest) return { entry: null, problems: read.problems, ignored: read.ignored };

    const taken = new Set((await listSkins()).map(s => s.id));
    const id = importedSkinId(read.manifest.name, taken);
    const stored = {
        id,
        manifestJson: read.manifestJson,
        files: read.files.map(f => ({ name: f.name, type: f.type, blob: new Blob([f.data as BlobPart], { type: f.type }) })),
        importedAt: Date.now(),
    };
    if (!(await putStoredSkin(stored))) {
        return { entry: null, problems: [...read.problems, { level: 'error', message: 'This browser would not store the skin (private window, or storage full).' }], ignored: read.ignored };
    }
    return {
        entry: { id, builtin: false, manifest: read.manifest, manifestJson: read.manifestJson, sources: stored.files.map(f => ({ name: f.name, blob: f.blob })) },
        problems: read.problems,
        ignored: read.ignored,
    };
}

/** Delete an imported skin; if it was chosen, go back to the default. */
export async function removeSkin(id: string): Promise<void> {
    await deleteStoredSkin(id);
    if (getSkinId() === id) setSkin(DEFAULT_SKIN_ID);
}
