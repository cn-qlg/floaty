import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import TaskList from "@tiptap/extension-task-list";
import TaskItem from "@tiptap/extension-task-item";
import Link from "@tiptap/extension-link";
import { useEffect, useRef, useState } from "react";
import { docToMarkdown, markdownToDoc } from "./markdown";
import { DueTime, refreshAllPills } from "./DueTime";
import { DueTimePicker } from "./DueTimePicker";

interface EditorProps {
  initialMarkdown: string;
  onChange: (markdown: string) => void;
}

type PickerState =
  | null
  | { x: number; y: number; mode: "insert" }
  | { x: number; y: number; mode: "edit"; pos: number };

export function Editor({ initialMarkdown, onChange }: EditorProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [picker, setPicker] = useState<PickerState>(null);
  const pickerRef = useRef<PickerState>(null);
  pickerRef.current = picker;

  const editor = useEditor({
    extensions: [
      StarterKit.configure({ heading: { levels: [1, 2, 3] } }),
      TaskList,
      TaskItem.configure({ nested: false }),
      Link.configure({ openOnClick: false }),
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
        if (event.key === "Escape" && pickerRef.current) {
          setPicker(null);
          event.preventDefault();
          return true;
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
