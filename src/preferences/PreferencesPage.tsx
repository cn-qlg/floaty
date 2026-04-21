import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { enable, disable, isEnabled } from "@tauri-apps/plugin-autostart";
import { ipc } from "../ipc/client";
import { kbd } from "../platform";

interface Stats {
  stickies: number;
  items: number;
  pending_reminders: number;
}

export function PreferencesPage() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [dataDir, setDataDir] = useState<string>("");
  const [autostart, setAutostart] = useState<boolean>(false);
  const [globalEnabled, setGlobalEnabled] = useState<boolean>(true);
  const [toolbarsEnabled, setToolbarsEnabled] = useState<boolean>(true);

  useEffect(() => {
    (async () => {
      try {
        const [s, d, a, g, t] = await Promise.all([
          invoke<Stats>("get_stats"),
          invoke<string>("get_data_dir"),
          isEnabled(),
          invoke<string | null>("get_setting", { key: "global_shortcut_enabled" }),
          invoke<string | null>("get_setting", { key: "format_toolbars_enabled" }),
        ]);
        setStats(s);
        setDataDir(d);
        setAutostart(a);
        setGlobalEnabled(g !== "false");
        setToolbarsEnabled(t !== "false");
      } catch (err) {
        console.error("[floaty] preferences load failed:", err);
      }
    })();
  }, []);

  const toggleGlobal = async (next: boolean) => {
    try {
      await invoke("set_setting", {
        key: "global_shortcut_enabled",
        value: next ? "true" : "false",
      });
      setGlobalEnabled(next);
    } catch (err) {
      console.error("[floaty] toggle global shortcut failed:", err);
    }
  };

  const toggleToolbars = async (next: boolean) => {
    try {
      await invoke("set_setting", {
        key: "format_toolbars_enabled",
        value: next ? "true" : "false",
      });
      setToolbarsEnabled(next);
    } catch (err) {
      console.error("[floaty] toggle toolbars failed:", err);
    }
  };

  const toggleAutostart = async (next: boolean) => {
    try {
      if (next) await enable();
      else await disable();
      setAutostart(next);
    } catch (err) {
      console.error("[floaty] toggle autostart failed:", err);
    }
  };

  const openDataDir = async () => {
    try {
      await invoke("plugin:opener|open_path", { path: dataDir });
    } catch {
      // 兜底：打开 file:// URL
      try {
        await invoke("plugin:opener|open_url", { url: `file://${dataDir}` });
      } catch (err) {
        console.error("[floaty] open data dir failed:", err);
      }
    }
  };

  const newSticky = async () => {
    try {
      await ipc.newStickyWindow();
    } catch (err) {
      console.error("[floaty] new sticky failed:", err);
    }
  };

  return (
    <div className="h-screen flex flex-col bg-white text-sm" style={{ color: "#333" }}>
      <div className="px-4 py-3 border-b border-black/5">
        <div className="font-semibold text-base">Floaty</div>
        <div className="text-xs opacity-60 mt-0.5">macOS 桌面便签式 todo</div>
      </div>

      <div className="flex-1 overflow-auto p-4 space-y-4">
        <section>
          <div className="text-[10px] uppercase tracking-wider opacity-60 mb-1.5">统计</div>
          <div className="grid grid-cols-3 gap-2">
            <Stat label="便签" value={stats?.stickies ?? "-"} />
            <Stat label="Todo 条数" value={stats?.items ?? "-"} />
            <Stat label="待触发提醒" value={stats?.pending_reminders ?? "-"} />
          </div>
        </section>

        <section>
          <div className="text-[10px] uppercase tracking-wider opacity-60 mb-1.5">数据目录</div>
          <div className="text-[11px] font-mono break-all p-2 bg-black/5 rounded">{dataDir}</div>
          <button
            className="mt-2 text-xs px-3 h-7 rounded border border-black/10 hover:bg-black/5"
            onClick={openDataDir}
          >
            在 Finder 中显示
          </button>
        </section>

        <section>
          <div className="text-[10px] uppercase tracking-wider opacity-60 mb-1.5">启动</div>
          <label className="flex items-center gap-2 text-xs cursor-pointer">
            <input
              type="checkbox"
              checked={autostart}
              onChange={(e) => toggleAutostart(e.target.checked)}
            />
            <span>开机自动启动 Floaty（macOS LaunchAgent）</span>
          </label>
        </section>

        <section>
          <div className="text-[10px] uppercase tracking-wider opacity-60 mb-1.5">编辑器</div>
          <label className="flex items-center gap-2 text-xs cursor-pointer">
            <input
              type="checkbox"
              checked={toolbarsEnabled}
              onChange={(e) => toggleToolbars(e.target.checked)}
            />
            <span>
              显示浮动格式工具栏（选中文字的粗斜/链接 + 空行的待办/列表/标题按钮）
            </span>
          </label>
        </section>

        <section>
          <div className="text-[10px] uppercase tracking-wider opacity-60 mb-1.5">快捷键</div>
          <label className="flex items-center gap-2 text-xs cursor-pointer mb-2">
            <input
              type="checkbox"
              checked={globalEnabled}
              onChange={(e) => toggleGlobal(e.target.checked)}
            />
            <span>
              启用全局 <Kbd>{kbd(["mod", "shift", "N"])}</Kbd>（任何 app 下都能快速新建便签）
            </span>
          </label>
          <div className="text-[11px] space-y-1 opacity-85">
            <Row k={kbd(["mod", "shift", "N"])} d="全局：新建便签" />
            <Row k={kbd(["mod", "N"])} d="便签聚焦时：新建便签" />
            <Row k={kbd(["mod", "W"])} d="隐藏当前便签（不删除）" />
            <Row k={kbd(["mod", "shift", "P"])} d="切换置顶" />
            <Row k={kbd(["mod", ","])} d="打开/关闭外观设置" />
            <Row k={kbd(["mod", "backspace"])} d="删除当前便签（带确认）" />
            <Row k="@" d="编辑区：打开时间选择器" />
            <Row k={kbd(["tab"])} d="编辑区：接受时间 ghost 预览" />
          </div>
          <div className="text-[10px] opacity-50 mt-2">
            快捷键自定义功能后续版本提供。
          </div>
        </section>

        <section>
          <div className="text-[10px] uppercase tracking-wider opacity-60 mb-1.5">操作</div>
          <div className="flex gap-2">
            <button
              className="text-xs px-3 h-7 rounded border border-black/10 hover:bg-black/5"
              onClick={newSticky}
            >
              ＋ 新建便签
            </button>
          </div>
        </section>

        <section className="pt-2 border-t border-black/5">
          <div className="text-[10px] opacity-50">
            关闭所有便签后 app 仍在菜单栏常驻。从菜单栏图标随时恢复便签或新建。
          </div>
        </section>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: number | string }) {
  return (
    <div className="rounded border border-black/10 p-2 text-center">
      <div className="text-[10px] opacity-60">{label}</div>
      <div className="text-lg font-semibold">{value}</div>
    </div>
  );
}

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="font-mono text-[10px] px-1.5 py-[1px] rounded border border-black/15 bg-black/5 mx-0.5">
      {children}
    </kbd>
  );
}

function Row({ k, d }: { k: string; d: string }) {
  return (
    <div className="flex items-center justify-between">
      <span>{d}</span>
      <Kbd>{k}</Kbd>
    </div>
  );
}
