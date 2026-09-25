import { useCallback, useEffect, useRef, useState } from "react";
import type { ReactNode } from "react";
import { Download, FolderOpen, Trash2, Upload } from "lucide-react";
import { composeSkin } from "@/skins/compose";
import type { SkinProblem } from "@/skins/format";
import { drawSkinPreview, PREVIEW_COLUMNS, PREVIEW_ROWS } from "@/skins/preview";
import { getSkinId, importSkin, listSkins, removeSkin, setSkin } from "@/skins/registry";
import type { SkinEntry } from "@/skins/registry";
import { getGlyphStyle, getTheme, onThemeChange } from "@/theme/tokens";

/**
 * Choose, import, export and delete skins (src/skins/). Each card shows a
 * small board drawn by the skin itself. Skin names and authors come from
 * files players share, so they are shown as text only, never as HTML.
 */
export function SkinPicker() {
  const [skins, setSkins] = useState<SkinEntry[]>([]);
  const [selected, setSelected] = useState(getSkinId());
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: "ok" | "error"; text: string; details: string[] } | null>(null);
  const [confirmDelete, setConfirmDelete] = useState<string | null>(null);
  const [version, setVersion] = useState(0);
  const fileInput = useRef<HTMLInputElement>(null);
  const folderInput = useRef<HTMLInputElement>(null);

  const reload = useCallback(async () => setSkins(await listSkins()), []);
  useEffect(() => { void reload(); }, [reload]);
  // Symbols and theme change the previews too.
  useEffect(() => onThemeChange(() => setVersion(v => v + 1)), []);

  const choose = (id: string) => {
    setSelected(id);
    setSkin(id);
  };

  const onPicked = async (list: FileList | null) => {
    if (!list || list.length === 0) return;
    setBusy(true);
    setMessage(null);
    try {
      const result = await importSkin(Array.from(list));
      const details = [
        ...result.problems.map((p: SkinProblem) => p.message),
        ...(result.ignored.length ? [`Not skin files, ignored: ${result.ignored.slice(0, 6).join(", ")}${result.ignored.length > 6 ? "…" : ""}`] : []),
      ];
      if (result.entry) {
        await reload();
        choose(result.entry.id);
        setMessage({ tone: "ok", text: `Imported “${result.entry.manifest.name}”.`, details });
      } else {
        setMessage({ tone: "error", text: "That skin could not be imported.", details });
      }
    } finally {
      setBusy(false);
      if (fileInput.current) fileInput.current.value = "";
      if (folderInput.current) folderInput.current.value = "";
    }
  };

  const exportCurrent = async () => {
    const skin = skins.find(s => s.id === selected);
    if (!skin) return;
    setBusy(true);
    try {
      const { exportSkinTemplate } = await import("@/skins/export");
      const blob = await exportSkinTemplate(skin, getTheme());
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${skin.manifest.name.toLowerCase().replace(/[^a-z0-9]+/g, "-") || "skin"}-template.zip`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 5000);
      setMessage({ tone: "ok", text: "Template downloaded. Edit the images and import the folder or the zip.", details: [] });
    } catch (e) {
      setMessage({ tone: "error", text: "The template could not be made.", details: [e instanceof Error ? e.message : String(e)] });
    } finally {
      setBusy(false);
    }
  };

  const remove = async (id: string) => {
    await removeSkin(id);
    setConfirmDelete(null);
    setSelected(getSkinId());
    await reload();
  };

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3" role="radiogroup" aria-label="Skin">
        {skins.map(skin => (
          <SkinCard
            key={skin.id}
            skin={skin}
            selected={skin.id === selected}
            version={version}
            confirming={confirmDelete === skin.id}
            onChoose={() => choose(skin.id)}
            onAskDelete={() => setConfirmDelete(skin.id)}
            onCancelDelete={() => setConfirmDelete(null)}
            onDelete={() => void remove(skin.id)}
          />
        ))}
      </div>

      <div className="flex flex-wrap gap-2">
        <ActionButton icon={<Upload size={15} />} label="Import skin" disabled={busy} onClick={() => fileInput.current?.click()} />
        <ActionButton icon={<FolderOpen size={15} />} label="Import folder" disabled={busy} onClick={() => folderInput.current?.click()} />
        <ActionButton icon={<Download size={15} />} label="Export template" disabled={busy} onClick={() => void exportCurrent()} />
      </div>
      <p className="text-xs text-white/45">
        A .zip or folder with a skin.json and images, or a classic puyo.png sheet on its own. Leave out any image and it is drawn for you.
      </p>
      <input
        ref={fileInput}
        type="file"
        multiple
        accept=".zip,.json,.png,.webp,.jpg,.jpeg,.svg"
        className="hidden"
        onChange={e => void onPicked(e.target.files)}
      />
      <input
        ref={folderInput}
        type="file"
        multiple
        // Not in the TypeScript DOM types, but supported by every current browser.
        {...{ webkitdirectory: "", directory: "" }}
        className="hidden"
        onChange={e => void onPicked(e.target.files)}
      />

      {message && (
        <div
          role="status"
          className="rounded-xl border px-4 py-3 text-sm"
          style={message.tone === "ok"
            ? { borderColor: "color-mix(in srgb, var(--pl-state-success) 45%, transparent)", background: "color-mix(in srgb, var(--pl-state-success) 10%, transparent)" }
            : { borderColor: "color-mix(in srgb, var(--pl-state-danger) 45%, transparent)", background: "color-mix(in srgb, var(--pl-state-danger) 10%, transparent)" }}
        >
          <div className="font-bold text-white">{message.text}</div>
          {message.details.length > 0 && (
            <ul className="mt-1.5 space-y-0.5 text-xs text-white/60 list-disc pl-4">
              {message.details.slice(0, 8).map((d, i) => <li key={i}>{d}</li>)}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

function ActionButton({ icon, label, disabled, onClick }: { icon: ReactNode; label: string; disabled: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-white/10 bg-white/5 text-xs font-bold tracking-wide text-white/80 hover:bg-white/10 hover:text-white transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-wait"
    >
      {icon}
      {label}
    </button>
  );
}

interface SkinCardProps {
  skin: SkinEntry;
  selected: boolean;
  version: number;
  confirming: boolean;
  onChoose: () => void;
  onAskDelete: () => void;
  onCancelDelete: () => void;
  onDelete: () => void;
}

function SkinCard({ skin, selected, version, confirming, onChoose, onAskDelete, onCancelDelete, onDelete }: SkinCardProps) {
  const canvas = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    let live = true;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const cell = Math.round(28 * dpr);
    void composeSkin(skin.manifest, skin.sources, getTheme(), cell, getGlyphStyle()).then(({ canvas: atlas }) => {
      const target = canvas.current;
      if (!live || !target) return;
      target.width = PREVIEW_COLUMNS * cell;
      target.height = PREVIEW_ROWS * cell;
      drawSkinPreview(target, atlas, cell);
    });
    return () => { live = false; };
  }, [skin, version]);

  return (
    <div
      className="relative rounded-xl border transition-colors"
      style={selected
        ? { borderColor: "var(--pl-accent-primary)", background: "color-mix(in srgb, var(--pl-accent-primary) 12%, transparent)" }
        : { borderColor: "rgba(255,255,255,0.1)", background: "rgba(0,0,0,0.2)" }}
    >
      <button
        type="button"
        role="radio"
        aria-checked={selected}
        aria-label={`${skin.manifest.name}${skin.manifest.author ? ` by ${skin.manifest.author}` : ""}`}
        onClick={onChoose}
        className="w-full text-left p-2.5 cursor-pointer rounded-xl"
      >
        <canvas
          ref={canvas}
          aria-hidden="true"
          className="w-full rounded-lg"
          style={{ aspectRatio: `${PREVIEW_COLUMNS} / ${PREVIEW_ROWS}`, background: "var(--pl-bg-board)" }}
        />
        <div className="mt-2 text-sm font-bold text-white truncate">{skin.manifest.name}</div>
        <div className="text-[11px] text-white/45 truncate">
          {[skin.manifest.author, skin.builtin ? null : "imported"].filter(Boolean).join(" · ") || "\u00a0"}
        </div>
      </button>

      {!skin.builtin && !confirming && (
        <button
          type="button"
          onClick={onAskDelete}
          aria-label={`Delete ${skin.manifest.name}`}
          className="absolute top-1.5 right-1.5 p-1.5 rounded-md bg-black/60 text-white/70 hover:text-white cursor-pointer"
        >
          <Trash2 size={13} />
        </button>
      )}
      {confirming && (
        <div className="absolute inset-0 rounded-xl bg-black/85 flex flex-col items-center justify-center gap-2 p-2 text-center">
          <span className="text-xs font-bold text-white">Delete this skin?</span>
          <div className="flex gap-2">
            <button type="button" onClick={onDelete} className="px-2.5 py-1 rounded-md text-xs font-bold text-white cursor-pointer" style={{ background: "var(--pl-state-danger)" }}>Delete</button>
            <button type="button" onClick={onCancelDelete} className="px-2.5 py-1 rounded-md text-xs font-bold text-white/80 bg-white/10 cursor-pointer">Keep</button>
          </div>
        </div>
      )}
    </div>
  );
}
