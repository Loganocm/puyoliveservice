/**
 * NextQueueView: the next two pairs, stacked beside the board.
 *
 * Pairs stand upright as they will spawn (second puyo on top). The nearer
 * pair is large; the one after is smaller and set down to the right, the
 * layout Puyo players read at a glance. When a piece spawns the queue slides
 * up rather than snapping, so the eye can follow it. Sprites are created once
 * and reused.
 */

import { Container, Graphics, Sprite, Text } from 'pixi.js';
import type { PuyoColor } from '@puyolive/engine';
import { ResourceManager } from '../core/ResourceManager';
import { FONTS, alphaOf, getTheme, prefersReducedMotion, toPixi } from '../theme/tokens';

interface Slot { x: number; y: number; size: number; alpha: number }

const W = 120;
const H = 200;
const SLOTS: Slot[] = [
    { x: 46, y: 96, size: 48, alpha: 1 },
    { x: 90, y: 150, size: 32, alpha: 0.9 },
    { x: 90, y: 214, size: 32, alpha: 0 },
];
const SLIDE_FRAMES = 9;

export class NextQueueView {
    static readonly WIDTH = W;
    static readonly HEIGHT = H;

    readonly container = new Container();
    private readonly panel = new Graphics();
    private readonly label: Text;
    private readonly sprites: Sprite[] = [];
    private readonly pieces = new Container();
    private slide = 1;

    constructor() {
        const mask = new Graphics();
        this.pieces.mask = mask;
        this.label = new Text({ text: 'NEXT', resolution: 2, style: { fontFamily: FONTS.ui, fontSize: 13, fontWeight: '700', letterSpacing: 3 } });
        this.label.anchor.set(0.5, 0);
        this.label.position.set(W / 2, 14);
        for (let i = 0; i < 4; i++) {
            const s = new Sprite();
            s.anchor.set(0.5);
            this.pieces.addChild(s);
            this.sprites.push(s);
        }
        this.container.addChild(this.panel, this.label, this.pieces, mask);
        this.retheme();
    }

    retheme(): void {
        const t = getTheme();
        this.panel.clear()
            .roundRect(0, 0, W, H, 16).fill({ color: toPixi(t.bg.raised), alpha: 0.72 })
            .roundRect(0, 0, W, H, 16).stroke({ color: toPixi(t.line.subtle), alpha: alphaOf(t.line.subtle), width: 1.5 });
        this.label.style.fill = t.text.muted;
        (this.pieces.mask as Graphics).clear().roundRect(0, 36, W, H - 36, 14).fill({ color: 0xffffff });
    }

    /** Draw `queue` (nearest first). Pass `advanced` on the frame a piece spawned. */
    render(queue: readonly { mainColor: PuyoColor; subColor: PuyoColor }[], dt: number, advanced: boolean): void {
        if (advanced && !prefersReducedMotion()) this.slide = 0;
        this.slide = Math.min(1, this.slide + dt / SLIDE_FRAMES);
        const e = 1 - (1 - this.slide) ** 3;
        for (let i = 0; i < 2; i++) {
            const pair = queue[i];
            const sub = this.sprites[i * 2], main = this.sprites[i * 2 + 1];
            if (!pair) { sub.visible = main.visible = false; continue; }
            // While sliding, each pair moves up from the slot below its own.
            const from = SLOTS[i + 1], to = SLOTS[i];
            const x = from.x + (to.x - from.x) * e;
            const y = from.y + (to.y - from.y) * e;
            const size = from.size + (to.size - from.size) * e;
            const alpha = from.alpha + (to.alpha - from.alpha) * e;
            place(sub, ResourceManager.getPuyoTexture(pair.subColor, 0), x, y - size / 2 - 1, size, alpha);
            place(main, ResourceManager.getPuyoTexture(pair.mainColor, 0), x, y + size / 2 + 1, size, alpha);
        }
    }
}

function place(s: Sprite, texture: Sprite['texture'], x: number, y: number, size: number, alpha: number): void {
    s.texture = texture;
    s.visible = true;
    s.position.set(x, y);
    s.width = s.height = size;
    s.alpha = alpha;
}
