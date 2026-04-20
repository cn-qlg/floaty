/**
 * Smart time-hint parser.
 *
 * Scans the END of a text string for a recognized time expression and
 * returns the matched substring plus the resolved Date.
 *
 * Intentionally conservative: 10+ patterns covering high-frequency
 * Chinese + English time phrases. Anything unmatched returns null
 * so the editor shows no ghost preview.
 */

export interface TimeHint {
  matchText: string; // the exact substring that was parsed
  date: Date;
}

const CN_WEEKDAYS = ["日", "一", "二", "三", "四", "五", "六"];

/**
 * Try to match a time expression at the tail of `text`. Returns null when
 * no pattern anchors to the end.
 */
export function parseTimeHint(text: string, now: Date = new Date()): TimeHint | null {
  // Order matters: more specific / longer matches first.
  const patterns: Array<(text: string, now: Date) => TimeHint | null> = [
    matchRelativeMinutes,
    matchRelativeHours,
    matchRelativeDays,
    matchTomorrowWithTime,
    matchTodayTonight,
    matchHouAfterDays,
    matchNextWeekday,
    matchAbsoluteMonthDay,
    matchAbsoluteISO,
    matchHourMinute,
  ];
  for (const fn of patterns) {
    const hint = fn(text, now);
    if (hint) return hint;
  }
  return null;
}

function matchRelativeMinutes(text: string, now: Date): TimeHint | null {
  const m = text.match(/(\d+)\s*(分钟|分|min|m)后?\s*$/i);
  if (!m) return null;
  const d = new Date(now.getTime() + Number(m[1]) * 60_000);
  return { matchText: m[0].trim(), date: d };
}

function matchRelativeHours(text: string, now: Date): TimeHint | null {
  const m = text.match(/(\d+)\s*(小时|时|hour|hr|h)后?\s*$/i);
  if (!m) return null;
  const d = new Date(now.getTime() + Number(m[1]) * 3600_000);
  return { matchText: m[0].trim(), date: d };
}

function matchRelativeDays(text: string, now: Date): TimeHint | null {
  const m = text.match(/(\d+)\s*(天|day|d)后?\s*$/i);
  if (!m) return null;
  const d = new Date(now);
  d.setDate(d.getDate() + Number(m[1]));
  d.setHours(10, 0, 0, 0);
  return { matchText: m[0].trim(), date: d };
}

function matchTomorrowWithTime(text: string, now: Date): TimeHint | null {
  // 明天 / 明天上午9点 / 明天9:00 / tomorrow 9am
  const m =
    text.match(/明天(上午|下午|早上|晚上)?\s*(\d{1,2})[点:]?(\d{1,2})?\s*$/) ||
    text.match(/tomorrow\s+(\d{1,2})(?::(\d{2}))?\s*(am|pm)?\s*$/i);
  if (!m) return null;
  const d = new Date(now);
  d.setDate(d.getDate() + 1);
  if (/明天/.test(m[0])) {
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
  return { matchText: m[0].trim(), date: d };
}

function matchTodayTonight(text: string, now: Date): TimeHint | null {
  const m = text.match(/(今天|今晚|tonight)\s*$/i);
  if (!m) return null;
  const d = new Date(now);
  const kind = m[1].toLowerCase();
  if (kind === "今晚" || kind === "tonight") {
    d.setHours(22, 0, 0, 0);
  } else {
    d.setHours(18, 0, 0, 0);
  }
  return { matchText: m[0].trim(), date: d };
}

function matchHouAfterDays(text: string, now: Date): TimeHint | null {
  const m = text.match(/(大后天|后天)\s*$/);
  if (!m) return null;
  const d = new Date(now);
  d.setDate(d.getDate() + (m[1] === "大后天" ? 3 : 2));
  d.setHours(10, 0, 0, 0);
  return { matchText: m[0].trim(), date: d };
}

function matchNextWeekday(text: string, now: Date): TimeHint | null {
  // 周三 / 下周三 / 周日 / 周天
  const m = text.match(/(下)?周([一二三四五六日天])\s*$/);
  if (!m) return null;
  const ch = m[2] === "天" ? "日" : m[2];
  const target = CN_WEEKDAYS.indexOf(ch);
  if (target < 0) return null;
  const d = new Date(now);
  const currentDow = d.getDay();
  let delta = (target - currentDow + 7) % 7;
  if (delta === 0) delta = 7; // 下一个同 weekday
  if (m[1] === "下") delta += 7;
  d.setDate(d.getDate() + delta);
  d.setHours(10, 0, 0, 0);
  return { matchText: m[0].trim(), date: d };
}

function matchAbsoluteMonthDay(text: string, now: Date): TimeHint | null {
  const m = text.match(/(\d{1,2})月(\d{1,2})日?\s*$/);
  if (!m) return null;
  const mo = Number(m[1]) - 1;
  const day = Number(m[2]);
  let year = now.getFullYear();
  const d = new Date(year, mo, day, 10, 0, 0, 0);
  if (d.getTime() < now.getTime()) {
    d.setFullYear(year + 1);
  }
  return { matchText: m[0].trim(), date: d };
}

function matchAbsoluteISO(text: string, _now: Date): TimeHint | null {
  const m = text.match(/(\d{4})-(\d{1,2})-(\d{1,2})\s*$/);
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 10, 0, 0, 0);
  if (isNaN(d.getTime())) return null;
  // 用 now 作为参照，过去的 ISO 日期仍然允许（用户可能有意输入）
  return { matchText: m[0].trim(), date: d };
}

function matchHourMinute(text: string, now: Date): TimeHint | null {
  const m = text.match(/(?:^|\s)(\d{1,2}):(\d{2})\s*$/);
  if (!m) return null;
  const hour = Number(m[1]);
  const minute = Number(m[2]);
  if (hour > 23 || minute > 59) return null;
  const d = new Date(now);
  d.setHours(hour, minute, 0, 0);
  if (d.getTime() <= now.getTime()) {
    d.setDate(d.getDate() + 1);
  }
  // 仅匹配去掉前导空格后的真实时间字符串
  return { matchText: m[0].trim(), date: d };
}
