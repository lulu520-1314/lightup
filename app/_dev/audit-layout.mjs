/**
 * _dev/audit-layout.mjs — 多分辨率布局审计
 * 输出每个宽度下：是否横向溢出、顶栏三块是否重叠、舞台/面板是否越界
 */
import puppeteer from 'puppeteer-core';

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const URL = 'http://127.0.0.1:8765/index.html';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const SIZES = [
  [2560, 1440], [1920, 1080], [1680, 1050], [1600, 900],
  [1440, 900], [1366, 768], [1280, 720], [1024, 768], [390, 844],
];

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: 'new',
  args: ['--no-sandbox', '--disable-gpu', '--mute-audio'],
});

const report = [];
for (const [w, h] of SIZES) {
  const page = await browser.newPage();
  await page.setViewport({ width: w, height: h, deviceScaleFactor: 1 });
  await page.goto(URL, { waitUntil: 'networkidle2' });
  await sleep(4200);

  const m = await page.evaluate(() => {
    const r = (sel) => {
      const el = document.querySelector(sel);
      if (!el) return null;
      const b = el.getBoundingClientRect();
      return { x: Math.round(b.x), y: Math.round(b.y), w: Math.round(b.width), h: Math.round(b.height) };
    };
    const overlap = (a, b) => {
      if (!a || !b) return 0;
      const x = Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x));
      const y = Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));
      return x * y;
    };
    const brand = r('.brand');
    const audio = r('.audio-ctl');
    const actions = r('.topbar-actions');
    return {
      docW: document.documentElement.scrollWidth,
      winW: window.innerWidth,
      bodyH: document.documentElement.scrollHeight,
      winH: window.innerHeight,
      brand, audio, actions,
      overlapBA: overlap(brand, actions),
      overlapAA: overlap(audio, actions),
      overlapAB: overlap(audio, brand),
      stage: r('.stage'),
      panel: r('.panel'),
      footer: r('.subtitle-bar'),
      footerW: document.querySelector('.footer-tools')?.scrollWidth || 0,
      footerBox: r('.footer-tools'),
    };
  });

  report.push({
    size: `${w}×${h}`,
    hScroll: m.docW > m.winW + 1,
    docW: m.docW,
    vScroll: m.bodyH > m.winH + 4,
    overlap: { brandXactions: m.overlapBA, audioXactions: m.overlapAA, audioXbrand: m.overlapAB },
    audio: m.audio,
    stageH: m.stage?.h,
    footerOverflow: m.footerW > (m.footerBox?.w || 0) + 2,
    footerY: m.footer?.y,
  });

  if (w === 1366 || w === 1920 || w === 390) {
    await page.screenshot({ path: `_dev/shots/91-layout-${w}.png`, fullPage: false });
  }
  await page.close();
}

await browser.close();
console.log(JSON.stringify(report, null, 2));
const bad = report.filter((r) => r.hScroll || r.overlap.brandXactions || r.overlap.audioXactions || r.overlap.audioXbrand || r.footerOverflow);
console.log(bad.length ? '有问题的尺寸: ' + bad.map((b) => b.size).join(', ') : '所有尺寸无溢出、无重叠');
