import { useEditor, EditorContent } from "@tiptap/react";
import { InputRule } from "@tiptap/core";
import StarterKit from "@tiptap/starter-kit";
import TaskList from "@tiptap/extension-task-list";
import TaskItem from "@tiptap/extension-task-item";
import Link from "@tiptap/extension-link";
import { useEffect, useRef, useState } from "react";
import { docToMarkdown, markdownToDoc } from "./markdown";
import { DueTime, refreshAllPills } from "./DueTime";
import { DueTimePicker } from "./DueTimePicker";
import { parseTimeHint, type TimeHint } from "./timeHints";
import { tierLabel, tierOf } from "../theme/urgency";

/**
 * 键入 `[text](url)` + 任意字符触发 → 替换为链接化的 "text"（保留 link mark）。
 * 不用 markInputRule，因为那个只认"最后一个 capture 作为展示文本"，而我们需要
 * 第一个 capture 是文字、第二个是 URL。手写 InputRule 精确控制。
 */
const MarkdownLink = Link.extend({
  addInputRules() {
    return [
      new InputRule({
        find: /\[([^\]]+)\]\(([^)]+)\)$/,
        handler: ({ state, range, match, chain }) => {
          const [, text, url] = match;
          console.log("[floaty] link rule fired:", { text, url, range });
          if (!text || !url) return null;
          // 用 chain() 而不是直接改 state.tr —— 更符合 TipTap 约定
          chain()
            .deleteRange(range)
            .insertContent({
              type: "text",
              text,
              marks: [{ type: "link", attrs: { href: url } }],
            })
            .unsetMark("link")
            .run();
        },
      }),
    ];
  },
});

interface EditorProps {
  initialMarkdown: string;
  onChange: (markdown: string) => void;
}

type PickerState =
  | null
  | { x: number; y: number; mode: "insert" }
  | { x: number; y: number; mode: "edit"; pos: number };

interface GhostState {
  from: number;
  to: number;
  hint: TimeHint;
  x: number;
  y: number;
}

export function Editor({ initialMarkdown, onChange }: EditorProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [picker, setPicker] = useState<PickerState>(null);
  const pickerRef = useRef<PickerState>(null);
  pickerRef.current = picker;
  const [ghost, setGhost] = useState<GhostState | null>(null);
  const ghostRef = useRef<GhostState | null>(null);
  ghostRef.current = ghost;

  const editor = useEditor({
    extensions: [
      StarterKit.configure({ heading: { levels: [1, 2, 3] } }),
      TaskList,
      TaskItem.configure({ nested: false }),
      MarkdownLink.configure({ openOnClick: false }),
      DueTime.configure({
        onEdit: (pos: number, iso: string) => {
          const el = containerRef.current?.querySelector<HTMLElement>(
            `span[data-due-time][data-datetime="${iso}"]`,
          );
          const rect = el?.getBoundingClientRect();
          const x = rect ? rect.left : 20;
          const y = rect ? rect.bottom + 4 : 20;
          setPicker(clampToViewport({ x, y, mode: "edit" as const, pos }));
        },
      }),
    ],
    content: markdownToDoc(initialMarkdown),
    onUpdate: ({ editor }) => {
      const md = docToMarkdown(editor.getJSON() as any);
      onChange(md);
    },
    editorProps: {
      handleKeyDown(view, event) {
        if (event.key === "@" && !event.metaKey && !event.ctrlKey) {
          const coords = view.coordsAtPos(view.state.selection.from);
          setPicker(clampToViewport({ x: coords.left, y: coords.bottom + 4, mode: "insert" as const }));
          event.preventDefault();
          return true;
        }
        // Tab 接受 ghost 时间预览
        if (event.key === "Tab" && ghostRef.current && !pickerRef.current) {
          const g = ghostRef.current;
          acceptGhost(g);
          event.preventDefault();
          return true;
        }
        if (event.key === "Escape") {
          if (pickerRef.current) {
            setPicker(null);
            event.preventDefault();
            return true;
          }
          if (ghostRef.current) {
            setGhost(null);
            event.preventDefault();
            return true;
          }
        }
        return false;
      },
    },
  });

  // 每 60s 刷新所有 pill
  useEffect(() => {
    const tick = () => {
      if (containerRef.current) refreshAllPills(containerRef.current);
    };
    tick();
    const id = window.setInterval(tick, 60000);
    return () => window.clearInterval(id);
  }, [editor]);

  useEffect(() => {
    if (!editor) return;
    const handler = () => {
      if (containerRef.current) refreshAllPills(containerRef.current);
    };
    editor.on("update", handler);
    return () => {
      editor.off("update", handler);
    };
  }, [editor]);

  useEffect(() => () => editor?.destroy(), [editor]);

  // 每次 selection / doc update 重算 ghost 预览
  useEffect(() => {
    if (!editor) return;
    const update = () => {
      if (pickerRef.current) {
        setGhost(null);
        return;
      }
      const { state } = editor;
      const sel = state.selection;
      if (!sel.empty) {
        setGhost(null);
        return;
      }
      // 取当前 paragraph/taskItem 起点到光标的纯文本。
      // 用 $from.parent 拿到最内层块节点（paragraph），再 textBetween 0 → offset；
      // 比 $from.start() + doc.textBetween 更鲁棒（对 taskItem > paragraph 结构友好）。
      const $from = sel.$from;
      const text = $from.parent.textBetween(0, $from.parentOffset, "\n", " ");
      const hint = parseTimeHint(text);
      if (!hint) {
        setGhost(null);
        return;
      }
      // 匹配文本可以不在 cursor 尾部（"今天 24 点吃饭"）：from/to 由 hint.start/end 换算 doc 坐标
      const paraStart = $from.start();
      const from = paraStart + hint.start;
      const to = paraStart + hint.end;
      const coords = editor.view.coordsAtPos(to);
      setGhost({ from, to, hint, x: coords.left, y: coords.bottom });
    };
    editor.on("update", update);
    editor.on("selectionUpdate", update);
    update();
    return () => {
      editor.off("update", update);
      editor.off("selectionUpdate", update);
    };
  }, [editor]);

  const acceptGhost = (g: GhostState) => {
    if (!editor) return;
    const iso = g.hint.date.toISOString();
    editor
      .chain()
      .focus()
      .deleteRange({ from: g.from, to: g.to })
      .insertContent([
        { type: "dueTime", attrs: { datetime: iso } },
        { type: "text", text: " " },
      ])
      .run();
    setGhost(null);
  };

  const handlePick = (iso: string) => {
    if (!editor) return;
    const current = pickerRef.current;
    if (!current) return;

    if (current.mode === "edit") {
      // 替换原 pill 的 datetime
      editor
        .chain()
        .focus()
        .setNodeSelection(current.pos)
        .updateAttributes("dueTime", { datetime: iso })
        .run();
    } else {
      // 插入新 pill；先清掉光标前可能残留的 '@'
      const { from } = editor.state.selection;
      if (from > 0) {
        const char = editor.state.doc.textBetween(from - 1, from);
        if (char === "@") {
          editor.chain().focus().deleteRange({ from: from - 1, to: from }).run();
        }
      }
      editor
        .chain()
        .focus()
        .insertContent([{ type: "dueTime", attrs: { datetime: iso } }, { type: "text", text: " " }])
        .run();
    }
    setPicker(null);
  };

  return (
    <div ref={containerRef} className="relative">
      <EditorContent editor={editor} className="prose prose-sm max-w-none focus:outline-none" />
      {picker && (
        <DueTimePicker
          x={picker.x}
          y={picker.y}
          onPick={handlePick}
          onCancel={() => setPicker(null)}
        />
      )}
      {ghost && !picker && <GhostPreview ghost={ghost} onAccept={() => acceptGhost(ghost)} />}
    </div>
  );
}

function formatDebugTime(d: Date): string {
  const pad = (n: number) => (n < 10 ? `0${n}` : `${n}`);
  return (
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ` +
    `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`
  );
}

function GhostPreview({ ghost, onAccept }: { ghost: GhostState; onAccept: () => void }) {
  const iso = ghost.hint.date.toISOString();
  const tier = tierOf(iso);
  const label = tierLabel(tier, iso);
  const debugTime = formatDebugTime(ghost.hint.date);
  return (
    <div
      className="fixed z-40 pointer-events-auto select-none text-[10px]"
      style={{ left: ghost.x + 4, top: ghost.y - 2 }}
      onMouseDown={(e) => {
        e.preventDefault();
        onAccept();
      }}
      title="按 Tab 接受"
    >
      <span className="inline-flex items-center gap-1.5 px-1.5 py-[1px] rounded border border-dashed border-black/30 bg-white/80 text-black/60">
        <span>{label}</span>
        <span className="font-mono text-[9px] opacity-60">{debugTime}</span>
        <kbd className="px-1 rounded bg-black/10 text-[9px]">Tab</kbd>
      </span>
    </div>
  );
}

const PICKER_W = 200;
const PICKER_H = 260;

function clampToViewport<T extends { x: number; y: number }>(p: T): T {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const x = Math.max(8, Math.min(p.x, vw - PICKER_W - 8));
  const y = p.y + PICKER_H > vh - 8 ? Math.max(8, p.y - PICKER_H - 24) : p.y;
  return { ...p, x, y } as T;
}
