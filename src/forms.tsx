import { useState, type FormEvent } from 'react';
import { Temporal } from '@js-temporal/polyfill';
import { Field, ErrorText, message } from './components';
import { addDays, calculateOrder, formatTime, localDate, localInput, mealPeriod, minutesBetween, newId, predict, safeLink, toInstant, zone, type Data, type History, type Meal, type Plan, type Preferences, type Shop } from './domain';
function useSubmission() {
  const [error, setError] = useState(''); const [busy, setBusy] = useState(false);
  const run = async (event: FormEvent, task: () => Promise<void>) => {
    event.preventDefault(); if (busy) return; setError(''); setBusy(true);
    try { await task(); } catch (err) { setError(message(err)); } finally { setBusy(false); }
  };
  return { error, busy, run };
}
const Submit = ({ busy, children = '保存' }: { busy: boolean; children?: string }) => <button className="primary full" type="submit" disabled={busy}>{busy ? '正在保存…' : children}</button>;
export function ShopForm({ shop, prefs, quick = false, save }: { shop?: Shop; prefs: Preferences; quick?: boolean; save: (shop: Shop, meal?: Meal) => Promise<void> }) {
  const [name, setName] = useState(shop?.name || ''); const [platform, setPlatform] = useState<Shop['platform']>(shop?.platform || '美团');
  const [link, setLink] = useState(shop?.link || ''); const [duration, setDuration] = useState(shop?.defaultMinutes ?? 35);
  const [safety, setSafety] = useState(shop?.safetyMinutes ?? prefs.safety); const [note, setNote] = useState(shop?.note || '');
  const [mealName, setMealName] = useState(''); const [items, setItems] = useState(''); const [price, setPrice] = useState(25);
  const s = useSubmission();
  return <form className="form" onSubmit={e => s.run(e, async () => {
    if (!name.trim() || (quick && (!mealName.trim() || !items.trim()))) throw new Error('请填写店铺、套餐名称和菜品清单');
    if (!safeLink(link.trim())) throw new Error('请填写完整的 http/https 分享链接，不能包含账号密码。');
    const next: Shop = { ...shop, id: shop?.id || newId(), name: name.trim(), platform, link: link.trim(), defaultMinutes: duration, safetyMinutes: safety, note: note.trim(), sort: shop?.sort ?? 0 };
    await save(next, quick ? { id: newId(), shopId: next.id, name: mealName.trim(), items: items.trim(), note: '', price, favorite: true, allowBackup: true } : undefined);
  })}>
    {quick && <p className="soft-note">先存一家常吃的店和一份套餐，下一步就能安排今天的午餐。</p>}
    <Field label="店铺名称"><input autoFocus required maxLength={80} value={name} onChange={e => setName(e.target.value)} placeholder="例如：街角黄焖鸡" /></Field>
    <Field label="外卖平台"><select value={platform} onChange={e => setPlatform(e.target.value as Shop['platform'])}><option>美团</option><option>饿了么</option><option>其他</option></select></Field>
    <Field label="店铺分享链接（可选）" hint="只保存你粘贴的链接，不读取平台内容。没有链接时可自行搜索店铺。"><input type="url" value={link} onChange={e => setLink(e.target.value)} placeholder="https://…" maxLength={2000}/></Field>
    <div className="form-row"><Field label="默认履约耗时 / 分钟"><input type="number" inputMode="numeric" required min={1} max={360} value={duration} onChange={e => setDuration(Number(e.target.value))}/></Field><Field label="安全余量 / 分钟"><input type="number" inputMode="numeric" required min={0} max={120} value={safety} onChange={e => setSafety(Number(e.target.value))}/></Field></div>
    <Field label="店铺备注（可选）"><textarea value={note} onChange={e => setNote(e.target.value)} maxLength={500} placeholder="例如：高峰期经常慢" /></Field>
    {quick && <><div className="form-divider">第一份常吃套餐</div><Field label="套餐名称"><input required value={mealName} onChange={e => setMealName(e.target.value)} maxLength={80} placeholder="例如：黄焖鸡微辣"/></Field><Field label="菜品清单与规格"><textarea required value={items} onChange={e => setItems(e.target.value)} maxLength={2000} placeholder="黄焖鸡小份、米饭一份"/></Field><Field label="预估价格 / 元"><input type="number" inputMode="decimal" required min={0} max={10000} step="0.01" value={price} onChange={e => setPrice(Number(e.target.value))}/></Field></>}
    <ErrorText value={s.error}/><Submit busy={s.busy}>{quick ? '保存，去安排午餐' : '保存店铺'}</Submit>
  </form>;
}
export function MealForm({ meal, shop, save }: { meal?: Meal; shop: Shop; save: (meal: Meal) => Promise<void> }) {
  const [name, setName] = useState(meal?.name || ''); const [items, setItems] = useState(meal?.items || ''); const [note, setNote] = useState(meal?.note || '');
  const [price, setPrice] = useState(meal?.price ?? 25); const [favorite, setFavorite] = useState(meal?.favorite ?? true); const [backup, setBackup] = useState(meal?.allowBackup ?? true);
  const s = useSubmission();
  return <form className="form" onSubmit={e => s.run(e, async () => {
    if (!name.trim() || !items.trim()) throw new Error('请填写套餐名称和菜品清单');
    await save({ id: meal?.id || newId(), shopId: shop.id, name: name.trim(), items: items.trim(), note: note.trim(), price, favorite, allowBackup: backup });
  })}>
    <p className="soft-note">{shop.name} · {shop.platform}</p>
    <Field label="套餐名称"><input autoFocus required maxLength={80} value={name} onChange={e => setName(e.target.value)} placeholder="例如：黄焖鸡微辣"/></Field>
    <Field label="菜品清单与规格"><textarea required maxLength={2000} value={items} onChange={e => setItems(e.target.value)} placeholder="菜品、份量、口味"/></Field>
    <Field label="套餐备注（可选）"><textarea maxLength={500} value={note} onChange={e => setNote(e.target.value)} placeholder="例如：不放香菜"/></Field>
    <Field label="预估价格 / 元"><input type="number" inputMode="decimal" min={0} max={10000} step="0.01" required value={price} onChange={e => setPrice(Number(e.target.value))}/></Field>
    <label className="check-row"><input type="checkbox" checked={favorite} onChange={e => setFavorite(e.target.checked)}/><span>设为常吃套餐</span></label>
    <label className="check-row"><input type="checkbox" checked={backup} onChange={e => setBackup(e.target.checked)}/><span>允许作为备选套餐</span></label>
    <ErrorText value={s.error}/><Submit busy={s.busy}>保存套餐</Submit>
  </form>;
}
export function PlanForm({ plan, data, prefs, initialDate, save }: { plan?: Plan; data: Data; prefs: Preferences; initialDate: string; save: (plan: Plan) => Promise<void> }) {
  const tz = plan?.timezone || zone();
  const [date, setDate] = useState(plan?.date || initialDate);
  const [eatTime, setEatTime] = useState(plan ? localInput(plan.eatAt, tz).slice(11) : prefs.lunchTime);
  const [latestDate, setLatestDate] = useState(plan ? localInput(plan.latestAt, tz).slice(0, 10) : Temporal.PlainDateTime.from(`${initialDate}T${prefs.lunchTime}`).add({ minutes: 30 }).toPlainDate().toString());
  const [latestTime, setLatestTime] = useState(plan ? localInput(plan.latestAt, tz).slice(11) : Temporal.PlainTime.from(prefs.lunchTime).add({ minutes: 30 }).toString({ smallestUnit: 'minute' }));
  const options = [...data.meals].sort((a, b) => Number(b.favorite) - Number(a.favorite));
  const [mealId, setMealId] = useState(plan?.mealId || options[0]?.id || ''); const [backups, setBackups] = useState(plan?.backupIds || []);
  const initialShop = data.shops.find(s => s.id === options.find(m => m.id === (plan?.mealId || options[0]?.id))?.shopId);
  const [safety, setSafety] = useState(plan?.safetyMinutes ?? initialShop?.safetyMinutes ?? prefs.safety);
  const [note, setNote] = useState(plan?.note || ''); const s = useSubmission();
  const meal = data.meals.find(m => m.id === mealId); const shop = data.shops.find(sh => sh.id === meal?.shopId);
  let preview: { eatAt: string; orderAt: string; latestAt: string; minutes: number; basis: string } | undefined; let calculationError = '';
  try {
    const eatAt = toInstant(date, eatTime, tz), latestAt = toInstant(latestDate, latestTime, tz);
    if (shop) { const prediction = predict(shop, mealPeriod(eatAt, tz), data.history); preview = { eatAt, latestAt, orderAt: calculateOrder(eatAt, prediction.minutes, safety), ...prediction }; }
  } catch (err) { calculationError = message(err); }
  const changeEat = (newDate: string, newTime: string) => {
    setDate(newDate); setEatTime(newTime);
    try {
      const next = Temporal.PlainDateTime.from(`${newDate}T${newTime}`).add({ minutes: 30 });
      setLatestDate(next.toPlainDate().toString()); setLatestTime(next.toPlainTime().toString({ smallestUnit: 'minute' }));
    } catch { /* The visible calculation error explains incomplete inputs. */ }
  };
  return <form className="form" onSubmit={e => s.run(e, async () => {
    if (!preview || !meal || !shop) throw new Error(calculationError || '请先建立店铺和套餐');
    if (Date.parse(preview.latestAt) < Date.parse(preview.eatAt)) throw new Error('最晚送达时间不能早于希望吃饭时间；跨日请调整送达日期。');
    if (Date.parse(preview.latestAt) <= Date.now()) throw new Error('这个计划已经过期，请选择未来的吃饭时间。');
    if (Date.parse(preview.orderAt) <= Date.now() && !window.confirm('建议下单时间已过。仍保存计划？保存后请立即自行核对下单，无法为过去的时刻生成提醒。')) return;
    await save({ ...plan, id: plan?.id || newId(), date, timezone: tz, eatAt: preview.eatAt, latestAt: preview.latestAt, orderAt: preview.orderAt, mealId,
      backupIds: backups, safetyMinutes: safety, predictedMinutes: preview.minutes, predictionBasis: preview.basis,
      period: mealPeriod(preview.eatAt, tz), note: note.trim(), status: plan?.status || 'planned', revision: plan ? plan.revision + 1 : 1 });
  })}>
    <div className="form-row"><Field label="吃饭日期"><input autoFocus type="date" required value={date} onChange={e => changeEat(e.target.value, eatTime)}/></Field><Field label="希望开始吃饭"><input type="time" required value={eatTime} onChange={e => changeEat(date, e.target.value)}/></Field></div>
    <Field label="主套餐"><select required value={mealId} onChange={e => {
      setMealId(e.target.value); setBackups(backups.filter(b => b !== e.target.value));
      const nextShop = data.shops.find(sh => sh.id === data.meals.find(m => m.id === e.target.value)?.shopId);
      setSafety(nextShop?.safetyMinutes ?? prefs.safety);
    }}><option value="" disabled>选择套餐</option>{options.map(m => <option key={m.id} value={m.id}>{m.favorite ? '★ ' : ''}{data.shops.find(sh => sh.id === m.shopId)?.name} · {m.name}</option>)}</select></Field>
    {meal && <div className="menu-preview"><strong>{meal.items}</strong>{meal.note && <small>{meal.note}</small>}<small>预估 ¥{meal.price} · 实时价格以官方 App 为准</small></div>}
    <fieldset className="backup-options"><legend>备选套餐 <small>最多 2 份</small></legend>{data.meals.filter(m => m.id !== mealId && (m.allowBackup || backups.includes(m.id))).map(m => <label className="check-row" key={m.id}><input type="checkbox" checked={backups.includes(m.id)} disabled={!backups.includes(m.id) && backups.length >= 2} onChange={e => setBackups(e.target.checked ? [...backups, m.id] : backups.filter(b => b !== m.id))}/><span>{data.shops.find(sh => sh.id === m.shopId)?.name} · {m.name}</span></label>)}{!data.meals.some(m => m.id !== mealId && m.allowBackup) && <p className="muted small">可以稍后在「店铺」中添加备选套餐。</p>}</fieldset>
    <div className="form-row"><Field label="最晚送达日期"><input type="date" required value={latestDate} onChange={e => setLatestDate(e.target.value)}/></Field><Field label="最晚送达时间"><input type="time" required value={latestTime} onChange={e => setLatestTime(e.target.value)}/></Field></div>
    <Field label="这次的安全余量 / 分钟" hint="切换主套餐会带入该店默认余量，可在此调整；历史校准不会更改余量。"><input type="number" inputMode="numeric" required min={0} max={120} value={safety} onChange={e => setSafety(Number(e.target.value))}/></Field>
    <Field label="计划备注（可选）" hint="位置提示仅填“学校办公室”等简短标签，请勿保存详细地址、电话或账号。"><textarea value={note} onChange={e => setNote(e.target.value)} maxLength={500} placeholder="例如：今天想吃清淡一点"/></Field>
    {preview && <div className="calculation"><span>建议下单时间</span><strong>{localInput(preview.orderAt, tz).slice(0, 10) !== date ? `${localInput(preview.orderAt, tz).slice(0, 10)} ` : ''}{formatTime(preview.orderAt, tz)}</strong><small>吃饭时间 − {preview.minutes} 分钟履约 − {safety} 分钟余量</small><small>{preview.basis}</small>{Date.parse(preview.orderAt) <= Date.now() && <small className="warn-text">时间已过，保存后请现在自行核对。</small>}</div>}
    <p className="muted small">时区：{tz}。计划保存后使用本次预测；编辑或换餐时重新计算。跨日下单会显示实际日期。</p>
    {plan?.calendarExportedAt && <p className="notice">修改后请删除旧日历事件，再重新生成提醒。网页不能更新系统日历。</p>}
    <ErrorText value={s.error || calculationError}/><Submit busy={s.busy}>保存午餐计划</Submit>
  </form>;
}
export function HistoryForm({ record, plan, data, save }: { record?: History; plan?: Plan; data: Data; save: (record: History) => Promise<void> }) {
  const linked = plan || data.plans.find(p => p.id === record?.planId);
  const fixedShop = linked ? data.meals.find(m => m.id === linked.mealId)?.shopId : record?.shopId;
  const [shopId, setShopId] = useState(fixedShop || data.shops[0]?.id || ''); const tz = record?.timezone || linked?.timezone || zone();
  const [ordered, setOrdered] = useState(record ? localInput(record.orderedAt, tz) : ''); const [arrived, setArrived] = useState(record ? localInput(record.arrivedAt, tz) : '');
  const [heat, setHeat] = useState(record?.heat ?? 4); const [satisfied, setSatisfied] = useState(record?.satisfied ?? true);
  const [note, setNote] = useState(record?.note || ''); const [valid, setValid] = useState(record?.valid ?? true); const s = useSubmission();
  return <form className="form" onSubmit={e => s.run(e, async () => {
    const orderedAt = toInstant(ordered.slice(0, 10), ordered.slice(11), tz), arrivedAt = toInstant(arrived.slice(0, 10), arrived.slice(11), tz);
    const elapsed = minutesBetween(orderedAt, arrivedAt);
    if (elapsed <= 0 || elapsed > 360) throw new Error('送达时间应晚于下单时间，且耗时不能超过 360 分钟。');
    if (Date.parse(arrivedAt) > Date.now()) throw new Error('实际送达时间不能在未来。');
    await save({ id: record?.id || newId(), shopId, ...(linked ? { planId: linked.id } : {}), orderedAt, arrivedAt, timezone: tz, period: mealPeriod(arrivedAt, tz), heat, satisfied, note: note.trim(), valid });
  })}>
    <p className="soft-note">按实际收到餐的时间归入餐段；午餐为 10:00–15:59。可输入不同日期，支持跨日配送。</p>
    <Field label="店铺"><select required value={shopId} disabled={!!linked} onChange={e => setShopId(e.target.value)}>{data.shops.map(sh => <option key={sh.id} value={sh.id}>{sh.name}</option>)}</select></Field>
    <Field label="实际下单时间"><input type="datetime-local" required value={ordered} onChange={e => setOrdered(e.target.value)}/></Field>
    <Field label="实际送达时间"><input type="datetime-local" required value={arrived} onChange={e => setArrived(e.target.value)}/></Field>
    <fieldset className="heat-field"><legend>收到时的热度</legend><div className="heat-options">{[1, 2, 3, 4, 5].map(n => <label key={n}><input type="radio" name="heat" value={n} checked={heat === n} onChange={() => setHeat(n)}/><span>{n}</span></label>)}</div><small className="muted">1 分凉了 · 3 分温热 · 5 分热乎</small></fieldset>
    <label className="check-row"><input type="checkbox" checked={satisfied} onChange={e => setSatisfied(e.target.checked)}/><span>这次午餐让我满意</span></label>
    <Field label="异常备注（可选）"><textarea maxLength={500} value={note} onChange={e => setNote(e.target.value)} placeholder="例如：暴雨、商家缺货"/></Field>
    <label className="check-row"><input type="checkbox" checked={valid} onChange={e => setValid(e.target.checked)}/><span>作为有效样本，参与预测</span></label><p className="muted small">遇到明显异常可取消勾选；备注本身不会自动排除记录。时区：{tz}。</p>
    <ErrorText value={s.error}/><Submit busy={s.busy}>保存收餐记录</Submit>
  </form>;
}
export function copyPlanToDate(plan: Plan, date: string): Plan {
  const dayGap = Temporal.PlainDate.from(localDate(Date.parse(plan.latestAt), plan.timezone)).since(Temporal.PlainDate.from(plan.date)).days;
  const eatAt = toInstant(date, localInput(plan.eatAt, plan.timezone).slice(11), plan.timezone);
  const latestAt = toInstant(addDays(date, dayGap), localInput(plan.latestAt, plan.timezone).slice(11), plan.timezone);
  return { ...plan, id: '', date, eatAt, latestAt, orderAt: calculateOrder(eatAt, plan.predictedMinutes, plan.safetyMinutes), status: 'planned', revision: 0, calendarExportRevision: undefined, calendarExportedAt: undefined };
}
