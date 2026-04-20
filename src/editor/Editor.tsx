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

export function Editor({ initialMarkdown, onChange }: EditorProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [picker, setPicker] = useState<{ x: number; y: number } | null>(null);

  const editor = useEditor({
    extensions: [
      StarterKit.configure({ heading: { levels: [1, 2, 3] } }),
      TaskList,
      TaskItem.configure({ nested: false }),
      Link.configure({ openOnClick: false }),
      DueTime,
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
          setPicker({ x: coords.left, y: coords.bottom + 4 });
          event.preventDefault();
          return true;
        }
        return false;
      },
    },
  });

  // 每 60s 刷新所有 due-time pill 颜色/文字
  useEffect(() => {
    if (!containerRef.current) return;
    const tick = () => {
      if (containerRef.current) refreshAllPills(containerRef.current);
    };
    tick();
    const id = window.setInterval(tick, 60000);
    return () => window.clearInterval(id);
  }, [editor]);

  // doc 内容变化后重新应用 pill 样式（新插入的节点初始没有样式）
  useEffect(() => {
    if (!editor || !containerRef.current) return;
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
    editor
      .chain()
      .focus()
      .insertContent([{ type: "dueTime", attrs: { datetime: iso } }, { type: "text", text: " " }])
      .run();
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
