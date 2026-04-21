# Floaty — Phase 6: Smart Time Parsing + Ghost Preview

**Goal:** 边打字边识别时间表达式（中英混合），在行尾显示**灰色 ghost pill 预览**；用户按 **Tab** 确认（替换成真 pill），继续打字或按 Esc 则取消。覆盖 10+ 高频模式，保留 `@` picker 作兜底。

**决策：** 小语法 + 视觉确认。不做全量 NLP；不静默替换。

## 支持的模式（v1）

| 类型 | 模式 | 示例 | 结果 |
|------|------|------|------|
| 相对（分钟） | `(\d+)(分钟|分|m)后` | "30分钟后" / "30m" | now + N min |
| 相对（小时） | `(\d+)(小时|时|h)后` | "1小时后" / "2h" | now + N hr |
| 相对（天） | `(\d+)(天|d)后` | "3天后" | now + N days |
| 今天 | `今天` / `今晚` | "今晚" | 今天 22:00 |
| 明天 | `明天(\d+点)?` / `tomorrow (\d+(am|pm)?)` | "明天9点" | +1 天，指定小时 |
| 后天/大后天 | `后天` / `大后天` | "后天下午" | +2/+3 天 |
| 星期 | `下?周([一二三四五六日天])` | "下周三" | 下次出现的那天 10:00 |
| 具体日期 | `(\d+)月(\d+)日?` | "4月25日" | 今年（过了则明年） |
| ISO | `(\d{4})-(\d{2})-(\d{2})` | "2026-04-25" | 当天 10:00 |
| 时分 | `(\d{1,2}):(\d{2})` | "18:30" | 今天（过了则明天） |

## Tasks

### Task 1: `timeHints.ts` 解析器 + tests

`src/editor/timeHints.ts`：

```ts
export interface TimeHint { matchText: string; date: Date; }
export function parseTimeHint(text: string, now?: Date): TimeHint | null;
```

扫描 text 尾部，按优先级匹配（相对 > 具体日期 > 时分）。返回最后一个匹配（尾部锚定）。

测试 ~12 个：每个模式一个 happy path + 几个边界（比如 18:00 已过用明天、"今天"不带时间默认当天 18:00）。

Commit: `feat(editor): timeHints parser + tests`

### Task 2: Editor ghost preview

Editor.tsx 里：

```ts
const [ghost, setGhost] = useState<{ from: number; to: number; hint: TimeHint } | null>(null);
```

- `editor.on('selectionUpdate')` + `on('update')`：提取 cursor 前的当前块文本，调 `parseTimeHint`；如果 hint 在"文本末尾锚定"则 setGhost，否则清 null
- 渲染 ghost pill：`position: absolute`，定位在 cursor 之后几 px，灰色 + 淡色，文字 "Tab 接受 → 📅 4/25 10:00"
- keydown:
  - `Tab`：阻止默认，`deleteRange(ghost.from, ghost.to)` + `insertContent dueTime` + 清 ghost
  - 其它输入：让 TipTap 正常处理；下次 update 重算 ghost

Commit: `feat(editor): ghost time preview + Tab to accept`

### Task 3: CSS + 视觉打磨

ghost pill 用灰底 (#e5e7eb)、深灰字、虚线边框，带 "Tab" 小键盘图标。不阻塞鼠标。

Commit: `style(editor): ghost pill styling`

### Task 4: 冒烟 + merge

手测：
- [ ] 打 "30分钟后" → 行尾灰 pill 预览 + Tab 提示
- [ ] Tab → 替换为彩色 pill (now+30min)
- [ ] 打 "明天9点" → ghost "明天 09:00"
- [ ] 打 "下周二" → ghost "周二 10:00"
- [ ] 打 "不相关的文字" → 无 ghost
- [ ] 打 "30分钟后 然后打更多字" → ghost 消失
- [ ] Esc → ghost 消失

merge 到 main + 推 github。
