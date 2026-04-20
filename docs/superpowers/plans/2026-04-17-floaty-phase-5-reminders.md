# Floaty — Phase 5: Reminders Implementation Plan

**Goal:** 带 `@due:ISO` 的 todo 到点触发 macOS 系统通知。通知含 `完成 / Snooze / 查看` 三个 action；snooze 延 10 分钟。

**Architecture:** 新建 `reminders` 表 + Rust Tokio 后台调度器。前端 `upsert_item` 时同步提取 markdown 中所有 `@due` token，通过 IPC `sync_reminders(sticky_id, list)` 让 Rust 端增删该便签的 reminders 行。Rust 调度器持有一个 `tokio::sync::Notify` 和 `BinaryHeap`，到期执行 `tauri-plugin-notification`。

## Tasks

### Task 1: migration 0002_reminders

```sql
CREATE TABLE reminders (
  id TEXT PRIMARY KEY,
  sticky_id TEXT NOT NULL REFERENCES stickies(id) ON DELETE CASCADE,
  item_id TEXT,
  item_index INTEGER NOT NULL,  -- todo 在 sticky 里第几条 (0-based)
  text_preview TEXT NOT NULL,   -- 通知展示用
  fire_at INTEGER NOT NULL,     -- unix ms
  kind TEXT NOT NULL,           -- 'at_due' | 'snooze'
  fired_at INTEGER,
  created_at INTEGER NOT NULL
);
CREATE INDEX idx_reminders_pending ON reminders(fire_at) WHERE fired_at IS NULL;
```

Phase 5 MVP 不做 lead-time，所以没 `lead_minutes` 字段；Phase 6+ 再加。

### Task 2: Rust reminders repo + tests

`src-tauri/src/db/reminders.rs`

API:
- `list_pending(db) -> Vec<Reminder>` (`fired_at IS NULL AND fire_at < now + 24h`)
- `insert(db, input: ReminderInput) -> Reminder`
- `delete_for_sticky(db, sticky_id)` (reconcile 清理)
- `mark_fired(db, id)`
- `snooze(db, id, minutes) -> Reminder`（新建一个 kind='snooze' 的行，基于当前 reminder）

测试：
- insert 后 list_pending 返回
- mark_fired 后 list_pending 不再返回
- snooze 生成新行 fire_at = now + minutes*60000

### Task 3: sync_reminders IPC + markdown due 提取

前端 `src/editor/markdown.ts` 加 helper：
```ts
export function extractDues(md: string): { index: number; iso: string; preview: string }[]
```
扫描每行 todo，对每个 `@due:ISO` 生成一条记录，preview 取 todo 文本前 50 字。

Rust 新 IPC：
```rust
#[tauri::command]
pub async fn sync_reminders(
  app: AppHandle, db: State<Db>,
  sticky_id: String,
  entries: Vec<ReminderInput>,
) -> AppResult<()> {
  // 1. delete_for_sticky 清掉旧 reminders（但保留 kind='snooze' 未触发的）
  // 2. 逐个 insert 新的 at_due reminders
  // 3. 通知调度器 wake up
}
```

前端 `useStickyData.save` debounce flush 后顺带调 sync_reminders。

### Task 4: Rust Tokio 调度器

`src-tauri/src/reminders/scheduler.rs`

结构：
```rust
pub struct Scheduler {
  wake: Arc<Notify>,
}
```

后台任务（setup 里 spawn）：
- 循环：
  - `list_pending(db).sort_by(fire_at)`
  - 取最近的一条
  - `tokio::select!` on: `sleep_until(fire_at)` or `wake.notified()`
  - 到期 → 取出 → `fire_notification(...)` → `mark_fired`
  - 没 pending → `wake.notified().await`

公开 `wake()` 给 IPC 调用（sync_reminders 写完后调）。

### Task 5: 系统通知 + tauri-plugin-notification

Cargo.toml 加 `tauri-plugin-notification = "2"`。
lib.rs `.plugin(tauri_plugin_notification::init())`.

```rust
use tauri_plugin_notification::NotificationExt;

fn fire_notification(app: &AppHandle, reminder: &Reminder) -> Result<()> {
  app.notification()
    .builder()
    .title("Floaty")
    .body(&reminder.text_preview)
    .show()?;
  Ok(())
}
```

macOS 需要权限：plugin 会首次请求。capabilities/default.json 加 `notification:default`。

**MVP 简化**：通知只弹出，不带按钮 action（Tauri 2 notification action buttons 平台差异大）。点击通知 → 带 app 到前台 + 聚焦对应便签。完成/snooze 暂时从便签 UI 里做。

### Task 6: 前端 UI — pill 右键菜单 + snooze 按钮

用户从便签里如何"完成/snooze"一条 reminder？

MVP 方案：
- pill 右键菜单：`标记完成` / `推迟 10 分钟` / `清除提醒`
- "标记完成" → 勾 checkbox（设 `- [x]`）；reminders 行 mark_fired
- "推迟 10 分钟" → snooze IPC
- "清除提醒" → 删 `@due` token

Phase 5 MVP 只做：pill 右键菜单 1 个选项"推迟 10 分钟"（其它保持 Phase 4 的行为即可）。

### Task 7: 冒烟 + merge

手动测：
- 设 `@due` 为当前时间 + 30 秒
- 等 30 秒 → macOS 通知弹出
- 右键 pill → 推迟 → 10 分钟后再弹
- 改 ISO 为过去时间 → 立刻弹（启动时的漏触发兜底）
