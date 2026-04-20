import { describe, it, expect } from "vitest";
import { parseTimeHint } from "./timeHints";

const now = new Date(2026, 3, 20, 10, 0, 0); // 2026-04-20 (Mon) 10:00 local

describe("parseTimeHint — relative", () => {
  it("30分钟后", () => {
    const h = parseTimeHint("写周报 30分钟后", now);
    expect(h?.matchText).toBe("30分钟后");
    expect(h?.date.getTime()).toBe(now.getTime() + 30 * 60_000);
  });

  it("1小时后", () => {
    const h = parseTimeHint("do thing 1小时后", now);
    expect(h?.date.getTime()).toBe(now.getTime() + 3600_000);
  });

  it("3天后", () => {
    const h = parseTimeHint("deadline 3天后", now);
    const d = h!.date;
    expect(d.getDate()).toBe(23);
    expect(d.getHours()).toBe(10);
  });

  it("30m shorthand", () => {
    const h = parseTimeHint("ping 30m", now);
    expect(h?.date.getTime()).toBe(now.getTime() + 30 * 60_000);
  });
});

describe("parseTimeHint — today / tonight", () => {
  it("今天 → 18:00 of today", () => {
    const h = parseTimeHint("交稿 今天", now);
    expect(h?.date.getHours()).toBe(18);
    expect(h?.date.getDate()).toBe(20);
  });

  it("今晚 → 22:00 of today", () => {
    const h = parseTimeHint("吃饭 今晚", now);
    expect(h?.date.getHours()).toBe(22);
  });
});

describe("parseTimeHint — tomorrow / 后天", () => {
  it("明天9点 → tomorrow 09:00", () => {
    const h = parseTimeHint("开会 明天9点", now);
    expect(h?.date.getDate()).toBe(21);
    expect(h?.date.getHours()).toBe(9);
  });

  it("明天下午3点 → tomorrow 15:00", () => {
    const h = parseTimeHint("meet 明天下午3点", now);
    expect(h?.date.getHours()).toBe(15);
  });

  it("后天 → +2 days at 10:00", () => {
    const h = parseTimeHint("reminder 后天", now);
    expect(h?.date.getDate()).toBe(22);
    expect(h?.date.getHours()).toBe(10);
  });

  it("tomorrow 3pm", () => {
    const h = parseTimeHint("note tomorrow 3pm", now);
    expect(h?.date.getDate()).toBe(21);
    expect(h?.date.getHours()).toBe(15);
  });
});

describe("parseTimeHint — weekdays", () => {
  it("周三 (now is Mon) → +2 days", () => {
    const h = parseTimeHint("plan 周三", now);
    expect(h?.date.getDate()).toBe(22);
  });

  it("下周三 → +9 days", () => {
    const h = parseTimeHint("plan 下周三", now);
    expect(h?.date.getDate()).toBe(29);
  });

  it("周一 (today is Mon) → next Monday +7", () => {
    const h = parseTimeHint("plan 周一", now);
    expect(h?.date.getDate()).toBe(27);
  });
});

describe("parseTimeHint — absolute", () => {
  it("4月25日", () => {
    const h = parseTimeHint("event 4月25日", now);
    expect(h?.date.getMonth()).toBe(3);
    expect(h?.date.getDate()).toBe(25);
  });

  it("past month/day rolls to next year", () => {
    const h = parseTimeHint("event 1月1日", now);
    expect(h?.date.getFullYear()).toBe(2027);
  });

  it("ISO 2026-05-15", () => {
    const h = parseTimeHint("deadline 2026-05-15", now);
    expect(h?.date.getMonth()).toBe(4);
    expect(h?.date.getDate()).toBe(15);
  });

  it("18:30 today", () => {
    const h = parseTimeHint("open at 18:30", now);
    expect(h?.date.getDate()).toBe(20);
    expect(h?.date.getHours()).toBe(18);
    expect(h?.date.getMinutes()).toBe(30);
  });

  it("8:00 rolls to tomorrow since already past", () => {
    const nowAfternoon = new Date(2026, 3, 20, 14, 0);
    const h = parseTimeHint("brekkie 8:00", nowAfternoon);
    expect(h?.date.getDate()).toBe(21);
  });
});

describe("parseTimeHint — negatives", () => {
  it("returns null for unrelated text", () => {
    expect(parseTimeHint("随便写点什么", now)).toBeNull();
  });

  it("returns null when time is not anchored at end", () => {
    expect(parseTimeHint("30分钟后 然后开会", now)).toBeNull();
  });
});
