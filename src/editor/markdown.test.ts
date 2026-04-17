import { describe, it, expect } from "vitest";
import { docToMarkdown, markdownToDoc } from "./markdown";

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
});
