import { SettingsManager } from './SettingsManager';
import { GameEvents } from './GameEvents';
import { getAudioContext, routeElement } from './AudioContext';

export type BGMContext = 'menu' | 'game' | 'none';

export class BGMManager {
  private static tracks: Map<string, string[]> = new Map();
  private static currentIndices: Map<string, number> = new Map();
  private static currentAudio: HTMLAudioElement | null = null;
  /** The current track's volume. Fades are ramps on this, not timers on the element. */
  private static currentGain: GainNode | null = null;
  private static currentContext: BGMContext = 'none';
  private static currentUrl: string | null = null;
  private static _initialized = false;

  static get initialized() { return this._initialized; }

  static init() {
    if (this._initialized) return;
    this._initialized = true;
    console.log('[BGM] Initialized');
  }

  static registerTrack(context: BGMContext, url: string) {
    const existing = this.tracks.get(context) || [];
    existing.push(url);
    this.tracks.set(context, existing);
    if (!this.currentIndices.has(context)) {
      this.currentIndices.set(context, 0); // initialize index
    }
  }

  static getEffectiveVolume(): number {
    const master = SettingsManager.masterVolume / 100;
    const bgm = SettingsManager.bgmVolume / 100;
    return master * bgm * 0.3;
  }

  static play(context: BGMContext) {
    if (!this._initialized) return;
    if (context === 'none') { this.stop(); return; }
    if (context === this.currentContext && this.currentAudio && !this.currentAudio.paused) return;

    const urls = this.tracks.get(context);
    if (!urls || urls.length === 0) {
      console.warn(`[BGM] No tracks registered for context: ${context}`);
      return;
    }

    // If we are switching contexts, pick a random track for the new context instead of starting from 0
    if (context !== this.currentContext) {
      const randomIndex = Math.floor(Math.random() * urls.length);
      this.currentIndices.set(context, randomIndex);
    }
    
    let index = this.currentIndices.get(context) || 0;

    // If we are already playing this context, don't restart play unless it's genuinely the start.
    if (context === this.currentContext && this.currentAudio && this.currentAudio.paused) {
        this.resume();
        return;
    }

    const url = urls[index];
    this.crossfadeTo(url, context);
  }

  static next() {
    if (this.currentContext === 'none') return;
    const urls = this.tracks.get(this.currentContext);
    if (!urls || urls.length === 0) return;

    let currentIndex = this.currentIndices.get(this.currentContext) || 0;
    let nextIndex = Math.floor(Math.random() * urls.length);
    
    // Prevent the same song from playing twice in a row if there are multiple songs
    if (urls.length > 1) {
        while (nextIndex === currentIndex) {
            nextIndex = Math.floor(Math.random() * urls.length);
        }
    }
    
    this.currentIndices.set(this.currentContext, nextIndex);

    const url = urls[nextIndex];
    this.crossfadeTo(url, this.currentContext, 200); // Faster crossfade for manual skip
  }

  static stop(fadeDurationMs = 800) {
    this.currentContext = 'none';
    if (this.currentAudio && this.currentGain) {
      this.fadeOut(this.currentAudio, this.currentGain, fadeDurationMs);
      this.currentAudio = null;
      this.currentGain = null;
    }
    this.emitState();
  }

  static pause() {
    if (this.currentAudio && !this.currentAudio.paused) {
      this.currentAudio.pause();
      this.emitState();
    }
  }

  static resume() {
    if (this.currentAudio && this.currentAudio.paused && this.currentContext !== 'none') {
      getAudioContext(); // resumes the context after the first gesture
      this.updateVolume();
      this.currentAudio.play().catch(() => {});
      this.emitState();
    }
  }

  static updateVolume() {
    if (!this.currentGain) return;
    const vol = Math.max(0, Math.min(1, this.getEffectiveVolume()));
    const g = this.currentGain.gain;
    g.cancelScheduledValues(0);
    g.value = vol;
  }

  private static emitState() {
    if (!this.currentUrl || this.currentContext === 'none') {
      GameEvents.emit('bgm_state_change', null);
      return;
    }

    const isPlaying = this.currentAudio ? !this.currentAudio.paused : false;
    
    // Extract filename without extension
    const parts = this.currentUrl.split('/');
    const filename = parts[parts.length - 1];
    let songName = filename.split('.')[0] || 'Unknown Track';

    // Remove Vite hash (e.g. songname-ABC12345.mp3 -> songname)
    if (songName.includes('-')) {
        songName = songName.substring(0, songName.lastIndexOf('-'));
    }

    // Format for display
    const formattedName = songName.charAt(0).toUpperCase() + songName.slice(1).replace(/_/g, ' ');

    GameEvents.emit('bgm_state_change', {
      isPlaying,
      songName: formattedName,
      artist: 'xaptiox'
    });
  }

  private static crossfadeTo(url: string, context: BGMContext, fadeDurationMs = 600) {
    if (this.currentAudio && this.currentGain) {
      // Remove old ended listener
      this.currentAudio.onended = null;
      this.fadeOut(this.currentAudio, this.currentGain, fadeDurationMs);
    }

    const audio = new Audio(url);
    // Don't loop a single track, we want rotation
    audio.loop = false;
    // Stream: a track starts playing long before it has finished downloading.
    audio.preload = 'auto';
    // Route through shared AudioContext for Discord/OBS screen share capture
    const gain = routeElement(audio);
    gain.gain.value = 0;

    audio.onended = () => {
      this.next();
    };

    this.currentAudio = audio;
    this.currentGain = gain;
    this.currentContext = context;
    this.currentUrl = url;

    audio.play().then(() => {
      this.emitState();
      if (this.currentGain !== gain) return;
      const ctx = getAudioContext();
      const target = Math.max(0, Math.min(1, this.getEffectiveVolume()));
      gain.gain.setValueAtTime(0, ctx.currentTime);
      gain.gain.linearRampToValueAtTime(target, ctx.currentTime + fadeDurationMs / 1000);
    }).catch(e => {
      console.warn('[BGM] Play failed:', e);
    });
  }

  private static fadeOut(audio: HTMLAudioElement, gain: GainNode, durationMs = 600) {
    const ctx = getAudioContext();
    const g = gain.gain;
    g.cancelScheduledValues(ctx.currentTime);
    g.setValueAtTime(g.value, ctx.currentTime);
    g.linearRampToValueAtTime(0, ctx.currentTime + durationMs / 1000);
    setTimeout(() => {
      audio.pause();
      audio.removeAttribute('src');
      audio.load();
      gain.disconnect();
    }, durationMs + 50);
  }
}
