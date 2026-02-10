
// Use Vite's import.meta.glob to load all background images
const bgModules = import.meta.glob('@/resources/backgrounds/*.jpg', { eager: true, as: 'url' });
const backgrounds = Object.values(bgModules);

class BackgroundManager {
    private currentMenuBg: string = '';

    constructor() {
        console.log(`[BackgroundManager] Loaded ${backgrounds.length} backgrounds.`);
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
}

export const backgroundManager = new BackgroundManager();
