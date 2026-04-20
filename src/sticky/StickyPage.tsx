import { useState } from "react";
import { Editor } from "../editor/Editor";
import { useStickyData } from "./useStickyData";
import { SettingsPopover } from "./SettingsPopover";
import { ipc } from "../ipc/client";
import { autoFg } from "../theme/contrast";
import type { StickyPatch } from "../ipc/types";

interface StickyPageProps {
  stickyId: string;
}

export function StickyPage({ stickyId }: StickyPageProps) {
  const { sticky, setSticky, markdown, loaded, save } = useStickyData(stickyId);
  const [settingsOpen, setSettingsOpen] = useState(false);

  if (!loaded || !sticky) {
    return <div className="h-screen bg-yellow-100 p-3 text-xs opacity-60">Loading...</div>;
  }

  const pinned = sticky.pinned === 1;
  const fg = sticky.font_color ?? autoFg(sticky.bg_color);

  const onTogglePin = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    try {
      await ipc.togglePin(stickyId);
      const fresh = await ipc.getSticky(stickyId);
      setSticky(fresh);
    } catch (err) {
      console.error("[floaty] togglePin failed:", err);
    }
  };

  const onClose = async (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    try {
      await ipc.hideSticky(stickyId);
    } catch (err) {
      console.error("[floaty] hideSticky failed:", err);
    }
  };

  const toggleSettings = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setSettingsOpen((v) => !v);
  };

  const onPatch = async (patch: StickyPatch) => {
    try {
      const fresh = await ipc.updateSticky(stickyId, patch);
      setSticky(fresh);
    } catch (err) {
      console.error("[floaty] updateSticky failed:", err);
    }
  };

  return (
    <div
      className="h-screen flex flex-col backdrop-blur-md relative"
      style={{
        backgroundColor: hexWithAlpha(sticky.bg_color, sticky.opacity),
        color: fg,
        fontSize: `${sticky.font_size}px`,
      }}
      onClick={() => settingsOpen && setSettingsOpen(false)}
    >
      <div
        data-tauri-drag-region
        className="flex items-center justify-between px-3 py-1.5 text-xs border-b border-black/5 select-none cursor-grab active:cursor-grabbing"
      >
        <strong data-tauri-drag-region className="pointer-events-none opacity-70 flex items-center gap-1.5">
          <span>📋 Floaty</span>
          {pinned && (
            <span className="text-[9px] font-semibold uppercase tracking-wider px-1.5 py-[1px] rounded bg-red-500 text-white">
              已置顶
            </span>
          )}
        </strong>
        <div
          className="flex items-center gap-1"
          style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}
          onMouseDown={(e) => e.stopPropagation()}
        >
          <button
            type="button"
            className={
              pinned
                ? "text-[12px] w-6 h-5 rounded bg-red-500 text-white shadow-sm"
                : "text-[12px] w-6 h-5 rounded opacity-40 hover:opacity-80 hover:bg-black/5"
            }
            onClick={onTogglePin}
            title={pinned ? "已置顶（点击取消）" : "置顶"}
            style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}
          >
            📌
          </button>
          <button
            type="button"
            className={
              settingsOpen
                ? "text-[11px] w-6 h-5 rounded bg-black/10"
                : "text-[11px] w-6 h-5 rounded opacity-40 hover:opacity-80 hover:bg-black/5"
            }
            onClick={toggleSettings}
            title="外观设置"
            style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}
          >
            ⚙
          </button>
          <button
            type="button"
            className="text-[11px] w-6 h-5 rounded opacity-40 hover:opacity-80 hover:bg-black/5"
            onClick={onClose}
            title="关闭（不删除，可从菜单栏恢复）"
            style={{ WebkitAppRegion: "no-drag" } as React.CSSProperties}
          >
            ✕
          </button>
        </div>
      </div>
      <div className="flex-1 overflow-auto p-3">
        <Editor initialMarkdown={markdown} onChange={save} />
      </div>
      {settingsOpen && (
        <SettingsPopover
          sticky={sticky}
          onPatch={onPatch}
          onClose={() => setSettingsOpen(false)}
        />
      )}
    </div>
  );
}

function hexWithAlpha(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
