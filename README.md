# Floaty

macOS 桌面便签式 todo 工具。每张便签是独立的浮动窗口，支持 markdown 编辑、智能时间识别、到期通知、完全本地。

[![release](https://img.shields.io/github/v/release/cn-qlg/floaty?display_name=tag)](https://github.com/cn-qlg/floaty/releases/latest)

---

## 安装

[**下载最新 DMG**](https://github.com/cn-qlg/floaty/releases/latest)（目前仅 Apple Silicon）

首次运行：未签名 ad-hoc 包，macOS 会拦截，去除隔离即可：

```bash
xattr -dr com.apple.quarantine /Applications/Floaty.app
open /Applications/Floaty.app
```

或右键 App → 打开 → 再点一次"打开"。

---

## 功能

### 多便签窗口
- 每张便签是独立浮动窗口：拖动、缩放、单独置顶（always-on-top）
- 菜单栏图标为总入口（纯 tray 应用，无 Dock 图标）：
  - **新建便签** / **显示全部** / **一键排版**（4 列网格） / 各便签的显示与隐藏
  - **偏好设置**（统计 / 数据目录 / 开机自启 / 快捷键）
- 关闭 ≠ 删除：`✕` 只隐藏（offscreen 保留窗口状态，菜单栏可恢复）；"删除便签..."才彻底清理

### 编辑器（TipTap + 自研 markdown 往返）

双向无损保留的语法：

| 语法 | 示例 |
|------|------|
| 标题 | `# H1` · `## H2` · `### H3` |
| 任务清单 | `- [ ] todo` / `- [x] done` |
| 无序列表 | `- item` |
| 有序列表 | `1. first` |
| 引用 | `> quote` |
| 代码块 | `` ```lang \n ... \n ``` `` |
| 行内码 | `` `code` `` |
| 粗体/斜体/删除线 | `**bold**` / `*italic*` / `~~strike~~` |
| 水平线 | `---` |
| 链接 | `[text](url)` —— 输入自动转换，⌘+点击打开 |

### 智能时间识别 + ghost preview

输入下列模式会在文末出现**虚线 ghost pill** + 绝对时间 + `Tab` 提示；`Tab` 接受，`Esc` 取消。

- **相对**：`30分钟后` / `1 个小时后` / `3天后` / `30m` / `2h`
- **今天 / 明天 / 后天**：`今天18点` / `明天下午3点` / `后天` / `大后天`
- **时段别名**：`今天早上` (08:00) / `上午` (10:00) / `中午` (12:00) / `下午` (15:00) / `晚上` (20:00) / `今晚` (22:00)
- **星期**：`周三` / `下周一` / `星期五` / `礼拜天`
- **具体日期**：`4月25日` / `2026-05-15` / `18:30`
- **日期 + 时间可组合**：`后天下午3点` / `下周一早上8点` / `2026-05-15 14:30`
- **英文**：`tomorrow 9am` / `tomorrow 3pm`

手动选择：在任何位置按 `@` 唤起时间选择器（快捷选项 / 倒计时 / 自定义 datetime / 点 pill 可重新选）。

### 紧急度配色

每条 `@due` 根据距当前时间距离显示彩色 pill（每分钟自动刷新）：

| 档位 | 条件 | 颜色 |
|------|------|------|
| 逾期 | `due < now` | 深红 |
| 紧迫 | `≤ 1 小时` | 红 |
| 今天 | 今日内 | 橙 |
| 本周 | 7 天内 | 黄 |
| 更晚 | 超过 7 天 | 灰 |

### 提醒

- 到期 macOS 系统通知，Tokio 后台调度器
- 启动时会补发 1 小时内错过的提醒
- 后端已支持 snooze（UI 后续版本接入）

### 便签外观自定义

每张便签可独立设置：
- 背景色（8 色预设 + 自定义 HEX）
- 透明度（30%–100%）
- 字号三档（小 12 / 中 14 / 大 16）
- 字色自动（按背景明暗对比）或自定义
- 一键「重置默认」 / 「删除便签...」

### 快捷键

**全局**（任何 app 下生效，可在偏好设置关）
- `⌘⇧N` 新建便签

**便签聚焦时**
- `⌘N` 新建 · `⌘W` 隐藏 · `⌘⇧P` 切换置顶 · `⌘,` 设置面板 · `⌘⌫` 删除（带确认）

**编辑区**
- `@` 打开时间选择器
- `Tab` 接受 ghost 时间预览
- 标准 markdown 快捷键（`⌘B` / `⌘I` / `⌘Z` / `⌘⌥1..3` / `⌘⇧7` / `⌘⇧8` / `⌘⇧X` 等）

---

## 技术栈

Tauri 2 · React 18 · TypeScript · Vite · TipTap 2 · Tailwind CSS · sqlx (SQLite) · Tokio · Vitest · Rust `cargo test`

- **后端 14 个单元测试**（stickies repo / items repo / reminders repo / migrations）
- **前端 86 个单元测试**（markdown 往返 / 时间解析 / 对比度 / 紧急度）

---

## 开发

```bash
# 克隆 + 安装
git clone https://github.com/cn-qlg/floaty.git
cd floaty
npm install

# 开发
npm run tauri dev              # 启动 app（Vite + Rust watch）
npm test                        # 前端测试
cd src-tauri && cargo test --lib && cd ..   # 后端测试
npx tsc --noEmit                # 类型检查

# 打包
npm run tauri build             # 产出 .app 和 .dmg 到 src-tauri/target/release/bundle/
```

**数据位置（macOS）：**
`~/Library/Application Support/app.floaty.desktop/floaty.db`

---

## 设计文档

- [Spec](docs/superpowers/specs/2026-04-17-floaty-design.md)
- [Phase 1 — 工程脚手架 + 单便签 MVP](docs/superpowers/plans/2026-04-17-floaty-phase-1-foundation.md)
- [Phase 2 — 多便签 + 菜单栏](docs/superpowers/plans/2026-04-17-floaty-phase-2-multi-sticky.md)
- [Phase 3 — 视觉自定义](docs/superpowers/plans/2026-04-17-floaty-phase-3-customization.md)
- [Phase 4 — 时间紧急度 + @ 选择器](docs/superpowers/plans/2026-04-17-floaty-phase-4-due-times.md)
- [Phase 5 — 提醒系统](docs/superpowers/plans/2026-04-17-floaty-phase-5-reminders.md)
- [Phase 6 — 智能时间解析 + ghost preview](docs/superpowers/plans/2026-04-20-floaty-phase-6-smart-time.md)

---

## 路线图（v0.2+ 候选）

- Snooze / 标记完成 pill 右键菜单
- 提前 X 分钟提醒
- 快捷键完全自定义
- 导出 / 导入 markdown
- 自定义背景图
- Windows / Linux 构建
- iCloud / Git 同步
- Universal macOS binary（含 Intel）

---

## License

MIT
