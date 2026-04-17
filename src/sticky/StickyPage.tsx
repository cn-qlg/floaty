import { Editor } from "../editor/Editor";
import { useStickyData } from "./useStickyData";

export function StickyPage() {
  const { sticky, markdown, loaded, save } = useStickyData();

  if (!loaded || !sticky) {
    return <div className="h-screen bg-yellow-100 p-3 text-xs opacity-60">Loading...</div>;
  }

  const bgColor = sticky.bg_color;
  const opacity = sticky.opacity;

  return (
    <div
      className="h-screen flex flex-col backdrop-blur-md"
      style={{
        backgroundColor: hexWithAlpha(bgColor, opacity),
        color: "var(--sticky-fg)",
      }}
    >
      <div
        data-tauri-drag-region
        className="flex items-center justify-between px-3 py-1.5 text-xs opacity-70 border-b border-black/5 select-none cursor-default"
      >
        <strong>📋 Floaty</strong>
        <span className="text-[10px]">⚙️</span>
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
