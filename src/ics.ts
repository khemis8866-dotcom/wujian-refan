import type { Meal, Plan, Shop } from './domain';
import { formatTime, planPhase } from './domain';

export function escapeICS(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/\r\n|\r|\n/g, '\\n').replace(/;/g, '\\;').replace(/,/g, '\\,');
}
export function foldLine(line: string): string {
  // RFC 5545: max 75 UTF-8 octets per physical line; continuation includes its space.
  const encoder = new TextEncoder();
  let result = '', bytes = 0;
  for (const char of line) {
    const size = encoder.encode(char).length;
    if (bytes + size > 75) { result += '\r\n '; bytes = 1; }
    result += char; bytes += size;
  }
  return result;
}
const utc = (iso: string) => new Date(iso).toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
export function reminderDescription(plan: Plan, shop: Shop, meal: Meal): string {
  return [
    `店铺：${shop.name}（${shop.platform}）`, `套餐：${meal.name}`, `菜品与规格：${meal.items}`,
    `套餐备注：${meal.note || '无'}`, `店铺备注：${shop.note || '无'}`, `计划备注：${plan.note || '无'}`,
    `预估预算：¥${meal.price.toFixed(2)}`,
    `希望吃饭：${formatTime(plan.eatAt, plan.timezone, true)}`,
    `最晚送达：${formatTime(plan.latestAt, plan.timezone, true)}`, `计划时区：${plan.timezone}`,
    `店铺链接：${shop.link || '未保存，请自行在官方 App 搜索店铺'}`,
    `预测依据：${plan.predictionBasis}；安全余量 ${plan.safetyMinutes} 分钟`,
    '请在官方 App 核对实时价格、优惠、配送时段和地址后自行付款。',
    '修改或取消计划后，请删除旧日历事件并重新生成。',
  ].join('\n');
}
export function createICS(plan: Plan, shop: Shop, meal: Meal, now = Date.now()): string {
  if (plan.status !== 'planned' || planPhase(plan, now) === '已过期' || Date.parse(plan.orderAt) <= now) throw new Error('建议下单时间已过或计划已结束，请现在自行核对下单，或编辑为未来时间后再生成提醒。');
  return [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//WujianRefan//Lunch reminder//ZH-CN',
    'CALSCALE:GREGORIAN', 'METHOD:PUBLISH', 'BEGIN:VEVENT',
    // Revision-specific UID: never claim importing a file updates a previous event.
    `UID:${plan.id}-r${plan.revision}@wujian-refan.local`, `DTSTAMP:${utc(new Date(now).toISOString())}`,
    `DTSTART:${utc(plan.orderAt)}`, `DTEND:${utc(new Date(Date.parse(plan.orderAt) + 60000).toISOString())}`,
    `SUMMARY:${escapeICS(`该点外卖了：${shop.name}`)}`,
    `DESCRIPTION:${escapeICS(reminderDescription(plan, shop, meal))}`,
    'STATUS:CONFIRMED', 'TRANSP:TRANSPARENT', 'BEGIN:VALARM',
    'ACTION:DISPLAY', 'TRIGGER;RELATED=START:PT0S',
    `DESCRIPTION:${escapeICS(`该点外卖了：${shop.name}`)}`, 'END:VALARM', 'END:VEVENT', 'END:VCALENDAR',
  ].map(foldLine).join('\r\n') + '\r\n';
}
export function downloadFile(content: string, name: string, type: string) {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const anchor = document.createElement('a');
  anchor.href = url; anchor.download = name; document.body.append(anchor); anchor.click(); anchor.remove();
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}
