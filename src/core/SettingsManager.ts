/**
 * Handling presets, in logical frames (1/60 s). "Standard" is the default:
 * it moves a pair three columns in 14 frames, close to Puyo Puyo Tsu. The old
 * default (DAS 25, ARR 15) took 40 frames, which is what made the game feel
 * slow to new players (CLI-12). See design/game-feel.md.
 */
export const HANDLING_PRESETS = {
  relaxed: { das: 16, arr: 4, sdf: 10 },
  standard: { das: 10, arr: 2, sdf: 20 },
  competitive: { das: 7, arr: 0, sdf: 40 },
} as const;

export type HandlingPreset = keyof typeof HANDLING_PRESETS;

/** Bumped when defaults change in a way untouched settings should follow. */
const HANDLING_VERSION = 2;

export class SettingsManager {
  // --- HANDLING SETTINGS ---

  // DAS: Delayed Auto Shift (logical frames before auto-repeat).
  public static das: number = HANDLING_PRESETS.standard.das;

  // ARR: Auto Repeat Rate (logical frames between auto-repeat steps).
  // 0 = straight to the wall.
  public static arr: number = HANDLING_PRESETS.standard.arr;

  // SDF: Soft Drop Factor (gravity multiplier while soft dropping).
  // 40 or more = sonic drop.
  public static sdf: number = HANDLING_PRESETS.standard.sdf;

  /** The preset the handling values match, or null for custom values. */
  public static get handlingPreset(): HandlingPreset | null {
    for (const [name, p] of Object.entries(HANDLING_PRESETS) as [HandlingPreset, typeof HANDLING_PRESETS[HandlingPreset]][]) {
      if (p.das === this.das && p.arr === this.arr && p.sdf === this.sdf) return name;
    }
    return null;
  }

  public static applyHandlingPreset(name: HandlingPreset): void {
    const p = HANDLING_PRESETS[name];
    this.das = p.das;
    this.arr = p.arr;
    this.sdf = p.sdf;
    this.save();
  }

  // Line Clear Delay (frames to wait during clear animation)
  // 0 = Instant, 20 = Standard
  public static lineClearDelay = 20;

  // Master Volume (0 to 100)
  // Master Volume (0 to 100) - controls overall volume
  // Scaled so 100 = 0.1 gain (10%)
  public static masterVolume = 100;

  // BGM Volume (0 to 100) - controls background music independently
  public static bgmVolume = 50;

  // SFX Volume (0 to 100) - controls sound effects independently
  public static sfxVolume = 100;

  // Soft Drop Protection (Require fresh press on spawn)
  // Defaulting to true is safer for preventing accidental drops on spawn
  public static softDropProtection = true;

  // Screen Shake Intensity (0 to 100, default 40 = subtle)
  // 0 = Off, 100 = Full intensity
  public static screenShake = 40;

  public static save() {
    localStorage.setItem('puyolive_settings', JSON.stringify({
      handlingVersion: HANDLING_VERSION,
      das: this.das,
      arr: this.arr,
      sdf: this.sdf,
      lineClearDelay: this.lineClearDelay,
      masterVolume: this.masterVolume,
      bgmVolume: this.bgmVolume,
      sfxVolume: this.sfxVolume,
      softDropProtection: this.softDropProtection,
      screenShake: this.screenShake
    }));
  }

  public static load() {
    const data = localStorage.getItem('puyolive_settings');
    if (data) {
      try {
        const parsed = JSON.parse(data);
        if (parsed.das !== undefined) this.das = parsed.das;
        if (parsed.arr !== undefined) this.arr = parsed.arr;

        if (parsed.sdf !== undefined) this.sdf = parsed.sdf;
        else if (parsed.softDropSpeed !== undefined) this.sdf = parsed.softDropSpeed;

        if (parsed.lineClearDelay !== undefined) this.lineClearDelay = parsed.lineClearDelay;
        if (parsed.masterVolume !== undefined) {
          this.masterVolume = parsed.masterVolume;
          // Migration: If loading old float volume (between 0 and 1 exclusive)
          // Convert to new scale (0-100). Preserves relative intent.
          if (this.masterVolume > 0 && this.masterVolume < 1) {
            this.masterVolume = Math.round(this.masterVolume * 100);
          }
        }
        if (parsed.softDropProtection !== undefined) this.softDropProtection = parsed.softDropProtection;
        if (parsed.screenShake !== undefined) this.screenShake = parsed.screenShake;
        if (parsed.bgmVolume !== undefined) this.bgmVolume = parsed.bgmVolume;
        if (parsed.sfxVolume !== undefined) this.sfxVolume = parsed.sfxVolume;

        // Players still on the version-1 defaults never chose them: move them
        // to Standard. Anyone who changed a value keeps it.
        if ((parsed.handlingVersion ?? 1) < HANDLING_VERSION) {
          if (this.das === 25 && this.arr === 15) {
            this.das = HANDLING_PRESETS.standard.das;
            this.arr = HANDLING_PRESETS.standard.arr;
            if (this.sdf === 10) this.sdf = HANDLING_PRESETS.standard.sdf;
          }
          this.save();
        }
      } catch (e) {
        console.warn('[SettingsManager] Corrupt settings data, resetting:', e);
        localStorage.removeItem('puyolive_settings');
        this.save();
      }
    } else {
      this.save();
    }
  }
}

// Load on startup
SettingsManager.load();
