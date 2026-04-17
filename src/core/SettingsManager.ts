export class SettingsManager {
  // --- HANDLING SETTINGS ---

  // DAS: Delayed Auto Shift (frames before auto-repeat)
  // Competitive standard: 5-10 frames (83ms - 167ms at 60fps)
  // Default changed to 25 per user request
  public static das = 25;

  // ARR: Auto Repeat Rate (frames between auto-repeat steps)
  // 0 = Instant (Teleport to wall), 1 = 60Hz, 2 = 30Hz
  // Default changed to 15 per user request
  public static arr = 15;

  // SDF: Soft Drop Factor (multiplier for gravity)
  // 40 = Instant/Sonic Drop, 6 = Fast, 2 = Default
  // User requested default 10
  public static sdf = 10;

  // ARE: Are Ready Entry (Spawn Delay in frames)
  // 0 = Instant Spawn, 6-10 = Standard arcade feel, 30 = 0.5s "Time to think"
  public static are = 30;

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
      das: this.das,
      arr: this.arr,
      sdf: this.sdf,
      are: this.are,
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

        if (parsed.are !== undefined) this.are = parsed.are;
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
