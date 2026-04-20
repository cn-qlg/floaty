# Floaty

macOS 桌面便签式 todo 工具。每个清单一个独立浮动窗口，markdown WYSIWYG，时间紧急度配色，提醒。

**当前进度：Phase 1–5 全部完成（v1 MVP）**

功能：
- 多便签浮动窗口（可任意拖动、resize、pin/always-on-top、自定义位置）
- macOS 菜单栏入口：新建便签、显示单张/全部、退出；纯菜单栏 app（无 Dock 图标）
- Markdown WYSIWYG 编辑（checkbox、标题、粗斜体、链接）
- 关闭 ≠ 删除：✕ 只隐藏（offscreen hack 避免 macOS 焦点重排），菜单栏可恢复
- 便签外观自定义：背景色（8 预设 + HEX）、透明度滑块、字号 3 档、字体色自动/自定义
- `@` 截止时间：5 个快捷选项 + 自定义 datetime；彩色 pill（逾期红 / 1h 红 / 今天橙 / 本周黄 / 更晚灰）每分钟刷新；点 pill 可重新选时间
- 提醒：到期 macOS 系统通知（Tokio 后台调度器）；后端已支持 snooze（UI 待加）
- SQLite 本地持久化；所有窗口几何/样式/提醒都自动保存

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
- Phase 1: `docs/superpowers/plans/2026-04-17-floaty-phase-1-foundation.md`
- Phase 2: `docs/superpowers/plans/2026-04-17-floaty-phase-2-multi-sticky.md`
- Phase 3: `docs/superpowers/plans/2026-04-17-floaty-phase-3-customization.md`
- Phase 4: `docs/superpowers/plans/2026-04-17-floaty-phase-4-due-times.md`
- Phase 5: `docs/superpowers/plans/2026-04-17-floaty-phase-5-reminders.md`
