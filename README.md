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

数据存储位置（macOS）：`~/Library/Application Support/ai.kaito.floaty/floaty.db`

## 设计文档

- Spec: `docs/superpowers/specs/2026-04-17-floaty-design.md`
- Phase 1 plan: `docs/superpowers/plans/2026-04-17-floaty-phase-1-foundation.md`
