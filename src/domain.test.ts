import { describe, expect, it } from 'vitest';
import { addDays, calculateOrder, exportData, localInput, mealPeriod, mergeData, nearestPlan, parseBackup, planPhase, predict, safeLink, toInstant, validateData } from './domain';
import { fixture, record, shop } from './fixtures';

describe('建议下单与时区', () => {
  it('12:15 - 32 - 5 = 11:38', () => {
    expect(localInput(calculateOrder(toInstant('2026-11-13', '12:15', 'Asia/Shanghai'), 32, 5), 'Asia/Shanghai')).toBe('2026-11-13T11:38');
  });
  it('跨日、跨月、闰年均按真实日期计算', () => {
    expect(localInput(calculateOrder(toInstant('2028-03-01', '00:15', 'Asia/Shanghai'), 32, 5), 'Asia/Shanghai')).toBe('2028-02-29T23:38');
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
  });
  it('支持半分钟中位数，不会丢失秒数', () => {
    expect(calculateOrder('2030-06-01T04:15:00.000Z', 32.5, 5)).toBe('2030-06-01T03:37:30.000Z');
  });
  it('春季 DST 按经过分钟倒推，跨越跳变仍准确', () => {
    const eat = toInstant('2026-03-08', '03:15', 'America/New_York');
    expect(calculateOrder(eat, 65, 5)).toBe('2026-03-08T06:05:00.000Z');
    expect(localInput(calculateOrder(eat, 65, 5), 'America/New_York')).toBe('2026-03-08T01:05');
  });
  it('秋季 DST 按实际经过时间倒推', () => {
    expect(calculateOrder(toInstant('2026-11-01', '02:15', 'America/New_York'), 65, 5)).toBe('2026-11-01T06:05:00.000Z');
  });
  it.each([['2026-03-08', '02:30'], ['2026-11-01', '01:30']])('拒绝不存在或重复的墙上时间 %s %s', (d, t) => {
    expect(() => toInstant(d, t, 'America/New_York')).toThrow('夏令时');
  });
  it('拒绝非法日期、耗时和未知时区', () => {
    expect(() => toInstant('2026-02-30', '12:15', 'Asia/Shanghai')).toThrow();
    expect(() => toInstant('2026-11-13', '12:15', 'Invalid/Zone')).toThrow();
    expect(() => calculateOrder('2030-06-01T04:15:00Z', -1, 5)).toThrow();
    expect(() => calculateOrder('2030-06-01T04:15:00Z', 35, NaN)).toThrow();
  });
  it('过最晚时间的计划为过期，不再作为到点计划', () => {
    const p = fixture().plans[0];
    expect(planPhase(p, Date.parse(p.latestAt) + 1)).toBe('已过期');
    expect(nearestPlan([p], Date.parse(p.latestAt) + 1)).toBeUndefined();
    expect(planPhase(p, Date.parse(p.orderAt))).toBe('该下单了');
  });
  it('优先展示最近已到点计划，忽略取消和完成', () => {
    const p = fixture().plans[0], now = Date.parse(p.orderAt) + 60000;
    const later = { ...p, id: 'later', orderAt: new Date(now + 60000).toISOString() };
    expect(nearestPlan([later, p], now)?.id).toBe(p.id);
    expect(nearestPlan([{ ...p, status: 'cancelled' }, later], now)?.id).toBe('later');
  });
  it('按送达时间归入餐段', () => {
    expect(mealPeriod(toInstant('2026-11-13', '09:59', 'Asia/Shanghai'), 'Asia/Shanghai')).toBe('早餐');
    expect(mealPeriod(toInstant('2026-11-13', '10:00', 'Asia/Shanghai'), 'Asia/Shanghai')).toBe('午餐');
    expect(mealPeriod(toInstant('2026-11-13', '16:00', 'Asia/Shanghai'), 'Asia/Shanghai')).toBe('晚餐');
  });
});
describe('预测', () => {
  it('奇数中位数不被极端值拉高', () => expect(predict(shop, '午餐', [record(30, 1), record(32, 2), record(110, 3)]).minutes).toBe(32));
  it('偶数中位数取中间二者平均', () => expect(predict(shop, '午餐', [record(30, 1), record(32, 2), record(33, 3), record(100, 4)]).minutes).toBe(32.5));
  it.each([0, 1, 2])('仅 %i 次有效记录时回退店铺默认', count => expect(predict(shop, '午餐', Array.from({ length: count }, (_, i) => record(20, i + 1))).minutes).toBe(35));
  it('只使用最近 8 次，同店同餐段，且排除无效和不合理记录', () => {
    const records = Array.from({ length: 10 }, (_, i) => record(i < 2 ? 300 : 32, i + 1));
    records.push(record(200, 11, { shopId: 'other' }), record(200, 12, { period: '晚餐' }), record(200, 13, { valid: false }), record(400, 14), record(0, 15));
    const pred = predict(shop, '午餐', records);
    expect(pred.count).toBe(8); expect(pred.minutes).toBe(32); expect(pred.samples[0].id).toBe('history-10');
    expect(shop.safetyMinutes).toBe(5);
  });
  it('重置只使用之后的有效记录，历史仍保留', () => {
    const records = [record(20, 1), record(21, 2), record(22, 3), record(40, 4)];
    expect(predict({ ...shop, predictionResetAt: records[2].arrivedAt }, '午餐', records).minutes).toBe(35);
    expect(records).toHaveLength(4);
  });
});
describe('备份格式与关联校验', () => {
  it('完整往返且不含界面偏好、账号或通知权限', () => {
    const data = fixture(); data.history = [record(32, 1)];
    expect(parseBackup(exportData(data))).toEqual(data);
    expect(Object.keys(JSON.parse(exportData(data))).sort()).toEqual(['exportedAt', 'format', 'history', 'meals', 'plans', 'shops', 'version']);
  });
  it('拒绝无效 JSON、错误版本和额外敏感字段', () => {
    expect(() => parseBackup('{')).toThrow('JSON');
    const parsed = JSON.parse(exportData(fixture()));
    expect(() => parseBackup(JSON.stringify({ ...parsed, version: 2 }))).toThrow();
    parsed.shops[0].cookie = 'do not store';
    expect(() => parseBackup(JSON.stringify(parsed))).toThrow();
  });
  it('拒绝不完整引用、重复 ID、重复备选和错误时间', () => {
    const data = fixture();
    expect(() => validateData({ ...data, shops: [] })).toThrow('店铺');
    expect(() => validateData({ ...data, shops: [shop, shop] })).toThrow('重复');
    expect(() => validateData({ ...data, plans: [{ ...data.plans[0], backupIds: ['meal-1'] }] })).toThrow('重复');
    expect(() => validateData({ ...data, plans: [{ ...data.plans[0], latestAt: data.plans[0].orderAt }] })).toThrow('时间');
  });
  it('校验跨日日期和历史的真实耗时', () => {
    const data = fixture(); data.history = [record(0)];
    expect(() => validateData(data)).toThrow('履约耗时');
    data.history = [record(361)]; expect(() => validateData(data)).toThrow('履约耗时');
    data.history = []; data.plans[0].date = '2030-05-31'; expect(() => validateData(data)).toThrow('日期');
  });
  it('合并时相同 ID 用备份替换，其他记录保留', () => {
    const data = fixture(), incoming = fixture(); incoming.shops[0].name = '新的名称';
    data.shops.push({ ...shop, id: 'shop-2', name: '另一个店' });
    const result = mergeData(data, incoming); expect(result.shops).toHaveLength(2); expect(result.shops[0].name).toBe('新的名称');
  });
  it('合并冲突不能破坏引用图', () => {
    const current = fixture(), incoming = fixture();
    current.history.push(record(32, 1, { planId: 'plan-1' }));
    incoming.shops.push({ ...shop, id: 'shop-2' }); incoming.meals[0].shopId = 'shop-2';
    expect(() => mergeData(current, incoming)).toThrow('不一致');
  });
  it('拒绝脚本 URL、带凭证的链接和破损时区', () => {
    expect(safeLink('javascript:alert(1)')).toBe(false); expect(safeLink('https://user:pass@example.com')).toBe(false);
    const data = fixture(); data.shops[0].link = 'data:text/html,hello'; expect(() => validateData(data)).toThrow();
    data.shops[0].link = ''; data.plans[0].timezone = 'Bad/Zone'; expect(() => validateData(data)).toThrow();
  });
  it('限制备份体积和用户文本字段大小', () => {
    expect(() => parseBackup(' '.repeat(10 * 1024 * 1024 + 1))).toThrow('过大');
    const data = fixture(); data.meals[0].items = '饭'.repeat(2001); expect(() => validateData(data)).toThrow();
  });
});
