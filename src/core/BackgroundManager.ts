// Use Vite's import.meta.glob to load all background images
// Use relative path to avoid alias issues with glob
// Note: 'as: url' might still return a Module with default export in some Vite versions
const bgModules = import.meta.glob('../resources/backgrounds/*.jpg', { eager: true, query: '?url', import: 'default' });

// Ensure we extract the string URL. 
// If import: 'default' works as expected with eager, it should be the string.
// If not, we might get a module. Let's handle both.
const backgrounds = Object.values(bgModules).map((mod: any) => {
    return (typeof mod === 'string') ? mod : mod.default;
});

class BackgroundManager {
    private currentMenuBg: string = '';

    constructor() {
        console.log(`[BackgroundManager] Loaded ${backgrounds.length} backgrounds from ../resources/backgrounds/*.jpg`);
        console.log(`[BackgroundManager] Backgrounds:`, backgrounds);
    }

    /**
     * Returns a random background URL.
     * @param exclude Optional URL to exclude from selection (e.g., current menu bg)
     */
    public getRandomBackground(exclude?: string): string {
        if (backgrounds.length === 0) return '';

        let available = backgrounds;
        if (exclude) {
            available = backgrounds.filter(bg => bg !== exclude);
            // Fallback if only 1 bg exists and it matches exclude
            if (available.length === 0) available = backgrounds;
        }

        const randomIndex = Math.floor(Math.random() * available.length);
        return available[randomIndex];
    }

    public setMenuBackground(bg: string) {
        this.currentMenuBg = bg;
    }

    public getMenuBackground(): string {
        return this.currentMenuBg;
    }

    private nextGameBg: string = '';

    public prepareGameBackground(): string {
        // Select a background distinct from the current menu one
        this.nextGameBg = this.getRandomBackground(this.currentMenuBg);
        return this.nextGameBg;
    }

    public getGameBackground(): string {
        // Return prepared one, or generate new if consumed/missing
        if (this.nextGameBg) {
            const bg = this.nextGameBg;
            // Optional: clear it so next game gets a new one? 
            // Or keep it? User might want consistent background for a session?
            // "randomized background for the gameplay screen" implies variety.
            // Let's keep it for the session or until explicitly refreshed?
            // Better: generate a new one for the *next* call if we consume this one?
            // Actually, let's just return it. If we want rotation, we call prepareGameBackground() again.
            return bg;
        }
        return this.getRandomBackground(this.currentMenuBg);
    }

    public async preload(url: string): Promise<void> {
        if (!url) return;
        // PixiJS Assets.load handles caching automatically
        await import('pixi.js').then(pixi => pixi.Assets.load(url));
    }
}

export const backgroundManager = new BackgroundManager();
