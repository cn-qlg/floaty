/**
 * Smart time-hint parser.
 *
 * Scans a text for recognized time expressions and returns the
 * RIGHTMOST match — so "今天 24 点 吃饭" still shows a hint even
 * though 吃饭 follows the time.
 *
 * ~11 patterns covering high-frequency Chinese + English time phrases.
 * Anything unmatched returns null.
 */

export interface TimeHint {
  matchText: string;
  date: Date;
  start: number;
  end: number;
}

const CN_WEEKDAYS = ["日", "一", "二", "三", "四", "五", "六"];

type Matcher = (text: string, now: Date) => TimeHint | null;

export function parseTimeHint(text: string, now: Date = new Date()): TimeHint | null {
  const matchers: Matcher[] = [
    matchRelativeMinutes,
    matchRelativeHours,
    matchRelativeDays,
    matchTomorrowWithTime,
    matchTodayWithTime,
    matchTodayTonight,
    matchHouAfterDays,
    matchNextWeekday,
    matchAbsoluteMonthDay,
    matchAbsoluteISO,
    matchHourMinute,
  ];
  let best: TimeHint | null = null;
  for (const fn of matchers) {
    const hint = fn(text, now);
    if (hint && (!best || hint.end > best.end)) best = hint;
  }
  return best;
}

/** 返回 text 中 regex 的最后一个匹配（使用 matchAll 避免与 child_process 同名歧义） */
function lastMatch(text: string, re: RegExp): RegExpMatchArray | null {
  const g = new RegExp(re.source, re.flags.includes("g") ? re.flags : re.flags + "g");
  const all = Array.from(text.matchAll(g));
  return all.length ? all[all.length - 1] : null;
}

function toHint(m: RegExpMatchArray, date: Date): TimeHint {
  const idx = m.index ?? 0;
  const matchText = m[0].trim();
  const leading = m[0].length - m[0].trimStart().length;
  const trailing = m[0].length - m[0].trimEnd().length;
  return { matchText, date, start: idx + leading, end: idx + m[0].length - trailing };
}

function matchRelativeMinutes(text: string, now: Date): TimeHint | null {
  const m = lastMatch(text, /(\d+)\s*(分钟|分|min|m)\s*后?/i);
  if (!m) return null;
  const d = new Date(now.getTime() + Number(m[1]) * 60_000);
  return toHint(m, d);
}

function matchRelativeHours(text: string, now: Date): TimeHint | null {
  const m = lastMatch(text, /(\d+)\s*(小时|时|hour|hr|h)\s*后?/i);
  if (!m) return null;
  const d = new Date(now.getTime() + Number(m[1]) * 3600_000);
  return toHint(m, d);
}

function matchRelativeDays(text: string, now: Date): TimeHint | null {
  const m = lastMatch(text, /(\d+)\s*(天|day|d)\s*后?/i);
  if (!m) return null;
  const d = new Date(now);
  d.setDate(d.getDate() + Number(m[1]));
  d.setHours(10, 0, 0, 0);
  return toHint(m, d);
}

function matchTomorrowWithTime(text: string, now: Date): TimeHint | null {
  const m =
    lastMatch(text, /明\s*天\s*(上午|下午|早上|晚上)?\s*(\d{1,2})\s*[点:]?\s*(\d{1,2})?/) ||
    lastMatch(text, /tomorrow\s+(\d{1,2})\s*(?::(\d{2}))?\s*(am|pm)?/i);
  if (!m) return null;
  const d = new Date(now);
  d.setDate(d.getDate() + 1);
  if (/明\s*天/.test(m[0])) {
    const period = m[1];
    let hour = Number(m[2]);
    const minute = m[3] ? Number(m[3]) : 0;
    if ((period === "下午" || period === "晚上") && hour < 12) hour += 12;
    if (period === "上午" && hour === 12) hour = 0;
    d.setHours(hour, minute, 0, 0);
  } else {
    let hour = Number(m[1]);
    const minute = m[2] ? Number(m[2]) : 0;
    const ap = (m[3] || "").toLowerCase();
    if (ap === "pm" && hour < 12) hour += 12;
    if (ap === "am" && hour === 12) hour = 0;
    d.setHours(hour, minute, 0, 0);
  }
  return toHint(m, d);
}

function matchTodayWithTime(text: string, now: Date): TimeHint | null {
  const m = lastMatch(
    text,
    /(今\s*天|今\s*晚|今\s*夜)\s*(上午|下午|早上|晚上)?\s*(\d{1,2})\s*[点:]?\s*(\d{1,2})?/,
  );
  if (!m) return null;
  const prefix = m[1].replace(/\s+/g, "");
  const rawPeriod = m[2];
  const period = rawPeriod || (prefix === "今晚" || prefix === "今夜" ? "晚上" : undefined);
  let hour = Number(m[3]);
  const minute = m[4] ? Number(m[4]) : 0;
  if ((period === "下午" || period === "晚上") && hour < 12) hour += 12;
  if (period === "上午" && hour === 12) hour = 0;
  const d = new Date(now);
  d.setHours(hour, minute, 0, 0);
  if (d.getTime() <= now.getTime()) d.setDate(d.getDate() + 1);
  return toHint(m, d);
}

function matchTodayTonight(text: string, now: Date): TimeHint | null {
  const m = lastMatch(text, /(今天|今晚|tonight)/i);
  if (!m) return null;
  const d = new Date(now);
  const kind = m[1].toLowerCase();
  if (kind === "今晚" || kind === "tonight") d.setHours(22, 0, 0, 0);
  else d.setHours(18, 0, 0, 0);
  return toHint(m, d);
}

function matchHouAfterDays(text: string, now: Date): TimeHint | null {
  const m = lastMatch(text, /(大\s*后\s*天|后\s*天)/);
  if (!m) return null;
  const d = new Date(now);
  d.setDate(d.getDate() + (m[1].replace(/\s+/g, "") === "大后天" ? 3 : 2));
  d.setHours(10, 0, 0, 0);
  return toHint(m, d);
}

function matchNextWeekday(text: string, now: Date): TimeHint | null {
  const m = lastMatch(text, /(下)?\s*周\s*([一二三四五六日天])/);
  if (!m) return null;
  const ch = m[2] === "天" ? "日" : m[2];
  const target = CN_WEEKDAYS.indexOf(ch);
  if (target < 0) return null;
  const d = new Date(now);
  const currentDow = d.getDay();
  let delta = (target - currentDow + 7) % 7;
  if (delta === 0) delta = 7;
  if (m[1] === "下") delta += 7;
  d.setDate(d.getDate() + delta);
  d.setHours(10, 0, 0, 0);
  return toHint(m, d);
}

function matchAbsoluteMonthDay(text: string, now: Date): TimeHint | null {
  const m = lastMatch(text, /(\d{1,2})\s*月\s*(\d{1,2})\s*日?/);
  if (!m) return null;
  const mo = Number(m[1]) - 1;
  const day = Number(m[2]);
  let year = now.getFullYear();
  const d = new Date(year, mo, day, 10, 0, 0, 0);
  if (d.getTime() < now.getTime()) d.setFullYear(year + 1);
  return toHint(m, d);
}

function matchAbsoluteISO(text: string, _now: Date): TimeHint | null {
  const m = lastMatch(text, /(\d{4})\s*-\s*(\d{1,2})\s*-\s*(\d{1,2})/);
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 10, 0, 0, 0);
  if (isNaN(d.getTime())) return null;
  return toHint(m, d);
}

function matchHourMinute(text: string, now: Date): TimeHint | null {
  const m = lastMatch(text, /(?:^|[\s，。、,])(\d{1,2}):(\d{2})/);
  if (!m) return null;
  const hour = Number(m[1]);
  const minute = Number(m[2]);
  if (hour > 23 || minute > 59) return null;
  const d = new Date(now);
  d.setHours(hour, minute, 0, 0);
  if (d.getTime() <= now.getTime()) d.setDate(d.getDate() + 1);
  return toHint(m, d);
}
