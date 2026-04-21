// 跨平台辅助：macOS 用 ⌘⇧⌥⌃，Windows/Linux 用 Ctrl/Shift/Alt/Win

export const IS_MAC =
  typeof navigator !== "undefined" && /Mac|iPhone|iPad|iPod/.test(navigator.platform || navigator.userAgent);

/** 渲染快捷键符号，比如 kbd(['mod', 'shift', 'N']) → '⌘⇧N' (mac) 或 'Ctrl+Shift+N' (win) */
export function kbd(parts: Array<"mod" | "shift" | "alt" | "ctrl" | "backspace" | "enter" | "tab" | string>): string {
  const map: Record<string, { mac: string; other: string }> = {
    mod: { mac: "⌘", other: "Ctrl" },
    shift: { mac: "⇧", other: "Shift" },
    alt: { mac: "⌥", other: "Alt" },
    ctrl: { mac: "⌃", other: "Ctrl" },
    backspace: { mac: "⌫", other: "Backspace" },
    enter: { mac: "↵", other: "Enter" },
    tab: { mac: "⇥", other: "Tab" },
  };
  const tokens = parts.map((p) => {
    const m = map[p as keyof typeof map];
    return m ? (IS_MAC ? m.mac : m.other) : p;
  });
  return IS_MAC ? tokens.join("") : tokens.join("+");
}
