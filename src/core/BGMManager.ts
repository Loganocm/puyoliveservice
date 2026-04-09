import { SettingsManager } from './SettingsManager';

export type BGMContext = 'menu' | 'game' | 'none';

/**
 * Background Music Manager
 * 
 * Manages looping BGM playback with crossfade transitions,
 * volume control (bgmVolume × masterVolume), and context-aware track selection.
 * 
 * Usage:
 *   BGMManager.init();                     // Call once on first user interaction
 *   BGMManager.registerTrack('menu', url); // Register tracks by context
 *   BGMManager.play('menu');               // Start playing a context
 *   BGMManager.stop();                     // Fade out and stop
 *   BGMManager.updateVolume();             // Call when volume settings change
 */
export class BGMManager {
  private static tracks: Map<string, string[]> = new Map(); // context -> urls[]
  private static currentAudio: HTMLAudioElement | null = null;
  private static currentContext: BGMContext = 'none';
  private static _initialized = false;

  static get initialized() { return this._initialized; }

  /**
   * Initialize the audio context. Must be called from a user gesture (click/keydown).
   */
  static init() {
    if (this._initialized) return;
    this._initialized = true;
    console.log('[BGM] Initialized');
  }

  /**
   * Register one or more track URLs for a context.
   * Multiple tracks for the same context will be picked randomly.
   */
  static registerTrack(context: BGMContext, url: string) {
    const existing = this.tracks.get(context) || [];
    existing.push(url);
    this.tracks.set(context, existing);
  }

  /**
   * Get the effective volume (0-1) based on master + bgm sliders.
   * Master 100 + BGM 50 => 0.1 * 0.5 = 0.05
   */
  static getEffectiveVolume(): number {
    const master = SettingsManager.masterVolume / 100;
    const bgm = SettingsManager.bgmVolume / 100;
    // BGM max gain = 0.3 (louder than SFX which caps at 0.1)
    return master * bgm * 0.3;
  }

  /**
   * Play BGM for a given context. If already playing that context, do nothing.
   * Crossfades from current track if one is playing.
   */
  static play(context: BGMContext) {
    if (!this._initialized) return;
    if (context === 'none') { this.stop(); return; }
    if (context === this.currentContext && this.currentAudio && !this.currentAudio.paused) return;

    const urls = this.tracks.get(context);
    if (!urls || urls.length === 0) {
      console.warn(`[BGM] No tracks registered for context: ${context}`);
      return;
    }

    // Pick a random track
    const url = urls[Math.floor(Math.random() * urls.length)];
    this.crossfadeTo(url, context);
  }

  /**
   * Stop all BGM with a fade out.
   */
  static stop(fadeDurationMs = 800) {
    this.currentContext = 'none';
    if (this.currentAudio) {
      this.fadeOut(this.currentAudio, fadeDurationMs);
      this.currentAudio = null;
    }
  }

  /**
   * Pause current BGM (e.g., when tab loses focus).
   */
  static pause() {
    if (this.currentAudio && !this.currentAudio.paused) {
      this.currentAudio.pause();
    }
  }

  /**
   * Resume current BGM.
   */
  static resume() {
    if (this.currentAudio && this.currentAudio.paused && this.currentContext !== 'none') {
      this.currentAudio.play().catch(() => {});
    }
  }

  /**
   * Update volume on all active audio elements. Call when settings change.
   */
  static updateVolume() {
    const vol = Math.max(0, Math.min(1, this.getEffectiveVolume()));
    if (this.currentAudio) {
      this.currentAudio.volume = vol;
    }
  }

  private static crossfadeTo(url: string, context: BGMContext, fadeDurationMs = 600) {
    // Fade out old
    if (this.currentAudio) {
      this.fadeOut(this.currentAudio, fadeDurationMs);
    }

    // Create new
    const audio = new Audio(url);
    audio.loop = true;
    audio.volume = 0;
    audio.preload = 'auto';

    this.currentAudio = audio;
    this.currentContext = context;

    const targetVol = Math.max(0, Math.min(1, this.getEffectiveVolume()));

    audio.play().then(() => {
      // Fade in
      const steps = 20;
      const stepMs = fadeDurationMs / steps;
      let step = 0;
      const interval = setInterval(() => {
        step++;
        if (step >= steps || this.currentAudio !== audio) {
          clearInterval(interval);
          if (this.currentAudio === audio) audio.volume = targetVol;
          return;
        }
        audio.volume = targetVol * (step / steps);
      }, stepMs);
    }).catch(e => {
      console.warn('[BGM] Play failed (no user interaction yet?):', e);
    });
  }

  private static fadeOut(audio: HTMLAudioElement, durationMs = 600) {
    const startVol = audio.volume;
    if (startVol <= 0) { audio.pause(); return; }

    const steps = 15;
    const stepMs = durationMs / steps;
    let step = 0;

    const interval = setInterval(() => {
      step++;
      if (step >= steps) {
        clearInterval(interval);
        audio.volume = 0;
        audio.pause();
        audio.src = ''; // Release resource
        return;
      }
      audio.volume = startVol * (1 - step / steps);
    }, stepMs);
  }
}
