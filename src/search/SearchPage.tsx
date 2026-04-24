import { useEffect, useRef, useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { ipc } from "../ipc/client";

interface Hit {
  sticky_id: string;
  item_id: string;
  snippet: string;
  bg_color: string;
}

export function SearchPage() {
  const [query, setQuery] = useState("");
  const [hits, setHits] = useState<Hit[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [cursor, setCursor] = useState(0);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    const q = query.trim();
    if (!q) {
      setHits([]);
      setError(null);
      return;
    }
    let cancelled = false;
    setLoading(true);
    const timer = setTimeout(async () => {
      try {
        const rows = await invoke<Hit[]>("search_stickies", { query: q });
        if (!cancelled) {
          setHits(rows);
          setCursor(0);
          setError(null);
        }
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : String(err));
          setHits([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }, 120);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query]);

  const openHit = async (hit: Hit) => {
    try {
      await ipc.showSticky(hit.sticky_id);
    } catch (err) {
      console.error("[floaty] open from search failed:", err);
    }
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setCursor((c) => Math.min(c + 1, Math.max(hits.length - 1, 0)));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setCursor((c) => Math.max(c - 1, 0));
    } else if (e.key === "Enter") {
      e.preventDefault();
      if (hits[cursor]) openHit(hits[cursor]);
    } else if (e.key === "Escape") {
      e.preventDefault();
      setQuery("");
    }
  };

  useEffect(() => {
    if (listRef.current) {
      const el = listRef.current.querySelector<HTMLElement>(`[data-cursor="${cursor}"]`);
      el?.scrollIntoView({ block: "nearest" });
    }
  }, [cursor]);

  return (
    <div className="h-screen flex flex-col bg-white text-sm" style={{ color: "#333" }}>
      <div className="px-4 py-3 border-b border-black/10 flex items-center gap-2">
        <span className="text-base">🔍</span>
        <input
          ref={inputRef}
          type="text"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder="搜索便签内容…"
          className="flex-1 outline-none bg-transparent text-sm"
        />
        {loading && <span className="text-[10px] opacity-50">搜索中…</span>}
      </div>

      <div className="flex-1 overflow-auto" ref={listRef}>
        {error && (
          <div className="p-4 text-xs text-red-600">搜索失败：{error}</div>
        )}
        {!error && hits.length === 0 && query.trim() && !loading && (
          <div className="p-8 text-center text-xs opacity-50">没有找到匹配的内容</div>
        )}
        {!error && hits.length === 0 && !query.trim() && (
          <div className="p-8 text-center text-xs opacity-50">
            <div className="mb-2">输入关键字开始搜索</div>
            <div className="text-[10px]">
              <kbd className="font-mono px-1.5 py-0.5 rounded border border-black/15 bg-black/5">↑↓</kbd> 选择
              {" · "}
              <kbd className="font-mono px-1.5 py-0.5 rounded border border-black/15 bg-black/5">Enter</kbd> 打开
              {" · "}
              <kbd className="font-mono px-1.5 py-0.5 rounded border border-black/15 bg-black/5">Esc</kbd> 清空
            </div>
          </div>
        )}
        {hits.map((h, i) => {
          const selected = i === cursor;
          return (
            <button
              key={h.item_id}
              data-cursor={i}
              onClick={() => openHit(h)}
              onMouseEnter={() => setCursor(i)}
              className={`w-full text-left px-4 py-2.5 border-b border-black/5 hover:bg-black/5 transition ${
                selected ? "bg-black/5" : ""
              }`}
            >
              <div className="flex items-center gap-2 mb-1">
                <span
                  className="inline-block w-3 h-3 rounded-sm border border-black/10"
                  style={{ backgroundColor: h.bg_color }}
                />
                <span className="text-[10px] font-mono opacity-50">
                  {h.sticky_id.slice(-8)}
                </span>
              </div>
              <div className="text-xs leading-relaxed">{renderSnippet(h.snippet)}</div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

/// 把 FTS snippet 里的 【...】 标记解析成 <mark> React 节点。
/// 纯 JSX 构造，无 innerHTML，避免 XSS。
function renderSnippet(raw: string): React.ReactNode[] {
  const parts: React.ReactNode[] = [];
  const matches = [...raw.matchAll(/【(.+?)】/g)];
  let cursor = 0;
  let key = 0;
  for (const m of matches) {
    const start = m.index ?? 0;
    if (start > cursor) {
      parts.push(<span key={key++}>{raw.slice(cursor, start)}</span>);
    }
    parts.push(
      <mark key={key++} className="bg-yellow-200 text-inherit px-0.5 rounded">
        {m[1]}
      </mark>,
    );
    cursor = start + m[0].length;
  }
  if (cursor < raw.length) {
    parts.push(<span key={key++}>{raw.slice(cursor)}</span>);
  }
  return parts;
}
