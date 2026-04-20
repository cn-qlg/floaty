/**
 * Smart time-hint parser.
 *
 * 设计：
 *   DatePart（日期前缀：今天 / 明天 / 后天 / 大后天 / 周X / 下周X / M月D日 / YYYY-MM-DD）
 * + TimePart（时间后缀：早上 / 下午 / N点 / HH:MM）
 *
 * parseTimeHint 扫描所有可能的组合（每个 date 可选拼一个 time）+ 独立的
 * 相对时长（N 分钟后 / N 小时后 / N 天后），取**最右**的那个作为 ghost。
 */

export interface TimeHint {
  matchText: string;
  date: Date;
  start: number;
  end: number;
}

const CN_WEEKDAYS = ["日", "一", "二", "三", "四", "五", "六"];

const PERIOD_HOUR: Record<string, number> = {
  早上: 8,
  上午: 10,
  中午: 12,
  下午: 15,
  晚上: 20,
};

interface DatePart {
  date: Date;
  defaultHour: number;
  allowPastTime: boolean;
  impliedPeriod?: "早上" | "上午" | "下午" | "晚上";
  start: number;
  end: number;
}

interface TimePart {
  hour: number;
  minute: number;
  hasExplicitPeriod: boolean;
  start: number;
  end: number;
}

// =============== 主入口 ===============

export function parseTimeHint(text: string, now: Date = new Date()): TimeHint | null {
  const candidates: TimeHint[] = [];

  // 1) 相对时长：独立匹配
  push(candidates, matchRelativeMinutes(text, now));
  push(candidates, matchRelativeHours(text, now));
  push(candidates, matchRelativeDays(text, now));

  // 2) 日期 + 可选时间组合
  const dates = findAllDateParts(text, now);
  for (const dp of dates) {
    const afterText = text.slice(dp.end);
    const afterTime = findFirstTimePart(afterText);
    if (afterTime) {
      const gap = afterText.slice(0, afterTime.start);
      if (/^\s*$/.test(gap)) {
        candidates.push(combineDateAndTime(dp, afterTime, dp.end, text));
        continue;
      }
    }
    // 用户可能打到一半：date 后紧跟空格+数字但没 点/: ——视为"正在输入"，不触发 ghost
    if (/^\s+\d/.test(afterText)) continue;
    // 裸日期：使用 defaultHour
    const d = new Date(dp.date);
    d.setHours(dp.defaultHour, 0, 0, 0);
    candidates.push({
      matchText: text.slice(dp.start, dp.end).trim(),
      date: d,
      start: dp.start,
      end: dp.end,
    });
  }

  // 3) 独立时间（无日期前缀 → 今天；已过则滚明天）
  push(candidates, matchStandaloneTime(text, now, dates));

  // 4) "今晚/今天"（无 period / 无时间）作为兜底
  push(candidates, matchTodayTonightBare(text, now, dates));

  if (!candidates.length) return null;
  return candidates.reduce((best, c) => (c.end > best.end ? c : best));
}

function push<T>(arr: T[], v: T | null): void {
  if (v) arr.push(v);
}

function combineDateAndTime(
  dp: DatePart,
  tp: TimePart,
  offset: number,
  fullText: string,
): TimeHint {
  const d = new Date(dp.date);
  let hour = tp.hour;
  const minute = tp.minute;
  if (!tp.hasExplicitPeriod && dp.impliedPeriod) {
    if ((dp.impliedPeriod === "下午" || dp.impliedPeriod === "晚上") && hour < 12) hour += 12;
    if (dp.impliedPeriod === "上午" && hour === 12) hour = 0;
  }
  d.setHours(hour, minute, 0, 0);
  const start = dp.start;
  const end = offset + tp.end;
  return {
    matchText: fullText.slice(start, end).trim(),
    date: d,
    start,
    end,
  };
}

// =============== 相对时长（独立） ===============

function matchRelativeMinutes(text: string, now: Date): TimeHint | null {
  const m = lastMatch(text, /(\d+)\s*个?\s*(分钟|分|min|m)\s*后?/i);
  if (!m) return null;
  const d = new Date(now.getTime() + Number(m[1]) * 60_000);
  return toHint(m, d);
}

function matchRelativeHours(text: string, now: Date): TimeHint | null {
  const m = lastMatch(text, /(\d+)\s*个?\s*(小时|时|hour|hr|h)\s*后?/i);
  if (!m) return null;
  const d = new Date(now.getTime() + Number(m[1]) * 3600_000);
  return toHint(m, d);
}

function matchRelativeDays(text: string, now: Date): TimeHint | null {
  const m = lastMatch(text, /(\d+)\s*个?\s*(天|day|d)\s*后?/i);
  if (!m) return null;
  const d = new Date(now);
  d.setDate(d.getDate() + Number(m[1]));
  d.setHours(10, 0, 0, 0);
  return toHint(m, d);
}

// =============== DatePart 解析器（扫描所有位置） ===============

function findAllDateParts(text: string, now: Date): DatePart[] {
  const parsers = [
    dateJinWanJinYe,
    dateToday,
    dateTomorrow,
    dateHouTian,
    dateDaHouTian,
    dateWeekday,
    dateAbsoluteMonthDay,
    dateAbsoluteISO,
  ];
  const all: DatePart[] = [];
  for (const fn of parsers) {
    for (const dp of fn(text, now)) all.push(dp);
  }
  // 去重：同一位置多个匹配（例如 "今晚" 既被 dateJinWan 又被……）只留第一个
  const seen = new Set<string>();
  return all.filter((dp) => {
    const k = `${dp.start}:${dp.end}`;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

function dateJinWanJinYe(text: string, now: Date): DatePart[] {
  return allMatches(text, /今\s*(晚|夜)/).map((m) => ({
    date: new Date(now),
    defaultHour: 22,
    allowPastTime: true,
    impliedPeriod: "晚上" as const,
    start: m.start,
    end: m.end,
  }));
}

function dateToday(text: string, now: Date): DatePart[] {
  return allMatches(text, /今\s*天/).map((m) => ({
    date: new Date(now),
    defaultHour: 18,
    allowPastTime: true, // 用户明确说"今天"，时间已过也保持当天
    start: m.start,
    end: m.end,
  }));
}

function dateTomorrow(text: string, now: Date): DatePart[] {
  const cn = allMatches(text, /明\s*天/);
  const en = allMatches(text, /\btomorrow\b/i);
  return [...cn, ...en].map((m) => {
    const d = new Date(now);
    d.setDate(d.getDate() + 1);
    return { date: d, defaultHour: 10, allowPastTime: true, start: m.start, end: m.end };
  });
}

function dateHouTian(text: string, now: Date): DatePart[] {
  return allMatches(text, /(?<!大\s*)后\s*天/).map((m) => {
    const d = new Date(now);
    d.setDate(d.getDate() + 2);
    return { date: d, defaultHour: 10, allowPastTime: true, start: m.start, end: m.end };
  });
}

function dateDaHouTian(text: string, now: Date): DatePart[] {
  return allMatches(text, /大\s*后\s*天/).map((m) => {
    const d = new Date(now);
    d.setDate(d.getDate() + 3);
    return { date: d, defaultHour: 10, allowPastTime: true, start: m.start, end: m.end };
  });
}

function dateWeekday(text: string, now: Date): DatePart[] {
  const res: DatePart[] = [];
  const re = /(下)?\s*(?:周|星\s*期|礼\s*拜)\s*([一二三四五六日天])/g;
  for (const m of text.matchAll(re)) {
    const ch = m[2] === "天" ? "日" : m[2];
    const target = CN_WEEKDAYS.indexOf(ch);
    if (target < 0) continue;
    const d = new Date(now);
    const currentDow = d.getDay();
    let delta: number;
    if (m[1] === "下") {
      // 下周X = 下周一 + (X - Mon). 下周一 from Mon today = +7.
      const daysUntilNextMon = currentDow === 1 ? 7 : ((1 - currentDow + 7) % 7) || 7;
      const monBasedTarget = target === 0 ? 6 : target - 1;
      delta = daysUntilNextMon + monBasedTarget;
    } else {
      delta = (target - currentDow + 7) % 7;
      if (delta === 0) delta = 7;
    }
    d.setDate(d.getDate() + delta);
    const idx = m.index ?? 0;
    res.push({ date: d, defaultHour: 10, allowPastTime: true, start: idx, end: idx + m[0].length });
  }
  return res;
}

function dateAbsoluteMonthDay(text: string, now: Date): DatePart[] {
  const res: DatePart[] = [];
  const re = /(\d{1,2})\s*月\s*(\d{1,2})\s*日?/g;
  for (const m of text.matchAll(re)) {
    const mo = Number(m[1]) - 1;
    const day = Number(m[2]);
    const year = now.getFullYear();
    const d = new Date(year, mo, day, 10, 0, 0, 0);
    if (d.getTime() < now.getTime()) d.setFullYear(year + 1);
    const idx = m.index ?? 0;
    res.push({ date: d, defaultHour: 10, allowPastTime: true, start: idx, end: idx + m[0].length });
  }
  return res;
}

function dateAbsoluteISO(text: string, _now: Date): DatePart[] {
  const res: DatePart[] = [];
  const re = /(\d{4})\s*-\s*(\d{1,2})\s*-\s*(\d{1,2})/g;
  for (const m of text.matchAll(re)) {
    const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 10, 0, 0, 0);
    if (isNaN(d.getTime())) continue;
    const idx = m.index ?? 0;
    res.push({ date: d, defaultHour: 10, allowPastTime: true, start: idx, end: idx + m[0].length });
  }
  return res;
}

// =============== TimePart 解析器 ===============

/** 在 text 中从头找第一个时间表达，返回相对 text 的 start/end */
function findFirstTimePart(text: string): TimePart | null {
  // period + 数字 + [点:]? + 分钟?
  let m = text.match(/^(\s*)(早上|上午|中午|下午|晚上)\s*(\d{1,2})\s*[点:]?\s*(\d{1,2})?/);
  if (m && m[3]) {
    const period = m[2];
    let hour = Number(m[3]);
    const minute = m[4] ? Number(m[4]) : 0;
    if ((period === "下午" || period === "晚上") && hour < 12) hour += 12;
    if (period === "上午" && hour === 12) hour = 0;
    if (hour > 24 || minute > 59) return null;
    return { hour, minute, hasExplicitPeriod: true, start: m[1].length, end: m[0].length };
  }
  // period only
  m = text.match(/^(\s*)(早上|上午|中午|下午|晚上)(?!\s*\d)/);
  if (m) {
    const period = m[2];
    return {
      hour: PERIOD_HOUR[period],
      minute: 0,
      hasExplicitPeriod: true,
      start: m[1].length,
      end: m[0].length,
    };
  }
  // 英文 am/pm: "3pm" / "3:30pm" / "9am"
  m = text.match(/^(\s*)(\d{1,2})(?::(\d{2}))?\s*(am|pm)\b/i);
  if (m) {
    let hour = Number(m[2]);
    const minute = m[3] ? Number(m[3]) : 0;
    const ap = m[4].toLowerCase();
    if (ap === "pm" && hour < 12) hour += 12;
    if (ap === "am" && hour === 12) hour = 0;
    if (hour > 24 || minute > 59) return null;
    return { hour, minute, hasExplicitPeriod: true, start: m[1].length, end: m[0].length };
  }
  // 数字 + 点/: + 分钟（必须有 点/: 才触发，否则等用户补齐）
  m = text.match(/^(\s*)(\d{1,2})\s*[点:]\s*(\d{1,2})?/);
  if (m) {
    const hour = Number(m[2]);
    const minute = m[3] ? Number(m[3]) : 0;
    if (hour > 24 || minute > 59) return null;
    return { hour, minute, hasExplicitPeriod: false, start: m[1].length, end: m[0].length };
  }
  return null;
}

/** 独立 HH:MM（如 "18:30"），用于没有日期前缀的句子。已过则滚明天。 */
function matchStandaloneTime(text: string, now: Date, dates: DatePart[]): TimeHint | null {
  const re = /(?:^|[\s，。、,])(\d{1,2}):(\d{2})/g;
  let last: RegExpMatchArray | null = null;
  for (const m of text.matchAll(re)) last = m;
  if (!last) return null;
  const idx = last.index ?? 0;
  const leading = last[0].length - last[0].trimStart().length;
  const start = idx + leading;
  // 避免和已识别的 DatePart 重叠
  if (dates.some((d) => rangesOverlap(d.start, d.end, start, idx + last![0].length))) return null;
  const hour = Number(last[1]);
  const minute = Number(last[2]);
  if (hour > 23 || minute > 59) return null;
  const d = new Date(now);
  d.setHours(hour, minute, 0, 0);
  if (d.getTime() <= now.getTime()) d.setDate(d.getDate() + 1);
  return {
    matchText: text.slice(start, idx + last[0].length).trim(),
    date: d,
    start,
    end: idx + last[0].length,
  };
}

/** 裸 "今天" / "今晚" / "tonight" — 无 period、无数字，返回今天 18:00 / 22:00 */
function matchTodayTonightBare(text: string, now: Date, dates: DatePart[]): TimeHint | null {
  const m = lastMatch(text, /(今天|今晚|tonight)(?!\s*(?:\d|早上|上午|中午|下午|晚上))/i);
  if (!m) return null;
  const idx = m.index ?? 0;
  const end = idx + m[0].length;
  // 若被 "今天" 的 DatePart 覆盖（通常会），直接让 DatePart 的 default 逻辑处理：
  // DatePart "今天" 的 defaultHour = 18。所以此 bare matcher 主要为 "今晚" / "tonight"
  // 返回今天 22:00。
  const kind = m[1].toLowerCase();
  if (kind === "今天") return null; // 交给 DatePart dateToday 处理
  // tonight / 今晚 → 22:00；不与 dates 重叠（今晚 不是 DatePart）
  if (dates.some((d) => rangesOverlap(d.start, d.end, idx, end))) return null;
  const d = new Date(now);
  d.setHours(22, 0, 0, 0);
  return { matchText: m[0].trim(), date: d, start: idx, end };
}

// =============== 工具函数 ===============

function lastMatch(text: string, re: RegExp): RegExpMatchArray | null {
  const g = new RegExp(re.source, re.flags.includes("g") ? re.flags : re.flags + "g");
  const all = Array.from(text.matchAll(g));
  return all.length ? all[all.length - 1] : null;
}

function allMatches(
  text: string,
  re: RegExp,
): Array<{ start: number; end: number; text: string }> {
  const g = new RegExp(re.source, re.flags.includes("g") ? re.flags : re.flags + "g");
  return Array.from(text.matchAll(g)).map((m) => ({
    start: m.index ?? 0,
    end: (m.index ?? 0) + m[0].length,
    text: m[0],
  }));
}

function rangesOverlap(a0: number, a1: number, b0: number, b1: number): boolean {
  return !(a1 <= b0 || b1 <= a0);
}

function toHint(m: RegExpMatchArray, date: Date): TimeHint {
  const idx = m.index ?? 0;
  const matchText = m[0].trim();
  const leading = m[0].length - m[0].trimStart().length;
  const trailing = m[0].length - m[0].trimEnd().length;
  return { matchText, date, start: idx + leading, end: idx + m[0].length - trailing };
}
