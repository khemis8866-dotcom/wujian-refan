import { useEffect, useRef, useState, type ReactNode } from 'react';
import { BowlArt, Empty, ErrorText, Field, Icon, Modal, message, type IconName } from './components';
import { copyPlanToDate, HistoryForm, MealForm, PlanForm, ShopForm } from './forms';
import { addDays, calculateOrder, emptyData, exportData, formatTime, localDate, localInput, mergeData, nearestPlan, parseBackup, planPhase, predict, priceText, revised, safeLink, zone, type Data, type History, type Meal, type Plan, type Preferences, type Shop } from './domain';
import { createICS, downloadFile, reminderDescription } from './ics';
import { readData, readPreferences, writeData, writePreferences } from './storage';

type Tab = 'today' | 'plans' | 'shops' | 'history' | 'settings';
type Dialog = { type: 'shop'; shop?: Shop; quick?: boolean } | { type: 'meal'; shop: Shop; meal?: Meal }
  | { type: 'plan'; plan?: Plan } | { type: 'history'; record?: History; plan?: Plan }
  | { type: 'calendar'; plan: Plan } | { type: 'alternatives'; plan: Plan }
  | { type: 'install' } | { type: 'import'; incoming: Data } | { type: 'clear' };
const tabs: { id: Tab; label: string; icon: IconName }[] = [
  { id: 'today', label: '今天', icon: 'today' }, { id: 'plans', label: '计划', icon: 'calendar' },
  { id: 'shops', label: '店铺', icon: 'shop' }, { id: 'history', label: '历史', icon: 'chart' }, { id: 'settings', label: '设置', icon: 'settings' },
];
const finalNotice = '请在官方 App 核对实时价格、优惠、配送时段和地址后自行付款。';
export default function App() {
  const [data, setData] = useState<Data>(emptyData); 
  const [prefs, setPrefs] = useState<Preferences>(readPreferences);
  const [loading, setLoading] = useState(true); const [loadError, setLoadError] = useState('');
  const [tab, setTab] = useState<Tab>('today'); const [dialog, setDialog] = useState<Dialog>();
  const [now, setNow] = useState(Date.now()); const today = localDate(now);
  const [selectedDate, setSelectedDate] = useState(today); const [toast, setToast] = useState('');
  const [offline, setOffline] = useState(!navigator.onLine); const [cacheState, setCacheState] = useState<'pending' | 'ready' | 'error'>(import.meta.env.DEV ? 'pending' : navigator.serviceWorker?.controller ? 'ready' : 'pending');
  const [busy, setBusy] = useState(false); const lock = useRef(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const load = async () => { setLoading(true); setLoadError(''); try { setData(await readData()); } catch (err) { setLoadError(message(err)); } finally { setLoading(false); } };
  useEffect(() => { void load(); }, []);
  useEffect(() => {
    const tick = () => setNow(Date.now()); const interval = setInterval(tick, 15000);
    const connection = () => setOffline(!navigator.onLine);
    const ready = () => setCacheState('ready'); const failed = () => setCacheState('error');
    window.addEventListener('online', connection); window.addEventListener('offline', connection);
    window.addEventListener('offline-ready', ready); window.addEventListener('offline-error', failed);
    document.addEventListener('visibilitychange', tick); window.addEventListener('pageshow', tick);
    return () => { clearInterval(interval); window.removeEventListener('online', connection); window.removeEventListener('offline', connection); window.removeEventListener('offline-ready', ready); window.removeEventListener('offline-error', failed); document.removeEventListener('visibilitychange', tick); window.removeEventListener('pageshow', tick); };
  }, []);
  useEffect(() => { if (!toast) return; const t = setTimeout(() => setToast(''), 6500); return () => clearTimeout(t); }, [toast]);
  const commit = async (next: Data, notice = '已保存在这台设备', close = true) => {
    if (lock.current) throw new Error('正在保存，请稍候再试。');
    lock.current = true; setBusy(true);
    try { await writeData(next); setData(next); if (close) setDialog(undefined); setToast(notice); }
    finally { lock.current = false; setBusy(false); }
  };
  const act = async (task: () => Promise<void>) => { try { await task(); } catch (err) { setToast(message(err)); } };
  const newPlan = (date = today) => {
    setSelectedDate(date);
    if (!data.meals.length) setDialog({ type: 'shop', quick: true }); else setDialog({ type: 'plan' });
  };
  const getMeal = (p: Plan) => data.meals.find(m => m.id === p.mealId)!;
  const getShop = (p: Plan) => data.shops.find(s => s.id === getMeal(p).shopId)!;
  const savePlan = (p: Plan) => commit({ ...data, plans: [...data.plans.filter(x => x.id !== p.id), p] }, p.calendarExportedAt ? '计划已保存。请删除旧日历事件，重新生成提醒。' : '计划已保存，记得添加下单提醒。');
  const updatePlan = (p: Plan, changes: Partial<Plan>, notice: string) => savePlanWithNotice(revised(p, changes), notice);
  const savePlanWithNotice = (p: Plan, notice: string) => commit({ ...data, plans: data.plans.map(x => x.id === p.id ? p : x) }, notice);
  const changeStatus = (p: Plan, status: Plan['status']) => act(() => updatePlan(p, { status }, status === 'cancelled' ? '今天不点了。若已导入日历，请手动删除旧提醒。' : '已标记为自行下单，收到餐后记一下实际耗时。'));
  const delay = (p: Plan) => act(async () => {
    const orderAt = new Date(Math.max(Date.parse(p.orderAt), Date.now()) + 5 * 60000).toISOString();
    if (Date.parse(orderAt) + p.predictedMinutes * 60000 > Date.parse(p.latestAt)) { setToast('延后可能超过最晚送达时间。请编辑吃饭时间或换一份餐。'); return; }
    await updatePlan(p, { orderAt }, '已延后 5 分钟，仅修改应用内计划。请删除旧日历事件并重新生成提醒。');
  });
  const copy = async (value: string) => {
    try { await navigator.clipboard.writeText(value); setToast('已复制'); }
    catch { setToast('复制失败，请长按页面上的文字手动复制。'); }
  };
  const checklist = (p: Plan) => {
    const meal = getMeal(p), shop = getShop(p);
    return `${shop.name}（${shop.platform}）\n${meal.name}\n${meal.items}\n套餐备注：${meal.note || '无'}\n店铺备注：${shop.note || '无'}\n计划备注：${p.note || '无'}\n预估预算：${priceText(meal.price)}\n${finalNotice}`;
  };
  const sortedShops = [...data.shops].sort((a, b) => a.sort - b.sort);
  const todayPlans = data.plans.filter(p => p.date === today);
  const featured = nearestPlan(todayPlans, now) || todayPlans.find(p => p.status === 'ordered') || nearestPlan(data.plans, now);
  const todayHistory = data.history.filter(h => localDate(Date.parse(h.arrivedAt)) === today).sort((a, b) => Date.parse(b.arrivedAt) - Date.parse(a.arrivedAt));
  const planList = data.plans.filter(p => p.date === selectedDate).sort((a, b) => Date.parse(a.eatAt) - Date.parse(b.eatAt));
  const moveShop = (id: string, offset: number) => act(async () => {
    const list = [...sortedShops]; const from = list.findIndex(s => s.id === id), to = from + offset;
    if (to < 0 || to >= list.length) return;
    [list[from], list[to]] = [list[to], list[from]];
    await commit({ ...data, shops: list.map((s, i) => ({ ...s, sort: i })) }, '店铺顺序已保存', false);
  });
  const deleteMeal = (meal: Meal) => act(async () => {
    const plans = data.plans.filter(p => p.mealId === meal.id); const planIds = new Set(plans.map(p => p.id));
    if (!window.confirm(`删除「${meal.name}」？同时删除以它为主餐的 ${plans.length} 个计划及其关联收餐记录，并从其他计划的备选中移除。已导入的日历事件需自行删除。`)) return;
    await commit({ ...data, meals: data.meals.filter(m => m.id !== meal.id), plans: data.plans.filter(p => !planIds.has(p.id)).map(p => p.backupIds.includes(meal.id) ? revised(p, { backupIds: p.backupIds.filter(id => id !== meal.id) }) : p), history: data.history.filter(h => !h.planId || !planIds.has(h.planId)) }, '套餐及关联数据已删除。请自行删除相关旧日历事件。');
  });
  const deleteShop = (shop: Shop) => act(async () => {
    const meals = new Set(data.meals.filter(m => m.shopId === shop.id).map(m => m.id));
    const plans = new Set(data.plans.filter(p => meals.has(p.mealId)).map(p => p.id));
    if (!window.confirm(`删除「${shop.name}」及它的 ${meals.size} 个套餐、${plans.size} 个主餐计划和全部店铺历史？建议先导出备份。已导入的日历事件需自行删除。`)) return;
    await commit({ shops: data.shops.filter(s => s.id !== shop.id), meals: data.meals.filter(m => !meals.has(m.id)), plans: data.plans.filter(p => !plans.has(p.id)).map(p => p.backupIds.some(id => meals.has(id)) ? revised(p, { backupIds: p.backupIds.filter(id => !meals.has(id)) }) : p), history: data.history.filter(h => h.shopId !== shop.id && (!h.planId || !plans.has(h.planId))) }, '店铺及关联数据已删除。请自行删除相关旧日历事件。');
  });
  const historyRows = (records: History[]) => records.map(h => <div className="history-row" key={h.id}><div className="history-dot"><Icon name="bowl" size={20}/></div><div className="grow"><strong>{data.shops.find(s => s.id === h.shopId)?.name}</strong><p>{formatTime(h.arrivedAt, h.timezone, true)} · {Number(((Date.parse(h.arrivedAt) - Date.parse(h.orderedAt)) / 60000).toFixed(1))} 分钟 · 热度 {h.heat}/5</p>{h.note && <p>{h.note}</p>}<small>{h.satisfied ? '满意' : '不满意'} · {h.valid ? '有效样本' : '不参与预测'}</small></div><button className="text-button" onClick={() => setDialog({ type: 'history', record: h })}>编辑</button></div>);
  const shopLink = (shop: Shop) => shop.link && safeLink(shop.link) ? <a className="primary" href={shop.link} target="_blank" rel="noopener noreferrer" referrerPolicy="no-referrer"><Icon name="shop" size={19}/>打开店铺<Icon name="arrow" size={18}/></a> : <button className="primary" onClick={async () => { await copy(shop.name); setToast('未保存链接，请在官方 App 搜索店铺名称；可在「店铺」补充分享链接。'); }}>自行搜索店铺</button>;
  function planCard(p: Plan, prominent = false) {
    const shop = getShop(p), meal = getMeal(p), phase = planPhase(p, now), planned = p.status === 'planned';
    const active = planned && phase !== '已过期'; const diff = Math.ceil((Date.parse(p.orderAt) - now) / 60000);
    return <article className={`plan-card ${prominent ? 'featured' : ''}`} key={p.id}>
      <div className="card-top"><span className={`badge ${phase === '该下单了' ? 'coral' : ''}`}>{phase === '该下单了' && <span className="live-dot"/>}{phase}</span><span className="muted small">{p.date === today ? '今天' : p.date} · {shop.platform}</span></div>
      <div className="order-time"><div><span>建议下单</span><strong>{formatTime(p.orderAt, p.timezone)}</strong></div><div className="countdown">{planned ? phase === '已过期' ? '已过最晚送达时间' : diff > 0 ? <>还有 <b>{diff >= 60 ? `${Math.floor(diff / 60)} 小时 ${diff % 60}` : diff}</b> 分钟</> : `已到下单时刻${diff < 0 ? ` · 晚了 ${Math.abs(diff)} 分钟` : ''}` : phase}</div></div>
      {localDate(Date.parse(p.orderAt), p.timezone) !== p.date && <p className="notice small">跨日提醒：{localDate(Date.parse(p.orderAt), p.timezone)} 下单</p>}
      <div className="meal-title"><span className="meal-symbol"><Icon name="bowl" size={27}/></span><div className="grow"><h3>{shop.name}</h3><p>{meal.name}</p></div><strong className="budget">{priceText(meal.price)}<small>预估</small></strong></div>
      <p className="meal-items">{meal.items}</p>
      {(meal.note || shop.note || p.note) && <div className="notes">{meal.note && <p>套餐 · {meal.note}</p>}{shop.note && <p>店铺 · {shop.note}</p>}{p.note && <p>这次 · {p.note}</p>}</div>}
      <div className="time-line"><span><i/>预计履约 {p.predictedMinutes} 分</span><span><i/>余量 {p.safetyMinutes} 分</span><span><i/>希望 {formatTime(p.eatAt, p.timezone)} 开饭</span></div>
      <p className="small muted">最晚 {formatTime(p.latestAt, p.timezone, true)} 送达 · {p.timezone}</p>
      {prominent && <div className="reason"><Icon name="leaf" size={18}/><div><strong>{phase === '该下单了' ? '建议现在下单' : '为什么是这个时间？'}</strong><p>{p.predictionBasis}。为 {formatTime(p.eatAt, p.timezone)} 开饭，另留 {p.safetyMinutes} 分钟余量。</p>{Date.parse(p.orderAt) + (p.predictedMinutes + p.safetyMinutes) * 60000 > Date.parse(p.eatAt) + 60000 && <p>已手动延后，预计开饭时间可能推迟。</p>}</div></div>}
      {(active || p.status === 'ordered') && <><p className="final-notice">{finalNotice}</p><div className="action-pair">{shopLink(shop)}<button className="secondary" onClick={() => void copy(checklist(p))}>复制点餐清单</button></div></>}
      {planned && <><button className="calendar-button" onClick={() => setDialog({ type: 'calendar', plan: p })} disabled={phase === '已过期'}><Icon name="calendar" size={19}/>{p.calendarExportRevision === p.revision ? '再次生成日历提醒' : '添加下单提醒'}<Icon name="arrow" size={17}/></button>
      {p.calendarExportedAt && <p className={`calendar-state ${p.calendarExportRevision !== p.revision ? 'warn-text' : ''}`}>{p.calendarExportRevision !== p.revision ? '计划已变更：请删除旧日历事件并重新生成。' : '已生成日历文件 · 是否已添加，请到系统日历确认。'}</p>}</>}
      <div className="plan-tools">
        {active && <><button onClick={() => void delay(p)} disabled={busy}>延后 5 分钟</button><button onClick={() => setDialog({ type: 'alternatives', plan: p })}>换备选餐</button><button onClick={() => { if (window.confirm('今天不点了？如已导入日历，请手动删除旧事件。')) void changeStatus(p, 'cancelled'); }} disabled={busy}>今天不点了</button></>}
        {(planned || p.status === 'ordered') && <button onClick={() => setDialog({ type: 'plan', plan: p })}>编辑计划</button>}
        {active && <button onClick={() => void changeStatus(p, 'ordered')} disabled={busy}>我已自行下单</button>}
        {(p.status === 'ordered' || (planned && Date.parse(p.orderAt) <= now) || (p.status === 'completed' && !data.history.some(h => h.planId === p.id))) && <button onClick={() => setDialog({ type: 'history', plan: p })}>记录收餐</button>}
        <button onClick={() => { void act(async () => { if (!window.confirm('删除该计划及关联收餐记录？已导入的日历事件需自行删除。')) return; await commit({ ...data, plans: data.plans.filter(x => x.id !== p.id), history: data.history.filter(h => h.planId !== p.id) }, '计划已删除。请自行删除旧日历事件。'); }); }}>删除计划</button>
      </div>
    </article>;
  }
  const savePreferences = (value: Preferences) => {
    try { writePreferences(value); setPrefs(value); setToast('默认偏好已保存，已有店铺和计划的手动设置保持原值。'); }
    catch { setToast('偏好保存失败，请检查浏览器是否允许本地存储。'); }
  };
  let content: ReactNode;
  if (loading) content = <div className="loading">正在打开你的午餐本…</div>;
  else if (loadError) content = <div className="panel"><h2>暂时无法读取本地数据</h2><p role="alert">{loadError}</p><button className="primary" onClick={() => void load()}>重新读取</button><button className="secondary" onClick={() => fileRef.current?.click()}>从 JSON 备份恢复</button><button className="danger-link" onClick={() => setDialog({ type: 'clear' })}>清空损坏数据并重新开始</button></div>;
  else if (tab === 'today') content = <>
    <section className={`hero ${featured ? 'compact' : ''}`}><div className="hero-copy"><span className="eyebrow">给午餐留一点从容</span><h2>{featured ? <>选好了，<br/>到点再下单。</> : <>提前想好吃什么，<br/>热乎留到午间。</>}</h2><p>早一点选菜，刚刚好开饭。</p>{!featured && <button className="primary" onClick={() => newPlan()}><Icon name="plus" size={20}/>{data.meals.length ? '安排今天的午餐' : '安排第一顿午餐'}<Icon name="arrow" size={18}/></button>}</div><BowlArt/></section>
    <div className="section-heading"><div><span className="eyebrow">TODAY’S LUNCH</span><h2>{featured?.date === today ? '今天，吃点好的' : featured ? '下一顿，已安排' : '今天的午餐'}</h2></div><button className="text-button" onClick={() => newPlan()}><Icon name="plus" size={18}/>新建计划</button></div>
    {featured ? planCard(featured, true) : <div className="panel start-panel"><div className="start-top"><span className="step-number">01</span><div><h3>三步，安心等开饭</h3><p>第一次使用大约 3 分钟，之后每天不到 1 分钟。</p></div></div><ol className="steps"><li><span className={data.shops.length ? 'done' : ''}>{data.shops.length ? <Icon name="check" size={14}/> : '1'}</span><div><strong>存一家常吃的店</strong><p>连同口味、套餐和预估预算</p></div></li><li><span>2</span><div><strong>选好开饭时间</strong><p>按店铺耗时，倒推合适的下单时刻</p></div></li><li><span>3</span><div><strong>添加到系统日历</strong><p>到点提醒你，自己去官方 App 下单</p></div></li></ol><button className="secondary full" onClick={() => newPlan()}>{data.meals.length ? '新建午餐计划' : '从常吃的店开始'}<Icon name="arrow" size={18}/></button></div>}
    {todayPlans.filter(p => p.id !== featured?.id).length > 0 && <details className="other-plans"><summary>今天其他计划 · {todayPlans.filter(p => p.id !== featured?.id).length} 个</summary>{todayPlans.filter(p => p.id !== featured?.id).map(p => planCard(p))}</details>}
    <div className="local-strip"><span className="local-mark"><Icon name="leaf" size={20}/></span><div><strong>只存在你的手机里</strong><p>无需登录 · 离线可用 · 日历提醒</p></div><span className="tiny-dot"/></div>
    <div className="section-heading"><h2>今天的收餐记录</h2><button className="text-button" disabled={!data.shops.length} onClick={() => setDialog({ type: 'history' })}>记一笔</button></div>
    <div className="panel">{todayHistory.length ? historyRows(todayHistory) : <div className="small-empty"><Icon name="clock" size={24}/><p>收到热乎的饭，记一下实际耗时。<br/><span>下次就能算得更贴近你的日常。</span></p></div>}</div>
    <p className="footer-note">好好吃饭，也给自己一点从容。</p>
  </>;
  else if (tab === 'plans') content = <>
    <PageTitle eyebrow="YOUR LUNCH PLANS" title="把午餐，提前安排好" description="按计划吃饭，按自己的节奏下单。" action={<button className="primary" onClick={() => newPlan(selectedDate)}><Icon name="plus" size={18}/>新建计划</button>}/>
    <div className="panel date-panel"><div className="date-controls"><button className="icon-button" aria-label="前一周" onClick={() => setSelectedDate(addDays(selectedDate, -7))}>‹</button><Field label="查看日期"><input type="date" value={selectedDate} onChange={e => { if (e.target.value) setSelectedDate(e.target.value); }}/></Field><button className="icon-button" aria-label="后一周" onClick={() => setSelectedDate(addDays(selectedDate, 7))}>›</button></div><div className="week-strip">{Array.from({ length: 7 }, (_, i) => addDays(selectedDate, i - 3)).map(date => <button key={date} className={date === selectedDate ? 'selected' : ''} onClick={() => setSelectedDate(date)} aria-label={`${date}${data.plans.some(p => p.date === date) ? ' 有计划' : ''}`}><small>{date === today ? '今天' : new Intl.DateTimeFormat('zh-CN', { weekday: 'short', timeZone: 'UTC' }).format(new Date(`${date}T12:00:00Z`))}</small><strong>{Number(date.slice(8))}</strong><i className={data.plans.some(p => p.date === date) ? 'has-plan' : ''}/></button>)}</div></div>
    <div className="section-heading"><h2>{selectedDate === today ? '今天' : selectedDate} · {planList.length} 个计划</h2><button className="text-button" onClick={() => {
      const yesterday = data.plans.filter(p => p.date === addDays(selectedDate, -1) && p.status !== 'cancelled').sort((a, b) => Date.parse(a.eatAt) - Date.parse(b.eatAt))[0];
      if (!yesterday) { setToast('前一天没有可复制的计划，先新建一个吧。'); return; }
      try { setDialog({ type: 'plan', plan: copyPlanToDate(yesterday, selectedDate) }); } catch (err) { setToast(message(err)); }
    }}>复制昨天计划</button></div>
    {planList.length ? planList.map(p => planCard(p)) : <div className="panel"><Empty title="这一天，还没安排午餐" action={<button className="primary" onClick={() => newPlan(selectedDate)}>安排这一餐</button>}>选一家喜欢的店，留一个合适的时间。</Empty></div>}
    {data.plans.some(p => p.date !== selectedDate) && <div className="panel upcoming"><h3>其他日期</h3>{[...new Set(data.plans.map(p => p.date))].filter(d => d !== selectedDate).sort().reverse().map(date => <button className="list-link" key={date} onClick={() => setSelectedDate(date)}><span>{date}</span><span>{data.plans.filter(p => p.date === date).length} 个计划 <Icon name="arrow" size={17}/></span></button>)}</div>}
  </>;
  else if (tab === 'shops') content = <>
    <PageTitle eyebrow="YOUR LITTLE FOOD LIST" title="常吃的店，喜欢的味道" description="记住你的口味，下次少一点纠结。" action={<button className="primary" onClick={() => setDialog({ type: 'shop' })}><Icon name="plus" size={18}/>添加店铺</button>}/>
    {!sortedShops.length ? <div className="panel"><Empty title="收藏第一家常吃的店" action={<button className="primary" onClick={() => setDialog({ type: 'shop', quick: true })}>添加店铺与套餐</button>}>保存分享链接、常吃套餐和配送耗时。</Empty></div> : sortedShops.map((shop, index) => <section className="panel shop-card" key={shop.id}><div className="shop-heading"><span className="shop-symbol"><Icon name="shop" size={25}/></span><div className="grow"><h2>{shop.name}</h2><p>{shop.platform} · 默认 {shop.defaultMinutes} 分钟 · 余量 {shop.safetyMinutes} 分钟</p></div><button className="text-button" onClick={() => setDialog({ type: 'shop', shop })}>编辑</button></div>{shop.note && <p className="notes">{shop.note}</p>}<p className="link-preview">{shop.link || '尚未保存店铺链接，可在编辑中添加。'}</p><div className="shop-tools"><button disabled={index === 0 || busy} onClick={() => void moveShop(shop.id, -1)} aria-label={`上移${shop.name}`}>↑ 上移</button><button disabled={index === sortedShops.length - 1 || busy} onClick={() => void moveShop(shop.id, 1)} aria-label={`下移${shop.name}`}>↓ 下移</button><button onClick={() => void deleteShop(shop)} disabled={busy}>删除店铺</button></div>
    <div className="meal-list">{data.meals.filter(m => m.shopId === shop.id).map(meal => <div className="saved-meal" key={meal.id}><div className="saved-meal-top"><strong>{meal.name}</strong><b>{priceText(meal.price)}</b></div><p>{meal.items}</p>{meal.note && <p className="muted">备注：{meal.note}</p>}<div className="saved-meal-bottom"><span>{meal.favorite && <small className="tag">常吃</small>}{meal.allowBackup && <small className="tag green">可备选</small>}</span><div><button className="text-button" onClick={() => setDialog({ type: 'meal', shop, meal })}>编辑</button><button className="text-button muted" onClick={() => void deleteMeal(meal)} disabled={busy}>删除</button></div></div></div>)}</div><button className="add-meal" onClick={() => setDialog({ type: 'meal', shop })}><Icon name="plus" size={18}/>添加套餐</button></section>)}
  </>;
  else if (tab === 'history') content = <>
    <PageTitle eyebrow="A LITTLE MORE ACCURATE" title="每一餐，都更了解一点" description="让真实耗时，慢慢校准下一次的等待。" action={<button className="primary" disabled={!data.shops.length} onClick={() => setDialog({ type: 'history' })}><Icon name="plus" size={18}/>记录收餐</button>}/>
    <div className="prediction-explainer"><Icon name="chart" size={26}/><p><strong>同一家店 · 同一餐段 · 最近 8 次</strong><br/>取有效记录的中位数；不足 3 次，使用店铺默认耗时。午餐餐段为 10:00–15:59，其他时段单独计算。安全余量由你决定。</p></div>
    {!sortedShops.length ? <div className="panel"><Empty title="先存一家店，再慢慢校准">每次收餐后，记下真实的下单和送达时间。</Empty></div> : sortedShops.map(shop => {
      const pred = predict(shop, '午餐', data.history); const records = data.history.filter(h => h.shopId === shop.id).sort((a, b) => Date.parse(b.arrivedAt) - Date.parse(a.arrivedAt));
      return <section className="panel prediction-card" key={shop.id}><div className="card-top"><h2>{shop.name}</h2><span className="badge">午餐预测</span></div><div className="prediction-number"><strong>{Number(pred.minutes.toFixed(2))}</strong><span>分钟</span><small>安全余量 {shop.safetyMinutes} 分钟</small></div><p>{pred.basis}</p>{shop.predictionResetAt && <p className="muted small">已重置于 {formatTime(shop.predictionResetAt, zone(), true)}，只使用此后的有效记录。</p>}
      <Trend records={pred.samples}/><div className="prediction-actions"><small className="muted">预测变化不会自动更新已保存计划。</small><button className="text-button" disabled={busy} onClick={() => void act(async () => { if (!window.confirm('重置这家店的预测？历史记录会保留，重置后仅使用新到达的有效记录；已有计划和安全余量不变。')) return; await commit({ ...data, shops: data.shops.map(s => s.id === shop.id ? { ...s, predictionResetAt: new Date().toISOString() } : s) }, '预测已重置，将回退到店铺默认耗时。', false); })}>手动重置预测</button></div>
      <details className="record-details"><summary>全部记录 · {records.length} 次</summary>{records.length ? <>{historyRows(records)}{records.map(h => <button className="delete-record" key={h.id} onClick={() => void act(async () => { if (!window.confirm('删除这条收餐记录？预测会按剩余有效样本重新计算。')) return; await commit({ ...data, history: data.history.filter(x => x.id !== h.id) }, '收餐记录已删除', false); })}>删除 {formatTime(h.arrivedAt, h.timezone, true)} 的记录</button>)}</> : <p className="muted small">还没有收餐记录。</p>}</details></section>;
    })}
  </>;
  else content = <>
    <PageTitle eyebrow="MAKE YOURSELF AT HOME" title="按你的习惯来" description="一个安静、只为你服务的午餐本。"/>
    <PreferencesForm prefs={prefs} save={savePreferences}/>
    <section className="panel settings-panel"><h2>数据与备份</h2><p>店铺、套餐、计划与历史只保存在当前浏览器的 IndexedDB。导出文件不包含界面偏好。</p><div className="action-pair"><button className="secondary" onClick={() => { try { downloadFile(exportData(data), `午间热饭备份-${today}.json`, 'application/json;charset=utf-8'); setToast('备份文件已生成，请保存在你选择的位置。'); } catch (err) { setToast(message(err)); } }}><Icon name="download" size={18}/>导出 JSON</button><button className="secondary" onClick={() => fileRef.current?.click()}>导入 JSON</button></div><p className="small muted">清除 Safari 网站数据、换浏览器或更换网址后，数据不会自动迁移。请定期备份；文件中包含你的菜单与计划，请妥善保管。</p><button className="danger-link" onClick={() => setDialog({ type: 'clear' })}>清空全部本地数据</button></section>
    <section className="panel settings-panel"><h2>主屏幕与离线</h2><button className="list-link" onClick={() => setDialog({ type: 'install' })}><span>iPhone 添加到主屏幕</span><Icon name="arrow" size={18}/></button><p className="small"><span className={`status-dot ${cacheState === 'ready' ? 'ready' : ''}`}/>{cacheState === 'ready' ? '应用资源已缓存，可离线查看与编辑' : cacheState === 'error' ? '离线缓存失败，请联网刷新页面后重试' : import.meta.env.DEV ? '开发模式不启用离线缓存，请用生产预览验收' : '正在准备离线资源，请保持联网片刻'}</p><p className="small muted">{navigator.standalone || matchMedia('(display-mode: standalone)').matches ? '当前以主屏幕应用模式打开。' : '当前是浏览器窗口；建议安装后在主屏幕应用中建立正式数据。'} 网页倒计时只在打开时更新，不在后台定时通知。</p><button className="text-button" onClick={() => void act(async () => { const granted = await navigator.storage?.persist?.(); setToast(granted ? '浏览器已允许持久存储，仍建议定期备份。' : '浏览器未保证持久存储，请定期导出 JSON 备份。'); })}>请求保留本地存储</button></section>
    <section className="panel settings-panel"><h2>日历提醒怎么生效</h2><ol className="plain-steps"><li>在计划详情中点击「添加下单提醒」。</li><li>下载或分享 .ics 文件，在系统提供的日历界面确认添加。</li><li>首次使用，前往 iPhone 设置允许「日历」通知，并检查事件提醒设为「事件发生时」。</li><li>修改、延后、换餐或取消后，手动删除旧事件；需要提醒时重新生成。</li></ol><p className="notice">网页不能得知你是否完成导入，也不能替你授予通知权限。请到日历中找到事件并确认提醒。</p><p className="small muted">部分 iOS 版本从 Safari／「文件」打开本地 ICS 可能只显示预览；若没有添加入口，可复制提醒信息，在系统日历手动新建事件。无需上传私人计划。也可通过 AirDrop 将 ICS 传到自己的 Mac 并在日历中导入。具体入口见 README。</p></section>
    <section className="panel settings-panel"><h2>隐私，简单明白</h2><p>不登录，不接入外卖平台，不保存账号、密码、验证码、Cookie 或支付信息；不抓取、不自动下单、不自动付款。不使用后端、统计、广告或云端接口。</p><p>仅在你点击「打开店铺」时交给保存的外部链接；实时价格、配送时间和付款均由你在官方 App 确认。应用不收集地址，只建议在备注保存简短的位置标签。</p><p className="small muted">首次加载和更新仅请求同站点静态资源，不发送本地菜单、计划或历史。手动导出的文件由你保管。若把事件加入 iCloud 等日历，是否同步由系统日历账户设置决定，可优先选择本机日历（如可用）。</p></section><p className="footer-note">午间热饭 1.0 · 让等待刚刚好</p>
  </>;
  let modal: ReactNode;
  if (dialog?.type === 'shop') modal = <Modal notice={toast} title={dialog.quick ? '先存一份喜欢的午餐' : dialog.shop ? '编辑店铺' : '添加店铺'} close={() => setDialog(undefined)}><ShopForm shop={dialog.shop} prefs={prefs} quick={dialog.quick} save={async (shop, meal) => { const next = { ...data, shops: [...data.shops.filter(s => s.id !== shop.id), { ...shop, sort: dialog.shop ? shop.sort : data.shops.length }], meals: meal ? [...data.meals, meal] : data.meals, plans: dialog.shop ? data.plans.map(p => data.meals.some(m => m.shopId === shop.id && (m.id === p.mealId || p.backupIds.includes(m.id))) ? revised(p, {}) : p) : data.plans }; await commit(next, meal ? '店铺和套餐已保存，继续选一个开饭时间。' : '店铺已保存'); if (meal) setDialog({ type: 'plan' }); }}/></Modal>;
  else if (dialog?.type === 'meal') modal = <Modal notice={toast} title={dialog.meal ? '编辑套餐' : '添加套餐'} close={() => setDialog(undefined)}><MealForm meal={dialog.meal} shop={dialog.shop} save={meal => commit({ ...data, meals: [...data.meals.filter(m => m.id !== meal.id), meal], plans: dialog.meal ? data.plans.map(p => p.mealId === meal.id || p.backupIds.includes(meal.id) ? revised(p, {}) : p) : data.plans }, '套餐已保存。如有已生成的关联提醒，请删除旧事件并重新生成。')}/></Modal>;
  else if (dialog?.type === 'plan') modal = <Modal notice={toast} title={dialog.plan?.id ? '编辑午餐计划' : '安排一顿午餐'} close={() => setDialog(undefined)}><PlanForm key={dialog.plan?.id || 'new'} plan={dialog.plan} data={data} prefs={prefs} initialDate={selectedDate} save={savePlan}/></Modal>;
  else if (dialog?.type === 'history') modal = <Modal notice={toast} title={dialog.record ? '编辑收餐记录' : '这顿饭，等了多久？'} close={() => setDialog(undefined)}><HistoryForm record={dialog.record} plan={dialog.plan} data={data} save={record => commit({ ...data, history: [...data.history.filter(h => h.id !== record.id), record], plans: data.plans.map(p => p.id === record.planId ? revised(p, { status: 'completed' }) : p) }, '收餐记录已保存，预测已按有效样本重新计算。')}/></Modal>;
  else if (dialog?.type === 'calendar') { const p = data.plans.find(p => p.id === dialog.plan.id) || dialog.plan; modal = <Modal notice={toast} title="添加下单提醒" close={() => setDialog(undefined)}><CalendarPanel plan={p} shop={getShop(p)} meal={getMeal(p)} copy={copy} exported={async () => { await commit({ ...data, plans: data.plans.map(x => x.id === p.id ? { ...p, calendarExportRevision: p.revision, calendarExportedAt: new Date().toISOString() } : x) }, '日历文件已交给系统，请在系统日历确认添加。', false); }}/></Modal>; }
  else if (dialog?.type === 'alternatives') { const p = dialog.plan; modal = <Modal notice={toast} title="换一份备选餐" close={() => setDialog(undefined)}><p className="soft-note">换餐会按新店铺重新预测，保留你为本次计划设置的安全余量，并恢复按开饭时间倒推。</p>{p.backupIds.length ? p.backupIds.map(id => { const meal = data.meals.find(m => m.id === id)!, shop = data.shops.find(s => s.id === meal.shopId)!; const pred = predict(shop, p.period, data.history); return <button className="alternative" key={id} disabled={busy} onClick={() => void act(() => updatePlan(p, { mealId: id, backupIds: [p.mealId, ...p.backupIds.filter(b => b !== id)].filter((b, i) => i < 2 && data.meals.find(m => m.id === b)?.allowBackup), predictedMinutes: pred.minutes, predictionBasis: pred.basis, orderAt: calculateOrder(p.eatAt, pred.minutes, p.safetyMinutes) }, '已换备选餐。请删除旧日历事件并重新生成提醒。'))}><span><strong>{meal.name}</strong><small>{shop.name} · 预测 {pred.minutes} 分钟</small></span><b>{priceText(meal.price)}</b><Icon name="arrow" size={18}/></button>; }) : <Empty title="还没有备选餐">编辑计划，最多选择两份可备选套餐。</Empty>}<button className="secondary full" onClick={() => setDialog({ type: 'plan', plan: p })}>编辑计划与备选</button></Modal>; }
  else if (dialog?.type === 'install') modal = <Modal notice={toast} title="把热饭，放到主屏幕" close={() => setDialog(undefined)}><div className="install-logo"><Icon name="bowl" size={42}/></div><ol className="plain-steps"><li>在 iOS 17 或以上的 iPhone 中，用 Safari 打开已部署的 HTTPS 网址。</li><li>点击 Safari 的「分享」按钮（方框向上箭头）。</li><li>选择「添加到主屏幕」，名称保留「午间热饭」，点击「添加」。</li><li>从主屏幕图标打开，联网等待一次资源缓存完成，再建立正式数据。</li></ol><p className="notice">Safari 窗口与主屏幕应用的数据共享行为可能随 iOS 版本变化。若未带入数据，可在原窗口导出 JSON，再到主屏幕应用导入。</p><p className="small muted">离线时可以查看、编辑和导出。打开外卖店铺需要网络。系统提醒由已导入的日历事件负责。</p></Modal>;
  else if (dialog?.type === 'import') modal = <Modal notice={toast} title="导入本地备份" close={() => setDialog(undefined)}><ImportPanel incoming={dialog.incoming} current={data} replaceOnly={Boolean(loadError)} save={async mode => { if (mode === 'replace' && !window.confirm('确认覆盖当前全部店铺、套餐、计划和历史？建议先导出当前数据。')) return; await commit(mode === 'replace' ? dialog.incoming : mergeData(data, dialog.incoming), '备份已导入。系统日历不随导入改变，请自行核对已有事件。'); setLoadError(''); }}/></Modal>;
  else if (dialog?.type === 'clear') modal = <Modal notice={toast} title="清空全部本地数据" close={() => setDialog(undefined)}><ClearPanel busy={busy} clear={async () => { if (!window.confirm('最后确认：删除所有店铺、套餐、计划、历史和界面偏好？此操作不可撤销；系统日历事件需另外手动删除。')) return; await commit(emptyData(), '全部本地记录已清空。系统日历中的事件请自行删除。'); setLoadError(''); try { localStorage.removeItem('lunch-preferences'); } catch { setToast('记录已清空，但界面偏好清除失败，请在 Safari 网站设置中处理。'); } setPrefs({ safety: 5, lunchTime: '12:15' }); }}/></Modal>;
  return <div className="app-shell"><aside className="sidebar"><div className="brand"><span className="brand-icon"><Icon name="bowl" size={27}/></span><div><h1>午间热饭</h1><p>让等待刚刚好</p></div></div><nav aria-label="主导航">{tabs.map(t => <button key={t.id} aria-current={tab === t.id ? 'page' : undefined} className={tab === t.id ? 'active' : ''} onClick={() => { setTab(t.id); window.scrollTo({ top: 0 }); }}><Icon name={t.icon}/><span>{t.label === '店铺' ? <><span className="desktop-only">店铺与套餐</span><span className="mobile-only">店铺</span></> : t.label === '历史' ? <><span className="desktop-only">历史与预测</span><span className="mobile-only">历史</span></> : t.label}</span></button>)}</nav><div className="sidebar-bottom"><Icon name="leaf" size={18}/><p>认真吃饭<br/>也是认真生活</p></div></aside>
    <div className="main-wrap"><header className="topbar"><div className="mobile-brand"><span className="brand-icon"><Icon name="bowl" size={22}/></span><strong>午间热饭</strong></div><div className="day-heading">{new Intl.DateTimeFormat('zh-CN', { month: 'long', day: 'numeric', weekday: 'long' }).format(now)}</div><button className="connection-badge" onClick={() => setTab('settings')}><span className={`status-dot ${offline ? '' : 'ready'}`}/>{offline ? '离线可编辑' : '本地保存'}</button></header><main aria-busy={loading || busy}>{offline && cacheState !== 'ready' && <p className="notice">当前已离线，现有数据仍可编辑；应用资源尚未确认缓存，联网后请在设置中检查。</p>}{content}</main></div>
    <input type="file" accept=".json,application/json" ref={fileRef} hidden aria-label="选择 JSON 备份" onChange={e => { const file = e.target.files?.[0]; e.target.value = ''; if (!file) return; void act(async () => { if (file.size > 10 * 1024 * 1024) throw new Error('请选择小于 10 MB 的备份文件。'); setDialog({ type: 'import', incoming: parseBackup(await file.text()) }); }); }}/>
    {modal}<div className={`toast ${toast ? 'visible' : ''}`} role="status" aria-live="polite">{toast}</div>
  </div>;
}
function PageTitle({ eyebrow, title, description, action }: { eyebrow: string; title: string; description: string; action?: ReactNode }) { return <div className="page-title"><span className="eyebrow">{eyebrow}</span><h2>{title}</h2><p>{description}</p>{action}</div>; }
function Trend({ records }: { records: History[] }) {
  if (!records.length) return <div className="trend-empty">收餐后记一笔，耗时趋势会出现在这里。</div>;
  const rows = [...records].reverse(), values = rows.map(r => (Date.parse(r.arrivedAt) - Date.parse(r.orderedAt)) / 60000); const max = Math.max(...values, 1);
  return <div className="trend" role="img" aria-label={`最近有效午餐耗时：${values.join('、')} 分钟`}><div className="trend-bars">{rows.map((r, i) => <div className="trend-col" key={r.id}><small>{Number(values[i].toFixed(1))}′</small><div className="trend-bar" style={{ height: `${Math.max(8, values[i] / max * 74)}px` }}/><span>{localDate(Date.parse(r.arrivedAt), r.timezone).slice(5).replace('-', '/')}</span><small>热度 {r.heat}</small></div>)}</div></div>;
}
function PreferencesForm({ prefs, save }: { prefs: Preferences; save: (p: Preferences) => void }) {
  const [safety, setSafety] = useState(prefs.safety), [lunchTime, setLunchTime] = useState(prefs.lunchTime);
  useEffect(() => { setSafety(prefs.safety); setLunchTime(prefs.lunchTime); }, [prefs]);
  return <form className="panel settings-panel form" onSubmit={e => { e.preventDefault(); save({ safety, lunchTime }); }}><h2>午餐默认偏好</h2><div className="form-row"><Field label="默认开饭时间"><input type="time" required value={lunchTime} onChange={e => setLunchTime(e.target.value)}/></Field><Field label="默认安全余量 / 分钟"><input type="number" inputMode="numeric" required min={0} max={120} value={safety} onChange={e => setSafety(Number(e.target.value))}/></Field></div><p className="small muted">余量用于新店铺的初始值，计划优先使用店铺设置。不会自动改动已有店铺或计划。</p><button className="secondary" type="submit">保存默认偏好</button></form>;
}
function CalendarPanel({ plan, shop, meal, copy, exported }: { plan: Plan; shop: Shop; meal: Meal; copy: (s: string) => Promise<void>; exported: () => Promise<void> }) {
  const [error, setError] = useState(''); const [working, setWorking] = useState(false);
  const make = async (share: boolean) => {
    if (working) return; setWorking(true); setError('');
    try {
      const content = createICS(plan, shop, meal), filename = `午间热饭-${plan.date}-r${plan.revision}.ics`;
      const file = new File([content], filename, { type: 'text/calendar;charset=utf-8' });
      if (share && navigator.canShare?.({ files: [file] })) { await navigator.share({ files: [file], title: `该点外卖了：${shop.name}` }); }
      else if (share) { throw new Error('当前环境不支持分享日历文件，请使用「下载 ICS 文件」。'); }
      else downloadFile(content, filename, 'text/calendar;charset=utf-8');
      await exported();
    } catch (err) { setError(err instanceof DOMException && err.name === 'AbortError' ? '已取消分享，尚未确认添加日历。' : message(err)); }
    finally { setWorking(false); }
  };
  const past = Date.parse(plan.orderAt) <= Date.now() || plan.status !== 'planned';
  return <div className="calendar-panel"><div className="calendar-preview"><span>该点外卖了：{shop.name}</span><strong>{formatTime(plan.orderAt, plan.timezone)}</strong><p>{localDate(Date.parse(plan.orderAt), plan.timezone)} · {plan.timezone}</p><small>事件开始时提醒 · {meal.name}</small></div>{plan.calendarExportedAt && <p className="notice">请先删除旧日历事件，再导入本次文件，避免重复提醒。网页不能自动更新日历。</p>}<ol className="plain-steps"><li>下载 / 打开 ICS，或使用系统分享面板选择可用的日历入口。</li><li>在系统日历中确认添加，并检查提醒设为「事件发生时」。首次使用需在 iPhone 设置中允许日历通知。</li><li>回到系统日历，确认已出现这条事件。生成文件并不等于已添加。</li></ol>{past && <p className="notice">下单时间已过或计划已结束。请现在自行核对，或编辑为未来时间后生成提醒。</p>}<ErrorText value={error}/><button className="primary full" disabled={working || past} onClick={() => void make(false)}><Icon name="download" size={19}/>下载 ICS 文件</button><button className="secondary full" disabled={working || past} onClick={() => void make(true)}>分享 / 打开日历文件</button><details className="calendar-fallback"><summary>只有文件预览，没有「添加」按钮？</summary><p>部分 iOS 版本无法从本地文件直接添加。可复制下方内容，在系统日历手动新建事件，将开始时间设为建议下单时间，提醒选「事件发生时」。此方式无需上传数据。</p><button className="secondary full" onClick={() => void copy(`标题：该点外卖了：${shop.name}\n开始：${localInput(plan.orderAt, plan.timezone)}\n时区：${plan.timezone}\n提醒：事件发生时\n${reminderDescription(plan, shop, meal)}`)}>复制完整提醒信息</button><p className="small muted">如有自己的 Mac，也可 AirDrop 传送 ICS，在 Mac 日历中导入。系统日历的账户同步规则由你选择的日历决定。</p></details><details className="calendar-fallback"><summary>查看事件内容</summary><pre>{reminderDescription(plan, shop, meal)}</pre></details></div>;
}
function ImportPanel({ incoming, current, save, replaceOnly = false }: { incoming: Data; current: Data; replaceOnly?: boolean; save: (mode: 'merge' | 'replace') => Promise<void> }) {
  const [mode, setMode] = useState<'merge' | 'replace'>(replaceOnly ? 'replace' : 'merge'), [error, setError] = useState(''), [busy, setBusy] = useState(false);
  const conflicts = (['shops', 'meals', 'plans', 'history'] as const).reduce((n, key) => n + incoming[key].filter(x => current[key].some(y => y.id === x.id)).length, 0);
  return <div className="form"><p className="soft-note">格式已校验：{incoming.shops.length} 家店铺、{incoming.meals.length} 个套餐、{incoming.plans.length} 个计划、{incoming.history.length} 条历史。</p><label className="import-choice"><input type="radio" name="mode" disabled={replaceOnly} checked={mode === 'merge'} onChange={() => setMode('merge')}/><span><strong>合并到当前数据</strong><small>保留无冲突记录；相同 ID 以导入文件为准。目前有 {conflicts} 条 ID 冲突。合并后还会检查所有关联。{replaceOnly && '当前原数据无法读取，只能使用明确确认的覆盖恢复。'}</small></span></label><label className="import-choice"><input type="radio" name="mode" checked={mode === 'replace'} onChange={() => setMode('replace')}/><span><strong>覆盖全部数据</strong><small>用备份替换当前店铺、套餐、计划与历史；建议先导出当前数据。</small></span></label><p className="notice">仅修改浏览器内的数据，系统日历不随导入改变。导入记录中的“已生成”不代表当前手机已经添加提醒。</p><ErrorText value={error}/><button className="primary full" disabled={busy} onClick={async () => { setBusy(true); try { await save(mode); } catch (err) { setError(message(err)); } finally { setBusy(false); } }}>{busy ? '正在导入…' : '确认导入'}</button></div>;
}
function ClearPanel({ busy, clear }: { busy: boolean; clear: () => Promise<void> }) {
  const [text, setText] = useState(''), [error, setError] = useState('');
  return <div className="form"><p className="notice">店铺、套餐、计划、历史及界面偏好将被删除，无法撤销。建议先导出备份。已导入系统日历的事件不会被删除。</p><Field label="请输入“清空”进行第一次确认"><input value={text} onChange={e => setText(e.target.value)} autoComplete="off"/></Field><ErrorText value={error}/><button className="danger full" disabled={text !== '清空' || busy} onClick={async () => { try { await clear(); } catch (err) { setError(message(err)); } }}>继续清空，进行最后确认</button></div>;
}
