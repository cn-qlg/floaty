import { useState } from "react";
import type { Sticky, StickyPatch } from "../ipc/types";
import { autoFg } from "../theme/contrast";

interface SettingsPopoverProps {
  sticky: Sticky;
  onPatch: (patch: StickyPatch) => void;
  onClose: () => void;
  onDelete: () => void;
}

const PRESET_COLORS = [
  { name: "黄", value: "#FFDC96" },
  { name: "薄荷", value: "#B4E6C8" },
  { name: "薰衣", value: "#C8C8FF" },
  { name: "粉红", value: "#FFB4B4" },
  { name: "杏", value: "#FFE6B4" },
  { name: "天蓝", value: "#B4D8F0" },
  { name: "紫", value: "#E6B4FF" },
  { name: "灰", value: "#D0D0D0" },
];

export function SettingsPopover({ sticky, onPatch, onClose, onDelete }: SettingsPopoverProps) {
  // "auto" = 字体颜色是不是等于 autoFg(bg)；此状态是 UI 级（不入 DB）
  const [fontColorAuto, setFontColorAuto] = useState(
    sticky.font_color == null ||
      sticky.font_color.toLowerCase() === autoFg(sticky.bg_color).toLowerCase(),
  );

  const applyBg = (bg: string) => {
    const patch: StickyPatch = { bg_color: bg };
    if (fontColorAuto) patch.font_color = autoFg(bg);
    onPatch(patch);
  };

  const toggleAuto = (auto: boolean) => {
    setFontColorAuto(auto);
    if (auto) {
      onPatch({ font_color: autoFg(sticky.bg_color) });
    }
    // auto=false：保留当前颜色，用户可通过 HEX 自己改
  };

  const reset = () => {
    setFontColorAuto(true);
    onPatch({
      bg_color: "#FFDC96",
      opacity: 0.85,
      font_size: 14,
      font_color: "#3a2e10", // autoFg("#FFDC96") = "#3a2e10"
    });
  };

  return (
    <div
      className="absolute top-[34px] left-2 right-2 z-10 rounded-lg shadow-xl border border-black/10 overflow-hidden flex flex-col"
      style={{
        backgroundColor: "rgba(255,255,255,0.96)",
        color: "#333",
        maxHeight: "calc(100vh - 44px)",
        maxWidth: "280px",
        marginLeft: "auto",
      }}
      onClick={(e) => e.stopPropagation()}
      onMouseDown={(e) => e.stopPropagation()}
    >
      <div className="flex items-center justify-between px-3 py-2 border-b border-black/5 flex-shrink-0">
        <strong className="text-xs">外观设置</strong>
        <button className="text-xs opacity-60 hover:opacity-100" onClick={onClose}>
          ✕
        </button>
      </div>

      <div className="p-3 space-y-3 text-xs overflow-y-auto">
        {/* 背景色 */}
        <div>
          <div className="text-[10px] uppercase tracking-wider opacity-60 mb-1.5">背景色</div>
          <div className="grid grid-cols-8 gap-1">
            {PRESET_COLORS.map((c) => (
              <button
                key={c.value}
                className={`h-6 rounded border-2 ${
                  sticky.bg_color.toLowerCase() === c.value.toLowerCase()
                    ? "border-black/40"
                    : "border-transparent"
                }`}
                style={{ backgroundColor: c.value }}
                onClick={() => applyBg(c.value)}
                title={c.name}
              />
            ))}
          </div>
          <div className="mt-2 flex items-center gap-2">
            <input
              type="color"
              value={sticky.bg_color}
              onChange={(e) => applyBg(e.target.value.toUpperCase())}
              className="h-6 w-10 rounded cursor-pointer"
            />
            <span className="font-mono text-[10px] opacity-70">{sticky.bg_color}</span>
          </div>
        </div>

        {/* 透明度 */}
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[10px] uppercase tracking-wider opacity-60">透明度</span>
            <span className="font-mono text-[10px] opacity-70">
              {Math.round(sticky.opacity * 100)}%
            </span>
          </div>
          <input
            type="range"
            min={30}
            max={100}
            step={5}
            value={Math.round(sticky.opacity * 100)}
            onChange={(e) => onPatch({ opacity: Number(e.target.value) / 100 })}
            className="w-full"
          />
        </div>

        {/* 字号 */}
        <div>
          <div className="text-[10px] uppercase tracking-wider opacity-60 mb-1.5">字号</div>
          <div className="flex gap-1">
            {[
              { label: "小", val: 12 },
              { label: "中", val: 14 },
              { label: "大", val: 16 },
            ].map((o) => (
              <button
                key={o.val}
                className={`flex-1 h-7 rounded border ${
                  sticky.font_size === o.val
                    ? "border-black/40 bg-black/5"
                    : "border-black/10 hover:bg-black/5"
                }`}
                onClick={() => onPatch({ font_size: o.val })}
              >
                <span style={{ fontSize: `${o.val}px` }}>{o.label}</span>
              </button>
            ))}
          </div>
        </div>

        {/* 字体颜色 */}
        <div>
          <div className="text-[10px] uppercase tracking-wider opacity-60 mb-1.5">字体颜色</div>
          <div className="flex gap-1 mb-2">
            <button
              className={`flex-1 h-6 rounded border text-[11px] ${
                fontColorAuto
                  ? "border-black/40 bg-black/5 font-medium"
                  : "border-black/10 hover:bg-black/5"
              }`}
              onClick={() => toggleAuto(true)}
            >
              自动
            </button>
            <button
              className={`flex-1 h-6 rounded border text-[11px] ${
                !fontColorAuto
                  ? "border-black/40 bg-black/5 font-medium"
                  : "border-black/10 hover:bg-black/5"
              }`}
              onClick={() => toggleAuto(false)}
            >
              自定义
            </button>
          </div>
          <div className="flex items-center gap-2">
            <input
              type="color"
              value={sticky.font_color ?? autoFg(sticky.bg_color)}
              disabled={fontColorAuto}
              onChange={(e) => onPatch({ font_color: e.target.value.toUpperCase() })}
              className="h-6 w-10 rounded cursor-pointer disabled:cursor-not-allowed disabled:opacity-50"
            />
            <span className="font-mono text-[10px] opacity-70">
              {(sticky.font_color ?? autoFg(sticky.bg_color)).toUpperCase()}
              {fontColorAuto && <span className="ml-1 opacity-60">（自动）</span>}
            </span>
          </div>
        </div>

        {/* 重置 + 删除 */}
        <div className="pt-2 border-t border-black/5 space-y-1.5">
          <button
            className="w-full h-7 rounded border border-black/10 hover:bg-black/5 text-xs"
            onClick={reset}
          >
            重置默认
          </button>
          <button
            className="w-full h-7 rounded border border-red-300 text-red-600 hover:bg-red-50 text-xs"
            onClick={onDelete}
          >
            删除便签...
          </button>
        </div>
      </div>
    </div>
  );
}
