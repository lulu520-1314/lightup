/**
 * _dev/check-calib.mjs — 白平衡校准的真实点击链路验证
 */
import puppeteer from 'puppeteer-core';

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const BASE = 'http://127.0.0.1:8765/index.html?photo=1';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: 'new',
  args: ['--no-sandbox', '--disable-gpu'],
  defaultViewport: { width: 1600, height: 900, deviceScaleFactor: 2 },
});
const page = await browser.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));

await page.goto(BASE, { waitUntil: 'networkidle2' });
await sleep(4500);

const clickAt = async (nx, ny) => {
  const pt = await page.evaluate((x, y) => {
    const stage = document.querySelector('.stage');
    const r = stage.getBoundingClientRect();
    const img = document.getElementById('photo');
    const sw = img.naturalWidth, sh = img.naturalHeight;
    const scale = Math.max(r.width / sw, r.height / sh);
    const offX = (r.width - sw * scale) / 2;
    const offY = (r.height - sh * scale) / 2;
    return { x: r.left + offX + x * sw * scale, y: r.top + offY + y * sh * scale };
  }, nx, ny);
  await page.mouse.click(pt.x, pt.y);
  await sleep(500);
};

const state = () => page.evaluate(() => ({
  calibrating: !document.getElementById('calibBanner').hidden,
  btnText: document.getElementById('btnCalib').textContent.trim(),
  subtitle: document.getElementById('subtitle').textContent,
  whitePoint: (() => { try { return JSON.parse(localStorage.getItem('lightup.whitePoint') || 'null'); } catch { return null; } })(),
}));

const lip = await page.evaluate(() => window.__lightup.getState().pick);

// 1. 进入校准
await page.screenshot({ path: '_dev/shots/20-topbar.png' });
await page.click('#btnCalib');
await sleep(500);
const s1 = await state();
await page.screenshot({ path: '_dev/shots/21-calib-banner.png' });

// 2. 点红色嘴唇 —— 应被拒绝
await clickAt(lip.x, lip.y);
const s2 = await state();

// 3. 点背景灰墙 —— 应接受
await clickAt(0.06, 0.25);
await sleep(900);
const s3 = await state();
await page.screenshot({ path: '_dev/shots/19-calib.png' });

// 4. 切换到另一张图 —— 旧校准应被重置
await page.click('#srcExample');
await sleep(3000);
const s4 = await state();

console.log(JSON.stringify({ lip, enter: s1, rejectRed: s2, acceptGrey: s3, afterSourceSwitch: s4, errors }, null, 2));
await browser.close();
