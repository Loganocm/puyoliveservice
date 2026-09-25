import { motion } from "motion/react";
import { useState } from "react";
import type { ReactNode } from "react";
import { Gamepad2 } from "lucide-react";
import { SettingsManager, HANDLING_PRESETS } from "@/core/SettingsManager";
import type { HandlingPreset } from "@/core/SettingsManager";
import { SoundManager } from "@/core/SoundManager";
import { BGMManager } from "@/core/BGMManager";
import { BackButton } from "@/components/BackButton";
import { SkinPicker } from "@/components/SkinPicker";
import { useMenuInput } from "@/hooks/useMenuInput";
import {
  SELECTABLE_THEMES, THEMES, getTheme, setTheme,
  getGlyphStyle, setGlyphStyle, prefersReducedMotion, setReducedMotion,
} from "@/theme/tokens";
import type { GlyphStyle, Theme } from "@/theme/tokens";

interface SettingsScreenProps {
  onOpenControls: () => void;
  onBack: () => void;
}

type Tab = "handling" | "audio" | "display";
type NumericSetting = "das" | "arr" | "sdf" | "masterVolume" | "bgmVolume" | "sfxVolume" | "screenShake";

interface SliderSpec {
  key: NumericSetting;
  label: string;
  description: string;
  min: number;
  max: number;
  unit?: string;
}

const HANDLING: SliderSpec[] = [
  { key: "das", label: "DAS", description: "Frames a direction is held before it repeats", min: 0, max: 60, unit: "f" },
  { key: "arr", label: "ARR", description: "Frames between repeats (0: straight to the wall)", min: 0, max: 30, unit: "f" },
  // 0 used to be allowed and stopped soft drop entirely (the engine divides by it).
  { key: "sdf", label: "SOFT DROP", description: "Gravity multiplier (40: instant)", min: 1, max: 40, unit: "×" },
];

const AUDIO: SliderSpec[] = [
  { key: "masterVolume", label: "MASTER", description: "Everything", min: 0, max: 100, unit: "%" },
  { key: "bgmVolume", label: "MUSIC", description: "Background music", min: 0, max: 100, unit: "%" },
  { key: "sfxVolume", label: "EFFECTS", description: "Sound effects", min: 0, max: 100, unit: "%" },
  { key: "screenShake", label: "SCREEN SHAKE", description: "Off at 0; always off with reduced motion", min: 0, max: 100, unit: "%" },
];

const PRESET_LABELS: Record<HandlingPreset, string> = { relaxed: "Relaxed", standard: "Standard", competitive: "Competitive" };

function touchPreference(): "auto" | "on" | "off" {
  try {
    const v = localStorage.getItem("puyolive_touch_controls");
    return v === "1" ? "on" : v === "0" ? "off" : "auto";
  } catch {
    return "auto";
  }
}

/**
 * Settings, in three tabs. Every change is applied and saved at once (it used
 * to save only on mouse-up, so keyboard changes were lost), and the handling
 * tab offers presets alongside the raw numbers.
 */
export function SettingsScreen({ onOpenControls, onBack }: SettingsScreenProps) {
  useMenuInput({ onBack }, [onBack]);
  const [activeTab, setActiveTab] = useState<Tab>("handling");
  const [, bump] = useState(0);
  const refresh = () => bump(n => n + 1);

  const setNumber = (key: NumericSetting, value: number) => {
    SettingsManager[key] = value;
    SettingsManager.save();
    if (key === "masterVolume" || key === "sfxVolume") SoundManager.updateActiveVolumes();
    if (key === "masterVolume" || key === "bgmVolume") BGMManager.updateVolume();
    refresh();
  };

  const preset = SettingsManager.handlingPreset;

  return (
    <div className="size-full relative overflow-y-auto bg-transparent flex items-start sm:items-center justify-center py-20">
      <BackButton onClick={onBack} />

      <div className="w-full max-w-xl px-4 sm:px-8 relative z-10">
        <motion.h1
          className="text-4xl sm:text-5xl font-bold text-white mb-8 sm:mb-10 tracking-tight text-center"
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.4 }}
        >
          Settings
        </motion.h1>

        <div className="flex gap-2 mb-5" role="tablist" aria-label="Settings sections">
          {([["handling", "HANDLING"], ["audio", "AUDIO & FX"], ["display", "DISPLAY"]] as const).map(([tab, label]) => (
            <button
              key={tab}
              role="tab"
              aria-selected={activeTab === tab}
              onClick={() => setActiveTab(tab)}
              className="flex-1 py-3 text-xs sm:text-sm font-bold tracking-widest rounded-xl border transition-colors cursor-pointer"
              style={activeTab === tab
                ? { background: "color-mix(in srgb, var(--pl-accent-primary) 18%, transparent)", borderColor: "color-mix(in srgb, var(--pl-accent-primary) 60%, transparent)", color: "var(--pl-accent-primary)" }
                : { background: "rgba(255,255,255,0.05)", borderColor: "rgba(255,255,255,0.1)", color: "rgba(255,255,255,0.55)" }}
            >
              {label}
            </button>
          ))}
        </div>

        <div className="space-y-7 mb-8 p-5 sm:p-8 bg-white/5 border border-white/10 rounded-2xl backdrop-blur-sm" role="tabpanel">
          {activeTab === "handling" && (
            <>
              <Row label="PRESET" description={preset ? "A tested starting point" : "Custom values"}>
                <Segmented
                  options={(Object.keys(HANDLING_PRESETS) as HandlingPreset[]).map(p => [p, PRESET_LABELS[p]])}
                  value={preset}
                  onChange={p => { SettingsManager.applyHandlingPreset(p); refresh(); }}
                />
              </Row>
              {HANDLING.map(spec => <Slider key={spec.key} spec={spec} value={SettingsManager[spec.key]} onChange={v => setNumber(spec.key, v)} />)}
            </>
          )}

          {activeTab === "audio" && AUDIO.map(spec => (
            <Slider key={spec.key} spec={spec} value={SettingsManager[spec.key]} onChange={v => setNumber(spec.key, v)} />
          ))}

          {activeTab === "display" && (
            <>
              <Row label="THEME" description="Colours for the board and menus">
                <Segmented
                  options={SELECTABLE_THEMES.map(id => [id, THEMES[id].name] as [Theme["id"], string])}
                  value={getTheme().id}
                  onChange={id => { setTheme(id); refresh(); }}
                />
              </Row>
              <div>
                <div className="text-sm font-bold text-white tracking-widest">SKIN</div>
                <div className="text-xs text-white/45 mt-1 mb-3">How the pieces look. Import your own, or export a template to start one.</div>
                <SkinPicker />
              </div>
              <Row label="PIECE SYMBOLS" description="A shape on each colour, so colour is never the only cue">
                <Segmented
                  options={[["subtle", "Subtle"], ["bold", "Bold"], ["off", "Off"]] as [GlyphStyle, string][]}
                  value={getGlyphStyle()}
                  onChange={g => { setGlyphStyle(g); refresh(); }}
                />
              </Row>
              <Row label="REDUCED MOTION" description="No shake, bursts or bounces; the system setting also applies">
                <Segmented
                  options={[["off", "Off"], ["on", "On"]] as ["off" | "on", string][]}
                  value={localReducedMotion() ? "on" : "off"}
                  onChange={v => { setReducedMotion(v === "on"); refresh(); }}
                />
              </Row>
              <Row label="TOUCH CONTROLS" description="On-screen buttons during play (Auto: on touch screens)">
                <Segmented
                  options={[["auto", "Auto"], ["on", "On"], ["off", "Off"]] as ["auto" | "on" | "off", string][]}
                  value={touchPreference()}
                  onChange={v => {
                    try {
                      if (v === "auto") localStorage.removeItem("puyolive_touch_controls");
                      else localStorage.setItem("puyolive_touch_controls", v === "on" ? "1" : "0");
                    } catch { /* not persisted */ }
                    refresh();
                  }}
                />
              </Row>
              {prefersReducedMotion() && !localReducedMotion() && (
                <p className="text-xs text-white/50">Your system asks for reduced motion, so it is on regardless.</p>
              )}
            </>
          )}
        </div>

        <motion.button
          className="w-full px-8 py-5 bg-white/5 border border-white/10 rounded-xl text-white font-bold text-lg tracking-widest hover:bg-white/10 hover:border-white/20 transition-colors flex items-center justify-center gap-3 cursor-pointer"
          onClick={onOpenControls}
          whileTap={{ scale: 0.98 }}
        >
          <Gamepad2 className="w-6 h-6" />
          CONTROLS
        </motion.button>
      </div>

      <style>{`
        .pl-slider { accent-color: var(--pl-accent-primary); }
        .pl-slider::-webkit-slider-thumb { appearance: none; width: 20px; height: 20px; border-radius: 50%; background: var(--pl-accent-primary); cursor: pointer; }
        .pl-slider::-moz-range-thumb { width: 20px; height: 20px; border-radius: 50%; background: var(--pl-accent-primary); cursor: pointer; border: none; }
        .pl-slider:focus-visible { outline: 2px solid var(--pl-accent-secondary); outline-offset: 4px; }
      `}</style>
    </div>
  );
}

function localReducedMotion(): boolean {
  try { return localStorage.getItem("puyolive_reduced_motion") === "1"; } catch { return false; }
}

function Row({ label, description, children }: { label: string; description: string; children: ReactNode }) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
      <div>
        <div className="text-sm font-bold text-white tracking-widest">{label}</div>
        <div className="text-xs text-white/45 mt-1">{description}</div>
      </div>
      {children}
    </div>
  );
}

function Segmented<T extends string>({ options, value, onChange }: { options: [T, string][]; value: T | null; onChange: (v: T) => void }) {
  return (
    <div className="inline-flex rounded-xl border border-white/10 bg-black/20 p-1 shrink-0" role="radiogroup">
      {options.map(([id, label]) => (
        <button
          key={id}
          role="radio"
          aria-checked={value === id}
          onClick={() => onChange(id)}
          className="px-3 py-1.5 rounded-lg text-xs font-bold tracking-wide transition-colors cursor-pointer"
          style={value === id
            ? { background: "var(--pl-accent-primary)", color: "#fff" }
            : { color: "rgba(255,255,255,0.6)" }}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

function Slider({ spec, value, onChange }: { spec: SliderSpec; value: number; onChange: (v: number) => void }) {
  const shown = Math.min(spec.max, Math.max(spec.min, value));
  const pct = ((shown - spec.min) / (spec.max - spec.min)) * 100;
  const id = `setting-${spec.key}`;
  return (
    <div>
      <div className="flex items-center justify-between mb-3">
        <label htmlFor={id}>
          <div className="text-sm font-bold text-white tracking-widest">{spec.label}</div>
          <div className="text-xs text-white/45 mt-1">{spec.description}</div>
        </label>
        <div className="text-2xl font-semibold tabular-nums" style={{ color: "var(--pl-accent-primary)" }}>
          {value}<span className="text-sm text-white/40 ml-0.5">{spec.unit}</span>
        </div>
      </div>
      <input
        id={id}
        type="range"
        min={spec.min}
        max={spec.max}
        value={shown}
        onChange={e => onChange(Number(e.target.value))}
        className="pl-slider w-full h-2 rounded-full appearance-none cursor-pointer"
        style={{ background: `linear-gradient(to right, var(--pl-accent-primary) ${pct}%, rgba(255,255,255,0.1) ${pct}%)` }}
      />
    </div>
  );
}
