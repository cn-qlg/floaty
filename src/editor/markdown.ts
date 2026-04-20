type ProseNode = {
  type: string;
  attrs?: Record<string, any>;
  content?: ProseNode[];
  text?: string;
  marks?: { type: string; attrs?: Record<string, any> }[];
};

type ProseDoc = { type: "doc"; content?: ProseNode[] };

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
      return (node.content ?? []).map(serializeTaskItem).join("\n");
    default:
      return serializeInline(node.content ?? []);
  }
}

function serializeTaskItem(node: ProseNode): string {
  const checked = node.attrs?.checked ? "x" : " ";
  const inner = (node.content ?? []).map(serializeBlock).join(" ");
  return `- [${checked}] ${inner}`;
}

function serializeInline(nodes: ProseNode[]): string {
  return nodes.map((n) => {
    if (n.type === "dueTime") {
      const iso = n.attrs?.datetime ?? "";
      return iso ? `@due:${iso}` : "";
    }
    if (n.type !== "text") return "";
    let text = n.text ?? "";
    const marks = n.marks ?? [];
    for (const m of marks) {
      if (m.type === "bold") text = `**${text}**`;
      else if (m.type === "italic") text = `*${text}*`;
      else if (m.type === "link") text = `[${text}](${m.attrs?.href ?? ""})`;
    }
    return text;
  }).join("");
}

export function markdownToDoc(md: string): ProseDoc {
  const lines = md.split("\n");
  const blocks: ProseNode[] = [];
  let pendingTasks: ProseNode[] = [];

  const flushTasks = () => {
    if (pendingTasks.length > 0) {
      blocks.push({ type: "taskList", content: pendingTasks });
      pendingTasks = [];
    }
  };

  for (const line of lines) {
    const taskMatch = line.match(/^- \[( |x)\] (.*)$/);
    if (taskMatch) {
      pendingTasks.push({
        type: "taskItem",
        attrs: { checked: taskMatch[1] === "x" },
        content: [{ type: "paragraph", content: parseInline(taskMatch[2]) }],
      });
      continue;
    }
    flushTasks();
    const headingMatch = line.match(/^(#{1,6}) (.*)$/);
    if (headingMatch) {
      blocks.push({
        type: "heading",
        attrs: { level: headingMatch[1].length },
        content: parseInline(headingMatch[2]),
      });
      continue;
    }
    if (line.trim() === "") continue;
    blocks.push({ type: "paragraph", content: parseInline(line) });
  }
  flushTasks();

  return { type: "doc", content: blocks };
}

const DUE_RE = /@due:(\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2}))/;

function parseInline(text: string): ProseNode[] {
  const tokens: ProseNode[] = [];
  let i = 0;
  while (i < text.length) {
    if (text.startsWith("**", i)) {
      const end = text.indexOf("**", i + 2);
      if (end > i + 2) {
        tokens.push({ type: "text", text: text.slice(i + 2, end), marks: [{ type: "bold" }] });
        i = end + 2;
        continue;
      }
    }
    if (text[i] === "*") {
      const end = text.indexOf("*", i + 1);
      if (end > i + 1) {
        tokens.push({ type: "text", text: text.slice(i + 1, end), marks: [{ type: "italic" }] });
        i = end + 1;
        continue;
      }
    }
    if (text[i] === "[") {
      const close = text.indexOf("](", i);
      const end = close > 0 ? text.indexOf(")", close) : -1;
      if (close > 0 && end > 0) {
        const linkText = text.slice(i + 1, close);
        const href = text.slice(close + 2, end);
        tokens.push({ type: "text", text: linkText, marks: [{ type: "link", attrs: { href } }] });
        i = end + 1;
        continue;
      }
    }
    if (text[i] === "@") {
      const rest = text.slice(i);
      const match = rest.match(DUE_RE);
      if (match && match.index === 0) {
        tokens.push({ type: "dueTime", attrs: { datetime: match[1] } });
        i += match[0].length;
        continue;
      }
    }
    let j = i;
    while (j < text.length && !"*[@".includes(text[j])) j++;
    if (j === i) j = i + 1;
    tokens.push({ type: "text", text: text.slice(i, j) });
    i = j;
  }
  return tokens;
}
