import { useState } from "react";

interface DueTimePickerProps {
  x: number; // viewport-relative
  y: number;
  onPick: (iso: string) => void;
  onCancel: () => void;
}

function toIso(d: Date): string {
  // Output as local ISO with timezone offset, e.g. 2026-04-20T22:00:00+08:00
  const pad = (n: number) => (n < 10 ? `0${n}` : `${n}`);
  const offMin = -d.getTimezoneOffset();
  const offSign = offMin >= 0 ? "+" : "-";
  const offH = pad(Math.floor(Math.abs(offMin) / 60));
  const offM = pad(Math.abs(offMin) % 60);
  return (
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}` +
    `T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}` +
    `${offSign}${offH}:${offM}`
  );
}

function makeQuickOptions(): { label: string; date: Date }[] {
  const now = new Date();
  const set = (base: Date, h: number, m = 0) => {
    const d = new Date(base);
    d.setHours(h, m, 0, 0);
    return d;
  };
  const today = now;
  const tmr = new Date(now);
  tmr.setDate(tmr.getDate() + 1);
  const daysUntilSat = (6 - now.getDay() + 7) % 7 || 7;
  const sat = new Date(now);
  sat.setDate(sat.getDate() + daysUntilSat);
  const nextMon = new Date(now);
  nextMon.setDate(nextMon.getDate() + ((1 - now.getDay() + 7) % 7 || 7));

  return [
    { label: "今天 18:00", date: set(today, 18) },
    { label: "今晚 22:00", date: set(today, 22) },
    { label: "明天 09:00", date: set(tmr, 9) },
    { label: "本周六 10:00", date: set(sat, 10) },
    { label: "下周一 09:00", date: set(nextMon, 9) },
  ];
}

export function DueTimePicker({ x, y, onPick, onCancel }: DueTimePickerProps) {
  const [custom, setCustom] = useState<string>(() => {
    const d = new Date();
    d.setMinutes(0, 0, 0);
    d.setHours(d.getHours() + 1);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}T${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  });
  const options = makeQuickOptions();

  return (
    <div
      className="fixed z-50 rounded-lg shadow-xl border border-black/10 overflow-hidden flex flex-col"
      style={{
        left: x,
        top: y,
        width: "200px",
        maxWidth: "calc(100vw - 16px)",
        maxHeight: "calc(100vh - 16px)",
        backgroundColor: "rgba(255,255,255,0.98)",
        color: "#333",
      }}
      onMouseDown={(e) => e.stopPropagation()}
      onClick={(e) => e.stopPropagation()}
    >
      <div className="flex items-center justify-between px-2 py-1.5 border-b border-black/5 text-[10px] uppercase tracking-wider opacity-60 flex-shrink-0">
        <span>选择截止时间</span>
        <button className="opacity-60 hover:opacity-100" onClick={onCancel} title="取消 (Esc)">
          ✕
        </button>
      </div>
      <div className="py-1 text-xs overflow-y-auto">
        {options.map((opt) => (
          <button
            key={opt.label}
            className="w-full text-left px-3 py-1.5 hover:bg-black/5 flex justify-between"
            onClick={() => onPick(toIso(opt.date))}
          >
            <span>{opt.label}</span>
            <span className="text-[10px] opacity-50">{formatPreview(opt.date)}</span>
          </button>
        ))}
      </div>
      <div className="px-3 py-2 border-t border-black/5">
        <div className="text-[10px] uppercase tracking-wider opacity-60 mb-1">自定义</div>
        <input
          type="datetime-local"
          value={custom}
          onChange={(e) => setCustom(e.target.value)}
          className="w-full text-xs border border-black/10 rounded px-1.5 py-1 bg-white"
        />
        <button
          className="mt-1.5 w-full text-xs px-2 py-1 rounded bg-black/80 text-white hover:bg-black"
          onClick={() => {
            const d = new Date(custom);
            if (!isNaN(d.getTime())) onPick(toIso(d));
          }}
        >
          确定
        </button>
      </div>
    </div>
  );
}

function formatPreview(d: Date): string {
  const pad = (n: number) => (n < 10 ? `0${n}` : `${n}`);
  return `${pad(d.getMonth() + 1)}/${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
}
