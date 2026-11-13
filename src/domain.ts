import { Temporal } from '@js-temporal/polyfill';
import { z } from 'zod';

const id = z.string().min(1).max(100).regex(/^[\w-]+$/);
const text = (max = 500) => z.string().max(max);
const title = z.string().trim().min(1, '请填写名称').max(80);
const instant = z.string().datetime();
export const safeLink = (value: string): boolean => {
  if (!value) return true;
  try {
    const url = new URL(value);
    return ['https:', 'http:'].includes(url.protocol) && !url.username && !url.password;
  } catch { return false; }
};
const shopSchema = z.object({
  id, name: title, platform: z.enum(['美团', '饿了么', '其他']),
  link: text(2000).refine(safeLink, '请填写完整的 http/https 链接，不能包含账号密码'),
  defaultMinutes: z.number().int().min(1).max(360), safetyMinutes: z.number().int().min(0).max(120),
  note: text(), sort: z.number().int().min(0), predictionResetAt: instant.optional(),
}).strict();
const mealSchema = z.object({
  id, shopId: id, name: title, items: z.string().trim().min(1).max(2000), note: text(),
  price: z.number().min(0).max(10000), favorite: z.boolean(), allowBackup: z.boolean(),
}).strict();
const periodSchema = z.enum(['早餐', '午餐', '晚餐', '夜宵']);
const planSchema = z.object({
  id, date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/), timezone: z.string().min(1).max(100),
  eatAt: instant, latestAt: instant, orderAt: instant, mealId: id,
  backupIds: z.array(id).max(2), safetyMinutes: z.number().int().min(0).max(120),
  predictedMinutes: z.number().positive().max(360), predictionBasis: text(300), period: periodSchema,
  note: text(), status: z.enum(['planned', 'ordered', 'completed', 'cancelled']),
  revision: z.number().int().min(1), calendarExportRevision: z.number().int().min(1).optional(),
  calendarExportedAt: instant.optional(),
}).strict();
const historySchema = z.object({
  id, shopId: id, planId: id.optional(), orderedAt: instant, arrivedAt: instant,
  timezone: z.string().min(1).max(100), period: periodSchema,
  heat: z.number().int().min(1).max(5), satisfied: z.boolean(), note: text(),
  valid: z.boolean(),
}).strict();
export type Shop = z.infer<typeof shopSchema>;
export type Meal = z.infer<typeof mealSchema>;
export type Plan = z.infer<typeof planSchema>;
export type History = z.infer<typeof historySchema>;
export type Period = z.infer<typeof periodSchema>;
export interface Data { shops: Shop[]; meals: Meal[]; plans: Plan[]; history: History[] }
export interface Preferences { safety: number; lunchTime: string }
export const emptyData = (): Data => ({ shops: [], meals: [], plans: [], history: [] });
export const newId = () => crypto.randomUUID();
export const zone = () => Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Shanghai';
export function localDate(at = Date.now(), tz = zone()): string {
  return Temporal.Instant.fromEpochMilliseconds(at).toZonedDateTimeISO(tz).toPlainDate().toString();
}
export function localInput(iso: string, tz = zone()): string {
  return Temporal.Instant.from(iso).toZonedDateTimeISO(tz).toPlainDateTime().toString({ smallestUnit: 'minute' });
}
export function addDays(date: string, days: number): string {
  return Temporal.PlainDate.from(date).add({ days }).toString();
}
export function toInstant(date: string, time: string, tz: string): string {
  try {
    const plain = Temporal.PlainDateTime.from(`${date}T${time}`, { overflow: 'reject' });
    return plain.toZonedDateTime(tz, { disambiguation: 'reject' }).toInstant().toString({ smallestUnit: 'millisecond' });
  } catch {
    throw new Error('日期或时间无效，或处于夏令时跳变的重复 / 不存在时段，请选择其他时间。');
  }
}
export function calculateOrder(eatAt: string, predicted: number, safety: number): string {
  if (!Number.isFinite(predicted) || predicted <= 0 || !Number.isFinite(safety) || safety < 0) throw new Error('配送耗时和安全余量无效');
  // Subtract elapsed minutes from an instant, not wall-clock fields or a fixed-length day.
  return Temporal.Instant.from(eatAt).subtract({ seconds: Math.round((predicted + safety) * 60) }).toString({ smallestUnit: 'millisecond' });
}
export const minutesBetween = (a: string, b: string) => (Date.parse(b) - Date.parse(a)) / 60000;
export function mealPeriod(iso: string, tz: string): Period {
  const hour = Temporal.Instant.from(iso).toZonedDateTimeISO(tz).hour;
  return hour < 5 ? '夜宵' : hour < 10 ? '早餐' : hour < 16 ? '午餐' : hour < 22 ? '晚餐' : '夜宵';
}
export function predict(shop: Shop, period: Period, history: History[]) {
  const samples = history.filter(h => h.shopId === shop.id && h.period === period && h.valid
    && (!shop.predictionResetAt || Date.parse(h.arrivedAt) > Date.parse(shop.predictionResetAt))
    && minutesBetween(h.orderedAt, h.arrivedAt) > 0 && minutesBetween(h.orderedAt, h.arrivedAt) <= 360)
    .sort((a, b) => Date.parse(b.arrivedAt) - Date.parse(a.arrivedAt)).slice(0, 8);
  if (samples.length < 3) return { minutes: shop.defaultMinutes, count: samples.length, samples, basis: `店铺默认 ${shop.defaultMinutes} 分钟 · ${period}有效样本 ${samples.length}/3` };
  const sorted = samples.map(h => minutesBetween(h.orderedAt, h.arrivedAt)).sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  const minutes = sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
  return { minutes, count: samples.length, samples, basis: `同店${period}最近 ${samples.length} 次有效记录的中位数 ${Number(minutes.toFixed(2))} 分钟` };
}
export function planPhase(plan: Plan, now = Date.now()) {
  if (plan.status === 'cancelled') return '已取消';
  if (plan.status === 'completed') return '已完成';
  if (plan.status === 'ordered') return '待收餐';
  if (Date.parse(plan.latestAt) < now) return '已过期';
  return Date.parse(plan.orderAt) <= now ? '该下单了' : '待下单';
}
export function nearestPlan(plans: Plan[], now = Date.now()): Plan | undefined {
  const active = plans.filter(p => p.status === 'planned' && Date.parse(p.latestAt) >= now);
  const due = active.filter(p => Date.parse(p.orderAt) <= now).sort((a, b) => Date.parse(b.orderAt) - Date.parse(a.orderAt));
  if (due.length) return due[0];
  return active.sort((a, b) => Date.parse(a.orderAt) - Date.parse(b.orderAt))[0];
}
export function formatTime(iso: string, tz = zone(), date = false): string {
  const value = new Date(iso);
  return new Intl.DateTimeFormat('zh-CN', { timeZone: tz, ...(date ? { month: 'numeric', day: 'numeric' } : {}), hour: '2-digit', minute: '2-digit', ...(value.getUTCSeconds() ? { second: '2-digit' } : {}), hourCycle: 'h23' }).format(value);
}
export const priceText = (price: number) => `¥${price.toFixed(price % 1 ? 2 : 0)}`;
export function revised(plan: Plan, changes: Partial<Plan>): Plan {
  return { ...plan, ...changes, revision: plan.revision + 1 };
}

const backupSchema = z.object({
  format: z.literal('wujian-refan'), version: z.literal(1), exportedAt: instant,
  shops: z.array(shopSchema).max(1000), meals: z.array(mealSchema).max(5000),
  plans: z.array(planSchema).max(20000), history: z.array(historySchema).max(20000),
}).strict();
export function validateData(data: Data): Data {
  const parsed = backupSchema.parse({ format: 'wujian-refan', version: 1, exportedAt: new Date().toISOString(), ...data });
  const sets = [parsed.shops, parsed.meals, parsed.plans, parsed.history].map(items => new Set(items.map(x => x.id)));
  [parsed.shops, parsed.meals, parsed.plans, parsed.history].forEach((items, i) => { if (items.length !== sets[i].size) throw new Error('文件中存在重复 ID'); });
  parsed.meals.forEach(m => { if (!sets[0].has(m.shopId)) throw new Error('套餐关联的店铺不存在'); });
  parsed.plans.forEach(p => {
    if (!sets[1].has(p.mealId) || p.backupIds.some(b => !sets[1].has(b))) throw new Error('计划关联的套餐不存在');
    if (new Set([p.mealId, ...p.backupIds]).size !== p.backupIds.length + 1) throw new Error('主套餐与备选套餐不能重复');
    // Validate the calendar date and time zone independently of the host time zone.
    if (localDate(Date.parse(p.eatAt), p.timezone) !== p.date || Date.parse(p.latestAt) < Date.parse(p.eatAt) || Date.parse(p.orderAt) >= Date.parse(p.latestAt)) throw new Error('计划日期、时区或时间顺序无效');
    if (mealPeriod(p.eatAt, p.timezone) !== p.period) throw new Error('计划餐段无效');
    if ((p.calendarExportRevision !== undefined && p.calendarExportRevision > p.revision) || Boolean(p.calendarExportedAt) !== Boolean(p.calendarExportRevision)) throw new Error('日历版本信息无效');
  });
  parsed.history.forEach(h => {
    if (!sets[0].has(h.shopId) || (h.planId && !sets[2].has(h.planId))) throw new Error('历史记录关联的数据不存在');
    const duration = minutesBetween(h.orderedAt, h.arrivedAt);
    if (duration <= 0 || duration > 360) throw new Error('实际履约耗时必须在 0 到 360 分钟之间');
    if (mealPeriod(h.arrivedAt, h.timezone) !== h.period) throw new Error('历史记录餐段无效');
    if (h.planId) {
      const plan = parsed.plans.find(p => p.id === h.planId)!;
      if (parsed.meals.find(m => m.id === plan.mealId)?.shopId !== h.shopId) throw new Error('历史记录与计划店铺不一致');
    }
  });
  return { shops: parsed.shops, meals: parsed.meals, plans: parsed.plans, history: parsed.history };
}
export function exportData(data: Data): string {
  return JSON.stringify({ format: 'wujian-refan', version: 1, exportedAt: new Date().toISOString(), ...validateData(data) }, null, 2);
}
export function parseBackup(raw: string): Data {
  if (new TextEncoder().encode(raw).length > 10 * 1024 * 1024) throw new Error('文件过大，请选择小于 10 MB 的备份');
  try {
    const { shops, meals, plans, history } = backupSchema.parse(JSON.parse(raw));
    return validateData({ shops, meals, plans, history });
  } catch (error) {
    if (error instanceof z.ZodError) throw new Error(`备份格式无效：${error.issues[0]?.path.join('.')} ${error.issues[0]?.message}`);
    if (error instanceof SyntaxError) throw new Error('文件不是有效的 JSON');
    throw error;
  }
}
export function mergeData(current: Data, incoming: Data): Data {
  // Incoming ID conflicts win as one graph; preserve unrelated existing data.
  const combine = <T extends { id: string }>(a: T[], b: T[]) => [...new Map([...a, ...b].map(x => [x.id, x])).values()];
  return validateData({ shops: combine(current.shops, incoming.shops), meals: combine(current.meals, incoming.meals), plans: combine(current.plans, incoming.plans), history: combine(current.history, incoming.history) });
}
