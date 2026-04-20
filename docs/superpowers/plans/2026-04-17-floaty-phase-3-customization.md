# Floaty — Phase 3: Visual Customization Implementation Plan

> REQUIRED SUB-SKILL: superpowers:subagent-driven-development or superpowers:executing-plans.

**Goal:** 每便签可独立调背景色（8 预设 + HEX）、透明度滑块、字号三档、字体颜色（auto 按背景明暗反推 / HEX 自定义）。所有改动实时生效 + 通过 `update_sticky` IPC 持久化。UI 为便签内嵌的 popover，点 ⚙️ 按钮弹出。

**Architecture:** 主要是前端工作。后端 `update_sticky` IPC + `StickyPatch` 都已在 Phase 2 就绪。新增：
- 前端 SettingsPopover 组件
- 前端 theme helper（WCAG luminance → 合适的 fg 颜色）
- StickyPage 渲染 `font_size` + `font_color`（已读 `bg_color` / `opacity`）

**Tech Stack:** 既有 React + Tailwind

## Tasks

### Task 1: WCAG 对比度 helper + 3 个单元测试

Files: `src/theme/contrast.ts`, `src/theme/contrast.test.ts`

先写测试：
- `luminance("#FFFFFF")` ≈ 1.0
- `luminance("#000000")` ≈ 0.0
- `autoFg("#FFDC96")` === `"#3a2e10"`（暗文字）
- `autoFg("#1a1d28")` === `"#f0f0f0"`（亮文字）

实现：
```ts
export function luminance(hex: string): number {
  const rgb = parseHex(hex).map((v) => {
    const s = v / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2];
}

export function autoFg(bgHex: string): string {
  return luminance(bgHex) > 0.5 ? "#3a2e10" : "#f0f0f0";
}

function parseHex(hex: string): [number, number, number] {
  const h = hex.replace("#", "");
  return [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16),
  ];
}
```

跑 `npm test` → 测试 +3 passed。commit: `feat(theme): luminance + auto fg helper + tests`

### Task 2: SettingsPopover 组件

Files: `src/sticky/SettingsPopover.tsx`

UI 结构：
- **背景色**：8 个预设小方块（Tailwind 颜色 + 自研）+ `<input type="color">` HEX
- **透明度**：滑块 30–100，实时显示百分比
- **字号**：三个按钮（小/中/大 对应 12/14/16）
- **字体颜色**：`auto` checkbox + 一个 HEX 输入
- **重置默认**：按钮，恢复到 Phase 1 默认值

Props:
```ts
interface SettingsPopoverProps {
  sticky: Sticky;
  onPatch: (patch: StickyPatch) => void;
  onClose: () => void;
}
```

8 色预设：`#FFDC96` (default 黄) / `#B4E6C8` (薄荷) / `#C8C8FF` (薰衣) / `#FFB4B4` (粉红) / `#FFE6B4` (杏) / `#B4D8F0` (天蓝) / `#E6B4FF` (紫) / `#D0D0D0` (灰)

实时应用：每个 onChange 立即 `onPatch({ bg_color })` 等。

commit: `feat(sticky): SettingsPopover with bg/opacity/font-size/font-color controls`

### Task 3: 集成 popover 到 StickyPage

Files: `src/sticky/StickyPage.tsx`

- ⚙️ 按钮（顶部右侧已有）加 onClick 切换 `popoverOpen` state
- popover 绝对定位在 titlebar 下方
- 支持点击便签内任意处关闭 popover（或 ⚙️ 再点一次）
- `onPatch` 调用 `ipc.updateSticky(stickyId, patch)` + `setSticky(newSticky)`
- 应用 `font_size` 到 editor 容器 + 应用 `font_color`（fg）到整张便签

font color 逻辑：
```ts
const fg = sticky.font_color ?? autoFg(sticky.bg_color);
```

commit: `feat(sticky): wire SettingsPopover into StickyPage with live apply`

### Task 4: 冒烟 + 回归 + merge

- `npm test` 6 → 9 passed（新 3 个 contrast 测试）
- 后端 10 passed 不变
- tsc 0 errors
- 手动冒烟：
  - 点 ⚙️ 弹出 popover
  - 换背景色 → 整张便签底色变化，字色 auto 时合适
  - 拖透明度滑块 → 便签透明度实时变
  - 切字号 → editor 字号变
  - 切字体颜色（auto ↔ HEX）
  - 点"重置" → 回到 `#FFDC96` 黄色 + 0.85 opacity + 字号 14
  - 关闭 app 重启 → 所有设置保留

merge: `git checkout main && git merge --no-ff phase-3-customization`

## Self-Review

- Spec 3.6 "自定义外观（按便签）"全部覆盖
- 无 placeholder，每步有代码
- 类型一致：`StickyPatch`、`font_size`、`font_color`、`bg_color`、`opacity` 在 Rust/TS 字段名 snake_case 一致
