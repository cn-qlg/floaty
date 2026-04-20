import { useEffect, useState, useRef, useCallback } from "react";
import { ipc } from "../ipc/client";
import type { Sticky } from "../ipc/types";
import { extractDues } from "../editor/markdown";

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

      // 同步 reminders：从 markdown 里提取所有 @due token
      try {
        const dues = extractDues(md);
        const entries = dues.map((d) => ({
          item_index: d.itemIndex,
          text_preview: d.preview,
          fire_at: new Date(d.iso).getTime(),
        }));
        await ipc.syncReminders(sticky.id, entries);
      } catch (err) {
        console.error("[floaty] syncReminders failed:", err);
      }
    }, 300);
  }, [sticky]);

  return { sticky, setSticky, markdown, loaded, save };
}
