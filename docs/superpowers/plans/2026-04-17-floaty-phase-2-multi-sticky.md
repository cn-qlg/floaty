# Floaty — Phase 2: Multi-Sticky + Menu Bar Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 从单便签进化到多便签：任何时候可同时开多个独立便签窗口，macOS 菜单栏图标作为总入口（新建、切换、显示已关闭的便签）。每个便签独立 pin（always-on-top）。窗口位置/大小实时持久化。

**Architecture:** Rust 端引入 `WindowManager`（所有便签窗口的生命周期统一管理）+ `Tray`（菜单栏）。前端通过 Tauri window label（`sticky-<id>`）识别自己属于哪张便签。窗口关闭只是隐藏（DB `hidden=1`），从菜单栏可恢复。Tauri 2 `WebviewWindowBuilder` 动态创建窗口。

**Tech Stack:** Tauri 2 tray API · Tauri 2 `WebviewWindowBuilder` · 既有 React + TipTap + SQLite 栈

---

## 前置状态

- Branch: `main` (Phase 1 已合并，HEAD: `d8314b4`)
- 所有命令默认从 `/Users/liuguoqing/Codes/OpenSource/floaty/` 执行
- Git author `cn_qlg <cn_qlg@163.com>` 已配置
- 执行前：`git checkout -b phase-2-multi-sticky`

## File Structure (Phase 2 完成后新增/修改)

```
floaty/
├── src-tauri/
│   ├── Cargo.toml                          # 可能需加 tauri 的 tray-icon feature
│   ├── tauri.conf.json                     # mainWindow 改为不自动创建
│   ├── capabilities/default.json           # 加 window 创建/事件相关 permissions
│   └── src/
│       ├── lib.rs                          # setup 里装 tray、打开初始便签
│       ├── windows.rs                      # (新) WindowManager：open/close/focus/geometry
│       ├── tray.rs                         # (新) Tray 菜单 + 动态刷新 + click handlers
│       └── commands/
│           ├── stickies.rs                 # 扩充：create / hide / show / delete / update
│           └── windows.rs                  # (新) focus / toggle_pin / update_geometry
├── src/
│   ├── App.tsx                             # 路由：按 window label 选渲染
│   ├── main.tsx                            # 不变
│   ├── sticky/
│   │   ├── StickyPage.tsx                  # 加 close/pin 按钮，接 sticky_id
│   │   └── useStickyData.ts                # 改成按 sticky_id 加载
│   └── ipc/
│       ├── client.ts                       # 新增方法
│       └── types.ts                        # 新类型（StickyPatch）
```

---

## Part A: Rust 后端 — 多便签窗口管理

### Task 1: DB 增补 —— get_sticky / list_all / create / update / hide / show / delete

**Files:**
- Modify: `src-tauri/src/db/stickies.rs`

- [ ] **Step 1: 扩充 `stickies.rs` 的仓库函数**

在现有 `create_default` / `get` / `list_visible` 的基础上追加：

```rust
#[derive(Debug, Clone, Deserialize, Default)]
pub struct StickyPatch {
    pub title: Option<String>,
    pub x: Option<i64>,
    pub y: Option<i64>,
    pub w: Option<i64>,
    pub h: Option<i64>,
    pub pinned: Option<i64>,
    pub bg_color: Option<String>,
    pub opacity: Option<f64>,
    pub font_size: Option<i64>,
    pub font_color: Option<String>,
    pub z_order: Option<i64>,
    pub hidden: Option<i64>,
}

pub async fn list_all(db: &Db) -> AppResult<Vec<Sticky>> {
    let rows = sqlx::query_as::<_, Sticky>(
        "SELECT * FROM stickies ORDER BY z_order ASC, created_at ASC",
    )
    .fetch_all(db)
    .await?;
    Ok(rows)
}

pub async fn update(db: &Db, id: &str, patch: StickyPatch) -> AppResult<Sticky> {
    let now = chrono::Utc::now().timestamp_millis();
    // 只更新非 None 字段；统一用单条 UPDATE 覆盖 COALESCE
    sqlx::query(
        "UPDATE stickies SET
            title = COALESCE(?, title),
            x = COALESCE(?, x),
            y = COALESCE(?, y),
            w = COALESCE(?, w),
            h = COALESCE(?, h),
            pinned = COALESCE(?, pinned),
            bg_color = COALESCE(?, bg_color),
            opacity = COALESCE(?, opacity),
            font_size = COALESCE(?, font_size),
            font_color = COALESCE(?, font_color),
            z_order = COALESCE(?, z_order),
            hidden = COALESCE(?, hidden),
            updated_at = ?
         WHERE id = ?",
    )
    .bind(patch.title)
    .bind(patch.x)
    .bind(patch.y)
    .bind(patch.w)
    .bind(patch.h)
    .bind(patch.pinned)
    .bind(patch.bg_color)
    .bind(patch.opacity)
    .bind(patch.font_size)
    .bind(patch.font_color)
    .bind(patch.z_order)
    .bind(patch.hidden)
    .bind(now)
    .bind(id)
    .execute(db)
    .await?;
    get(db, id).await
}

pub async fn delete(db: &Db, id: &str) -> AppResult<()> {
    sqlx::query("DELETE FROM stickies WHERE id = ?")
        .bind(id)
        .execute(db)
        .await?;
    Ok(())
}
```

- [ ] **Step 2: 扩充单元测试（先红）**

在 `#[cfg(test)] mod tests` 里追加：

```rust
#[tokio::test]
async fn update_applies_patch() {
    let pool = test_pool().await;
    let s = create_default(&pool).await.unwrap();
    let updated = update(&pool, &s.id, StickyPatch {
        title: Some("work".into()),
        x: Some(100),
        y: Some(200),
        pinned: Some(1),
        ..Default::default()
    }).await.unwrap();
    assert_eq!(updated.title, "work");
    assert_eq!(updated.x, Some(100));
    assert_eq!(updated.y, Some(200));
    assert_eq!(updated.pinned, 1);
    // unchanged
    assert_eq!(updated.w, 320);
}

#[tokio::test]
async fn list_all_includes_hidden() {
    let pool = test_pool().await;
    let a = create_default(&pool).await.unwrap();
    let _b = create_default(&pool).await.unwrap();
    update(&pool, &a.id, StickyPatch { hidden: Some(1), ..Default::default() })
        .await.unwrap();
    let all = list_all(&pool).await.unwrap();
    assert_eq!(all.len(), 2);
    let visible = list_visible(&pool).await.unwrap();
    assert_eq!(visible.len(), 1);
}

#[tokio::test]
async fn delete_cascades_items() {
    let pool = test_pool().await;
    let s = create_default(&pool).await.unwrap();
    // 插一条 item 依赖此 sticky
    sqlx::query("INSERT INTO items (id, sticky_id, content_md, sort_order, created_at, updated_at) VALUES ('i1', ?, 'x', 0, 0, 0)")
        .bind(&s.id).execute(&pool).await.unwrap();
    delete(&pool, &s.id).await.unwrap();
    let items: Vec<(String,)> = sqlx::query_as("SELECT id FROM items WHERE sticky_id = ?")
        .bind(&s.id).fetch_all(&pool).await.unwrap();
    assert!(items.is_empty(), "ON DELETE CASCADE should remove items");
}
```

- [ ] **Step 3: 跑测试**

```bash
cd src-tauri && cargo test --lib stickies && cd ..
```

Expected: 6 passed (原 3 + 新 3)

- [ ] **Step 4: Commit**

```bash
git add src-tauri/src/db/stickies.rs
git commit -m "feat(db): stickies list_all/update/delete + tests"
```

---

### Task 2: 新建 IPC create_sticky / hide / show / delete / update + list_all

**Files:**
- Modify: `src-tauri/src/commands/stickies.rs`
- Modify: `src-tauri/src/lib.rs` (invoke_handler 新增)

- [ ] **Step 1: 扩充 `commands/stickies.rs`**

```rust
use crate::db::{self, stickies::{Sticky, StickyPatch}, Db};
use crate::error::AppResult;
use tauri::State;

#[tauri::command]
pub async fn get_or_create_default_sticky(db: State<'_, Db>) -> AppResult<Sticky> {
    let visible = db::stickies::list_visible(&db).await?;
    if let Some(s) = visible.into_iter().next() {
        return Ok(s);
    }
    db::stickies::create_default(&db).await
}

#[tauri::command]
pub async fn list_stickies(db: State<'_, Db>) -> AppResult<Vec<Sticky>> {
    db::stickies::list_visible(&db).await
}

#[tauri::command]
pub async fn list_all_stickies(db: State<'_, Db>) -> AppResult<Vec<Sticky>> {
    db::stickies::list_all(&db).await
}

#[tauri::command]
pub async fn get_sticky(db: State<'_, Db>, id: String) -> AppResult<Sticky> {
    db::stickies::get(&db, &id).await
}

#[tauri::command]
pub async fn create_sticky(db: State<'_, Db>) -> AppResult<Sticky> {
    db::stickies::create_default(&db).await
}

#[tauri::command]
pub async fn update_sticky(db: State<'_, Db>, id: String, patch: StickyPatch) -> AppResult<Sticky> {
    db::stickies::update(&db, &id, patch).await
}

#[tauri::command]
pub async fn delete_sticky(db: State<'_, Db>, id: String) -> AppResult<()> {
    db::stickies::delete(&db, &id).await
}
```

- [ ] **Step 2: 在 `lib.rs` 的 `invoke_handler` 加入新命令**

```rust
.invoke_handler(tauri::generate_handler![
    commands::stickies::get_or_create_default_sticky,
    commands::stickies::list_stickies,
    commands::stickies::list_all_stickies,
    commands::stickies::get_sticky,
    commands::stickies::create_sticky,
    commands::stickies::update_sticky,
    commands::stickies::delete_sticky,
    commands::items::list_items,
    commands::items::upsert_item,
    commands::items::toggle_item,
    commands::items::delete_item,
])
```

- [ ] **Step 3: 编译验证**

```bash
cd src-tauri && cargo build && cd ..
```

- [ ] **Step 4: Commit**

```bash
git add src-tauri/src/commands/stickies.rs src-tauri/src/lib.rs
git commit -m "feat(ipc): full sticky CRUD commands"
```

---

### Task 3: WindowManager —— 创建/关闭/聚焦 sticky 窗口

**Files:**
- Create: `src-tauri/src/windows.rs`
- Modify: `src-tauri/src/lib.rs`

- [ ] **Step 1: 创建 `src-tauri/src/windows.rs`**

```rust
use crate::db::{self, stickies::Sticky, Db};
use crate::error::{AppError, AppResult};
use tauri::{AppHandle, Manager, WebviewUrl, WebviewWindow, WebviewWindowBuilder};

/// 标签前缀 + sticky id 构成窗口 label
pub fn label(sticky_id: &str) -> String {
    format!("sticky-{}", sticky_id)
}

/// 从 label 反解 sticky id（供前端通过 window label 查询自己属于哪张便签）
pub fn id_from_label(label: &str) -> Option<&str> {
    label.strip_prefix("sticky-")
}

/// 打开一个便签窗口（已存在则 focus）。成功返回 WebviewWindow 引用。
pub async fn open(app: &AppHandle, sticky: &Sticky) -> AppResult<WebviewWindow> {
    let lbl = label(&sticky.id);
    if let Some(w) = app.get_webview_window(&lbl) {
        w.set_focus().ok();
        return Ok(w);
    }

    let url = format!("index.html#/sticky/{}", sticky.id);
    let mut builder = WebviewWindowBuilder::new(app, &lbl, WebviewUrl::App(url.into()))
        .title("Floaty")
        .inner_size(sticky.w as f64, sticky.h as f64)
        .resizable(true)
        .decorations(false)
        .transparent(true)
        .always_on_top(sticky.pinned == 1)
        .visible(true);

    if let (Some(x), Some(y)) = (sticky.x, sticky.y) {
        builder = builder.position(x as f64, y as f64);
    }

    let window = builder
        .build()
        .map_err(|e| AppError::Other(format!("window build failed: {}", e)))?;

    attach_geometry_listener(&window, sticky.id.clone())?;
    Ok(window)
}

/// 关闭（隐藏）便签窗口：DB 标记 hidden，销毁 webview。
pub async fn hide(app: &AppHandle, sticky_id: &str, db: &Db) -> AppResult<()> {
    db::stickies::update(
        db,
        sticky_id,
        db::stickies::StickyPatch {
            hidden: Some(1),
            ..Default::default()
        },
    )
    .await?;
    if let Some(w) = app.get_webview_window(&label(sticky_id)) {
        w.close()
            .map_err(|e| AppError::Other(format!("window close: {}", e)))?;
    }
    Ok(())
}

/// 从菜单栏恢复一个已隐藏的便签：DB 清 hidden，然后 open。
pub async fn show(app: &AppHandle, sticky_id: &str, db: &Db) -> AppResult<WebviewWindow> {
    let sticky = db::stickies::update(
        db,
        sticky_id,
        db::stickies::StickyPatch {
            hidden: Some(0),
            ..Default::default()
        },
    )
    .await?;
    open(app, &sticky).await
}

/// 切换 always-on-top（pin）。返回新的 pinned 状态。
pub async fn toggle_pin(app: &AppHandle, sticky_id: &str, db: &Db) -> AppResult<bool> {
    let s = db::stickies::get(db, sticky_id).await?;
    let next = if s.pinned == 1 { 0 } else { 1 };
    db::stickies::update(
        db,
        sticky_id,
        db::stickies::StickyPatch {
            pinned: Some(next),
            ..Default::default()
        },
    )
    .await?;
    if let Some(w) = app.get_webview_window(&label(sticky_id)) {
        w.set_always_on_top(next == 1)
            .map_err(|e| AppError::Other(format!("set_always_on_top: {}", e)))?;
    }
    Ok(next == 1)
}

/// 冷启动：打开所有 hidden=0 的便签；若一个都没有，创建一张新便签并打开。
pub async fn restore_on_startup(app: &AppHandle, db: &Db) -> AppResult<()> {
    let visible = db::stickies::list_visible(db).await?;
    if visible.is_empty() {
        let fresh = db::stickies::create_default(db).await?;
        open(app, &fresh).await?;
    } else {
        for s in visible {
            open(app, &s).await?;
        }
    }
    Ok(())
}

/// 为窗口绑定 Move/Resize 事件 → 写回 DB。
fn attach_geometry_listener(window: &WebviewWindow, sticky_id: String) -> AppResult<()> {
    let app = window.app_handle().clone();
    let label = window.label().to_string();
    window.on_window_event(move |event| {
        use tauri::WindowEvent;
        let (x, y, w, h) = match event {
            WindowEvent::Moved(pos) => {
                let w = app.get_webview_window(&label);
                let size = w.as_ref().and_then(|w| w.inner_size().ok());
                let (width, height) = size
                    .map(|s| (s.width as i64, s.height as i64))
                    .unwrap_or((320, 420));
                (pos.x as i64, pos.y as i64, width, height)
            }
            WindowEvent::Resized(size) => {
                let w = app.get_webview_window(&label);
                let pos = w.as_ref().and_then(|w| w.outer_position().ok());
                let (x, y) = pos
                    .map(|p| (p.x as i64, p.y as i64))
                    .unwrap_or((0, 0));
                (x, y, size.width as i64, size.height as i64)
            }
            _ => return,
        };
        let sticky_id = sticky_id.clone();
        let app = app.clone();
        tauri::async_runtime::spawn(async move {
            if let Some(db) = app.try_state::<Db>() {
                let _ = db::stickies::update(
                    &db,
                    &sticky_id,
                    db::stickies::StickyPatch {
                        x: Some(x),
                        y: Some(y),
                        w: Some(w),
                        h: Some(h),
                        ..Default::default()
                    },
                )
                .await;
            }
        });
    });
    Ok(())
}
```

- [ ] **Step 2: 在 `lib.rs` 引入 `mod windows;` 并在 setup 完成后调用 `restore_on_startup`**

```rust
mod commands;
mod db;
mod error;
mod windows;
```

setup 改造（接在现有 `app.manage(pool)` 之后）：

```rust
.setup(|app| {
    let handle = app.handle().clone();
    let pool = tauri::async_runtime::block_on(async move {
        let data_dir = handle.path().app_data_dir().expect("app_data_dir");
        db::init(data_dir).await.expect("db init")
    });
    app.manage(pool.clone());

    // 启动时恢复所有可见便签
    let handle = app.handle().clone();
    tauri::async_runtime::spawn(async move {
        if let Err(e) = windows::restore_on_startup(&handle, &pool).await {
            eprintln!("[floaty] restore_on_startup failed: {}", e);
        }
    });
    Ok(())
})
```

- [ ] **Step 3: 改 `tauri.conf.json`：删除默认自动创建的 mainWindow**

Tauri 2 默认从 `app.windows` 配置建一个主窗口。我们改为不自动建（让 `restore_on_startup` 来建）：

方案 A（推荐）：把 `app.windows` 数组设为空 `[]`。
方案 B：保留一个 label="main" 的隐藏占位窗口；`restore_on_startup` 里把它销毁并重建成 sticky-xxx。

用方案 A。修改 `src-tauri/tauri.conf.json`：

```json
"app": {
  "macOSPrivateApi": true,
  "windows": [],
  ...
}
```

同时把 `macOSPrivateApi` 保持 `true`，`security.csp: null`。

- [ ] **Step 4: 编译验证**

```bash
cd src-tauri && cargo build && cd ..
```

Expected: 0 errors. 几个 warnings 关于 windows 模块里的未用函数（toggle_pin、hide、show 尚未通过 IPC 暴露，下 task 接）— 可接受。

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(windows): WindowManager + startup restore + geometry persistence"
```

---

### Task 4: IPC commands —— 窗口动作

**Files:**
- Create: `src-tauri/src/commands/windows.rs`
- Modify: `src-tauri/src/commands/mod.rs`
- Modify: `src-tauri/src/lib.rs`

- [ ] **Step 1: 创建 `src-tauri/src/commands/windows.rs`**

```rust
use crate::db::Db;
use crate::error::AppResult;
use crate::windows;
use tauri::{AppHandle, State};

#[tauri::command]
pub async fn open_sticky_window(
    app: AppHandle,
    db: State<'_, Db>,
    sticky_id: String,
) -> AppResult<()> {
    let sticky = crate::db::stickies::get(&db, &sticky_id).await?;
    windows::open(&app, &sticky).await?;
    Ok(())
}

#[tauri::command]
pub async fn hide_sticky(
    app: AppHandle,
    db: State<'_, Db>,
    sticky_id: String,
) -> AppResult<()> {
    windows::hide(&app, &sticky_id, &db).await
}

#[tauri::command]
pub async fn show_sticky(
    app: AppHandle,
    db: State<'_, Db>,
    sticky_id: String,
) -> AppResult<()> {
    windows::show(&app, &sticky_id, &db).await?;
    Ok(())
}

#[tauri::command]
pub async fn toggle_pin(
    app: AppHandle,
    db: State<'_, Db>,
    sticky_id: String,
) -> AppResult<bool> {
    windows::toggle_pin(&app, &sticky_id, &db).await
}

#[tauri::command]
pub async fn new_sticky_window(app: AppHandle, db: State<'_, Db>) -> AppResult<String> {
    let sticky = crate::db::stickies::create_default(&db).await?;
    windows::open(&app, &sticky).await?;
    Ok(sticky.id)
}
```

- [ ] **Step 2: 更新 `src-tauri/src/commands/mod.rs`**

```rust
pub mod stickies;
pub mod items;
pub mod windows;
```

- [ ] **Step 3: 注册到 `lib.rs` invoke_handler**

在现有 handler 列表末尾加：

```rust
commands::windows::open_sticky_window,
commands::windows::hide_sticky,
commands::windows::show_sticky,
commands::windows::toggle_pin,
commands::windows::new_sticky_window,
```

- [ ] **Step 4: 更新 capabilities**

`src-tauri/capabilities/default.json` 的 `windows` 字段现在要接受所有 `sticky-*` 标签的窗口。改为：

```json
{
  "$schema": "../gen/schemas/desktop-schema.json",
  "identifier": "default",
  "description": "Capability for all floaty windows",
  "windows": ["sticky-*"],
  "permissions": [
    "core:default",
    "core:window:allow-start-dragging",
    "core:window:allow-set-position",
    "core:window:allow-set-size",
    "core:window:allow-minimize",
    "core:window:allow-close",
    "core:window:allow-set-always-on-top",
    "opener:default"
  ]
}
```

- [ ] **Step 5: cargo build**

```bash
cd src-tauri && cargo build && cd ..
```

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat(ipc): window action commands + allow sticky-* capabilities"
```

---

## Part B: 菜单栏 (Tray)

### Task 5: 菜单栏图标 + 静态菜单骨架

**Files:**
- Create: `src-tauri/src/tray.rs`
- Modify: `src-tauri/src/lib.rs`

- [ ] **Step 1: 创建 `src-tauri/src/tray.rs`（骨架）**

```rust
use crate::db::{self, Db};
use tauri::{
    menu::{Menu, MenuEvent, MenuItem, PredefinedMenuItem, Submenu},
    tray::{MouseButton, TrayIconBuilder, TrayIconEvent},
    AppHandle, Manager,
};

/// 初始化 tray；每次点击图标时重新构建菜单（动态列出当前便签）。
pub fn init(app: &AppHandle) -> tauri::Result<()> {
    let menu = build_menu(app)?;
    let icon = app
        .default_window_icon()
        .cloned()
        .ok_or_else(|| tauri::Error::WebviewNotFound)?;

    TrayIconBuilder::with_id("floaty-tray")
        .icon(icon)
        .tooltip("Floaty")
        .menu(&menu)
        .show_menu_on_left_click(true)
        .on_menu_event(on_menu_event)
        .on_tray_icon_event(|tray, event| {
            if let TrayIconEvent::Click {
                button: MouseButton::Left,
                ..
            } = event
            {
                // 重建菜单以拿到最新便签列表
                if let Ok(menu) = build_menu(tray.app_handle()) {
                    let _ = tray.set_menu(Some(menu));
                }
            }
        })
        .build(app)?;
    Ok(())
}

/// 构建当前菜单：标题 — [便签列表] — 分隔 — 新建 — 偏好设置 — 退出
fn build_menu(app: &AppHandle) -> tauri::Result<Menu<tauri::Wry>> {
    let db = app.state::<Db>();
    let all = tauri::async_runtime::block_on(db::stickies::list_all(&db))
        .unwrap_or_default();

    let menu = Menu::new(app)?;
    // 标题（disabled）
    let heading = MenuItem::with_id(app, "heading", format!("便签 ({})", all.len()), false, None::<&str>)?;
    menu.append(&heading)?;

    // 每个便签一个菜单项（hidden 的用"显示："前缀）
    for s in &all {
        let label = if s.hidden == 1 {
            format!("· 显示：{}", sticky_display_name(s))
        } else {
            let pin = if s.pinned == 1 { "📌 " } else { "" };
            format!("{}{}", pin, sticky_display_name(s))
        };
        let item = MenuItem::with_id(
            app,
            format!("sticky:{}", s.id),
            label,
            true,
            None::<&str>,
        )?;
        menu.append(&item)?;
    }

    menu.append(&PredefinedMenuItem::separator(app)?)?;
    let new_item = MenuItem::with_id(app, "new-sticky", "＋ 新建便签", true, Some("CmdOrCtrl+Shift+N"))?;
    menu.append(&new_item)?;

    let prefs = MenuItem::with_id(app, "preferences", "⚙️ 偏好设置", false, None::<&str>)?;
    menu.append(&prefs)?;

    menu.append(&PredefinedMenuItem::separator(app)?)?;
    menu.append(&PredefinedMenuItem::quit(app, Some("退出"))?)?;
    Ok(menu)
}

fn sticky_display_name(s: &crate::db::stickies::Sticky) -> String {
    if s.title.is_empty() {
        format!("便签 {}", &s.id[..6])
    } else {
        s.title.clone()
    }
}

/// 菜单项点击 dispatch
fn on_menu_event(app: &AppHandle, event: MenuEvent) {
    let id = event.id().as_ref().to_string();
    if id == "new-sticky" {
        let handle = app.clone();
        tauri::async_runtime::spawn(async move {
            let db = handle.state::<Db>();
            if let Ok(sticky) = db::stickies::create_default(&db).await {
                let _ = crate::windows::open(&handle, &sticky).await;
            }
        });
    } else if let Some(sticky_id) = id.strip_prefix("sticky:") {
        let handle = app.clone();
        let sticky_id = sticky_id.to_string();
        tauri::async_runtime::spawn(async move {
            let db = handle.state::<Db>();
            // 若已显示则聚焦；已隐藏则 show
            if let Ok(s) = db::stickies::get(&db, &sticky_id).await {
                if s.hidden == 1 {
                    let _ = crate::windows::show(&handle, &sticky_id, &db).await;
                } else if let Some(w) = handle.get_webview_window(&crate::windows::label(&sticky_id)) {
                    let _ = w.set_focus();
                }
            }
        });
    }
}
```

- [ ] **Step 2: 启用 tray-icon feature 并加 dep**

`src-tauri/Cargo.toml`：

```toml
tauri = { version = "2", features = ["macos-private-api", "tray-icon"] }
```

- [ ] **Step 3: 在 `lib.rs` 引入 mod tray 并在 setup 里调用 `tray::init`**

```rust
mod commands;
mod db;
mod error;
mod tray;
mod windows;
```

setup 改造（紧接 `restore_on_startup` 的 spawn 之后）：

```rust
tray::init(app.handle()).expect("tray init");
```

- [ ] **Step 4: cargo build**

```bash
cd src-tauri && cargo build && cd ..
```

Expected: 成功。(macOS 会正确把 tray 显示在状态栏)

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(tray): menu bar icon with dynamic sticky list + new/quit"
```

---

### Task 6: Dock 图标隐藏 (macOS — 纯 tray 应用)

**Files:**
- Modify: `src-tauri/tauri.conf.json`

- [ ] **Step 1: 设置 macOS activation policy 为 accessory（不显示 dock 图标）**

在 `tauri.conf.json` 的 `app` 加上：

```json
"app": {
  "macOSPrivateApi": true,
  "windows": [],
  "macOSAccessory": true,
  "security": { "csp": null }
}
```

注意：Tauri 2 里直接在 config 不一定支持 `macOSAccessory`，如果不支持，就在 `lib.rs` setup 里手动设：

```rust
#[cfg(target_os = "macos")]
app.set_activation_policy(tauri::ActivationPolicy::Accessory);
```

优先用配置方案；如果 tauri.conf.json schema 拒绝，退到代码方案。

- [ ] **Step 2: 重启 app 验证**

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "chore(tray): hide dock icon, pure menu-bar app"
```

---

## Part C: 前端 — 按 sticky_id 渲染

### Task 7: 前端路由：从 window label 提取 sticky_id

**Files:**
- Modify: `src/App.tsx`
- Modify: `src/sticky/useStickyData.ts`
- Modify: `src/sticky/StickyPage.tsx`

- [ ] **Step 1: 改 `src/App.tsx` — 用 window label 判断要渲染哪张便签**

```tsx
import { useEffect, useState } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { StickyPage } from "./sticky/StickyPage";

export default function App() {
  const [stickyId, setStickyId] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const label = getCurrentWindow().label;
    if (label.startsWith("sticky-")) {
      setStickyId(label.slice("sticky-".length));
    }
    setReady(true);
  }, []);

  if (!ready) {
    return <div className="h-screen bg-yellow-100 p-3 text-xs opacity-60">Loading...</div>;
  }
  if (!stickyId) {
    return (
      <div className="h-screen bg-red-100 p-3 text-xs">
        Unknown window label. Expected "sticky-&lt;id&gt;".
      </div>
    );
  }
  return <StickyPage stickyId={stickyId} />;
}
```

- [ ] **Step 2: 改 `src/sticky/useStickyData.ts` — 接收 stickyId 作为参数**

```ts
import { useEffect, useState, useRef, useCallback } from "react";
import { ipc } from "../ipc/client";
import type { Sticky } from "../ipc/types";

export function useStickyData(stickyId: string) {
  const [sticky, setSticky] = useState<Sticky | null>(null);
  const [markdown, setMarkdown] = useState<string>("");
  const [loaded, setLoaded] = useState(false);
  const itemIdRef = useRef<string | null>(null);
  const saveTimer = useRef<number | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const s = await ipc.getSticky(stickyId);
        setSticky(s);
        const items = await ipc.listItems(s.id);
        const combined = items.map((i) => i.content_md).join("\n");
        setMarkdown(combined || "- [ ] ");
        itemIdRef.current = items[0]?.id ?? null;
        setLoaded(true);
      } catch (err) {
        console.error("[floaty] sticky load failed:", err);
      }
    })();
  }, [stickyId]);

  const save = useCallback((md: string) => {
    setMarkdown(md);
    if (!sticky) return;
    if (saveTimer.current) window.clearTimeout(saveTimer.current);
    saveTimer.current = window.setTimeout(async () => {
      const item = await ipc.upsertItem({
        id: itemIdRef.current,
        sticky_id: sticky.id,
        content_md: md,
        due_at: null,
        sort_order: 0,
      });
      itemIdRef.current = item.id;
    }, 300);
  }, [sticky]);

  return { sticky, markdown, loaded, save };
}
```

- [ ] **Step 3: 改 `src/sticky/StickyPage.tsx`** — 接收 `stickyId` prop，增加 pin / close 按钮：

```tsx
import { Editor } from "../editor/Editor";
import { useStickyData } from "./useStickyData";
import { ipc } from "../ipc/client";

interface StickyPageProps {
  stickyId: string;
}

export function StickyPage({ stickyId }: StickyPageProps) {
  const { sticky, markdown, loaded, save } = useStickyData(stickyId);

  if (!loaded || !sticky) {
    return <div className="h-screen bg-yellow-100 p-3 text-xs opacity-60">Loading...</div>;
  }

  const pinned = sticky.pinned === 1;

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
            className={`text-[11px] px-1 rounded ${pinned ? "opacity-100" : "opacity-40 hover:opacity-70"}`}
            onClick={() => ipc.togglePin(stickyId)}
            title={pinned ? "取消置顶" : "置顶"}
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
```

- [ ] **Step 4: 扩展 `src/ipc/client.ts`**

追加：

```ts
import type { StickyPatch } from "./types";

// 在现有 ipc 对象中追加：
getSticky: (id: string): Promise<Sticky> =>
  invoke("get_sticky", { id }),

listAllStickies: (): Promise<Sticky[]> =>
  invoke("list_all_stickies"),

createSticky: (): Promise<Sticky> =>
  invoke("create_sticky"),

updateSticky: (id: string, patch: StickyPatch): Promise<Sticky> =>
  invoke("update_sticky", { id, patch }),

deleteSticky: (id: string): Promise<void> =>
  invoke("delete_sticky", { id }),

openStickyWindow: (stickyId: string): Promise<void> =>
  invoke("open_sticky_window", { stickyId }),

hideSticky: (stickyId: string): Promise<void> =>
  invoke("hide_sticky", { stickyId }),

showSticky: (stickyId: string): Promise<void> =>
  invoke("show_sticky", { stickyId }),

togglePin: (stickyId: string): Promise<boolean> =>
  invoke("toggle_pin", { stickyId }),

newStickyWindow: (): Promise<string> =>
  invoke("new_sticky_window"),
```

- [ ] **Step 5: 扩展 `src/ipc/types.ts`** — 加 `StickyPatch`:

```ts
export interface StickyPatch {
  title?: string;
  x?: number;
  y?: number;
  w?: number;
  h?: number;
  pinned?: number;
  bg_color?: string;
  opacity?: number;
  font_size?: number;
  font_color?: string;
  z_order?: number;
  hidden?: number;
}
```

- [ ] **Step 6: index.html 支持 hash routing**

Vite 默认支持 `#/sticky/:id` 样的 URL，React 端通过 window label 解析（Step 1），所以 index.html 不用改。确认 vite.config.ts 没有设置奇怪的 base 路径即可。

- [ ] **Step 7: 前端测试 + typecheck**

```bash
npm test
npx tsc --noEmit
```

Expected: 6 passed (已有测试不受影响); 0 tsc errors.

- [ ] **Step 8: Commit**

```bash
git add -A
git commit -m "feat(frontend): multi-sticky routing via window label + pin/close controls"
```

---

## Part D: 端到端冒烟 & 透明态回退

### Task 8: 调试期 → 便签形态（visible=true, transparent=true）

**Files:**
- Modify: `src-tauri/src/windows.rs`（确认 `open` 里 transparent: true、decorations: false 都设置好）
- Modify: `src-tauri/tauri.conf.json`（`app.windows: []`；默认主窗不再是 floaty-debug）

Task 3 & 4 已经完成此配置。这一步作为**人工验证**节点：

- [ ] **Step 1: 构建 + 启动**

```bash
source ~/.cargo/env
npm run tauri dev
```

- [ ] **Step 2: 菜单栏 tray 测试（人工）**

- [ ] macOS 菜单栏右上看到 Floaty 图标
- [ ] 点击图标弹出下拉，列出现有便签（应至少 1 条，从 Phase 1 测试留下）
- [ ] 点"＋ 新建便签"，一张新便签窗口出现在 (200,200) 附近
- [ ] 拖动任一便签能移动，移动后关掉重开会在新位置（证明 geometry 持久化）
- [ ] 点击便签的 📌 按钮：置顶状态切换（其他应用上方能看到它）
- [ ] 点击便签的 ✕ 按钮：窗口消失；tray 菜单里出现"· 显示：便签 xxxxxx"项
- [ ] 点"· 显示：..."项：窗口恢复到之前的位置
- [ ] 退出：菜单栏 → 退出

- [ ] **Step 3: 后端测试回归**

```bash
source ~/.cargo/env
cd src-tauri && cargo test --lib && cd ..
```

Expected: 10 passed (Phase 1 的 7 + Phase 2 stickies 新增 3)

- [ ] **Step 4: 前端测试回归**

```bash
npm test
```

Expected: 6 passed (不变).

---

## Part E: 合并

### Task 9: Merge 到 main

- [ ] **Step 1: 确保工作树干净**

```bash
git status
# 应该是 clean
```

- [ ] **Step 2: 更新 README**

在 README.md 的"当前进度"部分改为 `Phase 2（多便签 + 菜单栏）`。

- [ ] **Step 3: Commit README**

```bash
git add README.md
git commit -m "docs: mark Phase 2 complete"
```

- [ ] **Step 4: Merge**

```bash
git checkout main
git merge --no-ff phase-2-multi-sticky -m "merge: Phase 2 multi-sticky + menu bar"
```

---

## Self-Review

### 1. Spec 覆盖（针对 Phase 2 范围）

| Spec 需求 | 落地 Task |
|-----------|-----------|
| 多便签窗口 | Task 3 (WindowManager::open) + Task 7 (前端路由) |
| 菜单栏入口 | Task 5 (tray::init) + Task 6 (dock icon hidden) |
| 新建/关闭恢复 | Task 2 + 4 (commands) + Task 7 (UI 按钮) |
| Per-sticky pin | Task 4 (toggle_pin IPC) + Task 7 (📌 按钮) |
| 窗口几何持久化 | Task 3 (attach_geometry_listener) |
| 关闭 ≠ 删除 | Task 3 hide()（只改 hidden + close webview）|

### 2. Placeholder scan

- 无 "TBD"
- 所有 step 有具体代码和命令
- Task 8（冒烟）有明确的人工 checklist；这一步只能本地测

### 3. Type consistency

- `StickyPatch` 定义在 Rust (`db/stickies.rs`) 与 TS (`ipc/types.ts`) 两端，字段 snake_case 对齐（`bg_color`、`font_size`、`z_order`）
- 窗口 label 格式 `sticky-<id>`：Rust 的 `windows::label()` / `id_from_label()` 和 前端 `App.tsx` 的 `label.slice("sticky-".length)` 保持一致
- IPC 命令名：Rust 的 `#[tauri::command]` 函数名 ↔ TS 的 `invoke("xxx", ...)` 字符串一一对应
- `get_sticky` 参数：Rust `id: String` + TS `{ id }`（Tauri 自动 camelCase → snake_case 不需要，因为 `id` 一字不转换）

### 4. 可能的坑

- **Tauri 2 `WebviewUrl::App("index.html#/sticky/...")`**：hash 部分能否正确传给 webview 取决于 Tauri 版本。如果传不过去，改用 `WebviewUrl::App("index.html?sticky=...")` 并在前端用 URLSearchParams 解析。
- **tray-icon feature**：确认 Cargo.toml 里有。否则 `use tauri::tray::...` 编译报错。
- **Dock icon hide**：Tauri 2 schema 可能不接 `macOSAccessory`。有替代：`app.set_activation_policy(Accessory)`。Task 6 已给备选。
- **multi-window capabilities**：`windows: ["sticky-*"]` 用 glob，Tauri 2 支持该语法。
- **geometry listener 性能**：Move/Resize 事件频繁触发 → 每次都 spawn async task 写 DB。Phase 2 先接受，Phase 3 如果卡顿再加 debounce。
- **tray 菜单响应时间**：每次点击重建菜单会 block_on DB query。DB 小（< 100 便签）不会卡；如果将来大了要改异步。
