import { existsSync } from 'node:fs';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
// Optional isolated workspace cache; otherwise use Playwright's standard installed browsers.
if (!process.env.PLAYWRIGHT_BROWSERS_PATH && existsSync('work/pw-browsers/webkit-2388/pw_run.sh')) process.env.PLAYWRIGHT_BROWSERS_PATH = path.resolve('work/pw-browsers');
const { webkit, chromium, expect } = await import('@playwright/test');
const engine = process.env.BROWSER || 'webkit';
const browser = await (engine === 'chromium' ? chromium.launch({ headless: true, ...(process.platform === 'darwin' && existsSync('/Applications/Google Chrome.app/Contents/MacOS/Google Chrome') ? { executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome' } : {}) }) : webkit.launch({ headless: true }));
await mkdir('work/browser-check', { recursive: true });
const context = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true, timezoneId: 'Asia/Shanghai', acceptDownloads: true });
const page = await context.newPage(); const failures = [], requests = []; const checks = [];
page.on('pageerror', error => failures.push(error.message));
context.on('request', request => { if (/^https?:/.test(request.url())) requests.push({ method: request.method(), url: request.url() }); });
page.on('dialog', d => d.accept());
const base = process.env.PREVIEW_URL || 'http://127.0.0.1:4173/';
const checkWidth = async label => {
  const dimensions = await page.evaluate(() => ({ width: innerWidth, scroll: document.documentElement.scrollWidth, body: document.body.scrollWidth, dialogs: [...document.querySelectorAll('dialog[open]')].map(d => ({ client: d.clientWidth, scroll: d.scrollWidth })) }));
  expect(dimensions.scroll, label).toBeLessThanOrEqual(dimensions.width);
  expect(dimensions.body, label).toBeLessThanOrEqual(dimensions.width);
  for (const d of dimensions.dialogs) expect(d.scroll, `${label} dialog`).toBeLessThanOrEqual(d.client + 1);
  checks.push(`${label}: no overflow`);
};
const closeDialog = () => page.getByRole('button', { name: '关闭', exact: true }).click();
const tomorrow = await (await import('@js-temporal/polyfill')).Temporal.Now.plainDateISO('Asia/Shanghai').add({ days: 1 }).toString();
try {
  await page.goto(base); await expect(page.getByRole('button', { name: '安排第一顿午餐' })).toBeVisible();
  await checkWidth('Empty home'); await page.screenshot({ path: 'work/browser-check/01-empty-home.png', fullPage: true });
  // First-run quick setup: one form creates a shop + meal, then opens the plan.
  await page.getByRole('button', { name: '安排第一顿午餐' }).click();
  await page.getByLabel('店铺名称', { exact: true }).fill('街角热饭测试店');
  await page.getByLabel('店铺分享链接（可选）', { exact: true }).fill('https://example.com/lunch');
  await page.getByLabel('套餐名称', { exact: true }).fill('黄焖鸡微辣');
  await page.getByLabel('菜品清单与规格', { exact: true }).fill('黄焖鸡小份、米饭一份');
  await checkWidth('Shop setup'); await page.getByRole('button', { name: '保存，去安排午餐' }).click();
  await expect(page.getByRole('heading', { name: '安排一顿午餐' })).toBeVisible();
  await page.getByLabel('吃饭日期', { exact: true }).fill(tomorrow);
  await page.getByLabel('希望开始吃饭', { exact: true }).fill('12:15');
  await page.getByLabel('最晚送达日期', { exact: true }).fill(tomorrow);
  await page.getByLabel('最晚送达时间', { exact: true }).fill('12:45');
  await page.getByLabel('计划备注（可选）', { exact: true }).fill('学校办公室');
  await expect(page.locator('.calculation strong')).toHaveText('11:35');
  await checkWidth('Plan editor'); await page.screenshot({ path: 'work/browser-check/02-plan-editor.png', fullPage: true });
  await page.getByRole('button', { name: '保存午餐计划', exact: true }).click();
  await expect(page.locator('.plan-card h3')).toHaveText('街角热饭测试店');
  const storeLink = page.getByRole('link', { name: /打开店铺/ }); await expect(storeLink).toHaveAttribute('href', 'https://example.com/lunch');
  await checkWidth('Featured plan'); await page.screenshot({ path: 'work/browser-check/03-planned-home.png', fullPage: true });
  // Generate a real local download, inspect independently parsable ICS bytes.
  await page.getByRole('button', { name: '添加下单提醒', exact: true }).click();
  const downloadEvent = page.waitForEvent('download'); await page.getByRole('button', { name: '下载 ICS 文件', exact: true }).click();
  const downloaded = await downloadEvent; const ics = await readFile(await downloaded.path(), 'utf8');
  expect(ics).toContain('BEGIN:VALARM'); expect(ics).toContain('SUMMARY:该点外卖了：街角热饭测试店');
  expect(ics.replaceAll('\r\n ', '')).toContain('学校办公室');
  await downloaded.saveAs('work/browser-check/test-reminder.ics'); checks.push('ICS generated and downloaded');
  await closeDialog();
  await expect(page.locator('.calendar-state')).toContainText('已生成日历文件');
  // Explicit local-only delay invalidates calendar version.
  await page.getByRole('button', { name: '延后 5 分钟', exact: true }).click();
  await expect(page.locator('.order-time strong')).toHaveText('11:40');
  await expect(page.locator('.calendar-state')).toContainText('删除旧日历事件'); checks.push('Delay invalidates exported calendar revision');
  // Offline-ready registration, full browser offline reload, and edit + persistence.
  await page.evaluate(() => navigator.serviceWorker.ready.then(() => true));
  await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true);
  await context.setOffline(true); await page.reload(); await expect(page.locator('.plan-card h3')).toHaveText('街角热饭测试店');
  await page.getByRole('button', { name: '编辑计划', exact: true }).click();
  await page.getByLabel('计划备注（可选）', { exact: true }).fill('学校办公室 · 离线修改');
  await page.getByRole('button', { name: '保存午餐计划', exact: true }).click(); await expect(page.locator('dialog[open]')).toHaveCount(0); await expect(page.locator('.notes')).toContainText('离线修改'); await page.reload();
  await expect(page.locator('.notes')).toContainText('离线修改'); checks.push('Offline reload, edit and IndexedDB persistence');
  await context.setOffline(false);
  // Cover every main page at 390px.
  for (const [name, heading] of [['计划', '把午餐，提前安排好'], ['店铺', '常吃的店，喜欢的味道'], ['历史', '每一餐，都更了解一点'], ['设置', '按你的习惯来']]) {
    await page.getByRole('navigation', { name: '主导航' }).getByRole('button', { name, exact: true }).click();
    await expect(page.getByRole('heading', { name: heading, exact: true })).toBeVisible(); await checkWidth(name);
    await page.screenshot({ path: `work/browser-check/page-${name}.png`, fullPage: true });
  }
  const jsonEvent = page.waitForEvent('download'); await page.getByRole('button', { name: '导出 JSON', exact: true }).click();
  const jsonDownload = await jsonEvent, json = JSON.parse(await readFile(await jsonDownload.path(), 'utf8'));
  expect(json.plans[0].note).toContain('离线修改'); expect(json.shops).toHaveLength(1);
  await jsonDownload.saveAs('work/browser-check/test-backup.json');
  await page.locator('input[type=file]').setInputFiles({ name: 'backup.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(json)) });
  await expect(page.getByRole('heading', { name: '导入本地备份' })).toBeVisible();
  await page.getByRole('button', { name: '确认导入', exact: true }).click(); await expect(page.locator('dialog[open]')).toHaveCount(0);
  checks.push('JSON export, validated merge import');
  // Clear requires typed confirmation and a native final confirmation, then restore.
  await page.getByRole('button', { name: '清空全部本地数据', exact: true }).click();
  await expect(page.getByRole('button', { name: '继续清空，进行最后确认' })).toBeDisabled();
  await page.getByLabel('请输入“清空”进行第一次确认', { exact: true }).fill('清空');
  await page.getByRole('button', { name: '继续清空，进行最后确认' }).click();
  await expect(page.locator('dialog[open]')).toHaveCount(0);
  await page.locator('input[type=file]').setInputFiles({ name: 'backup.json', mimeType: 'application/json', buffer: Buffer.from(JSON.stringify(json)) });
  await page.getByText('覆盖全部数据', { exact: true }).click(); await page.getByRole('button', { name: '确认导入', exact: true }).click();
  await expect(page.locator('dialog[open]')).toHaveCount(0); await page.reload();
  await page.getByRole('navigation', { name: '主导航' }).getByRole('button', { name: '今天', exact: true }).click();
  await expect(page.locator('.plan-card h3')).toHaveText('街角热饭测试店'); checks.push('Double-confirmed clear and replace restore');
  // A second shop with different defaults exercises cross-shop backup switching.
  const nav = name => page.getByRole('navigation', { name: '主导航' }).getByRole('button', { name, exact: true }).click();
  await nav('店铺'); await page.getByRole('button', { name: '添加店铺', exact: true }).click();
  await page.getByLabel('店铺名称', { exact: true }).fill('备用轻食测试店');
  await page.getByLabel('默认履约耗时 / 分钟', { exact: true }).fill('50');
  await page.getByLabel('安全余量 / 分钟', { exact: true }).fill('9');
  await page.getByRole('button', { name: '保存店铺', exact: true }).click(); await expect(page.locator('dialog[open]')).toHaveCount(0);
  let second = page.locator('.shop-card').filter({ has: page.getByRole('heading', { name: '备用轻食测试店', exact: true }) });
  await second.getByRole('button', { name: '添加套餐', exact: true }).click();
  await page.getByLabel('套餐名称', { exact: true }).fill('鸡胸肉沙拉');
  await page.getByLabel('菜品清单与规格', { exact: true }).fill('鸡胸肉、蔬菜、米饭');
  await page.getByRole('button', { name: '保存套餐', exact: true }).click(); await expect(page.locator('dialog[open]')).toHaveCount(0);
  await nav('今天'); await page.getByRole('button', { name: '编辑计划', exact: true }).click();
  await page.getByLabel('备用轻食测试店 · 鸡胸肉沙拉', { exact: true }).check();
  await page.getByLabel('这次的安全余量 / 分钟', { exact: true }).fill('7');
  await page.getByRole('button', { name: '保存午餐计划', exact: true }).click(); await expect(page.locator('dialog[open]')).toHaveCount(0);
  await page.getByRole('button', { name: '换备选餐', exact: true }).click(); await page.locator('button.alternative').click();
  await expect(page.locator('.plan-card h3')).toHaveText('备用轻食测试店'); await expect(page.locator('.order-time strong')).toHaveText('11:18');
  await expect(page.locator('.time-line')).toContainText('余量 7 分');
  await page.getByRole('button', { name: '换备选餐', exact: true }).click(); await page.locator('button.alternative').click();
  await expect(page.locator('.plan-card h3')).toHaveText('街角热饭测试店'); await expect(page.locator('.order-time strong')).toHaveText('11:33');
  checks.push('Cross-shop backup recalculates duration and preserves manual safety');
  // Enter actual historical delivery times through the UI; verify median and snapshot semantics.
  const { Temporal } = await import('@js-temporal/polyfill');
  await nav('历史');
  for (const [i, duration] of [30, 32, 90].entries()) {
    await page.getByRole('button', { name: '记录收餐', exact: true }).click();
    await page.getByLabel('店铺', { exact: true }).selectOption({ label: '街角热饭测试店' });
    const date = Temporal.Now.plainDateISO('Asia/Shanghai').subtract({ days: i + 1 }).toString();
    const arrival = Temporal.PlainDateTime.from(`${date}T12:15`);
    await page.getByLabel('实际下单时间', { exact: true }).fill(arrival.subtract({ minutes: duration }).toString({ smallestUnit: 'minute' }));
    await page.getByLabel('实际送达时间', { exact: true }).fill(arrival.toString({ smallestUnit: 'minute' }));
    await page.getByRole('button', { name: '保存收餐记录', exact: true }).click(); await expect(page.locator('dialog[open]')).toHaveCount(0);
  }
  const prediction = page.locator('.prediction-card').filter({ has: page.getByRole('heading', { name: '街角热饭测试店', exact: true }) });
  await expect(prediction.locator('.prediction-number strong')).toHaveText('32'); await checkWidth('History with real samples');
  await nav('今天'); await expect(page.locator('.order-time strong')).toHaveText('11:33');
  await page.getByRole('button', { name: '编辑计划', exact: true }).click();
  await page.getByRole('button', { name: '保存午餐计划', exact: true }).click(); await expect(page.locator('dialog[open]')).toHaveCount(0);
  await expect(page.locator('.order-time strong')).toHaveText('11:36');
  await nav('历史'); await prediction.getByRole('button', { name: '手动重置预测', exact: true }).click();
  await expect(prediction.locator('.prediction-number strong')).toHaveText('35');
  await expect(prediction.locator('summary')).toContainText('3 次');
  checks.push('History entry, median prediction, frozen plan basis, explicit recalculation and reset');
  // Shop sorting and cascading deletion preserve a main plan at another shop.
  await nav('店铺'); await page.getByRole('button', { name: '上移备用轻食测试店', exact: true }).click();
  await expect(page.locator('.shop-card h2').first()).toHaveText('备用轻食测试店');
  second = page.locator('.shop-card').filter({ has: page.getByRole('heading', { name: '备用轻食测试店', exact: true }) });
  await second.getByRole('button', { name: '删除店铺', exact: true }).click(); await expect(page.locator('.shop-card')).toHaveCount(1);
  await nav('今天'); await expect(page.locator('.plan-card h3')).toHaveText('街角热饭测试店');
  await expect(page.locator('.time-line')).toContainText('余量 7 分');
  checks.push('Shop sorting, safe linked-data deletion and retained main plan');
  await page.locator('input[type=file]').setInputFiles({ name: 'bad.json', mimeType: 'application/json', buffer: Buffer.from('{broken') });
  await expect(page.locator('.toast')).toContainText('JSON'); await expect(page.locator('.plan-card h3')).toHaveText('街角热饭测试店');
  checks.push('Invalid import rejected without altering local data');
  expect(failures).toEqual([]);
  expect(requests.filter(r => r.method !== 'GET' || new URL(r.url).origin !== new URL(base).origin)).toEqual([]);
  checks.push('No browser errors, no external or non-GET application requests');
  await page.setViewportSize({ width: 1440, height: 1000 }); await checkWidth('Desktop'); await page.screenshot({ path: 'work/browser-check/desktop.png', fullPage: true });
  const report = { engine, viewport: '390x844', checks, browserErrors: failures, externalRequests: [], date: new Date().toISOString() };
  await writeFile(`work/browser-check/result-${engine}.json`, JSON.stringify(report, null, 2)); console.log(JSON.stringify(report, null, 2));
} catch (error) {
  await page.screenshot({ path: 'work/browser-check/failure.png', fullPage: true }).catch(() => {}); console.error(error); process.exitCode = 1;
} finally { await browser.close(); }
