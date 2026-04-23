import { useEffect, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { enable, disable, isEnabled } from "@tauri-apps/plugin-autostart";
import { check, Update } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";
import { save } from "@tauri-apps/plugin-dialog";
import { getVersion } from "@tauri-apps/api/app";
import { ipc } from "../ipc/client";
import { kbd, IS_MAC } from "../platform";

type UpdateStatus =
  | { kind: "idle" }
  | { kind: "checking" }
  | { kind: "up-to-date" }
  | { kind: "available"; update: Update }
  | { kind: "downloading"; received: number; total: number | null }
  | { kind: "installed" }
  | { kind: "error"; message: string };

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
  const [bubbleEnabled, setBubbleEnabled] = useState<boolean>(true);
  const [floatingEnabled, setFloatingEnabled] = useState<boolean>(true);
  const [currentVersion, setCurrentVersion] = useState<string>("");
  const [updateStatus, setUpdateStatus] = useState<UpdateStatus>({ kind: "idle" });
  const [backupStatus, setBackupStatus] = useState<
    | { kind: "idle" }
    | { kind: "running" }
    | { kind: "done"; path: string }
    | { kind: "error"; message: string }
  >({ kind: "idle" });

  useEffect(() => {
    (async () => {
      try {
        const [s, d, a, g, bm, fm, v] = await Promise.all([
          invoke<Stats>("get_stats"),
          invoke<string>("get_data_dir"),
          isEnabled(),
          invoke<string | null>("get_setting", { key: "global_shortcut_enabled" }),
          invoke<string | null>("get_setting", { key: "bubble_menu_enabled" }),
          invoke<string | null>("get_setting", { key: "floating_menu_enabled" }),
          getVersion(),
        ]);
        setStats(s);
        setDataDir(d);
        setAutostart(a);
        setGlobalEnabled(g !== "false");
        setBubbleEnabled(bm !== "false");
        setFloatingEnabled(fm !== "false");
        setCurrentVersion(v);
      } catch (err) {
        console.error("[floaty] preferences load failed:", err);
      }
    })();
  }, []);

  const checkForUpdate = async () => {
    setUpdateStatus({ kind: "checking" });
    try {
      const update = await check();
      if (!update) {
        setUpdateStatus({ kind: "up-to-date" });
        return;
      }
      setUpdateStatus({ kind: "available", update });
    } catch (err) {
      setUpdateStatus({
        kind: "error",
        message: err instanceof Error ? err.message : String(err),
      });
    }
  };

  const downloadAndInstall = async (update: Update) => {
    setUpdateStatus({ kind: "downloading", received: 0, total: null });
    let received = 0;
    let total: number | null = null;
    try {
      await update.downloadAndInstall((evt) => {
        if (evt.event === "Started") {
          total = evt.data.contentLength ?? null;
          setUpdateStatus({ kind: "downloading", received: 0, total });
        } else if (evt.event === "Progress") {
          received += evt.data.chunkLength;
          setUpdateStatus({ kind: "downloading", received, total });
        } else if (evt.event === "Finished") {
          setUpdateStatus({ kind: "installed" });
        }
      });
      // macOS 下 downloadAndInstall 不会自动重启，手动 relaunch
      await relaunch();
    } catch (err) {
      setUpdateStatus({
        kind: "error",
        message: err instanceof Error ? err.message : String(err),
      });
    }
  };

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

  const toggleBubble = async (next: boolean) => {
    try {
      await invoke("set_setting", { key: "bubble_menu_enabled", value: next ? "true" : "false" });
      setBubbleEnabled(next);
    } catch (err) {
      console.error("[floaty] toggle bubble failed:", err);
    }
  };

  const toggleFloating = async (next: boolean) => {
    try {
      await invoke("set_setting", { key: "floating_menu_enabled", value: next ? "true" : "false" });
      setFloatingEnabled(next);
    } catch (err) {
      console.error("[floaty] toggle floating failed:", err);
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

  const revealBackup = async (path: string) => {
    // 没有稳定跨平台的 reveal-in-dir，就打开父目录，用户自己能看到文件。
    const sep = IS_MAC ? "/" : path.includes("\\") ? "\\" : "/";
    const parent = path.substring(0, path.lastIndexOf(sep));
    try {
      await invoke("plugin:opener|open_path", { path: parent });
    } catch (err) {
      console.error("[floaty] reveal backup failed:", err);
    }
  };

  const runBackup = async () => {
    const now = new Date();
    const pad = (n: number) => String(n).padStart(2, "0");
    const stamp =
      `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}-` +
      `${pad(now.getHours())}${pad(now.getMinutes())}${pad(now.getSeconds())}`;
    const defaultName = `floaty-backup-${stamp}.db`;
    try {
      const selected = await save({
        title: "保存 Floaty 备份",
        defaultPath: defaultName,
        filters: [{ name: "SQLite Database", extensions: ["db"] }],
      });
      if (!selected) return; // 用户取消
      setBackupStatus({ kind: "running" });
      const path = await invoke<string>("backup_database", { targetPath: selected });
      setBackupStatus({ kind: "done", path });
    } catch (err) {
      setBackupStatus({
        kind: "error",
        message: err instanceof Error ? err.message : String(err),
      });
    }
  };

  const newSticky = async () => {
    try {
      await ipc.newStickyWindow();
    } catch (err) {
      console.error("[floaty] new sticky failed:", err);
    }
  };

  const openWelcome = async () => {
    try {
      await invoke("open_welcome");
    } catch (err) {
      console.error("[floaty] open welcome failed:", err);
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
          <div className="text-[10px] uppercase tracking-wider opacity-60 mb-1.5">数据目录 &amp; 备份</div>
          <div className="text-[11px] font-mono break-all p-2 bg-black/5 rounded">{dataDir}</div>
          <div className="mt-2 flex gap-2 flex-wrap">
            <button
              className="text-xs px-3 h-7 rounded border border-black/10 hover:bg-black/5"
              onClick={openDataDir}
            >
              {IS_MAC ? "在 Finder 中显示" : "在资源管理器中显示"}
            </button>
            <button
              className="text-xs px-3 h-7 rounded border border-black/10 hover:bg-black/5 disabled:opacity-50"
              onClick={runBackup}
              disabled={backupStatus.kind === "running"}
            >
              {backupStatus.kind === "running" ? "正在备份…" : "立即备份到…"}
            </button>
          </div>
          {backupStatus.kind === "done" && (
            <div className="mt-2 text-[11px] flex items-center gap-2 flex-wrap">
              <span className="opacity-70">已备份到：</span>
              <span className="font-mono break-all">{backupStatus.path}</span>
              <button
                className="text-[11px] px-2 h-6 rounded border border-black/10 hover:bg-black/5"
                onClick={() => revealBackup(backupStatus.path)}
              >
                {IS_MAC ? "在 Finder 打开" : "打开所在文件夹"}
              </button>
            </div>
          )}
          {backupStatus.kind === "error" && (
            <div className="mt-2 text-[11px] text-red-600">备份失败：{backupStatus.message}</div>
          )}
        </section>

        <section>
          <div className="text-[10px] uppercase tracking-wider opacity-60 mb-1.5">关于 &amp; 更新</div>
          <div className="text-xs mb-2">
            当前版本：<span className="font-mono">{currentVersion || "—"}</span>
          </div>
          <UpdatePanel
            status={updateStatus}
            onCheck={checkForUpdate}
            onInstall={downloadAndInstall}
          />
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
          <label className="flex items-center gap-2 text-xs cursor-pointer mb-1.5">
            <input
              type="checkbox"
              checked={bubbleEnabled}
              onChange={(e) => toggleBubble(e.target.checked)}
            />
            <span>选中文字时显示格式工具栏（粗斜 / 删除线 / 行内码 / 标题 / 链接）</span>
          </label>
          <label className="flex items-center gap-2 text-xs cursor-pointer">
            <input
              type="checkbox"
              checked={floatingEnabled}
              onChange={(e) => toggleFloating(e.target.checked)}
            />
            <span>空行时显示插入工具栏（待办 / 列表 / 有序 / 标题 / 引用）</span>
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
          <div className="flex gap-2 flex-wrap">
            <button
              className="text-xs px-3 h-7 rounded border border-black/10 hover:bg-black/5"
              onClick={newSticky}
            >
              ＋ 新建便签
            </button>
            <button
              className="text-xs px-3 h-7 rounded border border-black/10 hover:bg-black/5"
              onClick={openWelcome}
            >
              📖 打开上手指南
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

function UpdatePanel({
  status,
  onCheck,
  onInstall,
}: {
  status: UpdateStatus;
  onCheck: () => void;
  onInstall: (u: Update) => void;
}) {
  const btn =
    "text-xs px-3 h-7 rounded border border-black/10 hover:bg-black/5 disabled:opacity-50";

  if (status.kind === "idle") {
    return (
      <button className={btn} onClick={onCheck}>
        检查更新
      </button>
    );
  }
  if (status.kind === "checking") {
    return (
      <button className={btn} disabled>
        正在检查…
      </button>
    );
  }
  if (status.kind === "up-to-date") {
    return (
      <div className="flex items-center gap-2">
        <span className="text-xs opacity-70">已是最新版本</span>
        <button className={btn} onClick={onCheck}>
          再次检查
        </button>
      </div>
    );
  }
  if (status.kind === "available") {
    const u = status.update;
    return (
      <div>
        <div className="text-xs mb-1.5">
          发现新版本 <span className="font-mono">{u.version}</span>
          {u.date && (
            <span className="opacity-50 ml-1.5">{u.date.split(" ")[0]}</span>
          )}
        </div>
        {u.body && (
          <div className="text-[11px] opacity-75 whitespace-pre-wrap mb-2 p-2 bg-black/5 rounded max-h-32 overflow-auto">
            {u.body}
          </div>
        )}
        <button className={btn} onClick={() => onInstall(u)}>
          下载并安装
        </button>
      </div>
    );
  }
  if (status.kind === "downloading") {
    const pct =
      status.total && status.total > 0
        ? Math.round((status.received / status.total) * 100)
        : null;
    return (
      <div>
        <div className="text-xs mb-1">
          下载中… {pct !== null ? `${pct}%` : `${(status.received / 1024 / 1024).toFixed(1)} MB`}
        </div>
        <div className="h-1 bg-black/10 rounded overflow-hidden">
          <div
            className="h-full bg-black/40 transition-all"
            style={{ width: pct !== null ? `${pct}%` : "33%" }}
          />
        </div>
      </div>
    );
  }
  if (status.kind === "installed") {
    return <div className="text-xs opacity-70">安装完成，正在重启…</div>;
  }
  return (
    <div>
      <div className="text-xs text-red-600 mb-1.5">更新失败：{status.message}</div>
      <button className={btn} onClick={onCheck}>
        重试
      </button>
    </div>
  );
}
