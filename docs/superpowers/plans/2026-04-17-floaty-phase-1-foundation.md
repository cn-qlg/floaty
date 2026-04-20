# Floaty — Phase 1: Foundation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 搭起 Tauri + React + SQLite 工程骨架，并实现最小可用的"单便签"：打开应用 → 看到一张便签 → 能写 markdown todo（`- [ ]` 自动渲染为 checkbox）→ 退出重启数据保留。

**Architecture:** 单 Tauri 进程，单 webview 窗口加载 React。前端用 TipTap 做 WYSIWYG markdown 编辑，每条 item 序列化为 markdown 文本行，通过 Tauri IPC 写入 SQLite。后端 Rust 用 sqlx 管理 DB 连接池，commands 模块暴露 RPC。

**Tech Stack:** Tauri 2 · React 18 · TypeScript · Vite · TipTap 2 · Tailwind CSS · sqlx (SQLite) · Tokio · Vitest · Rust `cargo test`

---

## Pre-flight: 项目目录与基线

**当前状态：** 仓库已 `git init`，含 `docs/superpowers/specs/2026-04-17-floaty-design.md`，工作目录 `/Users/liuguoqing/Codes/OpenSource/floaty/`。Git author 已配置为 `cn_qlg <cn_qlg@163.com>`。`.gitignore` 已含 `node_modules/`、`dist/`、`target/`、`.superpowers/`、`.DS_Store`、`*.log`。

**所有命令默认从仓库根 `/Users/liuguoqing/Codes/OpenSource/floaty/` 执行。** 每个 task 的 commit 都用 `cn_qlg <cn_qlg@163.com>` 作为 author（已是本地 git 默认）。

---

## File Structure (Phase 1 完成后)

```
floaty/
├── package.json                 # npm 依赖 + scripts
├── pnpm-lock.yaml or package-lock.json
├── vite.config.ts
├── tsconfig.json
├── tailwind.config.js
├── postcss.config.js
├── index.html                   # Vite entry
├── src/                         # 前端
│   ├── main.tsx                 # React mount
│   ├── App.tsx                  # 路由：默认渲染 <StickyPage>
│   ├── ipc/
│   │   ├── client.ts            # invoke<T>(cmd, args) 类型化封装
│   │   └── types.ts             # Sticky / Item TS 类型，与 Rust 对齐
│   ├── sticky/
│   │   ├── StickyPage.tsx       # 单便签页面：title + editor
│   │   └── useStickyData.ts     # hook：加载/保存 sticky + items
│   ├── editor/
│   │   ├── Editor.tsx           # TipTap 封装（StarterKit + TaskList）
│   │   ├── markdown.ts          # serialize/deserialize: doc <-> markdown
│   │   └── markdown.test.ts     # 编辑器 markdown 往返测试
│   └── styles.css               # Tailwind + 基础 CSS variables
├── src-tauri/                   # 后端 (Rust)
│   ├── Cargo.toml
│   ├── tauri.conf.json
│   ├── build.rs
│   ├── icons/                   # tauri 默认占位
│   └── src/
│       ├── main.rs              # 应用入口、注册 commands、初始化 DB
│       ├── db/
│       │   ├── mod.rs           # 导出 + 连接池
│       │   ├── migrations.rs    # SQL migration runner
│       │   ├── stickies.rs      # stickies 表 repo
│       │   └── items.rs         # items 表 repo
│       ├── commands/
│       │   ├── mod.rs
│       │   ├── stickies.rs      # IPC: get_or_create_default_sticky, ...
│       │   └── items.rs         # IPC: list_items, upsert_item, toggle_item
│       └── error.rs             # AppError + IPC 序列化
├── docs/superpowers/specs/      # 已存在
├── docs/superpowers/plans/      # 已存在
├── README.md
└── .gitignore                   # 已存在
```

---

## Part A: 工程脚手架

### Task 1: 初始化 Tauri 2 + Vite + React + TS 项目

**Files:**
- Create (via scaffold): `package.json`, `vite.config.ts`, `tsconfig.json`, `index.html`, `src/main.tsx`, `src/App.tsx`, `src-tauri/Cargo.toml`, `src-tauri/tauri.conf.json`, `src-tauri/build.rs`, `src-tauri/src/main.rs`, `src-tauri/icons/*`

- [ ] **Step 1: 在仓库根运行 Tauri 2 模板生成器**

```bash
cd /Users/liuguoqing/Codes/OpenSource/floaty
npm create tauri-app@latest -- floaty --template react-ts --manager npm --identifier app.floaty.desktop
```

它会问几个问题，照下回答：
- App name: `floaty`
- 把生成的 `floaty/` 子目录里所有文件**移动到当前目录**（生成器在子目录里跑）：

```bash
mv floaty/* floaty/.* . 2>/dev/null; rmdir floaty
```

如果 `npm create tauri-app` 不接受位置参数，等它生成 `floaty/` 子目录后做上面的移动即可。

- [ ] **Step 2: 验证脚手架可启动**

```bash
npm install
npm run tauri dev
```

Expected: 一个 Tauri 窗口弹出，显示模板的 "Welcome to Tauri + React" 页面。`Ctrl+C` 关掉。

- [ ] **Step 3: 改 `tauri.conf.json`：窗口标题 + 默认尺寸**

修改 `src-tauri/tauri.conf.json` 的 `app.windows[0]`：

```json
{
  "title": "Floaty",
  "width": 320,
  "height": 420,
  "resizable": true,
  "decorations": false,
  "transparent": true,
  "alwaysOnTop": false
}
```

也设 `productName` 为 `"Floaty"`，`identifier` 为 `"app.floaty.desktop"`。

- [ ] **Step 4: 重新跑 `npm run tauri dev`**

Expected: 窗口现在是 320×420 的无标题栏透明窗口（Webview 仍显示 React 默认页）。

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "chore: scaffold Tauri 2 + React + TS via create-tauri-app"
```

---

### Task 2: 添加 Tailwind CSS

**Files:**
- Create: `tailwind.config.js`, `postcss.config.js`, `src/styles.css`
- Modify: `src/main.tsx`, `src/App.tsx`

- [ ] **Step 1: 安装 Tailwind**

```bash
npm install -D tailwindcss postcss autoprefixer
npx tailwindcss init -p
```

- [ ] **Step 2: 配 `tailwind.config.js`**

```js
/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: { extend: {} },
  plugins: [],
}
```

- [ ] **Step 3: 创建 `src/styles.css`**

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

:root {
  --sticky-bg: #FFDC96;
  --sticky-fg: #3a2e10;
  --sticky-opacity: 0.85;
}

html, body, #root {
  height: 100%;
  margin: 0;
  background: transparent;
  color: var(--sticky-fg);
  font-family: -apple-system, BlinkMacSystemFont, "SF Pro Text", sans-serif;
  font-size: 14px;
  overflow: hidden;
}
```

- [ ] **Step 4: 在 `src/main.tsx` 引入 styles**

```tsx
import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./styles.css";

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
```

- [ ] **Step 5: 简化 `src/App.tsx` 验证 Tailwind 生效**

```tsx
export default function App() {
  return (
    <div className="h-screen bg-yellow-200/85 backdrop-blur-md p-3 text-sm">
      <div className="text-xs opacity-60">Floaty</div>
      <div className="mt-2">Hello, sticky world.</div>
    </div>
  );
}
```

- [ ] **Step 6: `npm run tauri dev` 验证**

Expected: 窗口透明 + 黄色半透明背景 + "Hello, sticky world." 文字。

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "chore: add Tailwind CSS with base theme variables"
```

---

### Task 3: 添加 Rust 后端依赖（sqlx, ulid, tokio, anyhow, serde）

**Files:**
- Modify: `src-tauri/Cargo.toml`

- [ ] **Step 1: 编辑 `src-tauri/Cargo.toml`，加入依赖**

在 `[dependencies]` 段加入：

```toml
sqlx = { version = "0.8", features = ["runtime-tokio", "sqlite", "macros", "migrate"] }
tokio = { version = "1", features = ["rt-multi-thread", "macros", "sync", "time"] }
ulid = "1.1"
anyhow = "1"
thiserror = "1"
chrono = { version = "0.4", features = ["serde"] }
```

并确保 `[build-dependencies]` 已有 `tauri-build`，`[dependencies]` 已有 `tauri`、`serde`、`serde_json`（脚手架已生成）。

- [ ] **Step 2: 编译验证**

```bash
cd src-tauri
cargo build
cd ..
```

Expected: 编译成功（首次会下载很多 crate，需几分钟）。

- [ ] **Step 3: Commit**

```bash
git add src-tauri/Cargo.toml src-tauri/Cargo.lock
git commit -m "chore: add sqlx, ulid, tokio, anyhow, chrono deps"
```

---

### Task 4: 配置前端测试框架 (Vitest)

**Files:**
- Create: `vitest.config.ts`
- Modify: `package.json`

- [ ] **Step 1: 安装 vitest + jsdom**

```bash
npm install -D vitest @vitest/ui jsdom @testing-library/react @testing-library/jest-dom
```

- [ ] **Step 2: 创建 `vitest.config.ts`**

```ts
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/test-setup.ts"],
  },
});
```

- [ ] **Step 3: 创建 `src/test-setup.ts`**

```ts
import "@testing-library/jest-dom/vitest";
```

- [ ] **Step 4: 在 `package.json` 的 `scripts` 加入**

```json
"test": "vitest run",
"test:watch": "vitest"
```

- [ ] **Step 5: 写一个 smoke test 验证框架**

Create `src/smoke.test.ts`:

```ts
import { describe, it, expect } from "vitest";

describe("smoke", () => {
  it("vitest works", () => {
    expect(1 + 1).toBe(2);
  });
});
```

- [ ] **Step 6: 跑测试**

```bash
npm test
```

Expected: 1 passed.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "test: add vitest with jsdom + testing-library"
```

---

## Part B: 数据库基础

### Task 5: SQLite 连接池 + migration runner

**Files:**
- Create: `src-tauri/src/db/mod.rs`, `src-tauri/src/db/migrations.rs`, `src-tauri/migrations/0001_init.sql`
- Modify: `src-tauri/src/main.rs`, `src-tauri/Cargo.toml`

- [ ] **Step 1: 创建 migration SQL 文件**

`src-tauri/migrations/0001_init.sql`:

```sql
CREATE TABLE stickies (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL DEFAULT '',
  x INTEGER,
  y INTEGER,
  w INTEGER NOT NULL DEFAULT 320,
  h INTEGER NOT NULL DEFAULT 420,
  pinned INTEGER NOT NULL DEFAULT 0,
  bg_color TEXT NOT NULL DEFAULT '#FFDC96',
  opacity REAL NOT NULL DEFAULT 0.85,
  font_size INTEGER NOT NULL DEFAULT 14,
  font_color TEXT,
  z_order INTEGER NOT NULL DEFAULT 0,
  hidden INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE items (
  id TEXT PRIMARY KEY,
  sticky_id TEXT NOT NULL REFERENCES stickies(id) ON DELETE CASCADE,
  content_md TEXT NOT NULL,
  due_at INTEGER,
  completed_at INTEGER,
  sort_order INTEGER NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE INDEX idx_items_sticky_sort ON items(sticky_id, sort_order);
CREATE INDEX idx_items_due ON items(due_at) WHERE completed_at IS NULL;
```

- [ ] **Step 2: 创建 `src-tauri/src/db/mod.rs`**

```rust
use sqlx::{sqlite::SqlitePoolOptions, SqlitePool};
use std::path::PathBuf;

pub mod migrations;
pub mod stickies;
pub mod items;

pub type Db = SqlitePool;

pub async fn init(data_dir: PathBuf) -> anyhow::Result<Db> {
    std::fs::create_dir_all(&data_dir)?;
    let db_path = data_dir.join("floaty.db");
    let url = format!("sqlite://{}?mode=rwc", db_path.display());
    let pool = SqlitePoolOptions::new()
        .max_connections(4)
        .connect(&url)
        .await?;
    migrations::run(&pool).await?;
    Ok(pool)
}
```

- [ ] **Step 3: 创建 `src-tauri/src/db/migrations.rs`**

```rust
use sqlx::SqlitePool;

static MIGRATIONS: &[(&str, &str)] = &[
    ("0001_init", include_str!("../../migrations/0001_init.sql")),
];

pub async fn run(pool: &SqlitePool) -> anyhow::Result<()> {
    sqlx::query(
        "CREATE TABLE IF NOT EXISTS _migrations (
            name TEXT PRIMARY KEY,
            applied_at INTEGER NOT NULL
        )",
    )
    .execute(pool)
    .await?;

    for (name, sql) in MIGRATIONS {
        let exists: Option<(String,)> =
            sqlx::query_as("SELECT name FROM _migrations WHERE name = ?")
                .bind(name)
                .fetch_optional(pool)
                .await?;
        if exists.is_some() {
            continue;
        }
        let mut tx = pool.begin().await?;
        sqlx::query(sql).execute(&mut *tx).await?;
        sqlx::query("INSERT INTO _migrations (name, applied_at) VALUES (?, ?)")
            .bind(name)
            .bind(chrono::Utc::now().timestamp_millis())
            .execute(&mut *tx)
            .await?;
        tx.commit().await?;
    }
    Ok(())
}
```

- [ ] **Step 4: 在 `src-tauri/src/db/stickies.rs` 留空占位（下一任务填）**

```rust
// repo for stickies — implemented in Task 7
```

同样 `src-tauri/src/db/items.rs`：

```rust
// repo for items — implemented in Task 8
```

- [ ] **Step 5: 改 `src-tauri/src/main.rs` 初始化 DB 并放到 Tauri state**

```rust
#![cfg_attr(not(debug_assertions), windows_subsystem = "windows")]

mod db;

use tauri::Manager;

#[tokio::main]
async fn main() {
    tauri::Builder::default()
        .setup(|app| {
            let handle = app.handle().clone();
            tauri::async_runtime::spawn(async move {
                let data_dir = handle
                    .path()
                    .app_data_dir()
                    .expect("app_data_dir available");
                let pool = db::init(data_dir).await.expect("db init failed");
                handle.manage(pool);
            });
            Ok(())
        })
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
```

注意：`tauri::generate_context!` 已在脚手架里。

- [ ] **Step 6: `cargo build` + 启动验证**

```bash
cd src-tauri && cargo build && cd ..
npm run tauri dev
```

Expected: 无报错，启动后 `~/Library/Application Support/app.floaty.desktop/floaty.db` 文件被创建（macOS）。

```bash
sqlite3 "$HOME/Library/Application Support/app.floaty.desktop/floaty.db" ".tables"
```

Expected: 列出 `_migrations  items  stickies`。

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat(db): SQLite pool + migration runner with initial schema"
```

---

### Task 6: 错误类型 + IPC 友好序列化

**Files:**
- Create: `src-tauri/src/error.rs`
- Modify: `src-tauri/src/main.rs`

- [ ] **Step 1: 创建 `src-tauri/src/error.rs`**

```rust
use serde::Serialize;
use thiserror::Error;

#[derive(Error, Debug)]
pub enum AppError {
    #[error("database error: {0}")]
    Db(#[from] sqlx::Error),
    #[error("not found")]
    NotFound,
    #[error("{0}")]
    Other(String),
}

impl Serialize for AppError {
    fn serialize<S>(&self, serializer: S) -> Result<S::Ok, S::Error>
    where
        S: serde::Serializer,
    {
        serializer.serialize_str(&self.to_string())
    }
}

pub type AppResult<T> = Result<T, AppError>;
```

- [ ] **Step 2: 在 `src-tauri/src/main.rs` 顶部加 `mod error;`**

```rust
mod db;
mod error;
```

- [ ] **Step 3: `cargo build`**

```bash
cd src-tauri && cargo build && cd ..
```

Expected: 成功。

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat(error): AppError type with serde for IPC"
```

---

### Task 7: Stickies repo (CRUD) + tests

**Files:**
- Modify: `src-tauri/src/db/stickies.rs`

- [ ] **Step 1: 写测试（先红）**

`src-tauri/src/db/stickies.rs`:

```rust
use serde::{Deserialize, Serialize};
use sqlx::FromRow;
use crate::db::Db;
use crate::error::AppResult;

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct Sticky {
    pub id: String,
    pub title: String,
    pub x: Option<i64>,
    pub y: Option<i64>,
    pub w: i64,
    pub h: i64,
    pub pinned: i64,
    pub bg_color: String,
    pub opacity: f64,
    pub font_size: i64,
    pub font_color: Option<String>,
    pub z_order: i64,
    pub hidden: i64,
    pub created_at: i64,
    pub updated_at: i64,
}

pub async fn create_default(db: &Db) -> AppResult<Sticky> {
    let id = ulid::Ulid::new().to_string();
    let now = chrono::Utc::now().timestamp_millis();
    sqlx::query(
        "INSERT INTO stickies (id, title, w, h, pinned, bg_color, opacity, font_size, z_order, hidden, created_at, updated_at)
         VALUES (?, '', 320, 420, 0, '#FFDC96', 0.85, 14, 0, 0, ?, ?)",
    )
    .bind(&id)
    .bind(now)
    .bind(now)
    .execute(db)
    .await?;
    get(db, &id).await
}

pub async fn get(db: &Db, id: &str) -> AppResult<Sticky> {
    let row = sqlx::query_as::<_, Sticky>("SELECT * FROM stickies WHERE id = ?")
        .bind(id)
        .fetch_optional(db)
        .await?
        .ok_or(crate::error::AppError::NotFound)?;
    Ok(row)
}

pub async fn list_visible(db: &Db) -> AppResult<Vec<Sticky>> {
    let rows = sqlx::query_as::<_, Sticky>(
        "SELECT * FROM stickies WHERE hidden = 0 ORDER BY z_order ASC",
    )
    .fetch_all(db)
    .await?;
    Ok(rows)
}

#[cfg(test)]
mod tests {
    use super::*;
    use sqlx::SqlitePool;

    async fn test_pool() -> SqlitePool {
        let pool = SqlitePool::connect("sqlite::memory:").await.unwrap();
        crate::db::migrations::run(&pool).await.unwrap();
        pool
    }

    #[tokio::test]
    async fn create_default_returns_sticky_with_defaults() {
        let pool = test_pool().await;
        let s = create_default(&pool).await.unwrap();
        assert_eq!(s.title, "");
        assert_eq!(s.w, 320);
        assert_eq!(s.h, 420);
        assert_eq!(s.bg_color, "#FFDC96");
        assert_eq!(s.opacity, 0.85);
        assert_eq!(s.hidden, 0);
        assert!(s.id.len() == 26);  // ULID
    }

    #[tokio::test]
    async fn get_returns_not_found_for_missing() {
        let pool = test_pool().await;
        let r = get(&pool, "nonexistent").await;
        assert!(matches!(r, Err(crate::error::AppError::NotFound)));
    }

    #[tokio::test]
    async fn list_visible_excludes_hidden() {
        let pool = test_pool().await;
        let a = create_default(&pool).await.unwrap();
        let _b = create_default(&pool).await.unwrap();
        sqlx::query("UPDATE stickies SET hidden = 1 WHERE id = ?")
            .bind(&a.id)
            .execute(&pool).await.unwrap();
        let visible = list_visible(&pool).await.unwrap();
        assert_eq!(visible.len(), 1);
        assert_ne!(visible[0].id, a.id);
    }
}
```

- [ ] **Step 2: 跑测试 (验证编译 + 全过)**

```bash
cd src-tauri && cargo test --lib stickies && cd ..
```

Expected: 3 passed.

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "feat(db): stickies repo with create_default/get/list_visible + tests"
```

---

### Task 8: Items repo (CRUD) + tests

**Files:**
- Modify: `src-tauri/src/db/items.rs`

- [ ] **Step 1: 实现 + 测试**

`src-tauri/src/db/items.rs`:

```rust
use serde::{Deserialize, Serialize};
use sqlx::FromRow;
use crate::db::Db;
use crate::error::AppResult;

#[derive(Debug, Clone, Serialize, Deserialize, FromRow)]
pub struct Item {
    pub id: String,
    pub sticky_id: String,
    pub content_md: String,
    pub due_at: Option<i64>,
    pub completed_at: Option<i64>,
    pub sort_order: i64,
    pub created_at: i64,
    pub updated_at: i64,
}

#[derive(Debug, Clone, Deserialize)]
pub struct ItemUpsert {
    pub id: Option<String>,           // None = 新建
    pub sticky_id: String,
    pub content_md: String,
    pub due_at: Option<i64>,
    pub sort_order: i64,
}

pub async fn list(db: &Db, sticky_id: &str) -> AppResult<Vec<Item>> {
    let rows = sqlx::query_as::<_, Item>(
        "SELECT * FROM items WHERE sticky_id = ? ORDER BY sort_order ASC",
    )
    .bind(sticky_id)
    .fetch_all(db)
    .await?;
    Ok(rows)
}

pub async fn upsert(db: &Db, input: ItemUpsert) -> AppResult<Item> {
    let now = chrono::Utc::now().timestamp_millis();
    let id = input.id.unwrap_or_else(|| ulid::Ulid::new().to_string());
    sqlx::query(
        "INSERT INTO items (id, sticky_id, content_md, due_at, sort_order, created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
            content_md = excluded.content_md,
            due_at = excluded.due_at,
            sort_order = excluded.sort_order,
            updated_at = excluded.updated_at",
    )
    .bind(&id)
    .bind(&input.sticky_id)
    .bind(&input.content_md)
    .bind(input.due_at)
    .bind(input.sort_order)
    .bind(now)
    .bind(now)
    .execute(db)
    .await?;
    get(db, &id).await
}

pub async fn get(db: &Db, id: &str) -> AppResult<Item> {
    let row = sqlx::query_as::<_, Item>("SELECT * FROM items WHERE id = ?")
        .bind(id)
        .fetch_optional(db)
        .await?
        .ok_or(crate::error::AppError::NotFound)?;
    Ok(row)
}

pub async fn toggle(db: &Db, id: &str) -> AppResult<Item> {
    let now = chrono::Utc::now().timestamp_millis();
    sqlx::query(
        "UPDATE items SET completed_at =
            CASE WHEN completed_at IS NULL THEN ? ELSE NULL END,
            updated_at = ?
         WHERE id = ?",
    )
    .bind(now)
    .bind(now)
    .bind(id)
    .execute(db)
    .await?;
    get(db, id).await
}

pub async fn delete(db: &Db, id: &str) -> AppResult<()> {
    sqlx::query("DELETE FROM items WHERE id = ?")
        .bind(id)
        .execute(db)
        .await?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::db::stickies;
    use sqlx::SqlitePool;

    async fn test_pool() -> SqlitePool {
        let pool = SqlitePool::connect("sqlite::memory:").await.unwrap();
        crate::db::migrations::run(&pool).await.unwrap();
        pool
    }

    #[tokio::test]
    async fn upsert_creates_when_id_is_none() {
        let pool = test_pool().await;
        let s = stickies::create_default(&pool).await.unwrap();
        let item = upsert(&pool, ItemUpsert {
            id: None,
            sticky_id: s.id.clone(),
            content_md: "- [ ] hello".into(),
            due_at: None,
            sort_order: 0,
        }).await.unwrap();
        assert_eq!(item.content_md, "- [ ] hello");
        assert_eq!(item.completed_at, None);
        assert_eq!(item.sort_order, 0);
    }

    #[tokio::test]
    async fn upsert_updates_when_id_exists() {
        let pool = test_pool().await;
        let s = stickies::create_default(&pool).await.unwrap();
        let i1 = upsert(&pool, ItemUpsert {
            id: None,
            sticky_id: s.id.clone(),
            content_md: "v1".into(),
            due_at: None,
            sort_order: 0,
        }).await.unwrap();
        let i2 = upsert(&pool, ItemUpsert {
            id: Some(i1.id.clone()),
            sticky_id: s.id,
            content_md: "v2".into(),
            due_at: None,
            sort_order: 0,
        }).await.unwrap();
        assert_eq!(i1.id, i2.id);
        assert_eq!(i2.content_md, "v2");
    }

    #[tokio::test]
    async fn toggle_marks_complete_then_uncomplete() {
        let pool = test_pool().await;
        let s = stickies::create_default(&pool).await.unwrap();
        let i = upsert(&pool, ItemUpsert {
            id: None, sticky_id: s.id, content_md: "x".into(),
            due_at: None, sort_order: 0,
        }).await.unwrap();
        let i = toggle(&pool, &i.id).await.unwrap();
        assert!(i.completed_at.is_some());
        let i = toggle(&pool, &i.id).await.unwrap();
        assert!(i.completed_at.is_none());
    }

    #[tokio::test]
    async fn list_returns_in_sort_order() {
        let pool = test_pool().await;
        let s = stickies::create_default(&pool).await.unwrap();
        for (i, txt) in ["c", "a", "b"].iter().enumerate() {
            upsert(&pool, ItemUpsert {
                id: None, sticky_id: s.id.clone(), content_md: txt.to_string(),
                due_at: None, sort_order: i as i64,
            }).await.unwrap();
        }
        let items = list(&pool, &s.id).await.unwrap();
        assert_eq!(items.iter().map(|i| i.content_md.as_str()).collect::<Vec<_>>(),
                   vec!["c", "a", "b"]);
    }
}
```

- [ ] **Step 2: 跑测试**

```bash
cd src-tauri && cargo test --lib items && cd ..
```

Expected: 4 passed.

- [ ] **Step 3: Commit**

```bash
git add -A
git commit -m "feat(db): items repo with upsert/list/toggle/delete + tests"
```

---

## Part C: IPC Commands

### Task 9: IPC commands for stickies

**Files:**
- Create: `src-tauri/src/commands/mod.rs`, `src-tauri/src/commands/stickies.rs`
- Modify: `src-tauri/src/main.rs`

- [ ] **Step 1: 创建 `src-tauri/src/commands/mod.rs`**

```rust
pub mod stickies;
pub mod items;
```

- [ ] **Step 2: 创建 `src-tauri/src/commands/stickies.rs`**

```rust
use crate::db::{self, stickies::Sticky, Db};
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
```

- [ ] **Step 3: 在 `src-tauri/src/main.rs` 注册 commands**

修改：

```rust
mod commands;
mod db;
mod error;

use tauri::Manager;

#[tokio::main]
async fn main() {
    tauri::Builder::default()
        .setup(|app| {
            let handle = app.handle().clone();
            tauri::async_runtime::block_on(async move {
                let data_dir = handle.path().app_data_dir().expect("app_data_dir");
                let pool = db::init(data_dir).await.expect("db init");
                handle.manage(pool);
            });
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            commands::stickies::get_or_create_default_sticky,
            commands::stickies::list_stickies,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
```

注意：把之前的 `tauri::async_runtime::spawn` 改为 `block_on`，确保 DB 在窗口加载前就 ready。

- [ ] **Step 4: 编译验证**

```bash
cd src-tauri && cargo build && cd ..
```

Expected: 成功。

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(ipc): get_or_create_default_sticky + list_stickies commands"
```

---

### Task 10: IPC commands for items

**Files:**
- Create: `src-tauri/src/commands/items.rs`
- Modify: `src-tauri/src/main.rs`

- [ ] **Step 1: 创建 `src-tauri/src/commands/items.rs`**

```rust
use crate::db::{self, items::{Item, ItemUpsert}, Db};
use crate::error::AppResult;
use tauri::State;

#[tauri::command]
pub async fn list_items(db: State<'_, Db>, sticky_id: String) -> AppResult<Vec<Item>> {
    db::items::list(&db, &sticky_id).await
}

#[tauri::command]
pub async fn upsert_item(db: State<'_, Db>, input: ItemUpsert) -> AppResult<Item> {
    db::items::upsert(&db, input).await
}

#[tauri::command]
pub async fn toggle_item(db: State<'_, Db>, id: String) -> AppResult<Item> {
    db::items::toggle(&db, &id).await
}

#[tauri::command]
pub async fn delete_item(db: State<'_, Db>, id: String) -> AppResult<()> {
    db::items::delete(&db, &id).await
}
```

- [ ] **Step 2: 在 `main.rs` 的 `invoke_handler` 加上四个新 command**

```rust
.invoke_handler(tauri::generate_handler![
    commands::stickies::get_or_create_default_sticky,
    commands::stickies::list_stickies,
    commands::items::list_items,
    commands::items::upsert_item,
    commands::items::toggle_item,
    commands::items::delete_item,
])
```

- [ ] **Step 3: `cargo build`**

```bash
cd src-tauri && cargo build && cd ..
```

Expected: 成功。

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat(ipc): list/upsert/toggle/delete item commands"
```

---

## Part D: 前端 IPC + Editor

### Task 11: 前端 IPC 客户端封装

**Files:**
- Create: `src/ipc/types.ts`, `src/ipc/client.ts`

- [ ] **Step 1: 创建 `src/ipc/types.ts`**

```ts
export interface Sticky {
  id: string;
  title: string;
  x: number | null;
  y: number | null;
  w: number;
  h: number;
  pinned: number;
  bg_color: string;
  opacity: number;
  font_size: number;
  font_color: string | null;
  z_order: number;
  hidden: number;
  created_at: number;
  updated_at: number;
}

export interface Item {
  id: string;
  sticky_id: string;
  content_md: string;
  due_at: number | null;
  completed_at: number | null;
  sort_order: number;
  created_at: number;
  updated_at: number;
}

export interface ItemUpsert {
  id: string | null;
  sticky_id: string;
  content_md: string;
  due_at: number | null;
  sort_order: number;
}
```

- [ ] **Step 2: 创建 `src/ipc/client.ts`**

```ts
import { invoke } from "@tauri-apps/api/core";
import type { Sticky, Item, ItemUpsert } from "./types";

export const ipc = {
  getOrCreateDefaultSticky: (): Promise<Sticky> =>
    invoke("get_or_create_default_sticky"),

  listStickies: (): Promise<Sticky[]> =>
    invoke("list_stickies"),

  listItems: (stickyId: string): Promise<Item[]> =>
    invoke("list_items", { stickyId }),

  upsertItem: (input: ItemUpsert): Promise<Item> =>
    invoke("upsert_item", { input }),

  toggleItem: (id: string): Promise<Item> =>
    invoke("toggle_item", { id }),

  deleteItem: (id: string): Promise<void> =>
    invoke("delete_item", { id }),
};
```

注意：Tauri 的 invoke 在 Rust 端 snake_case 参数对应 JS 端 camelCase（自动转换）。

- [ ] **Step 3: 验证类型编译**

```bash
npx tsc --noEmit
```

Expected: 0 errors（如果 `@tauri-apps/api` 路径报错，确认 `package.json` 里有它；脚手架默认带）。

- [ ] **Step 4: Commit**

```bash
git add -A
git commit -m "feat(ipc-client): typed wrapper for Tauri commands"
```

---

### Task 12: TipTap 编辑器（任务列表 + markdown 序列化）

**Files:**
- Create: `src/editor/Editor.tsx`, `src/editor/markdown.ts`, `src/editor/markdown.test.ts`
- Modify: `package.json`

- [ ] **Step 1: 安装 TipTap**

```bash
npm install @tiptap/react @tiptap/pm @tiptap/starter-kit @tiptap/extension-task-list @tiptap/extension-task-item @tiptap/extension-link
```

- [ ] **Step 2: 写 markdown serializer/deserializer 的失败测试**

`src/editor/markdown.test.ts`:

```ts
import { describe, it, expect } from "vitest";
import { docToMarkdown, markdownToDoc } from "./markdown";

describe("markdown round-trip", () => {
  it("serializes a single unchecked todo", () => {
    const doc = {
      type: "doc",
      content: [{
        type: "taskList",
        content: [{
          type: "taskItem",
          attrs: { checked: false },
          content: [{ type: "paragraph", content: [{ type: "text", text: "buy milk" }] }],
        }],
      }],
    };
    expect(docToMarkdown(doc)).toBe("- [ ] buy milk");
  });

  it("serializes a checked todo", () => {
    const doc = {
      type: "doc",
      content: [{
        type: "taskList",
        content: [{
          type: "taskItem",
          attrs: { checked: true },
          content: [{ type: "paragraph", content: [{ type: "text", text: "done" }] }],
        }],
      }],
    };
    expect(docToMarkdown(doc)).toBe("- [x] done");
  });

  it("parses markdown back into doc", () => {
    const md = "- [ ] buy milk\n- [x] done";
    const doc = markdownToDoc(md);
    expect(doc.content?.[0].type).toBe("taskList");
    expect(doc.content?.[0].content).toHaveLength(2);
    expect(doc.content?.[0].content?.[0].attrs?.checked).toBe(false);
    expect(doc.content?.[0].content?.[1].attrs?.checked).toBe(true);
  });

  it("round-trips a paragraph + bold + link", () => {
    const md = "Hello **world** and [tau](https://tauri.app)";
    const doc = markdownToDoc(md);
    expect(docToMarkdown(doc)).toBe(md);
  });

  it("round-trips a heading", () => {
    const md = "# Title";
    expect(docToMarkdown(markdownToDoc(md))).toBe(md);
  });
});
```

- [ ] **Step 3: 跑测试验证失败**

```bash
npm test
```

Expected: 5 failures (`docToMarkdown is not defined`).

- [ ] **Step 4: 实现 `src/editor/markdown.ts`**

为了减少自研负担，使用 ProseMirror schema 直接序列化。Phase 1 只支持子集：`taskList/taskItem`、`paragraph`、`heading`、`text` (mark: `bold`, `italic`, `link`)。

```ts
type ProseNode = {
  type: string;
  attrs?: Record<string, any>;
  content?: ProseNode[];
  text?: string;
  marks?: { type: string; attrs?: Record<string, any> }[];
};

type ProseDoc = { type: "doc"; content?: ProseNode[] };

export function docToMarkdown(doc: ProseNode | ProseDoc): string {
  if (!("content" in doc) || !doc.content) return "";
  return doc.content.map(serializeBlock).join("\n");
}

function serializeBlock(node: ProseNode): string {
  switch (node.type) {
    case "heading": {
      const level = node.attrs?.level ?? 1;
      return "#".repeat(level) + " " + serializeInline(node.content ?? []);
    }
    case "paragraph":
      return serializeInline(node.content ?? []);
    case "taskList":
      return (node.content ?? []).map(serializeTaskItem).join("\n");
    default:
      return serializeInline(node.content ?? []);
  }
}

function serializeTaskItem(node: ProseNode): string {
  const checked = node.attrs?.checked ? "x" : " ";
  const inner = (node.content ?? []).map(serializeBlock).join(" ");
  return `- [${checked}] ${inner}`;
}

function serializeInline(nodes: ProseNode[]): string {
  return nodes.map((n) => {
    if (n.type !== "text") return "";
    let text = n.text ?? "";
    const marks = n.marks ?? [];
    for (const m of marks) {
      if (m.type === "bold") text = `**${text}**`;
      else if (m.type === "italic") text = `*${text}*`;
      else if (m.type === "link") text = `[${text}](${m.attrs?.href ?? ""})`;
    }
    return text;
  }).join("");
}

export function markdownToDoc(md: string): ProseDoc {
  const lines = md.split("\n");
  const blocks: ProseNode[] = [];
  let pendingTasks: ProseNode[] = [];

  const flushTasks = () => {
    if (pendingTasks.length > 0) {
      blocks.push({ type: "taskList", content: pendingTasks });
      pendingTasks = [];
    }
  };

  for (const line of lines) {
    const taskMatch = line.match(/^- \[( |x)\] (.*)$/);
    if (taskMatch) {
      pendingTasks.push({
        type: "taskItem",
        attrs: { checked: taskMatch[1] === "x" },
        content: [{ type: "paragraph", content: parseInline(taskMatch[2]) }],
      });
      continue;
    }
    flushTasks();
    const headingMatch = line.match(/^(#{1,6}) (.*)$/);
    if (headingMatch) {
      blocks.push({
        type: "heading",
        attrs: { level: headingMatch[1].length },
        content: parseInline(headingMatch[2]),
      });
      continue;
    }
    if (line.trim() === "") continue;
    blocks.push({ type: "paragraph", content: parseInline(line) });
  }
  flushTasks();

  return { type: "doc", content: blocks };
}

function parseInline(text: string): ProseNode[] {
  // 简单线性扫描：**bold**, *italic*, [text](url)
  const tokens: ProseNode[] = [];
  let i = 0;
  while (i < text.length) {
    if (text.startsWith("**", i)) {
      const end = text.indexOf("**", i + 2);
      if (end > i + 2) {
        tokens.push({ type: "text", text: text.slice(i + 2, end), marks: [{ type: "bold" }] });
        i = end + 2;
        continue;
      }
    }
    if (text[i] === "*") {
      const end = text.indexOf("*", i + 1);
      if (end > i + 1) {
        tokens.push({ type: "text", text: text.slice(i + 1, end), marks: [{ type: "italic" }] });
        i = end + 1;
        continue;
      }
    }
    if (text[i] === "[") {
      const close = text.indexOf("](", i);
      const end = close > 0 ? text.indexOf(")", close) : -1;
      if (close > 0 && end > 0) {
        const linkText = text.slice(i + 1, close);
        const href = text.slice(close + 2, end);
        tokens.push({ type: "text", text: linkText, marks: [{ type: "link", attrs: { href } }] });
        i = end + 1;
        continue;
      }
    }
    // 累积普通字符到下一个特殊字符
    let j = i;
    while (j < text.length && !"*[".includes(text[j])) j++;
    if (j === i) j = i + 1;
    tokens.push({ type: "text", text: text.slice(i, j) });
    i = j;
  }
  return tokens;
}
```

- [ ] **Step 5: 跑测试，验证全过**

```bash
npm test
```

Expected: 6 passed (1 smoke + 5 markdown).

- [ ] **Step 6: 创建 `src/editor/Editor.tsx`**

```tsx
import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import TaskList from "@tiptap/extension-task-list";
import TaskItem from "@tiptap/extension-task-item";
import Link from "@tiptap/extension-link";
import { useEffect } from "react";
import { docToMarkdown, markdownToDoc } from "./markdown";

interface EditorProps {
  initialMarkdown: string;
  onChange: (markdown: string) => void;
}

export function Editor({ initialMarkdown, onChange }: EditorProps) {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({ heading: { levels: [1, 2, 3] } }),
      TaskList,
      TaskItem.configure({ nested: false }),
      Link.configure({ openOnClick: false }),
    ],
    content: markdownToDoc(initialMarkdown),
    onUpdate: ({ editor }) => {
      const md = docToMarkdown(editor.getJSON() as any);
      onChange(md);
    },
  });

  useEffect(() => () => editor?.destroy(), [editor]);

  return <EditorContent editor={editor} className="prose prose-sm max-w-none focus:outline-none" />;
}
```

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat(editor): TipTap setup with markdown round-trip + tests"
```

---

### Task 13: useStickyData hook + StickyPage 整合

**Files:**
- Create: `src/sticky/StickyPage.tsx`, `src/sticky/useStickyData.ts`
- Modify: `src/App.tsx`

- [ ] **Step 1: 创建 `src/sticky/useStickyData.ts`**

```ts
import { useEffect, useState, useRef, useCallback } from "react";
import { ipc } from "../ipc/client";
import type { Sticky } from "../ipc/types";

export function useStickyData() {
  const [sticky, setSticky] = useState<Sticky | null>(null);
  const [markdown, setMarkdown] = useState<string>("");
  const [loaded, setLoaded] = useState(false);
  const itemIdRef = useRef<string | null>(null);
  const saveTimer = useRef<number | null>(null);

  // 初始加载
  useEffect(() => {
    (async () => {
      const s = await ipc.getOrCreateDefaultSticky();
      setSticky(s);
      const items = await ipc.listItems(s.id);
      // Phase 1：把所有 items 的 content_md 拼成单个 markdown 块
      // (Phase 2 会引入 multi-item，这里先合并)
      const combined = items.map((i) => i.content_md).join("\n");
      setMarkdown(combined || "- [ ] ");
      itemIdRef.current = items[0]?.id ?? null;
      setLoaded(true);
    })();
  }, []);

  // 保存（debounce 300ms）
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

> 注：Phase 1 把整张便签当作 1 条 item 处理（"内容是一段 markdown"），简化 v1 实现。Phase 2 引入按行拆 item（用于按 todo 单独设置 due_at 和 reminder）。

- [ ] **Step 2: 创建 `src/sticky/StickyPage.tsx`**

```tsx
import { Editor } from "../editor/Editor";
import { useStickyData } from "./useStickyData";

export function StickyPage() {
  const { sticky, markdown, loaded, save } = useStickyData();

  if (!loaded || !sticky) {
    return <div className="p-3 text-xs opacity-60">Loading...</div>;
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
```

- [ ] **Step 3: 改 `src/App.tsx` 渲染 StickyPage**

```tsx
import { StickyPage } from "./sticky/StickyPage";

export default function App() {
  return <StickyPage />;
}
```

- [ ] **Step 4: 添加 TipTap 基础 CSS（让 checkbox 显示正常）**

修改 `src/styles.css`，在末尾追加：

```css
/* TipTap task list */
ul[data-type="taskList"] {
  list-style: none;
  padding: 0;
  margin: 0;
}
ul[data-type="taskList"] li {
  display: flex;
  gap: 0.5rem;
  align-items: flex-start;
  margin: 2px 0;
}
ul[data-type="taskList"] li > label {
  margin-top: 3px;
  user-select: none;
}
ul[data-type="taskList"] li > div {
  flex: 1;
}
ul[data-type="taskList"] li[data-checked="true"] > div {
  opacity: 0.5;
  text-decoration: line-through;
}
.ProseMirror:focus {
  outline: none;
}
```

- [ ] **Step 5: `npm run tauri dev`**

Expected: 窗口打开 → 显示便签 → 看到 `☐` checkbox → 可以打字、点 checkbox 切换、按回车增加新行。

- [ ] **Step 6: 端到端验证持久化**

1. 在便签里写：`- [ ] buy milk` 然后回车 `- [x] coffee`
2. 等 1 秒（让 debounce 触发）
3. `Ctrl+C` 关闭 app
4. 重新 `npm run tauri dev`
5. Expected: 上面两条 todo 还在

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat(sticky): single-sticky page with editor + IPC persistence"
```

---

## Part E: 收尾

### Task 14: README + dev 指南

**Files:**
- Create: `README.md`

- [ ] **Step 1: 写 `README.md`**

```markdown
# Floaty

macOS 桌面便签式 todo 工具。每个清单一个独立浮动窗口，markdown WYSIWYG，时间紧急度配色，提醒。

**当前进度：Phase 1（单便签 MVP）**

## 开发

```bash
npm install
npm run tauri dev      # 启动桌面 app
npm test               # 跑前端测试
cd src-tauri && cargo test --lib && cd ..  # 跑后端测试
```

数据存储位置（macOS）：`~/Library/Application Support/app.floaty.desktop/floaty.db`

## 设计文档

- Spec: `docs/superpowers/specs/2026-04-17-floaty-design.md`
- Phase 1 plan: `docs/superpowers/plans/2026-04-17-floaty-phase-1-foundation.md`
```

- [ ] **Step 2: Commit**

```bash
git add README.md
git commit -m "docs: add README with dev quickstart"
```

---

### Task 15: 全量回归

- [ ] **Step 1: 跑所有测试**

```bash
npm test
cd src-tauri && cargo test --lib && cd ..
```

Expected: 前端 6 passed，后端 7 passed (3 stickies + 4 items)。

- [ ] **Step 2: 端到端 smoke**

```bash
npm run tauri dev
```

清单：
- [ ] 应用启动 → 透明无边框窗口 (320×420) 出现
- [ ] 窗口顶部显示 "📋 Floaty"，下方编辑区显示 `☐` 空 checkbox
- [ ] 可以打字
- [ ] 输入 `- [ ] task1` 回车，再输入 `- [x] task2`，渲染为两个 checkbox（一空一勾）
- [ ] 关闭 app 重启，内容保留
- [ ] 拖动顶部条可以移动窗口（`data-tauri-drag-region` 生效）

- [ ] **Step 3: 若全过，最终 commit**

```bash
git status   # 应该是 clean
git log --oneline
```

---

## Phase 1 完成标志

✅ 工程脚手架就位（Tauri + React + Tailwind + Vitest + sqlx）
✅ SQLite 持久化 + migration 系统
✅ Stickies + Items repo + 单元测试
✅ IPC commands：CRUD for sticky + items
✅ TipTap 编辑器 + markdown 往返
✅ 单便签可编辑、可勾选、可重启恢复
✅ README 文档

**未做（留给 Phase 2+）**：多便签、菜单栏入口、pin、自定义颜色 UI、@ 时间选择器、提醒系统、全局快捷键。

---

## Self-Review

### 1. Spec coverage（针对 Phase 1 范围）

| Spec 段落 | Plan 任务 |
|----------|-----------|
| 3.1 多便签窗口 | Phase 2（明确未做） |
| 3.2 菜单栏入口 | Phase 2 |
| 3.3 单便签内部 (titlebar / editor) | Task 13 |
| 3.4 时间紧急度 | Phase 4 |
| 3.5 提醒 | Phase 5 |
| 3.6 自定义外观 | Phase 3 |
| 3.7 快捷键 | Phase 6 |
| 4.2 模块划分 | Tasks 5-13（创建 src/, src-tauri/ 完整结构） |
| 4.3 数据模型 | Task 5 (migration `0001_init.sql` 含 stickies + items；reminders 表 Phase 5 加) |
| 4.4 IPC commands | Tasks 9-10（部分：v1 子集；其余 phase 加） |
| 8 测试策略 | Tasks 4, 7, 8, 12 |
| 9 项目目录结构 | Tasks 1-13 完整建出 |

Phase 1 故意只覆盖 spec 子集，符合渐进式交付。reminders 表的 schema 在 Phase 5 加 migration，避免 Phase 1 有死表。

### 2. Placeholder scan

- 无 "TBD"、"TODO"、"implement later"
- 每个 step 都有具体代码或具体命令
- 每个测试都有完整断言

### 3. Type consistency

- `Sticky`/`Item`/`ItemUpsert` 在 Rust (`db/stickies.rs`、`db/items.rs`) 与 TypeScript (`ipc/types.ts`) 字段名一致（snake_case 两端都用，避免转换 bug）
- IPC command 名称：Rust 的 `get_or_create_default_sticky` ↔ TS 调用 `invoke("get_or_create_default_sticky")` 一致
- Tauri 自动 camelCase ↔ snake_case 参数转换：`stickyId` (TS) → `sticky_id` (Rust)，`input` 不转换，已在 Task 11 注释说明
- `docToMarkdown` / `markdownToDoc` 在 Task 12 前后引用一致
