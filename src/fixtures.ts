import { calculateOrder, toInstant, type Data, type History, type Plan, type Shop } from './domain';
export const shop: Shop = { id: 'shop-1', name: '街角黄焖鸡', platform: '美团', link: 'https://example.com/shop?q=1,2', defaultMinutes: 35, safetyMinutes: 5, note: '汤容易洒', sort: 0 };
export function fixture(): Data {
  const eatAt = toInstant('2030-06-01', '12:15', 'Asia/Shanghai');
  const plan: Plan = { id: 'plan-1', date: '2030-06-01', timezone: 'Asia/Shanghai', eatAt, latestAt: toInstant('2030-06-01', '12:45', 'Asia/Shanghai'), orderAt: calculateOrder(eatAt, 32, 5), mealId: 'meal-1', backupIds: [], safetyMinutes: 5, predictedMinutes: 32, predictionBasis: '最近 3 次有效记录的中位数 32 分钟', period: '午餐', note: '学校办公室', status: 'planned', revision: 1 };
  return { shops: [{ ...shop }], meals: [{ id: 'meal-1', shopId: shop.id, name: '黄焖鸡微辣', items: '小份黄焖鸡、米饭一份', note: '不放香菜', price: 25, favorite: true, allowBackup: true }], plans: [plan], history: [] };
}
export function record(duration: number, day = 1, extra: Partial<History> = {}): History {
  const arrivedAt = toInstant(`2026-10-${String(day).padStart(2, '0')}`, '12:15', 'Asia/Shanghai');
  return { id: `history-${day}`, shopId: shop.id, arrivedAt, orderedAt: new Date(Date.parse(arrivedAt) - duration * 60000).toISOString(), timezone: 'Asia/Shanghai', period: '午餐', heat: 4, satisfied: true, note: '', valid: true, ...extra };
}
