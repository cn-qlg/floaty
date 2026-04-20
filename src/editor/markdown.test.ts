import { describe, it, expect } from "vitest";
import { docToMarkdown, markdownToDoc, extractDues } from "./markdown";

describe("markdown round-trip", () => {
  it("serializes a single unchecked todo", () => {
    const doc = {
      type: "doc",
      content: [{
        type: "taskList",
        content: [{
          type: "taskItem",
          attrs: { checked: false },
          content: [{ type: "paragraph", content: [{ type: "text", text: "buy milk" }] }],
        }],
      }],
    };
    expect(docToMarkdown(doc)).toBe("- [ ] buy milk");
  });

  it("serializes a checked todo", () => {
    const doc = {
      type: "doc",
      content: [{
        type: "taskList",
        content: [{
          type: "taskItem",
          attrs: { checked: true },
          content: [{ type: "paragraph", content: [{ type: "text", text: "done" }] }],
        }],
      }],
    };
    expect(docToMarkdown(doc)).toBe("- [x] done");
  });

  it("parses markdown back into doc", () => {
    const md = "- [ ] buy milk\n- [x] done";
    const doc = markdownToDoc(md);
    expect(doc.content?.[0].type).toBe("taskList");
    expect(doc.content?.[0].content).toHaveLength(2);
    expect(doc.content?.[0].content?.[0].attrs?.checked).toBe(false);
    expect(doc.content?.[0].content?.[1].attrs?.checked).toBe(true);
  });

  it("round-trips a paragraph + bold + link", () => {
    const md = "Hello **world** and [tau](https://tauri.app)";
    const doc = markdownToDoc(md);
    expect(docToMarkdown(doc)).toBe(md);
  });

  it("round-trips a heading", () => {
    const md = "# Title";
    expect(docToMarkdown(markdownToDoc(md))).toBe(md);
  });

  it("round-trips a todo with @due token", () => {
    const md = "- [ ] 写周报 @due:2026-04-20T22:00:00Z";
    const doc = markdownToDoc(md);
    const para = doc.content?.[0].content?.[0].content?.[0];
    expect(para?.content).toHaveLength(2);
    expect(para?.content?.[0].type).toBe("text");
    expect(para?.content?.[1].type).toBe("dueTime");
    expect(para?.content?.[1].attrs?.datetime).toBe("2026-04-20T22:00:00Z");
    expect(docToMarkdown(doc)).toBe(md);
  });

  it("parses multiple @due tokens in one line", () => {
    const md = "mixed @due:2026-04-20T10:00:00Z and @due:2026-04-21T15:30:00Z";
    const doc = markdownToDoc(md);
    const para = doc.content?.[0];
    const dueNodes = para?.content?.filter((n) => n.type === "dueTime") ?? [];
    expect(dueNodes).toHaveLength(2);
  });
});

describe("extractDues", () => {
  it("returns empty when no @due", () => {
    expect(extractDues("- [ ] plain todo")).toEqual([]);
  });

  it("extracts single @due with preview", () => {
    const md = "- [ ] 写周报 @due:2026-04-20T22:00:00Z";
    expect(extractDues(md)).toEqual([
      { itemIndex: 0, iso: "2026-04-20T22:00:00Z", preview: "写周报" },
    ]);
  });

  it("assigns itemIndex per non-empty line", () => {
    const md = [
      "- [ ] a @due:2026-04-20T10:00:00Z",
      "",
      "- [ ] b @due:2026-04-21T10:00:00Z",
    ].join("\n");
    const dues = extractDues(md);
    expect(dues).toHaveLength(2);
    expect(dues[0].itemIndex).toBe(0);
    expect(dues[1].itemIndex).toBe(1);
  });

  it("strips markdown decoration from preview", () => {
    const md = "- [x] **urgent** [link](http://x) @due:2026-04-20T10:00:00Z";
    expect(extractDues(md)[0].preview).toBe("urgent link");
  });
});
