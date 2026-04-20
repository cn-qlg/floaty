import { Node, mergeAttributes } from "@tiptap/core";
import { tierOf, tierColor, tierLabel } from "../theme/urgency";

/**
 * TipTap inline atom node representing a due-time pill.
 * Attr: datetime (ISO8601 string)
 *
 * Rendered via NodeView as a colored <span> pill whose bg/fg/text
 * depend on the current time-vs-due gap. The parent editor is
 * expected to periodically walk `span[data-due-time]` nodes and
 * call `refreshPillDom(el)` so the pill color updates every minute.
 */
export const DueTime = Node.create({
  name: "dueTime",
  group: "inline",
  inline: true,
  atom: true,
  selectable: true,

  addAttributes() {
    return {
      datetime: { default: null as string | null },
    };
  },

  parseHTML() {
    return [{ tag: "span[data-due-time]" }];
  },

  renderHTML({ HTMLAttributes, node }) {
    const iso = (node.attrs.datetime as string | null) ?? "";
    return [
      "span",
      mergeAttributes(
        { "data-due-time": "true", "data-datetime": iso, contenteditable: "false" },
        HTMLAttributes,
      ),
      "",
    ];
  },

  addNodeView() {
    return ({ node }) => {
      const dom = document.createElement("span");
      dom.setAttribute("data-due-time", "true");
      dom.setAttribute("data-datetime", node.attrs.datetime ?? "");
      dom.contentEditable = "false";
      refreshPillDom(dom);
      return { dom };
    };
  },
});

/**
 * Apply current urgency color + label text to a pill element, based on
 * its `data-datetime` attribute. Safe to call repeatedly.
 */
export function refreshPillDom(el: HTMLElement, now: Date = new Date()): void {
  const iso = el.getAttribute("data-datetime");
  if (!iso) {
    el.textContent = "";
    return;
  }
  const tier = tierOf(iso, now);
  const color = tierColor(tier);
  el.textContent = tierLabel(tier, iso, now);
  el.style.backgroundColor = color.bg;
  el.style.color = color.fg;
  el.style.padding = "1px 6px";
  el.style.margin = "0 2px";
  el.style.borderRadius = "8px";
  el.style.fontSize = "0.82em";
  el.style.fontWeight = "500";
  el.style.display = "inline-block";
  el.style.verticalAlign = "middle";
  el.style.cursor = "default";
  el.style.userSelect = "none";
  el.dataset.tier = tier;
}

/** Refresh all pills in a root element. */
export function refreshAllPills(root: ParentNode, now: Date = new Date()): void {
  root.querySelectorAll<HTMLElement>("span[data-due-time]").forEach((el) => {
    refreshPillDom(el, now);
  });
}
