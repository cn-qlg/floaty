import { describe, it, expect } from "vitest";
import { tierOf, tierColor, tierLabel } from "./urgency";

// 用 local-time 构造 now + 测试值，避开时区对 "今天" 定义的影响
const now = new Date(2026, 3, 20, 10, 0, 0); // 2026-04-20 10:00 local

describe("tierOf", () => {
  it("overdue when due in the past", () => {
    expect(tierOf(new Date(2026, 3, 20, 9, 59).toISOString(), now)).toBe("overdue");
  });

  it("urgent when due within an hour", () => {
    expect(tierOf(new Date(2026, 3, 20, 10, 30).toISOString(), now)).toBe("urgent");
  });

  it("today when due later same day", () => {
    expect(tierOf(new Date(2026, 3, 20, 18, 0).toISOString(), now)).toBe("today");
  });

  it("this-week when due within 6 days after today", () => {
    expect(tierOf(new Date(2026, 3, 23, 10, 0).toISOString(), now)).toBe("this-week");
  });

  it("later when due beyond a week", () => {
    expect(tierOf(new Date(2026, 4, 1, 10, 0).toISOString(), now)).toBe("later");
  });
});

describe("tierColor", () => {
  it("maps overdue to deep red", () => {
    expect(tierColor("overdue").bg).toBe("#c0392b");
  });

  it("maps later to gray", () => {
    expect(tierColor("later").bg).toBe("#95a5a6");
  });
});

describe("tierLabel", () => {
  it("renders overdue with warning prefix", () => {
    const label = tierLabel("overdue", new Date(2026, 3, 20, 8).toISOString(), now);
    expect(label).toMatch(/^⚠/);
  });

  it("renders later with ⏰ clock + short date (no 📅 which shows as '17' on macOS)", () => {
    const label = tierLabel("later", new Date(2026, 4, 1, 10).toISOString(), now);
    expect(label).toMatch(/^⏰/);
    expect(label).toMatch(/\d+\/\d+/);
    expect(label).not.toContain("📅");
  });
});
