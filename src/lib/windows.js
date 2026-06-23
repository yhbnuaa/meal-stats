// 报名窗口的「分钟数 <-> 人类可读」换算工具
// 约定：分钟数 = 距「供应日」当天 0 点的偏移；可为负（前一天）/ >1440（次日）

export const DAY = 1440

// 把分钟数拆成 { dayOffset, hh, mm }
export function splitMinutes(min) {
  if (min == null) return null
  let dayOffset = Math.floor(min / DAY)
  let rem = min - dayOffset * DAY
  const hh = Math.floor(rem / 60)
  const mm = rem % 60
  return { dayOffset, hh, mm }
}

export function makeMinutes(dayOffset, hh, mm) {
  return dayOffset * DAY + hh * 60 + mm
}

const DAY_LABEL = { '-1': '前一天', 0: '当天', 1: '次日' }

export function dayLabel(dayOffset) {
  return DAY_LABEL[dayOffset] ?? `${dayOffset >= 0 ? '+' : ''}${dayOffset}天`
}

// "前一天 21:00" 这样的可读串
export function describeMinutes(min) {
  const p = splitMinutes(min)
  if (!p) return '不限'
  const t = `${String(p.hh).padStart(2, '0')}:${String(p.mm).padStart(2, '0')}`
  return p.dayOffset === 0 ? t : `${dayLabel(p.dayOffset)} ${t}`
}

// 把 ISO 时间串格式化为 "HH:MM"（按本地时区显示即可，展示用）
export function hhmm(iso) {
  if (!iso) return ''
  const d = new Date(iso)
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
}

// 把供应日 date 字符串（YYYY-MM-DD）格式化为 "6月24日 周二"
const WEEK = ['周日', '周一', '周二', '周三', '周四', '周五', '周六']
export function describeDate(dateStr) {
  if (!dateStr) return ''
  const [y, m, d] = dateStr.split('-').map(Number)
  const dt = new Date(y, m - 1, d)
  return `${m}月${d}日 ${WEEK[dt.getDay()]}`
}
