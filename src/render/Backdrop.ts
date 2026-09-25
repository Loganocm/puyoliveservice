/**
 * Backdrop: the ambient field behind the board.
 *
 * Replaces six stock photographs (several megabytes, unrelated to the game,
 * and loaded on every match) with a few large, soft light blobs in the
 * theme's hues drifting over the base colour, and a sparse drift of small
 * bubbles rising through them. It downloads nothing, costs a handful of
 * sprites, and stays dim so the board is always the brightest thing on
 * screen. A big chain brightens it briefly (`pulse`).
 *
 * Specified in website/src/content/docs/design/visual-identity.md, "Backgrounds".
 */

import { Container, Graphics, Sprite, Texture } from 'pixi.js';
import { getTheme, prefersReducedMotion, toPixi } from '../theme/tokens';

interface Blob { sprite: Sprite; ax: number; ay: number; fx: number; fy: number; phase: number; size: number; alpha: number }
interface Bubble { sprite: Sprite; x: number; y: number; speed: number; wobble: number; size: number; alpha: number }

let softTexture: Texture | null = null;

/** A white disc with a long, smooth falloff, shared by blobs and bubbles. */
function soft(): Texture {
    if (softTexture) return softTexture;
    const size = 256;
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = size;
    const ctx = canvas.getContext('2d')!;
    const g = ctx.createRadialGradient(size / 2, size / 2, 0, size / 2, size / 2, size / 2);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.35, 'rgba(255,255,255,0.55)');
    g.addColorStop(0.7, 'rgba(255,255,255,0.14)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, size, size);
    softTexture = Texture.from(canvas);
    return softTexture;
}

export class Backdrop {
    readonly container = new Container();
    private readonly base = new Graphics();
    private readonly blobLayer = new Container();
    private readonly bubbleLayer = new Container();
    private blobs: Blob[] = [];
    private bubbles: Bubble[] = [];
    private width = 1;
    private height = 1;
    private time = 0;
    private energy = 0;
    private reduced = prefersReducedMotion();

    constructor(width: number, height: number) {
        this.container.addChild(this.base, this.blobLayer, this.bubbleLayer);
        this.build();
        this.resize(width, height);
    }

    /** Brighten briefly: 0 to 1, for example on a long chain. */
    pulse(amount: number): void {
        this.energy = Math.max(this.energy, Math.min(1, amount));
    }

    resize(width: number, height: number): void {
        this.width = width;
        this.height = height;
        this.base.clear().rect(0, 0, width, height).fill({ color: toPixi(getTheme().bg.base) });
        this.update(0);
    }

    /** Re-read the theme and the motion preference. */
    retheme(): void {
        this.reduced = prefersReducedMotion();
        this.build();
        this.resize(this.width, this.height);
    }

    update(dt: number): void {
        if (!this.reduced) this.time += dt;
        this.energy = Math.max(0, this.energy - dt / 90);
        const w = this.width, h = this.height;
        const span = Math.max(w, h);
        for (const b of this.blobs) {
            const t = this.time / 60;
            b.sprite.position.set(w * (0.5 + b.ax * Math.sin(t * b.fx + b.phase)), h * (0.5 + b.ay * Math.cos(t * b.fy + b.phase * 1.7)));
            b.sprite.width = b.sprite.height = span * b.size;
            b.sprite.alpha = b.alpha * (1 + this.energy * 0.9);
        }
        for (const p of this.bubbles) {
            if (!this.reduced) {
                p.y -= p.speed * dt;
                if (p.y < -0.05) { p.y = 1.05; p.x = Math.random(); }
            }
            p.sprite.position.set(w * p.x + Math.sin(this.time / 60 * p.wobble + p.x * 10) * 12, h * p.y);
            p.sprite.width = p.sprite.height = p.size;
            p.sprite.alpha = p.alpha * (1 + this.energy);
        }
    }

    destroy(): void {
        this.container.destroy({ children: true });
    }

    private build(): void {
        const theme = getTheme();
        this.blobLayer.removeChildren().forEach(c => c.destroy());
        this.bubbleLayer.removeChildren().forEach(c => c.destroy());
        const light = theme.id === 'daybreak';
        this.blobs = theme.ambient.map((color, i) => {
            const sprite = new Sprite(soft());
            sprite.anchor.set(0.5);
            sprite.tint = toPixi(color);
            if (!light) sprite.blendMode = 'add';
            this.blobLayer.addChild(sprite);
            return {
                sprite,
                ax: 0.32 + 0.08 * i, ay: 0.28 + 0.06 * ((i + 1) % 3),
                fx: 0.05 + 0.017 * i, fy: 0.043 + 0.013 * ((i + 2) % 4),
                phase: i * 1.9, size: 0.55 + 0.12 * (i % 2), alpha: light ? 0.32 : 0.1,
            };
        });
        const bubbles = theme.ambient.length ? 26 : 0;
        this.bubbles = Array.from({ length: bubbles }, (_, i) => {
            const sprite = new Sprite(soft());
            sprite.anchor.set(0.5);
            sprite.tint = toPixi(theme.ambient[i % theme.ambient.length]);
            if (!light) sprite.blendMode = 'add';
            this.bubbleLayer.addChild(sprite);
            return {
                sprite, x: Math.random(), y: Math.random() * 1.1,
                speed: 0.00018 + Math.random() * 0.00035, wobble: 0.2 + Math.random() * 0.4,
                size: 6 + Math.random() * 16, alpha: light ? 0.25 : 0.1 + Math.random() * 0.12,
            };
        });
    }
}
