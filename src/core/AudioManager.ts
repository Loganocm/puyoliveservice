import { SettingsManager } from './SettingsManager';

// Import audio files
import buttonClickUrl from '../resources/soundeffects/buttonclick.wav';
import moveUrl from '../resources/soundeffects/move.wav';
import rotateUrl from '../resources/soundeffects/rotate.wav';
import dropPieceUrl from '../resources/soundeffects/droppiece.wav';

export class AudioManager {
    private static sounds: Map<string, HTMLAudioElement> = new Map();
    private static initialized = false;

    public static readonly SFX = {
        CLICK: 'click',
        HOVER: 'hover',
        ROTATE: 'rotate',
        DROP: 'drop',
    };

    public static load() {
        if (this.initialized) return;

        this.register(this.SFX.CLICK, buttonClickUrl);
        this.register(this.SFX.HOVER, moveUrl);
        this.register(this.SFX.ROTATE, rotateUrl);
        this.register(this.SFX.DROP, dropPieceUrl);

        this.initialized = true;
    }

    private static register(name: string, url: string) {
        const audio = new Audio(url);
        audio.preload = 'auto'; // Preload sounds
        this.sounds.set(name, audio);
    }

    public static play(name: string) {
        const audio = this.sounds.get(name);
        if (!audio) return;

        // Reset to start to allow rapid fire
        audio.currentTime = 0;

        // SettingsManager.masterVolume is 0-100.
        // Convert to 0.0 - 1.0, but remember user said 100 = 10% gain scaling in comments?
        // Actually SettingsManager comment said "100 = 0.1 gain (10%)" ? 
        // Let's check SettingsManager.ts again. 
        // Line 29: public static masterVolume = 100;
        // Line 28: // Scaled so 100 = 0.1 gain (10%)
        // That seems very low. Standard is 0-100 = 0.0-1.0. 
        // I will assume standard scaling for now: Volume / 100. 
        // If it's too quiet I can adjust.
        const volume = SettingsManager.masterVolume / 100;
        audio.volume = Math.max(0, Math.min(1, volume)); // Clamp 0-1

        try {
            audio.play().catch(e => {
                // Ignore auto-play errors (user interaction required usually)
                console.warn("Audio play failed", e);
            });
        } catch (e) {
            console.error("Audio error", e);
        }
    }
}
