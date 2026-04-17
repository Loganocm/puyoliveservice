import moveUrl from '../resources/soundeffects/move.wav';
import rotateUrl from '../resources/soundeffects/rotate.wav';
import dropUrl from '../resources/soundeffects/droppiece.wav';
import clickUrl from '../resources/soundeffects/buttonclick.wav';
import tinyGarbageUrl from '../resources/soundeffects/tinygarbage.wav';
import hugeGarbageUrl from '../resources/soundeffects/hugegarbage.wav';

// Import Combos
import combo1Url from '../resources/soundeffects/combo1.wav';
import combo2Url from '../resources/soundeffects/combo2.wav';
import combo3Url from '../resources/soundeffects/combo3.wav';
import combo4Url from '../resources/soundeffects/combo4.wav';
import combo5Url from '../resources/soundeffects/combo5.wav';
import combo6Url from '../resources/soundeffects/combo6.wav';
import combo7Url from '../resources/soundeffects/combo7.wav'; // Use for 7+

import { SettingsManager } from './SettingsManager';

export class SoundManager {
  private static sounds: Map<string, HTMLAudioElement> = new Map();

  public static async load() {
    this.loadSound('move', moveUrl);
    this.loadSound('rotate', rotateUrl);
    this.loadSound('drop', dropUrl);
    this.loadSound('click', clickUrl);
    this.loadSound('tinygarbage', tinyGarbageUrl);
    this.loadSound('hugegarbage', hugeGarbageUrl);

    this.loadSound('combo1', combo1Url);
    this.loadSound('combo2', combo2Url);
    this.loadSound('combo3', combo3Url);
    this.loadSound('combo4', combo4Url);
    this.loadSound('combo5', combo5Url);
    this.loadSound('combo6', combo6Url);
    this.loadSound('combo7', combo7Url);
  }

  private static loadSound(name: string, url: string) {
    const audio = new Audio(url);
    // Preload
    audio.load();
    this.sounds.set(name, audio);
  }

  public static play(soundName: string) {
    const sound = this.sounds.get(soundName);
    if (sound) {
      // Scale 0-100 to 0.0-0.1, applying both master and sfx volume
      let volume = (SettingsManager.masterVolume / 100) * (SettingsManager.sfxVolume / 100) * 0.1;

      // Specific adjustments (Relative mixing)
      if (soundName === 'move' || soundName === 'click') {
        volume *= 0.1; // Keep these relatively quieter
      }

      // Fix audio lag by cloning the Audio node. This allows rapid-fire overlaps without resetting the buffer
      const clone = sound.cloneNode() as HTMLAudioElement;
      clone.volume = Math.max(0, Math.min(1, volume));
      clone.play().catch(() => { /* Ignore auto-play errors */ });
    }
  }

  public static playCombo(chain: number) {
    const num = Math.min(Math.max(1, chain), 7);
    this.play(`combo${num}`);
  }

  public static updateActiveVolumes() {
    this.sounds.forEach((sound, name) => {
      // Recalculate volume using same logic as play()
      let volume = (SettingsManager.masterVolume / 100) * 0.1;

      if (name === 'move' || name === 'click') {
        volume *= 0.1;
      }

      sound.volume = Math.max(0, Math.min(1, volume));
    });
  }
}
