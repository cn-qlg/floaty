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
