import { Container, Sprite, Texture } from 'pixi.js';

/**
 * A reusable set of sprites for things drawn fresh every frame.
 *
 * The board used to destroy and re-create every puyo sprite on every frame
 * (CLI-17): at 60 fps with a full board that is thousands of allocations per
 * second, and the garbage collector pauses to reclaim them at exactly the
 * moments that matter, such as the middle of a chain.
 *
 * A pool keeps its sprites. Each frame the caller asks for as many as it
 * needs with `next()`, and `end()` hides whichever were not asked for. The
 * number of live sprites only ever grows to the largest frame seen.
 */
export class SpritePool {
    private readonly sprites: Sprite[] = [];
    private used = 0;
    private readonly parent: Container;

    constructor(parent: Container) {
        this.parent = parent;
    }

    /** Start a frame. Every sprite is up for reuse. */
    begin(): void {
        this.used = 0;
    }

    /** A visible sprite with `texture`, reset to neutral transform and colour. */
    next(texture: Texture): Sprite {
        let sprite = this.sprites[this.used];
        if (!sprite) {
            sprite = new Sprite(texture);
            sprite.anchor.set(0.5);
            this.parent.addChild(sprite);
            this.sprites.push(sprite);
        } else {
            sprite.texture = texture;
        }
        this.used++;
        sprite.visible = true;
        sprite.alpha = 1;
        sprite.tint = 0xffffff;
        sprite.rotation = 0;
        sprite.scale.set(1);
        return sprite;
    }

    /** Finish a frame: hide the sprites that were not used. */
    end(): void {
        for (let i = this.used; i < this.sprites.length; i++) {
            if (!this.sprites[i].visible) break;
            this.sprites[i].visible = false;
        }
    }

    /** Sprites in use this frame. */
    get size(): number {
        return this.used;
    }
}
