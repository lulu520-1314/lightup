/**
 * _dev/shoot-ui.mjs — 为提案"界面一览"页抓六张状态截图
 * 输出：deck/assets/ui-*.png
 */
import puppeteer from 'puppeteer-core';
import fs from 'node:fs';

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const URL = 'http://127.0.0.1:8765/index.html';
const OUT = 'D:\\桌面\\AI creation\\Production\\loreal-lightup\\deck\\assets';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

fs.mkdirSync(OUT, { recursive: true });

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: 'new',
  args: ['--no-sandbox', '--disable-gpu', '--mute-audio'],
  defaultViewport: { width: 1440, height: 900, deviceScaleFactor: 1.5 },
});

async function fresh() {
  const page = await browser.newPage();
  await page.goto(URL, { waitUntil: 'networkidle2' });
  await sleep(11000);   // 等模型加载完，避免截图里出现“加载中”
  return page;
}

const shot = (page, name) => page.screenshot({ path: `${OUT}\\ui-${name}.png` });

// 1) 色卡库
{
  const p = await fresh();
  await p.click('#btnLibrary');
  await sleep(1200);
  await shot(p, 'library');
  await p.close();
}

// 2) 指标解释弹窗
{
  const p = await fresh();
  const btn = await p.$('.metric[data-tip]');
  if (btn) await btn.click();
  await sleep(900);
  await shot(p, 'tip');
  await p.close();
}

// 3) 离线问答
{
  const p = await fresh();
  await p.click('#btnQA');
  await sleep(600);
  await p.click('.qa-chip[data-q="fit"]');
  await sleep(1400);
  await shot(p, 'qa');
  await p.close();
}

// 4) 白平衡
{
  const p = await fresh();
  await p.click('#btnCalib');
  await sleep(1200);
  await shot(p, 'calib');
  await p.close();
}

// 5) 放大镜（点在眼睛位置，放大取样区域）
{
  const p = await fresh();
  await p.evaluate(() => window.__lightup.setPick(0.656, 0.338));
  await sleep(1200);
  await shot(p, 'loupe');
  await p.close();
}

// 6) 默认界面
{
  const p = await fresh();
  await shot(p, 'default');
  await p.close();
}

await browser.close();
console.log('done:', fs.readdirSync(OUT).filter((f) => f.startsWith('ui-')).join(', '));
