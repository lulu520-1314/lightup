/**
 * _dev/check-tryon.mjs — 试色模式验收
 * 覆盖：四个模块并列、试色面板、快速换色、色卡库试色、诊肤色推荐跳转、图层按模式绘制
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
  tabs: [...document.querySelectorAll('.mode b')].map((b) => b.textContent),
  active: document.querySelector('.mode[aria-selected="true"] b')?.textContent,
  name: document.querySelector('.result-name')?.textContent || '',
  chips: document.querySelectorAll('.strip-chip[data-shade]').length,
  recs: document.querySelectorAll('.strip-chip[data-rec]').length,
  targetChip: !!document.querySelector('[data-act="target"]'),
  pillVisible: (() => {
    const el = document.getElementById('enginePill');
    const r = el.getBoundingClientRect();
    return r.width > 2 && r.height > 2;
  })(),
}));

const s0 = await snap();

// 进入试色
await page.click('#modeTryon');
await sleep(700);
const s1 = await snap();
await page.screenshot({ path: '_dev/shots/80-tryon.png' });

// 快速换色
await page.click('.strip-chip[data-shade="砖红"]');
await sleep(700);
const s2 = await snap();

// 色卡库 → 选一支 → 试色
await page.click('#btnLibrary');
await sleep(500);
await page.click('.lib-card:nth-child(5)');
await sleep(400);
await page.click('#libTryon');
await sleep(900);
const s3 = await snap();
await page.screenshot({ path: '_dev/shots/81-tryon-from-library.png' });

// 诊肤色 → 推荐色块 → 跳试色
await page.click('#modeSkin');
await page.keyboard.press('Space');
await sleep(900);
const s4 = await snap();
await page.screenshot({ path: '_dev/shots/82-skin-enriched.png' });
const recClicked = await page.evaluate(() => {
  const b = document.querySelector('.strip-chip[data-rec]');
  if (!b) return null;
  b.click();
  return b.dataset.rec;
});
await sleep(900);
const s5 = await snap();

await browser.close();

const report = {
  '四个模块并列': JSON.stringify(s0.tabs) === JSON.stringify(['读色', '诊肤色', '查妆容', '试色']),
  '技术字样已隐藏': s0.pillVisible === false,
  '试色面板有 12 个色块': s1.chips === 12,
  '试色面板可设目标': s1.targetChip === true,
  '点击色块可换色': s2.name === '砖红',
  '色卡库试色可用': s3.active === '试色' && s3.name.length > 0,
  '诊肤色有推荐色号': s4.recs >= 3,
  '推荐色号可跳试色': s5.active === '试色' && s5.name === recClicked,
  '无控制台错误': errors.length === 0,
};
console.log(JSON.stringify({ report, recClicked, samples: { s1: s1.name, s3: s3.name, s5: s5.name }, errors }, null, 2));
const failed = Object.entries(report).filter(([, v]) => !v).map(([k]) => k);
console.log(failed.length ? '未通过: ' + failed.join(', ') : '试色与诊肤色检查通过');
process.exit(failed.length ? 1 : 0);
