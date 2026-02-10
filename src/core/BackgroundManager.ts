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
}

export const backgroundManager = new BackgroundManager();
