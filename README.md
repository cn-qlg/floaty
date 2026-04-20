# Floaty

macOS 桌面便签式 todo 工具。每个清单一个独立浮动窗口，markdown WYSIWYG，时间紧急度配色，提醒。

**当前进度：Phase 2（多便签 + 菜单栏）**

功能：
- 多便签浮动窗口（可任意拖动、resize、pin/always-on-top、自定义位置）
- macOS 菜单栏入口：新建便签、显示单张/全部隐藏便签、退出
- Markdown WYSIWYG 编辑（checkbox、标题、粗斜体、链接）
- 关闭 ≠ 删除：✕ 只隐藏，从菜单栏可批量恢复
- SQLite 本地持久化；窗口位置/大小/置顶状态自动保存

## 开发

```bash
npm install
npm run tauri dev      # 启动桌面 app
npm test               # 跑前端测试
cd src-tauri && cargo test --lib && cd ..  # 跑后端测试
```

数据存储位置（macOS）：`~/Library/Application Support/ai.kaito.floaty/floaty.db`

## 设计文档

- Spec: `docs/superpowers/specs/2026-04-17-floaty-design.md`
- Phase 1 plan: `docs/superpowers/plans/2026-04-17-floaty-phase-1-foundation.md`
- Phase 2 plan: `docs/superpowers/plans/2026-04-17-floaty-phase-2-multi-sticky.md`
