type ProseNode = {
  type: string;
  attrs?: Record<string, any>;
  content?: ProseNode[];
  text?: string;
  marks?: { type: string; attrs?: Record<string, any> }[];
};

type ProseDoc = { type: "doc"; content?: ProseNode[] };

// ============================================================
// Serialize: ProseMirror doc → markdown string
// ============================================================

export function docToMarkdown(doc: ProseNode | ProseDoc): string {
  if (!("content" in doc) || !doc.content) return "";
  return doc.content.map(serializeBlock).join("\n");
}

function serializeBlock(node: ProseNode): string {
  switch (node.type) {
    case "heading": {
      const level = node.attrs?.level ?? 1;
      return "#".repeat(level) + " " + serializeInline(node.content ?? []);
    }
    case "paragraph":
      return serializeInline(node.content ?? []);
    case "taskList":
      return (node.content ?? []).map((item) => serializeTaskItem(item, 0)).join("\n");
    case "bulletList":
      return (node.content ?? [])
        .map((li) => "- " + serializeListItemInner(li))
        .join("\n");
    case "orderedList":
      return (node.content ?? [])
        .map((li, i) => `${i + 1}. ` + serializeListItemInner(li))
        .join("\n");
    case "blockquote":
      return (node.content ?? [])
        .map(serializeBlock)
        .join("\n")
        .split("\n")
        .map((l) => "> " + l)
        .join("\n");
    case "codeBlock": {
      const lang = node.attrs?.language ?? "";
      const body = (node.content ?? []).map((c) => c.text ?? "").join("");
      return "```" + lang + "\n" + body + "\n```";
    }
    case "horizontalRule":
      return "---";
    default:
      return serializeInline(node.content ?? []);
  }
}

/// 序列化 taskItem。indent 是层级（0=顶层），每层缩进 2 个空格。
/// taskItem 的 content 通常是 [paragraph, ...optional taskList]，把段落作为本行文本，
/// 子 taskList 递归输出在下一层缩进。
function serializeTaskItem(node: ProseNode, indent: number): string {
  const pad = "  ".repeat(indent);
  const checked = node.attrs?.checked ? "x" : " ";
  const lines: string[] = [];
  let textWritten = false;
  for (const child of node.content ?? []) {
    if (child.type === "paragraph" && !textWritten) {
      lines.push(`${pad}- [${checked}] ${serializeInline(child.content ?? [])}`);
      textWritten = true;
    } else if (child.type === "taskList") {
      for (const sub of child.content ?? []) {
        lines.push(serializeTaskItem(sub, indent + 1));
      }
    } else if (child.type === "paragraph") {
      lines.push(`${pad}  ${serializeInline(child.content ?? [])}`);
    }
  }
  if (!textWritten) lines.unshift(`${pad}- [${checked}] `);
  return lines.join("\n");
}

function serializeListItemInner(li: ProseNode): string {
  // A listItem wraps one or more paragraph/block nodes; join their inline text.
  return (li.content ?? []).map(serializeBlock).join("\n  ");
}

function serializeInline(nodes: ProseNode[]): string {
  return nodes
    .map((n) => {
      if (n.type === "dueTime") {
        const iso = n.attrs?.datetime ?? "";
        return iso ? `@due:${iso}` : "";
      }
      if (n.type === "hardBreak") return "\n";
      if (n.type !== "text") return "";
      let text = n.text ?? "";
      const marks = n.marks ?? [];
      // 顺序：先 code（锁定内容），再 strike，bold，italic，最后 link 包外
      for (const m of marks) {
        if (m.type === "code") text = "`" + text + "`";
      }
      for (const m of marks) {
        if (m.type === "strike") text = `~~${text}~~`;
      }
      for (const m of marks) {
        if (m.type === "bold") text = `**${text}**`;
      }
      for (const m of marks) {
        if (m.type === "italic") text = `*${text}*`;
      }
      for (const m of marks) {
        if (m.type === "link") text = `[${text}](${m.attrs?.href ?? ""})`;
      }
      return text;
    })
    .join("");
}

// ============================================================
// Parse: markdown string → ProseMirror doc
// ============================================================

const DUE_RE = /@due:(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2}))/;
const DUE_RE_GLOBAL = /@due:(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2}))/g;

export interface DueEntry {
  itemIndex: number;
  iso: string;
  preview: string;
}

export function extractDues(md: string): DueEntry[] {
  const entries: DueEntry[] = [];
  const lines = md.split("\n");
  let nonEmptyIndex = 0;
  for (const line of lines) {
    if (line.trim() === "") continue;
    // 已完成的 todo 不再产生提醒（含缩进的子任务）
    const isCompletedTodo = /^\s*- \[x\] /.test(line);
    if (!isCompletedTodo) {
      const matches = [...line.matchAll(DUE_RE_GLOBAL)];
      if (matches.length > 0) {
        const preview = line
          .replace(DUE_RE_GLOBAL, "")
          .replace(/^\s*- \[[ x]\] /, "")
          .replace(/^#+\s+/, "")
          .replace(/\*\*(.+?)\*\*/g, "$1")
          .replace(/\*(.+?)\*/g, "$1")
          .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
          .trim()
          .slice(0, 50);
        for (const m of matches) {
          entries.push({ itemIndex: nonEmptyIndex, iso: m[1], preview });
        }
      }
    }
    nonEmptyIndex++;
  }
  return entries;
}

export function markdownToDoc(md: string): ProseDoc {
  const lines = md.split("\n");
  const blocks: ProseNode[] = [];

  let i = 0;
  while (i < lines.length) {
    const line = lines[i];

    // --- Code block (```lang\n...\n```) ---
    const fenceMatch = line.match(/^```(\S*)\s*$/);
    if (fenceMatch) {
      const lang = fenceMatch[1] || null;
      const body: string[] = [];
      i++;
      while (i < lines.length && !/^```\s*$/.test(lines[i])) {
        body.push(lines[i]);
        i++;
      }
      if (i < lines.length) i++; // 吃掉闭合 ```
      blocks.push({
        type: "codeBlock",
        attrs: lang ? { language: lang } : {},
        content: body.length ? [{ type: "text", text: body.join("\n") }] : [],
      });
      continue;
    }

    // --- Horizontal rule ---
    if (/^-{3,}\s*$/.test(line) || /^\*{3,}\s*$/.test(line)) {
      blocks.push({ type: "horizontalRule" });
      i++;
      continue;
    }

    // --- Heading ---
    const headingMatch = line.match(/^(#{1,6}) (.*)$/);
    if (headingMatch) {
      blocks.push({
        type: "heading",
        attrs: { level: headingMatch[1].length },
        content: parseInline(headingMatch[2]),
      });
      i++;
      continue;
    }

    // --- Blockquote (consecutive > lines) ---
    if (/^>\s/.test(line)) {
      const quotedLines: string[] = [];
      while (i < lines.length && /^>\s?/.test(lines[i])) {
        quotedLines.push(lines[i].replace(/^>\s?/, ""));
        i++;
      }
      const innerDoc = markdownToDoc(quotedLines.join("\n"));
      blocks.push({ type: "blockquote", content: innerDoc.content ?? [] });
      continue;
    }

    // --- Task list (- [ ] / - [x]，支持 2-空格缩进的嵌套子任务) ---
    if (/^- \[( |x)\] /.test(line)) {
      const parsed = parseTaskList(lines, i, 0);
      blocks.push({ type: "taskList", content: parsed.tasks });
      i = parsed.nextI;
      continue;
    }

    // --- Ordered list (1. / 2. ...) ---
    if (/^\d+\.\s/.test(line)) {
      const items: ProseNode[] = [];
      while (i < lines.length && /^\d+\.\s/.test(lines[i])) {
        const text = lines[i].replace(/^\d+\.\s/, "");
        items.push({
          type: "listItem",
          content: [{ type: "paragraph", content: parseInline(text) }],
        });
        i++;
      }
      blocks.push({ type: "orderedList", content: items });
      continue;
    }

    // --- Bullet list (- / * but NOT task) ---
    if (/^[-*]\s(?!\[[ x]\]\s)/.test(line)) {
      const items: ProseNode[] = [];
      while (
        i < lines.length &&
        /^[-*]\s/.test(lines[i]) &&
        !/^- \[( |x)\] /.test(lines[i])
      ) {
        const text = lines[i].replace(/^[-*]\s/, "");
        items.push({
          type: "listItem",
          content: [{ type: "paragraph", content: parseInline(text) }],
        });
        i++;
      }
      blocks.push({ type: "bulletList", content: items });
      continue;
    }

    // --- Empty line ---
    if (line.trim() === "") {
      i++;
      continue;
    }

    // --- Paragraph (default) ---
    blocks.push({ type: "paragraph", content: parseInline(line) });
    i++;
  }

  if (blocks.length === 0) {
    blocks.push({ type: "paragraph", content: [] });
  }

  return { type: "doc", content: blocks };
}

/// 递归解析 task-list（含嵌套）。从 startI 起消费所有 baseIndent 缩进的 task 行，
/// 遇到下一个比 baseIndent 更深的 - [ ] 则把它们作为前一项的子 taskList。
/// 返回 { tasks, nextI }，nextI 是已停下的下一行。
function parseTaskList(
  lines: string[],
  startI: number,
  baseIndent: number,
): { tasks: ProseNode[]; nextI: number } {
  const tasks: ProseNode[] = [];
  let i = startI;
  const taskRe = /^(\s*)- \[( |x)\] (.*)$/;
  while (i < lines.length) {
    const m = lines[i].match(taskRe);
    if (!m) break;
    const indent = m[1].length;
    if (indent !== baseIndent) break;
    const checked = m[2] === "x";
    const text = m[3];
    i++;
    const childContent: ProseNode[] = [
      { type: "paragraph", content: parseInline(text) },
    ];
    if (i < lines.length) {
      const next = lines[i].match(taskRe);
      if (next && next[1].length > indent) {
        const child = parseTaskList(lines, i, next[1].length);
        if (child.tasks.length > 0) {
          childContent.push({ type: "taskList", content: child.tasks });
          i = child.nextI;
        }
      }
    }
    tasks.push({
      type: "taskItem",
      attrs: { checked },
      content: childContent,
    });
  }
  return { tasks, nextI: i };
}

function parseInline(text: string): ProseNode[] {
  const tokens: ProseNode[] = [];
  let i = 0;

  const pushText = (s: string, marks?: ProseNode["marks"]) => {
    if (!s) return;
    if (marks && marks.length) tokens.push({ type: "text", text: s, marks });
    else tokens.push({ type: "text", text: s });
  };

  while (i < text.length) {
    // `code`
    if (text[i] === "`") {
      const end = text.indexOf("`", i + 1);
      if (end > i + 1) {
        pushText(text.slice(i + 1, end), [{ type: "code" }]);
        i = end + 1;
        continue;
      }
    }
    // ~~strike~~
    if (text.startsWith("~~", i)) {
      const end = text.indexOf("~~", i + 2);
      if (end > i + 2) {
        pushText(text.slice(i + 2, end), [{ type: "strike" }]);
        i = end + 2;
        continue;
      }
    }
    // **bold**
    if (text.startsWith("**", i)) {
      const end = text.indexOf("**", i + 2);
      if (end > i + 2) {
        pushText(text.slice(i + 2, end), [{ type: "bold" }]);
        i = end + 2;
        continue;
      }
    }
    // *italic*
    if (text[i] === "*") {
      const end = text.indexOf("*", i + 1);
      if (end > i + 1) {
        pushText(text.slice(i + 1, end), [{ type: "italic" }]);
        i = end + 1;
        continue;
      }
    }
    // [text](url)
    if (text[i] === "[") {
      const close = text.indexOf("](", i);
      const end = close > 0 ? text.indexOf(")", close) : -1;
      if (close > 0 && end > 0) {
        const linkText = text.slice(i + 1, close);
        const href = text.slice(close + 2, end);
        pushText(linkText, [{ type: "link", attrs: { href } }]);
        i = end + 1;
        continue;
      }
    }
    // @due:ISO at cursor position
    if (text.startsWith("@due:", i)) {
      const rest = text.slice(i);
      const dueM = rest.match(DUE_RE);
      if (dueM && dueM.index === 0) {
        tokens.push({ type: "dueTime", attrs: { datetime: dueM[1] } });
        i += dueM[0].length;
        continue;
      }
    }
    // Accumulate normal chars until next special
    let j = i;
    while (j < text.length && !"*[`~".includes(text[j]) && !text.startsWith("@due:", j)) j++;
    if (j === i) j = i + 1;
    pushText(text.slice(i, j));
    i = j;
  }
  return tokens;
}
