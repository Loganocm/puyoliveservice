import type { SkinManifest } from '../format';
import { circuitPainter } from './circuit';
import { gelPainter } from './gel';
import type { Painter } from './types';

export type { Painter } from './types';

/** The painter a skin's manifest asks for. */
export function painterFor(manifest: Pick<SkinManifest, 'style' | 'shape'>): Painter {
    return manifest.style === 'gel' ? gelPainter() : circuitPainter({ shape: manifest.shape });
}
