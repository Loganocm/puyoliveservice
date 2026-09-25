import moveUrl from '../resources/soundeffects/move.wav';
import rotateUrl from '../resources/soundeffects/rotate.wav';
import dropUrl from '../resources/soundeffects/droppiece.wav';
import clickUrl from '../resources/soundeffects/buttonclick.wav';
import tinyGarbageUrl from '../resources/soundeffects/tinygarbage.wav';
import hugeGarbageUrl from '../resources/soundeffects/hugegarbage.wav';
import combo1Url from '../resources/soundeffects/combo1.wav';
import combo2Url from '../resources/soundeffects/combo2.wav';
import combo3Url from '../resources/soundeffects/combo3.wav';
import combo4Url from '../resources/soundeffects/combo4.wav';
import combo5Url from '../resources/soundeffects/combo5.wav';
import combo6Url from '../resources/soundeffects/combo6.wav';
import combo7Url from '../resources/soundeffects/combo7.wav'; // Use for 7+

import { SettingsManager } from './SettingsManager';
import { getAudioContext } from './AudioContext';

const SOURCES: Record<string, string> = {
  move: moveUrl,
  rotate: rotateUrl,
  drop: dropUrl,
  click: clickUrl,
  tinygarbage: tinyGarbageUrl,
  hugegarbage: hugeGarbageUrl,
  combo1: combo1Url,
  combo2: combo2Url,
  combo3: combo3Url,
  combo4: combo4Url,
  combo5: combo5Url,
  combo6: combo6Url,
  combo7: combo7Url,
};

/**
 * Names the UI asks for that share another sound. These were requested but
 * never loaded, so they used to be silent.
 */
const ALIASES: Record<string, string> = {
  menu_select: 'click',
  menu_back: 'click',
  level_up: 'combo6',
};

/** Relative mix: frequent, small sounds sit under the rest. */
const LEVELS: Record<string, number> = { move: 0.1, click: 0.1 };

/**
 * Sound effects, played from decoded buffers through the shared AudioContext.
 *
 * They used to be HTMLAudioElements cloned on every play, each clone routed
 * into the audio graph and never released: slow to start (an element has to
 * seek and buffer), and a new graph node per sound for the life of the page.
 * A buffer source starts on the next audio quantum and is collected when it
 * finishes.
 *
 * Loading is off the critical path: start-up does not wait for it, and a
 * sound requested before its buffer is ready is simply skipped.
 */
export class SoundManager {
  private static buffers = new Map<string, AudioBuffer>();
  private static bus: GainNode | null = null;
  private static loading: Promise<void> | null = null;

  /** Fetch and decode every effect (once). */
  public static load(): Promise<void> {
    this.loading ??= Promise.all(Object.entries(SOURCES).map(async ([name, url]) => {
      try {
        const response = await fetch(url);
        const data = await response.arrayBuffer();
        this.buffers.set(name, await getAudioContext().decodeAudioData(data));
      } catch (e) {
        console.warn(`[SoundManager] ${name} failed to load`, e);
      }
    })).then(() => undefined);
    return this.loading;
  }

  public static play(soundName: string) {
    const name = ALIASES[soundName] ?? soundName;
    const buffer = this.buffers.get(name);
    if (!buffer) return;
    const ctx = getAudioContext();
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    const level = LEVELS[name];
    if (level !== undefined) {
      const gain = ctx.createGain();
      gain.gain.value = level;
      source.connect(gain).connect(this.output(ctx));
    } else {
      source.connect(this.output(ctx));
    }
    source.start();
  }

  /** The chain sound for link `chain` (the seventh and beyond share one). */
  public static playCombo(chain: number) {
    const num = Math.min(Math.max(1, chain), 7);
    this.play(`combo${num}`);
  }

  /** Apply the master and effects volume settings. */
  public static updateActiveVolumes() {
    if (this.bus) this.bus.gain.value = this.volume();
  }

  private static volume(): number {
    // 0-100 settings, scaled so 100/100 is a gain of 0.1: the mix level the game has always used.
    return (SettingsManager.masterVolume / 100) * (SettingsManager.sfxVolume / 100) * 0.1;
  }

  private static output(ctx: AudioContext): GainNode {
    if (!this.bus) {
      this.bus = ctx.createGain();
      this.bus.gain.value = this.volume();
      this.bus.connect(ctx.destination);
    }
    return this.bus;
  }
}
