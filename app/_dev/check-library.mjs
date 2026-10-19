/**
 * _dev/check-library.mjs — 色卡库验收
 * 覆盖：打开/关闭、数量、筛选、选中试听、设为目标、Esc 与焦点归位
 */
import puppeteer from 'puppeteer-core';

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const BASE = 'http://127.0.0.1:8765/index.html';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const errors = [];
const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: 'new',
  args: ['--no-sandbox', '--disable-gpu', '--mute-audio'],
  defaultViewport: { width: 1600, height: 900, deviceScaleFactor: 2 },
});
const page = await browser.newPage();
page.on('pageerror', (e) => errors.push('[pageerror] ' + e.message));
page.on('console', (m) => {
  if (m.type() === 'error' && !/XNNPACK|TensorFlow|favicon/i.test(m.text())) errors.push(m.text());
});

await page.goto(BASE, { waitUntil: 'networkidle2' });
await sleep(5000);

const snap = () => page.evaluate(() => ({
  open: !document.getElementById('lib').hidden,
  count: document.getElementById('libGrid').querySelectorAll('.lib-card').length,
  head: document.getElementById('libCount').textContent,
  selected: document.querySelector('.lib-card[aria-selected="true"]')?.querySelector('.lib-name')?.textContent || null,
  selBar: document.getElementById('libSel').textContent,
  targetDisabled: document.getElementById('libTarget').disabled,
  focusInLib: !!document.activeElement?.closest('#lib'),
}));

// 1. 打开
await page.click('#btnLibrary');
await sleep(600);
const s1 = await snap();
await page.screenshot({ path: '_dev/shots/60-library.png' });

// 2. 选一支（第 3 张卡）
await page.click('.lib-card:nth-child(3)');
await sleep(700);
const s2 = await snap();
await page.screenshot({ path: '_dev/shots/61-library-selected.png' });

// 3. 暖调筛选
await page.click('.lib-filters .src-btn[data-f="warm"]');
await sleep(400);
const s3 = await snap();

// 4. 全部 → 设为目标
await page.click('.lib-filters .src-btn[data-f="all"]');
await sleep(300);
await page.click('#libTarget');
await sleep(600);
const s4 = await page.evaluate(() => ({
  open: !document.getElementById('lib').hidden,
  subtitle: document.getElementById('subtitle').textContent,
  focusBack: document.activeElement?.id,
}));

// 5. 重新打开 → Esc 关闭
await page.click('#btnLibrary');
await sleep(400);
await page.keyboard.press('Escape');
await sleep(400);
const s5 = await snap();

// 6. 键盘：L 打开
await page.keyboard.press('l');
await sleep(400);
const s6 = await snap();
await page.keyboard.press('Escape');

await browser.close();

const report = {
  '点击按钮可打开': s1.open === true,
  '共 38 支': s1.count === 38,
  '打开后焦点进入面板': s1.focusInLib === true,
  '点卡片可选中并试听': s2.selected !== null && s2.selBar.includes('已选'),
  '设为目标按钮可用': s2.targetDisabled === false,
  '暖调筛选生效': s3.count > 0 && s3.count < 40,
  '设为目标后关闭并回写': s4.open === false && s4.subtitle.includes('目标'),
  'Esc 可关闭': s5.open === false,
  'L 快捷键可打开': s6.open === true,
  '无控制台错误': errors.length === 0,
};
console.log(JSON.stringify({ report, counts: { all: s1.count, warm: s3.count }, subtitle: s4.subtitle, errors }, null, 2));
const failed = Object.entries(report).filter(([, v]) => !v).map(([k]) => k);
console.log(failed.length ? '未通过: ' + failed.join(', ') : '全部通过');
process.exit(failed.length ? 1 : 0);
