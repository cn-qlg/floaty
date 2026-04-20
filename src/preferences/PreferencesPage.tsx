import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { ipc } from "../ipc/client";

interface Stats {
  stickies: number;
  items: number;
  pending_reminders: number;
}

export function PreferencesPage() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [dataDir, setDataDir] = useState<string>("");

  useEffect(() => {
    (async () => {
      try {
        const [s, d] = await Promise.all([
          invoke<Stats>("get_stats"),
          invoke<string>("get_data_dir"),
        ]);
        setStats(s);
        setDataDir(d);
      } catch (err) {
        console.error("[floaty] preferences load failed:", err);
      }
    })();
  }, []);

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
