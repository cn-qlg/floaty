import { useEditor, EditorContent } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import TaskList from "@tiptap/extension-task-list";
import TaskItem from "@tiptap/extension-task-item";
import Link from "@tiptap/extension-link";
import { useEffect } from "react";
import { docToMarkdown, markdownToDoc } from "./markdown";

interface EditorProps {
  initialMarkdown: string;
  onChange: (markdown: string) => void;
}

export function Editor({ initialMarkdown, onChange }: EditorProps) {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({ heading: { levels: [1, 2, 3] } }),
      TaskList,
      TaskItem.configure({ nested: false }),
      Link.configure({ openOnClick: false }),
    ],
    content: markdownToDoc(initialMarkdown),
    onUpdate: ({ editor }) => {
      const md = docToMarkdown(editor.getJSON() as any);
      onChange(md);
    },
  });

  useEffect(() => () => editor?.destroy(), [editor]);

  return <EditorContent editor={editor} className="prose prose-sm max-w-none focus:outline-none" />;
}
