export type Tier = "overdue" | "urgent" | "today" | "this-week" | "later";

const HOUR = 3600 * 1000;
const DAY = 24 * HOUR;

export function tierOf(dueAtIso: string, now: Date = new Date()): Tier {
  const due = new Date(dueAtIso);
  const diffMs = due.getTime() - now.getTime();
  if (diffMs < 0) return "overdue";
  if (diffMs <= HOUR) return "urgent";

  const todayEnd = new Date(now);
  todayEnd.setHours(23, 59, 59, 999);
  if (due.getTime() <= todayEnd.getTime()) return "today";

  const weekEnd = todayEnd.getTime() + 6 * DAY;
  if (due.getTime() <= weekEnd) return "this-week";

  return "later";
}

export function tierColor(tier: Tier): { bg: string; fg: string } {
  switch (tier) {
    case "overdue":
      return { bg: "#c0392b", fg: "white" };
    case "urgent":
      return { bg: "#e74c3c", fg: "white" };
    case "today":
      return { bg: "#f39c12", fg: "white" };
    case "this-week":
      return { bg: "#f1c40f", fg: "#3a2e10" };
    case "later":
      return { bg: "#95a5a6", fg: "white" };
  }
}

export function tierLabel(tier: Tier, dueAtIso: string, now: Date = new Date()): string {
  const due = new Date(dueAtIso);
  const diffMs = due.getTime() - now.getTime();
  if (tier === "overdue") {
    return `⚠ 逾期 ${formatDuration(-diffMs)}`;
  }
  if (tier === "urgent") {
    return `⏰ ${formatDuration(diffMs)}`;
  }
  // 不用 📅 / 🗓 / 📆 —— macOS 的日历 emoji 会固定渲染日期数字（"17"），用 ⏰ 代替
  if (tier === "today") {
    return `⏰ 今天 ${formatClock(due)}`;
  }
  if (tier === "this-week") {
    return `⏰ ${formatWeekday(due)} ${formatClock(due)}`;
  }
  return `⏰ ${formatShortDate(due)} ${formatClock(due)}`;
}

function formatDuration(ms: number): string {
  const min = Math.round(ms / 60000);
  if (min < 60) return `${min}分钟`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr}小时`;
  const days = Math.round(hr / 24);
  return `${days}天`;
}

function formatClock(d: Date): string {
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function formatWeekday(d: Date): string {
  const names = ["周日", "周一", "周二", "周三", "周四", "周五", "周六"];
  return names[d.getDay()];
}

function formatShortDate(d: Date): string {
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

function pad(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}
