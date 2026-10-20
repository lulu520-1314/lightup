/**
 * _dev/check.mjs — 端到端自检（三条链路）
 *   A. ?photo=1        示例照片：读色 → 记住 → 自动跳查妆容 → 诊肤色 → 声化说明
 *   B. 默认（无摄像头） 来源选择 → 示例照片 → 未设目标时的引导
 *   C. 上传图片        真实走 <input type=file> 的路径
 */
import puppeteer from 'puppeteer-core';
import path from 'node:path';
import fs from 'node:fs';

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const BASE = 'http://127.0.0.1:8765/index.html';
const SAMPLE = path.resolve('assets/demo-face.jpg');
const OUT = path.resolve('_dev/shots');
fs.mkdirSync(OUT, { recursive: true });

const errors = [];
const BENIGN = /XNNPACK|TensorFlow Lite|favicon/i;

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: 'new',
  args: ['--no-sandbox', '--disable-gpu', '--disable-dev-shm-usage', '--font-render-hinting=none'],
  defaultViewport: { width: 1600, height: 900, deviceScaleFactor: 2 },
});
const ctx = browser.defaultBrowserContext();
await ctx.overridePermissions('http://127.0.0.1:8765', []);

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const shot = (p, n) => p.screenshot({ path: path.join(OUT, n + '.png') });
const txt = (el) => el;

async function newPage() {
  const page = await browser.newPage();
  page.on('console', (m) => {
    if (m.type() === 'error' && !BENIGN.test(m.text())) errors.push('[console] ' + m.text());
  });
  page.on('pageerror', (e) => errors.push('[pageerror] ' + e.message));
  page.on('requestfailed', (r) => errors.push(`[reqfail] ${r.url()} :: ${r.failure()?.errorText}`));
  return page;
}

const state = (page) => page.evaluate(() => ({
  pill: document.getElementById('enginePill')?.textContent,
  result: (document.getElementById('result')?.innerText || '').replace(/\n+/g, ' | '),
  rememberHidden: document.getElementById('btnRemember')?.hidden,
  goReadHidden: document.getElementById('btnGoRead')?.hidden,
  chooserHidden: document.getElementById('chooser')?.hidden,
  mode: [...document.querySelectorAll('.mode')].find((b) => b.getAttribute('aria-selected') === 'true')?.id,
}));

/* ---------------- A. 示例照片链路 ---------------- */
{
  const page = await newPage();
  await page.goto(BASE + '?photo=1', { waitUntil: 'networkidle2', timeout: 60000 });
  await sleep(4500);
  const a1 = await state(page);
  await shot(page, '10-read');

  await page.click('#btnRemember');
  await sleep(1500);                 // 自动跳转
  const a2 = await state(page);
  await page.keyboard.press('Space');
  await sleep(900);
  const a3 = await state(page);
  await shot(page, '11-check');

  await page.click('#modeSkin');
  await page.keyboard.press('Space');
  await sleep(900);
  const a4 = await state(page);
  await shot(page, '12-skin');

  await page.click('#btnHelp');
  await sleep(400);
  await shot(page, '13-legend');

  console.log('=== A. 示例照片 ===');
  console.log(JSON.stringify({ read: a1, afterRemember: a2, check: a3, skin: a4 }, null, 2));
  await page.close();
}

/* ---------------- B. 默认来源 + 未设目标引导 ---------------- */
{
  const page = await newPage();
  await page.goto(BASE, { waitUntil: 'networkidle2', timeout: 60000 });
  await sleep(5000);                       // 默认就是示例照片，不再等摄像头
  const b1 = await state(page);
  await shot(page, '30-default');

  // 未设目标直接查妆容：应出现「去读色」按钮
  await page.click('#modeCheck');
  await page.keyboard.press('Space');
  await sleep(900);
  const b2 = await state(page);
  await shot(page, '14-notarget');

  console.log('=== B. 默认来源 / 未设目标 ===');
  console.log(JSON.stringify({ defaultSource: b1, noTarget: b2 }, null, 2));
  await page.close();
}

/* ---------------- C. 上传图片 ---------------- */
{
  const page = await newPage();
  await page.goto(BASE, { waitUntil: 'networkidle2', timeout: 60000 });
  await sleep(9000);
  const input = await page.$('#fileInput');
  await input.uploadFile(SAMPLE);
  await sleep(3500);
  const c1 = await state(page);
  await page.keyboard.press('Space');
  await sleep(900);
  const c2 = await state(page);
  await shot(page, '15-upload');
  console.log('=== C. 上传图片 ===');
  console.log(JSON.stringify({ afterUpload: c1, afterRead: c2 }, null, 2));
  await page.close();
}

/* ---------------- D. 小目标精度 + 试色 + 问答 --------------- */
{
  const page = await newPage();
  await page.goto(BASE + '?photo=1', { waitUntil: 'networkidle2', timeout: 60000 });
  await sleep(4500);

  const initial = await page.evaluate(() => window.__lightup.getState().pick);

  // 瞳孔（示例图 900×900 的归一化坐标）
  const eye = await page.evaluate(() => {
    window.__lightup.setPick(0.656, 0.338);
    window.__lightup.read();
    return window.__lightup.getState();
  });
  await sleep(500);
  await shot(page, '16-eye');

  // 同一位置放大取样半径 → 会被周围皮肤带偏，用来证明"半径要能调"
  const big = await page.evaluate(() => {
    window.__lightup.setRadius(60);
    window.__lightup.read();
    return window.__lightup.getState();
  });

  // 回到唇部，开试色
  await page.evaluate((p) => {
    window.__lightup.setRadius(11);
    window.__lightup.setPick(p.x, p.y);
    window.__lightup.read();
  }, initial);
  await sleep(600);
  await page.click('#modeTryon');
  await sleep(700);
  await page.click('.strip-chip[data-shade="豆沙色"]');
  await sleep(700);
  await shot(page, '17-tryon');

  // 问一问：适合我吗
  await page.click('#btnQA');
  await sleep(300);
  await page.click('.qa-chip[data-q="fit"]');
  await sleep(500);
  const qa = await page.evaluate(() => document.getElementById('qaAnswer').innerText);
  await shot(page, '18-qa');

  console.log('=== D. 小目标 / 试色 / 问答 ===');
  console.log(JSON.stringify({
    eyeSmallRadius: eye.result,
    eyeLargeRadius: big.result,
    qaAnswer: qa,
  }, null, 2));
  await page.close();
}

await browser.close();
console.log('=== ERRORS (' + errors.length + ') ===');
errors.slice(0, 12).forEach((e) => console.log(e));
if (!errors.length) console.log('(none)');
process.exit(errors.length ? 1 : 0);
