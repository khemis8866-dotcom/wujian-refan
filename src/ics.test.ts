import { describe, expect, it } from 'vitest';
import ICAL from 'ical.js';
import { createICS, escapeICS, foldLine } from './ics';
import { fixture } from './fixtures';
const now = Date.parse('2030-05-31T00:00:00Z');
describe('ICS 标准与事件内容', () => {
  it('可由独立 iCalendar 解析器解析，UTC 开始时刻就是建议下单时刻', () => {
    const d = fixture(), p = d.plans[0]; const ics = createICS(p, d.shops[0], d.meals[0], now);
    const cal = new ICAL.Component(ICAL.parse(ics)), event = cal.getFirstSubcomponent('vevent')!;
    expect(event.getFirstPropertyValue('summary')).toBe('该点外卖了：街角黄焖鸡');
    expect((event.getFirstPropertyValue('dtstart') as ICAL.Time).toJSDate().toISOString()).toBe(p.orderAt);
    const description = event.getFirstPropertyValue('description') as string;
    for (const text of ['黄焖鸡微辣', '不放香菜', '学校办公室', '12:15', '12:45', 'https://example.com/shop?q=1,2', '自行付款']) expect(description).toContain(text);
    const alarm = event.getFirstSubcomponent('valarm')!;
    expect(alarm.getFirstPropertyValue('action')).toBe('DISPLAY');
    expect((alarm.getFirstPropertyValue('trigger') as ICAL.Duration).toSeconds()).toBe(0);
    expect(alarm.getFirstProperty('trigger')?.getParameter('related')).toBe('START');
  });
  it('转义分隔符、反斜线和换行，阻止注入事件属性', () => {
    expect(escapeICS('a,b;c\\d\r\nnext')).toBe('a\\,b\\;c\\\\d\\nnext');
    const d = fixture(); d.shops[0].name = '店\r\nBEGIN:VEVENT';
    const ics = createICS(d.plans[0], d.shops[0], d.meals[0], now);
    expect(new ICAL.Component(ICAL.parse(ics)).getAllSubcomponents('vevent')).toHaveLength(1);
  });
  it('按 UTF-8 字节折行，中文和 emoji 可无损展开，使用 CRLF', () => {
    const original = `DESCRIPTION:${'午餐🍚'.repeat(50)}`; const folded = foldLine(original);
    expect(folded.split('\r\n').every(line => new TextEncoder().encode(line).length <= 75)).toBe(true);
    expect(folded.replace(/\r\n /g, '')).toBe(original);
    const d = fixture(), ics = createICS(d.plans[0], d.shops[0], d.meals[0], now);
    expect(ics.replaceAll('\r\n', '')).not.toContain('\n'); expect(ics.endsWith('\r\n')).toBe(true);
  });
  it('跨日事件保留正确 UTC 日期', () => {
    const d = fixture(); d.plans[0].orderAt = '2030-05-31T15:38:00.000Z';
    expect(createICS(d.plans[0], d.shops[0], d.meals[0], now)).toContain('DTSTART:20300531T153800Z');
  });
  it('修改版本使用不同 UID，不假装可以自动更新', () => {
    const d = fixture(); const a = createICS(d.plans[0], d.shops[0], d.meals[0], now);
    const b = createICS({ ...d.plans[0], revision: 2 }, d.shops[0], d.meals[0], now);
    expect(a).toContain('UID:plan-1-r1@'); expect(b).toContain('UID:plan-1-r2@');
  });
  it('不为已过、已完成或已取消的计划生成过去的提醒', () => {
    const d = fixture(), p = d.plans[0];
    expect(() => createICS(p, d.shops[0], d.meals[0], Date.parse(p.orderAt))).toThrow('已过');
    expect(() => createICS({ ...p, status: 'cancelled' }, d.shops[0], d.meals[0], now)).toThrow();
    expect(() => createICS({ ...p, status: 'completed' }, d.shops[0], d.meals[0], now)).toThrow();
  });
});
