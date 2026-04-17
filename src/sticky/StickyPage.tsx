import { Editor } from "../editor/Editor";
import { useStickyData } from "./useStickyData";
import { ipc } from "../ipc/client";

interface StickyPageProps {
  stickyId: string;
}

export function StickyPage({ stickyId }: StickyPageProps) {
  const { sticky, setSticky, markdown, loaded, save } = useStickyData(stickyId);

  if (!loaded || !sticky) {
    return <div className="h-screen bg-yellow-100 p-3 text-xs opacity-60">Loading...</div>;
  }

  const pinned = sticky.pinned === 1;

  const onTogglePin = async () => {
    try {
      const next = await ipc.togglePin(stickyId);
      setSticky({ ...sticky, pinned: next ? 1 : 0 });
    } catch (err) {
      console.error("[floaty] togglePin failed:", err);
    }
  };

  return (
    <div
      className="h-screen flex flex-col backdrop-blur-md"
      style={{
        backgroundColor: hexWithAlpha(sticky.bg_color, sticky.opacity),
        color: "var(--sticky-fg)",
      }}
    >
      <div
        data-tauri-drag-region
        className="flex items-center justify-between px-3 py-1.5 text-xs border-b border-black/5 select-none cursor-grab active:cursor-grabbing"
      >
        <strong data-tauri-drag-region className="pointer-events-none opacity-70">
          📋 Floaty
        </strong>
        <div className="flex items-center gap-2">
          <button
            className={`text-[11px] px-1 rounded transition-opacity ${pinned ? "opacity-100" : "opacity-40 hover:opacity-70"}`}
            onClick={onTogglePin}
            title={pinned ? "已置顶（点击取消）" : "置顶"}
            style={{ filter: pinned ? "drop-shadow(0 0 2px rgba(239, 68, 68, 0.6))" : "none" }}
          >
            📌
          </button>
          <button
            className="text-[11px] px-1 rounded opacity-40 hover:opacity-70"
            onClick={() => ipc.hideSticky(stickyId)}
            title="关闭（不删除，可从菜单栏恢复）"
          >
            ✕
          </button>
        </div>
      </div>
      <div className="flex-1 overflow-auto p-3">
        <Editor initialMarkdown={markdown} onChange={save} />
      </div>
    </div>
  );
}

function hexWithAlpha(hex: string, alpha: number): string {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}
