/**
 * Reading a skin a player brings in: a .zip, a folder, or loose files.
 *
 * Works on bytes, not on DOM objects, so it is unit tested
 * (tests/skins/archive.test.ts). Everything a player imports is untrusted:
 * sizes are checked before anything is inflated or decoded, file names are
 * reduced to their base name, and only known element files are kept.
 */

import { unzipSync } from 'fflate';
import { classicManifest, elementOf, LIMITS, parseManifest } from './format';
import type { SkinManifest, SkinProblem } from './format';

export interface InputFile {
    /** Path inside the archive or folder, with forward slashes. */
    path: string;
    data: Uint8Array;
}

export interface SkinFileData {
    /** Base name, lower case: `puyo-red.png`. */
    name: string;
    type: string;
    data: Uint8Array;
}

export interface ReadSkin {
    manifest: SkinManifest | null;
    /** The raw skin.json, kept so an exported or re-imported skin round-trips. */
    manifestJson: unknown;
    files: SkinFileData[];
    ignored: string[];
    problems: SkinProblem[];
}

const TYPES: Record<string, string> = {
    png: 'image/png', webp: 'image/webp', jpg: 'image/jpeg', jpeg: 'image/jpeg', svg: 'image/svg+xml',
};

const baseName = (path: string) => path.split('/').pop() ?? path;
const skippable = (path: string) =>
    path.endsWith('/') || path.split('/').some(part => part.startsWith('.') || part === '__MACOSX');

/** Unzip, refusing archives whose contents are too many or too large (checked before inflating). */
export function unzipSkin(bytes: Uint8Array): { files: InputFile[]; problems: SkinProblem[] } {
    const problems: SkinProblem[] = [];
    let count = 0;
    let total = 0;
    let refused = false;
    let entries: Record<string, Uint8Array>;
    try {
        entries = unzipSync(bytes, {
            filter: file => {
                if (skippable(file.name)) return false;
                count++;
                total += file.originalSize;
                if (count > LIMITS.files || file.originalSize > LIMITS.fileBytes || total > LIMITS.totalBytes) refused = true;
                return !refused;
            },
        });
    } catch {
        return { files: [], problems: [{ level: 'error', message: 'This is not a readable .zip file.' }] };
    }
    if (refused) {
        problems.push({ level: 'error', message: `The archive is too large: at most ${LIMITS.files} files, ${LIMITS.fileBytes / 1048576} MB each and ${LIMITS.totalBytes / 1048576} MB in all.` });
        return { files: [], problems };
    }
    return { files: Object.entries(entries).map(([path, data]) => ({ path, data })), problems };
}

/**
 * Turn a set of files into a skin: find skin.json, keep the element files,
 * list what was ignored. Files may sit in one top folder (as most archives
 * do). A folder with no skin.json but a puyo.png is read as a community
 * sheet, named after `fallbackName`.
 */
export function readSkinFiles(input: InputFile[], fallbackName = ''): ReadSkin {
    const problems: SkinProblem[] = [];
    const ignored: string[] = [];
    const files: SkinFileData[] = [];
    let manifestJson: unknown = null;
    let manifestText: string | null = null;
    let total = 0;

    let usable = input.filter(f => !skippable(f.path));
    // One image on its own, whatever it is called, is a community sheet:
    // that is how they are shared ("blue-skin.png").
    if (usable.length === 1) {
        const only = baseName(usable[0].path);
        const ext = only.split('.').pop()!.toLowerCase();
        if (ext in TYPES && !elementOf(only)) {
            if (!fallbackName) fallbackName = only;
            usable = [{ path: `puyo.${ext}`, data: usable[0].data }];
        }
    }
    if (usable.length > LIMITS.files) {
        return { manifest: null, manifestJson: null, files: [], ignored: [], problems: [{ level: 'error', message: `Too many files: at most ${LIMITS.files}.` }] };
    }

    const seen = new Set<string>();
    for (const f of usable) {
        const name = baseName(f.path).toLowerCase();
        total += f.data.byteLength;
        if (name === 'skin.json') {
            if (f.data.byteLength > LIMITS.manifestBytes) { problems.push({ level: 'error', message: 'skin.json is too large.' }); continue; }
            manifestText = new TextDecoder().decode(f.data);
            continue;
        }
        if (!elementOf(name)) { ignored.push(baseName(f.path)); continue; }
        if (f.data.byteLength > LIMITS.fileBytes) { problems.push({ level: 'error', message: `${name} is larger than ${LIMITS.fileBytes / 1048576} MB.` }); continue; }
        if (seen.has(name)) { problems.push({ level: 'warning', message: `${name} appears twice; the first is used.` }); continue; }
        seen.add(name);
        files.push({ name, type: TYPES[name.split('.').pop()!], data: f.data });
    }
    if (total > LIMITS.totalBytes) problems.push({ level: 'error', message: `The skin is larger than ${LIMITS.totalBytes / 1048576} MB.` });

    let manifest: SkinManifest | null = null;
    if (manifestText !== null) {
        try {
            manifestJson = JSON.parse(manifestText);
        } catch {
            problems.push({ level: 'error', message: 'skin.json is not valid JSON.' });
        }
        if (manifestJson !== null) {
            const parsed = parseManifest(manifestJson);
            manifest = parsed.manifest;
            problems.push(...parsed.problems);
        }
    } else if (files.some(f => f.name.startsWith('puyo.'))) {
        // A community sheet on its own, as they are usually shared.
        manifest = classicManifest(fallbackName.replace(/\.(zip|png|webp|jpe?g|svg)$/i, '').slice(0, LIMITS.name));
        manifestJson = { format: manifest.format, name: manifest.name };
        problems.push({ level: 'warning', message: 'No skin.json: read as a classic puyo.png sheet.' });
    } else {
        problems.push({ level: 'error', message: 'No skin.json, and no puyo.png sheet to read instead.' });
    }

    if (manifest && files.length === 0 && manifest.explicitColors.length === 0) {
        problems.push({ level: 'warning', message: 'The skin has no art and no colours, so it looks like the default.' });
    }
    if (problems.some(p => p.level === 'error')) manifest = null;
    return { manifest, manifestJson, files, ignored, problems };
}

/** An id for an imported skin, distinct from every built-in id. */
export function importedSkinId(name: string, taken: ReadonlySet<string>): string {
    const slug = name.normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40) || 'skin';
    let id = `user-${slug}`;
    for (let n = 2; taken.has(id); n++) id = `user-${slug}-${n}`;
    return id;
}
