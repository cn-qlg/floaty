# Floaty — Design Spec

**Status:** Draft v1
**Date:** 2026-04-17
**Project name:** Floaty
**Repo dir:** `OpenSource/floaty/`

> 一款 macOS 桌面便签式 todo 工具：每个清单一个独立浮动窗口，支持 markdown、时间紧急度配色、提醒。技术栈为 Tauri 2 + React + TypeScript + SQLite。

---

## 1. 目标 (Goals)

构建一款**便签风格**的桌面 todo 应用，覆盖 7 项核心需求：

1. 跨平台架构（v1 只打包 macOS，技术栈本身跨平台）
2. 每个便签窗口可任意调整大小
3. 单便签可 pin（独立的 always-on-top）
4. 自定义背景颜色 + 透明度（按便签）
5. Markdown WYSIWYG 编辑（todo / 标题 / 粗体 / 链接）
6. 基于截止时间的紧急度可视化（彩色 pill）
7. 提醒：到点 + 提前 X 分钟 + snooze 10 分钟

## 2. 非目标 (Non-goals, v1)

明确排除在 v1 之外，避免范围蔓延：

- 自定义背景**图片** → v2
- Windows / Linux 安装包 → v2（代码层面跨平台）
- 云同步（iCloud / git / 自建后端）→ v2
- 单条 item 的字号/颜色独立设置（用便签级主题代替）
- 子任务 / 嵌套层级
- 协作 / 分享
- 富文本（HTML / 图片粘贴）
- AI 功能

## 3. 用户体验设计

### 3.1 窗口形态

- **多便签**：每个清单 = 一个独立浮动窗口
- 用户可以同时把多个便签摆在桌面不同位置
- 每个便签独立维护：位置、大小、pin 状态、背景色、透明度、字号

### 3.2 应用入口

- macOS **菜单栏图标**（无 dock 图标，应用常驻后台）
- 点击图标弹出下拉菜单：
  - 所有便签列表（标题 + 未完成项数 + pin 标记）
  - "＋ 新建便签"
  - "⚙️ 偏好设置"
  - "退出"
- 点击便签条目 → 把对应窗口提到前台（已关闭的便签会重新打开到上次位置）

### 3.3 单便签内部

每个便签窗口包含：

- **顶部 mini titlebar**（高 24px）：左边便签标题（可双击编辑），右边 `📌 pin` / `⚙️ 设置` / `✕ 关闭` 三个按钮
- **正文区**：TipTap 编辑器，WYSIWYG markdown
  - 输入 `- [ ]` 自动变 ☐ checkbox（点击切换 ☑/☐，完成项灰色 + 删除线）
  - `**粗体**`、`*斜体*`、`# 标题`、`[文字](url)` 实时渲染
  - 链接 `⌘+点击` 在浏览器打开
- **底部状态栏**（可折叠）：未完成数 / 总数 + 创建时间

**关闭按钮**只是隐藏窗口，便签数据保留在 SQLite 中。从菜单栏点回来即可恢复，包括 pin 状态、位置、大小、滚动位置。

### 3.4 时间紧急度

**输入**：在 todo 行输入 `@` 触发迷你时间选择器（轻量浮层，非系统日历）：

- 快速选项：今天 / 今晚 / 明天 / 明天上午 / 本周末 / 下周一
- "自定义..." → 完整日期 + 时间选择
- 选定后，行尾插入一个时间 token（数据层是 ISO8601 字符串，渲染层是彩色 pill）

**显示**：每条带时间的 todo，行尾渲染一个彩色 pill：

| 紧急度 | 触发条件 | 颜色 | 文案示例 |
|--------|----------|------|----------|
| 已逾期 | `due < now` 且未完成 | 深红 `#c0392b` | `⚠ 逾期 2小时` |
| 紧迫 | `due - now ≤ 1h` | 红 `#e74c3c` | `⏰ 30分钟` |
| 今天 | `due` 在今日且 > 1h | 橙 `#f39c12` | `📅 今天 18:00` |
| 本周 | `due` 在 7 天内 | 黄 `#f1c40f` | `📅 周五` |
| 更晚 | `due > now + 7d` | 灰 `#95a5a6` | `📅 4/30` |
| 已完成 | 已勾选 | （pill 隐藏） | — |

颜色判定每分钟刷新一次（前端 `setInterval`）。配色后续可在偏好设置里覆盖。

### 3.5 提醒

每条带 `due_at` 的 todo 默认生成 1 个 "到点提醒"。用户可在该 todo 的右键菜单 / @ 后浮层里**额外**添加：

- **提前 X 分钟**提醒（多个，比如提前 1 天 + 提前 30 分钟）
- 每条提醒都是 SQLite `reminders` 表的一行，由 Rust 端的调度器统一管理

**提醒触发**时弹出 macOS 系统通知，包含：

- 标题：便签名 + todo 文本前 50 字
- 操作按钮：`完成` / `Snooze 10分钟` / `查看`
- 点击 `完成` → 标记 todo 为已完成
- 点击 `Snooze` → 当前时间 + 10 分钟生成新 reminder 入队
- 点击 `查看` → 把对应便签窗口提到前台并 pin

应用关闭后提醒**不会触发**（v1 不做后台守护进程；菜单栏应用常驻即可）。

### 3.6 自定义外观（按便签）

每个便签的"⚙️ 设置"打开一个迷你浮层，包含：

- **背景色**：调色板（8 个预设）+ 自定义 HEX
- **透明度**：滑块 30%–100%（默认 85%）
- **字号**：3 档（小 12 / 中 14 / 大 16）
- **字体颜色**：自动（按背景明暗反推）/ 自定义 HEX
- **重置默认**

设置实时生效，存入 SQLite。

### 3.7 快捷键

**应用内**（便签或菜单栏聚焦时）：

| 快捷键 | 动作 |
|--------|------|
| `⌘N` | 新建便签 |
| `⌘W` | 关闭当前便签（隐藏，不删除） |
| `⌘⌫` | 删除当前便签（带确认弹窗） |
| `⌘,` | 打开当前便签的设置 |
| `⌘⇧P` | 切换 pin |
| `⌘D` | 标记当前焦点 todo 为完成 |
| `⌘E` | 进入/退出编辑模式 |
| `@` | 在 todo 行触发时间选择器 |

**全局热键**（系统级）：

| 快捷键 | 动作 |
|--------|------|
| `⌘⇧N` | 新建便签（任何场景） |

全局热键可在偏好设置里改键或禁用。

## 4. 系统架构

### 4.1 进程模型

**单 Tauri 进程，多窗口**：

- 主进程（Rust）持有：菜单栏 tray + reminder scheduler + SQLite 连接 + window manager
- 每个便签是一个 Tauri Webview window，加载同一个 React app（路由 `/sticky/:id`）
- 偏好设置是另一个 Webview window，路由 `/settings`

### 4.2 模块划分

**前端 (`src/`)**

- `src/sticky/` — 单便签 UI（titlebar、editor、settings 浮层）
- `src/menubar/` — 菜单栏下拉菜单（特殊 transparent + frameless 窗口）
- `src/settings/` — 全局偏好设置窗口
- `src/editor/` — TipTap 编辑器封装
  - 内置扩展：StarterKit, TaskList, TaskItem, Link
  - 自研扩展：`DueTime` node（@ 触发器 + pill 渲染）
- `src/state/` — Zustand store（每个便签 store 独立，订阅自己的 IPC events）
- `src/ipc/` — Tauri command 封装 + event listener
- `src/theme/` — 便签主题计算（背景明暗 → 文字色 / pill 对比度）

**后端 (`src-tauri/src/`)**

- `main.rs` — 应用入口、tray 初始化
- `commands/` — Tauri commands（前端可调用的 RPC）
- `db/` — SQLite 连接池 + 三张表的 repo
- `windows.rs` — Window manager：创建/恢复/聚焦/关闭便签窗口
- `reminders.rs` — Tokio 调度器：从 DB 拉所有未触发 reminder，排队 → 到点发系统通知
- `notifications.rs` — 系统通知 + 按钮回调（`tauri-plugin-notification`）
- `shortcuts.rs` — 全局热键注册（`tauri-plugin-global-shortcut`）
- `migrations/` — SQLite schema 演进

### 4.3 数据模型 (SQLite)

```sql
CREATE TABLE stickies (
  id TEXT PRIMARY KEY,           -- ULID
  title TEXT NOT NULL DEFAULT '',
  x INTEGER, y INTEGER,           -- 窗口位置
  w INTEGER NOT NULL DEFAULT 280,
  h INTEGER NOT NULL DEFAULT 360,
  pinned INTEGER NOT NULL DEFAULT 0,
  bg_color TEXT NOT NULL DEFAULT '#FFDC96',
  opacity REAL NOT NULL DEFAULT 0.85,  -- 0.3 - 1.0
  font_size INTEGER NOT NULL DEFAULT 14, -- 12 / 14 / 16
  font_color TEXT,                -- NULL = auto
  z_order INTEGER NOT NULL DEFAULT 0,
  hidden INTEGER NOT NULL DEFAULT 0,  -- 0 = 显示, 1 = 关闭隐藏
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE items (
  id TEXT PRIMARY KEY,
  sticky_id TEXT NOT NULL REFERENCES stickies(id) ON DELETE CASCADE,
  content_md TEXT NOT NULL,       -- markdown 源码（含 @due token）
  due_at INTEGER,                 -- unix ms, NULL = 无截止
  completed_at INTEGER,           -- NULL = 未完成
  sort_order INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX idx_items_due ON items(due_at) WHERE completed_at IS NULL;

CREATE TABLE reminders (
  id TEXT PRIMARY KEY,
  item_id TEXT NOT NULL REFERENCES items(id) ON DELETE CASCADE,
  fire_at INTEGER NOT NULL,       -- unix ms
  kind TEXT NOT NULL,              -- 'at_due' | 'lead' | 'snooze'
  lead_minutes INTEGER,            -- 仅 kind='lead' 有值
  fired_at INTEGER,                -- NULL = 未触发
  dismissed_at INTEGER,
  created_at INTEGER NOT NULL
);

CREATE INDEX idx_reminders_pending ON reminders(fire_at) WHERE fired_at IS NULL;

CREATE TABLE settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL              -- JSON
);
```

**便签内容存储策略**：每条 item 是一行 markdown 文本（包含 `- [ ]` 前缀和 `@due:ISO` token）。前端编辑器在 `parse → DOM` 时把 `@due` 渲染为 pill。保存时序列化回 markdown。这样：

- 数据是纯文本，未来导出 / git 同步零成本
- `due_at` 字段是冗余索引（用于 SQL 查询），权威值仍是 markdown 中的 token
- 编辑器对每条 item 单独保存（debounce 300ms）

### 4.4 IPC Commands（Rust ↔ JS）

```rust
// 便签 CRUD
create_sticky() -> Sticky
get_sticky(id) -> Sticky
list_stickies(include_hidden: bool) -> Vec<StickySummary>
update_sticky(id, patch: StickyPatch)
delete_sticky(id)
hide_sticky(id)        // 关闭按钮
show_sticky(id)        // 从菜单栏点回来

// item CRUD
list_items(sticky_id) -> Vec<Item>
upsert_item(item: Item)
delete_item(id)
toggle_item(id) -> Item

// reminders
add_reminder(item_id, kind, lead_minutes?)
snooze_reminder(reminder_id, minutes)
dismiss_reminder(reminder_id)

// 窗口操作
focus_sticky_window(id)
toggle_pin(id) -> bool
update_window_geometry(id, x, y, w, h)

// 设置
get_settings() -> Settings
update_settings(patch)
```

**事件**（Rust → JS broadcast）：

- `sticky-updated`（位置/大小变化时窗口自己 emit，给菜单栏更新）
- `reminder-fired`（用于打开窗口时高亮对应 item）
- `settings-changed`

### 4.5 Reminder 调度器

**冷启动**：应用启动时，从 SQLite 拉所有 `fired_at IS NULL AND fire_at > now - 1h` 的 reminders，加入 BinaryHeap（按 fire_at 排序）。

**运行时**：`tokio::time::sleep_until(top.fire_at)` → 触发 → 弹通知 → 标记 `fired_at`。同时监听 IPC `add_reminder` / `snooze_reminder` 把新条目插入堆。

**漏触发兜底**：启动时若发现 `fire_at < now` 的未触发 reminder，立即触发一次（除非 `now - fire_at > 1h`，那种就忽略）。

### 4.6 关键流程

#### A. 新建便签（菜单栏 → ＋）

1. JS 调 `create_sticky()`
2. Rust 写 SQLite，返回 sticky 记录
3. Rust 调 `WindowManager::open(sticky)` 创建 Tauri webview window，加载 `/sticky/:id`
4. 菜单栏 store 收到 `sticky-updated` 事件，刷新列表

#### B. 输入 `@` 设置截止时间

1. TipTap `@` keymap 触发，打开浮层
2. 用户选择时间 → 编辑器在当前 todo 行末插入 `@due:2026-04-18T22:00:00Z` token
3. Editor `onUpdate` 提取 token，debounce 300ms 后调 `upsert_item({content_md, due_at})`
4. 同时调 `add_reminder(item_id, 'at_due')`（如果 due_at 变化或新增）
5. 前端立即按新 due_at 重算 pill 颜色

#### C. 提醒触发

1. Rust 调度器到点 → 调 `tauri-plugin-notification` 弹系统通知
2. 通知按钮回调返回 action：`complete` / `snooze` / `view`
3. `complete`: 直接调 `toggle_item`
4. `snooze`: 调 `snooze_reminder(id, 10)` 生成新 reminder
5. `view`: 调 `focus_sticky_window(sticky_id)`，前端导航到对应 item

#### D. 关闭便签 vs 删除

- `✕` 或 `⌘W` → `hide_sticky(id)`：窗口销毁，DB `hidden=1`，菜单栏列表加灰色标记，可恢复
- `⌘⌫` 或菜单"删除" → `delete_sticky(id)`：弹 confirm，确认后级联删除 items + reminders + 销毁窗口

## 5. 技术栈

| 层 | 选型 | 备注 |
|----|------|------|
| 桌面框架 | Tauri 2 | 包小（~10MB），透明窗口/always-on-top 原生支持 |
| 前端 | React 18 + TypeScript + Vite | |
| 编辑器 | TipTap 2 | + StarterKit, TaskList, TaskItem, Link, 自研 DueTime 扩展 |
| 状态 | Zustand | 每个便签一个 store 实例 |
| 样式 | Tailwind CSS + CSS variables | CSS vars 支持便签实时换主题 |
| 数据 | SQLite via `sqlx` | 编译时校验 query |
| 通知 | `tauri-plugin-notification` | macOS UNUserNotification |
| 全局热键 | `tauri-plugin-global-shortcut` | |
| ID | ULID (前端 `ulid` / Rust `ulid` crate) | 时间有序 + 短 |
| 打包 | `tauri build` → `.dmg` | 需 Apple Developer 签名（v1 可先 ad-hoc，开发用） |

**Rust 代码量预估**：约 800–1200 行（窗口管理 ~250、commands ~300、db ~200、reminders ~200、shortcuts ~100）。

## 6. 风险与对策

| 风险 | 影响 | 对策 |
|------|------|------|
| Tauri 多窗口 + 透明在 macOS 有已知 quirks（标题栏 z-order） | 视觉 bug | 用 frameless + 自绘 titlebar，避开 native decorations 问题 |
| 系统通知点击 action 在 macOS 后台时的回调时延 | 用户体验 | 通知按钮回调写入 IPC channel，UI 唤起后立即重放 |
| SQLite 在多 webview 进程下的写入冲突 | 数据损坏 | 所有写入都走 Rust 端单一连接池，前端只通过 IPC 写 |
| TipTap 自研 DueTime 扩展 + serialization round-trip | markdown 导出失真 | 在 schema 阶段把 token 设计成纯文本 `@due:ISO`，parser/serializer 一对一 |
| macOS 14+ 通知权限需用户授权 | 提醒静默失败 | 首次启动引导授权，权限被拒时偏好设置里有红色提示 |
| `font_color = auto` 的对比度算法 | 读不清 | 用 WCAG luminance + 阈值 0.5，简单可靠；提供手动覆盖 |

## 7. 实施阶段（粗略）

为后续 implementation plan 提供分阶段路线，**实际任务拆分由 writing-plans 阶段细化**：

- **Phase 0 — 工程脚手架**：Tauri 2 init、React/Vite/Tailwind、SQLite 连接、单元测试框架
- **Phase 1 — 单便签最小可用**：能建一个便签、写 markdown、勾选 todo、保存到 DB、重启恢复
- **Phase 2 — 多便签 + 菜单栏**：tray、新建/列表/恢复、窗口位置持久化、pin
- **Phase 3 — 视觉自定义**：背景色、透明度、字号、字色 auto
- **Phase 4 — 时间 & 紧急度**：DueTime 扩展、@ 选择器、pill 渲染、颜色调度
- **Phase 5 — 提醒系统**：Tokio 调度器、系统通知、snooze、复盘漏触发
- **Phase 6 — 快捷键 & 偏好设置**：所有应用内快捷键、`⌘⇧N` 全局、settings 窗口
- **Phase 7 — 打包 & 体验打磨**：dmg、首次启动引导、通知权限、图标

## 8. 测试策略

- **Rust 后端**：每个 repo / scheduler 用 `#[tokio::test]` 跑独立 SQLite（in-memory）
- **前端组件**：Vitest + Testing Library，重点测 DueTime 扩展 round-trip + pill 颜色逻辑
- **集成测试**：Tauri 提供 webdriver，至少跑通"新建 → 写 todo → 设时间 → 等触发 → 通知" 一条 happy path
- **手测**：所有 UI 调整 + macOS 通知权限 + 多便签 z-order 必须人工验证

## 9. 项目目录结构（建议）

```
floaty/                             # 仓库根
├── src/                            # 前端 (React)
│   ├── sticky/                     # 单便签 UI
│   ├── menubar/                    # 菜单栏下拉
│   ├── settings/                   # 偏好设置窗口
│   ├── editor/                     # TipTap 封装 + DueTime 扩展
│   ├── state/                      # Zustand stores
│   ├── ipc/                        # Tauri commands 封装
│   ├── theme/                      # 主题计算
│   └── main.tsx                    # 路由入口
├── src-tauri/                      # Rust 后端
│   ├── src/
│   │   ├── main.rs
│   │   ├── commands/
│   │   ├── db/
│   │   ├── windows.rs
│   │   ├── reminders.rs
│   │   ├── notifications.rs
│   │   ├── shortcuts.rs
│   │   └── migrations/
│   ├── Cargo.toml
│   └── tauri.conf.json
├── docs/superpowers/specs/         # 本文件位置
├── package.json
├── vite.config.ts
└── README.md
```
