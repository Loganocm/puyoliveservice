/**
 * Where the pieces of a match screen go: the player's board, the queue, the
 * stats, and a small second board (the opponent, or the Mines target).
 *
 * Shared by GameScene and QuickPlayScene so both lay out the same way.
 *
 *   Landscape (the default):      stats | board | queue
 *                                               | small board
 *   Portrait (phones held upright): board | queue
 *                                         | stats
 *                                         | small board
 *
 * In portrait the stats go compact and the side column narrows, so the board
 * gets most of the width. The bottom of the screen that on-screen controls
 * cover (SceneManager.reservedBottom) is left free.
 */

import type { Container, Text } from 'pixi.js';
import { SceneManager } from '../core/SceneManager';
import { BOARD_LEFT, BOARD_TOP, SIDE_GAP, OPPONENT_SCALE } from '../core/RenderConstants';
import { BoardView } from './BoardView';
import { NextQueueView } from './NextQueueView';
import { StatPanel } from './StatPanel';

export interface MatchViews {
    /** Holds everything below; scaled and centred as one. */
    wrapper: Container;
    board: BoardView;
    next: NextQueueView;
    stats: StatPanel;
    side?: { view: BoardView; label: Text };
}

/** Portrait content box, in base units: board, a gap, and a 136-wide column. */
const PORTRAIT_W = BoardView.WIDTH + 16 + 136 + 8;
const PORTRAIT_H = BOARD_TOP + BoardView.HEIGHT + 16;
const PORTRAIT_SIDE_SCALE = 0.3;

export function isPortrait(width: number, height: number): boolean {
    return width / Math.max(1, height) < 0.8;
}

export function layoutMatch(v: MatchViews, screenW: number, screenH: number): void {
    const availH = Math.max(1, screenH - SceneManager.reservedBottom);
    if (isPortrait(screenW, availH)) {
        const scale = Math.min(screenW / PORTRAIT_W, availH / PORTRAIT_H);
        v.wrapper.scale.set(scale);
        v.wrapper.position.set(Math.round((screenW - PORTRAIT_W * scale) / 2), Math.round((availH - PORTRAIT_H * scale) / 2));
        const colX = 4 + BoardView.WIDTH + 16;
        v.board.container.position.set(4, BOARD_TOP);
        v.next.container.position.set(colX + 8, BOARD_TOP);
        v.stats.setSize(136, 60);
        v.stats.container.position.set(colX, BOARD_TOP + NextQueueView.HEIGHT + 14);
        if (v.side) {
            const w = BoardView.WIDTH * PORTRAIT_SIDE_SCALE;
            const y = BOARD_TOP + BoardView.HEIGHT - BoardView.HEIGHT * PORTRAIT_SIDE_SCALE;
            v.side.view.container.scale.set(PORTRAIT_SIDE_SCALE);
            v.side.view.container.position.set(colX + (136 - w) / 2, y);
            v.side.label.position.set(colX + 68, y - 24);
        }
        return;
    }

    const baseW = SceneManager.BASE_WIDTH;
    const baseH = SceneManager.BASE_HEIGHT;
    const scale = Math.min(screenW / baseW, availH / baseH);
    v.wrapper.scale.set(scale);
    v.wrapper.position.set(Math.round((screenW - baseW * scale) / 2), Math.round((availH - baseH * scale) / 2));
    const rightX = BOARD_LEFT + BoardView.WIDTH + SIDE_GAP;
    v.board.container.position.set(BOARD_LEFT, BOARD_TOP);
    v.stats.setSize(StatPanel.WIDTH, 74);
    v.stats.container.position.set(BOARD_LEFT - SIDE_GAP - StatPanel.WIDTH, BOARD_TOP);
    v.next.container.position.set(rightX, BOARD_TOP);
    if (v.side) {
        const w = BoardView.WIDTH * OPPONENT_SCALE;
        const x = rightX + (NextQueueView.WIDTH - w) / 2;
        const y = BOARD_TOP + NextQueueView.HEIGHT + 96;
        v.side.view.container.scale.set(OPPONENT_SCALE);
        v.side.view.container.position.set(x, y);
        v.side.label.position.set(x + w / 2, y - 76);
    }
}
