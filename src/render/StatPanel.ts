/**
 * StatPanel: the column of labelled numbers beside the board (score, max
 * chain, time...). Text objects are created once per row and only their
 * content changes, because creating Pixi text is expensive.
 */

import { Container, Graphics, Text } from 'pixi.js';
import { FONTS, alphaOf, getTheme, toPixi } from '../theme/tokens';

export type StatTone = 'normal' | 'accent' | 'warning' | 'danger';

export interface StatRow {
    label: string;
    value: string | number;
    tone?: StatTone;
}

const CARD_W = 172;
const CARD_H = 74;
const GAP = 12;

export class StatPanel {
    static readonly WIDTH = CARD_W;

    readonly container = new Container();
    private readonly cards = new Graphics();
    private readonly labels: Text[] = [];
    private readonly values: Text[] = [];
    private shown = -1;

    constructor() {
        this.container.addChild(this.cards);
    }

    /** Height of `rows` stacked cards. */
    static heightFor(rows: number): number {
        return rows * CARD_H + Math.max(0, rows - 1) * GAP;
    }

    set(rows: readonly StatRow[]): void {
        const t = getTheme();
        while (this.labels.length < rows.length) {
            const label = new Text({ text: '', resolution: 2, style: { fontFamily: FONTS.ui, fontSize: 12, fontWeight: '700', letterSpacing: 2.5 } });
            const value = new Text({ text: '', resolution: 2, style: { fontFamily: FONTS.display, fontSize: 32, fontWeight: '600' } });
            label.position.set(18, 12);
            value.position.set(16, 28);
            this.container.addChild(label, value);
            this.labels.push(label);
            this.values.push(value);
        }
        if (rows.length !== this.shown) {
            this.cards.clear();
            for (let i = 0; i < rows.length; i++) {
                const y = i * (CARD_H + GAP);
                this.cards.roundRect(0, y, CARD_W, CARD_H, 14).fill({ color: toPixi(t.bg.raised), alpha: 0.72 });
                this.cards.roundRect(0, y, CARD_W, CARD_H, 14).stroke({ color: toPixi(t.line.subtle), alpha: alphaOf(t.line.subtle), width: 1.5 });
            }
            this.shown = rows.length;
        }
        const tones: Record<StatTone, string> = { normal: t.text.primary, accent: t.accent.primary, warning: t.state.warning, danger: t.state.danger };
        for (let i = 0; i < this.labels.length; i++) {
            const row = rows[i];
            const label = this.labels[i], value = this.values[i];
            label.visible = value.visible = !!row;
            if (!row) continue;
            const y = i * (CARD_H + GAP);
            label.y = y + 12;
            value.y = y + 28;
            if (label.text !== row.label) label.text = row.label;
            const text = String(row.value);
            if (value.text !== text) value.text = text;
            const fill = tones[row.tone ?? 'normal'];
            if (value.style.fill !== fill) value.style.fill = fill;
            if (label.style.fill !== t.text.muted) label.style.fill = t.text.muted;
        }
    }

    /** Force a redraw of the cards after a theme change. */
    retheme(): void {
        this.shown = -1;
    }
}
