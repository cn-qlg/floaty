# Floaty — Phase 4: Due Times + Urgency Pills Plan

**Goal:** 每条 todo 可设置截止时间（`@` 触发选择器），用彩色 pill 显示紧急度，每分钟自动刷新颜色。

**Architecture:** 全前端 + 少量 TipTap 扩展。不改数据库 schema：`due_at` 作为 markdown 内联 token（`@due:ISO8601`）存在 `items.content_md` 里，markdown 是权威来源。日后 Phase 5 做提醒时再同步 `items.due_at` 索引。

## Tasks

### Task 1: Urgency 计算 + tests

`src/theme/urgency.ts` + `src/theme/urgency.test.ts`

```ts
export type Tier = "overdue" | "urgent" | "today" | "this-week" | "later";

export function tierOf(dueAtIso: string, now: Date = new Date()): Tier {
  const due = new Date(dueAtIso);
  const diffMs = due.getTime() - now.getTime();
  const hour = 3600 * 1000;
  if (diffMs < 0) return "overdue";
  if (diffMs <= hour) return "urgent";
  const todayEnd = new Date(now);
  todayEnd.setHours(23, 59, 59, 999);
  if (due.getTime() <= todayEnd.getTime()) return "today";
  const weekEnd = todayEnd.getTime() + 6 * 24 * hour;
  if (due.getTime() <= weekEnd) return "this-week";
  return "later";
}

export function tierColor(tier: Tier): { bg: string; fg: string } {
  switch (tier) {
    case "overdue":   return { bg: "#c0392b", fg: "white" };
    case "urgent":    return { bg: "#e74c3c", fg: "white" };
    case "today":     return { bg: "#f39c12", fg: "white" };
    case "this-week": return { bg: "#f1c40f", fg: "#3a2e10" };
    case "later":     return { bg: "#95a5a6", fg: "white" };
  }
}

export function tierLabel(tier: Tier, dueAtIso: string, now: Date = new Date()): string {
  const due = new Date(dueAtIso);
  const diffMs = due.getTime() - now.getTime();
  const hour = 3600 * 1000;
  if (tier === "overdue") return `⚠ 逾期 ${formatDuration(-diffMs)}`;
  if (tier === "urgent")  return `⏰ ${formatDuration(diffMs)}`;
  if (tier === "today")   return `📅 今天 ${formatClock(due)}`;
  if (tier === "this-week") return `📅 ${formatWeekday(due)}`;
  return `📅 ${formatShortDate(due)}`;
}
```

Tests: overdue / urgent / today / week / later 各一个边界 case。

### Task 2: DueTime TipTap 节点 + pill 渲染

`src/editor/DueTime.ts`（TipTap inline atom node）

```ts
import { Node, mergeAttributes } from "@tiptap/core";

export const DueTime = Node.create({
  name: "dueTime",
  group: "inline",
  inline: true,
  atom: true,
  selectable: true,
  addAttributes() {
    return {
      datetime: { default: null },
    };
  },
  parseHTML() {
    return [{ tag: "span[data-due-time]" }];
  },
  renderHTML({ HTMLAttributes }) {
    return ["span", mergeAttributes({ "data-due-time": "true" }, HTMLAttributes), ""];
  },
  addNodeView() {
    return ({ node }) => {
      const dom = document.createElement("span");
      dom.setAttribute("data-due-time", "true");
      dom.setAttribute("data-datetime", node.attrs.datetime);
      dom.contentEditable = "false";
      // pill 样式 + 文字由 React 外层通过 MutationObserver 或 effect 刷新
      updatePillDom(dom, node.attrs.datetime);
      return { dom };
    };
  },
});

function updatePillDom(el: HTMLElement, iso: string) {
  // import tierOf/tierColor/tierLabel — 会在 commit 里做
}
```

### Task 3: Markdown 扩展 `@due:ISO` token

改 `src/editor/markdown.ts`：
- `docToMarkdown`：遇到 `dueTime` 节点 → 输出 ` @due:ISO`
- `markdownToDoc`：`parseInline` 识别 `@due:ISO` 模式 → 插入 dueTime 节点

+ 2 tests：round-trip todo with `@due`。

### Task 4: `@` 触发时间选择器 popover

新建 `src/editor/DueTimePicker.tsx`：
- 快捷选项：今天 18:00 / 今晚 22:00 / 明天 9:00 / 本周末 / 下周一 / 自定义
- 自定义用 `<input type="datetime-local">`
- 点一个选项后调用 editor API 插入 dueTime 节点在当前光标位置
- `Esc` 关闭

在 `Editor.tsx`：绑定 `@` keydown → 打开 popover，定位到 cursor

### Task 5: 每分钟刷新紧急度

在 Editor.tsx 里 `setInterval(..., 60000)`：
- 找到所有 `span[data-due-time]` dom
- 读 `data-datetime`, 重新算 tier → 更新 style + 文字

清理：unmount 时 clearInterval。

### Task 6: 冒烟 + 回归 + merge

全量测试绿 + 手动冒烟：
- [ ] 打 todo，输入 `@` → picker 弹出
- [ ] 选"今天 18:00" → 插入 pill，颜色 = today 橙色
- [ ] 时间到期（手动改系统时间或等） → pill 颜色变红
- [ ] 写 `- [ ] 测试 @due:2026-04-25T10:00:00Z` 直接保存 → 重开便签 pill 正确渲染

merge 到 main。
