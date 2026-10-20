/**
 * _dev/check-ux.mjs — 本轮改动的验收脚本
 * 覆盖：默认来源 / 按钮顺序 / 指标数量 / 说明弹层 / 无退化项
 */
import puppeteer from 'puppeteer-core';

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const BASE = 'http://127.0.0.1:8765/index.html';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const errors = [];
const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: 'new',
  args: ['--no-sandbox', '--disable-gpu'],
  defaultViewport: { width: 1600, height: 900, deviceScaleFactor: 2 },
});
const ctx = browser.defaultBrowserContext();
await ctx.overridePermissions('http://127.0.0.1:8765', []);   // 不授权摄像头，验证"默认不依赖摄像头"

const page = await browser.newPage();
page.on('pageerror', (e) => errors.push('[pageerror] ' + e.message));
page.on('console', (m) => {
  if (m.type() === 'error' && !/XNNPACK|TensorFlow|favicon/i.test(m.text())) {
    errors.push('[console] ' + m.text());
  }
});

await page.goto(BASE, { waitUntil: 'networkidle2' });
await sleep(5000);

const snap = () => page.evaluate(() => {
  const srcBtns = [...document.querySelectorAll('.source-bar .src-btn')].map((b) => ({
    id: b.id, pressed: b.getAttribute('aria-pressed'),
  }));
  return {
    source: window.__lightup.getState().source,
    result: document.getElementById('result').innerText.replace(/\n+/g, ' | '),
    metrics: [...document.querySelectorAll('.metric')].map((m) => m.querySelector('span').textContent),
    metricOrder: [...document.querySelectorAll('.metric')].length,
    srcBtns,
    tipHidden: document.getElementById('tip').hidden,
    tipTitle: document.getElementById('tipTitle').textContent,
    mutePressed: document.getElementById('btnMute').getAttribute('aria-pressed'),
    voiceLabel: document.getElementById('btnVoice').textContent.trim(),
    rateText: document.getElementById('btnRate').textContent,
  };
});

const s0 = await snap();
await page.screenshot({ path: '_dev/shots/50-default-example.png' });

// 指标说明：点第一张卡片
await page.click('.metric');
await sleep(400);
const s1 = await snap();
await page.screenshot({ path: '_dev/shots/51-metric-tip.png' });

// Esc 关闭 + 焦点归位
await page.keyboard.press('Escape');
await sleep(300);
const s2 = await snap();
const focusBack = await page.evaluate(() => document.activeElement?.classList.contains('metric'));

// 放大镜开关
const loupeVisible = () => page.evaluate(() => !document.getElementById('loupeWrap').hidden);
const loupeBefore = await loupeVisible();
await page.click('#btnLoupe');
await sleep(300);
const loupeOff = await loupeVisible();
await page.click('#btnLoupe');
await sleep(300);
const loupeBack = await loupeVisible();

// 诊肤色（2 个指标）
await page.click('#modeSkin');
await page.keyboard.press('Space');
await sleep(900);
const s3 = await snap();

// 查妆容（2 个指标）
await page.click('#modeCheck');
await page.keyboard.press('Space');
await sleep(900);
const s4 = await snap();

// 声音总开关 → 播报应禁用；T 改语速
await page.click('#btnMute');
await sleep(300);
const s5 = await snap();
await page.keyboard.press('t');
await sleep(300);
const s6 = await snap();

// 白平衡重置：校准后切换来源
await page.click('#modeObject');
await page.keyboard.press('Space');
await sleep(900);
await page.click('#btnCalib');
await sleep(300);
const pt = await page.evaluate(() => {
  const stage = document.querySelector('.stage');
  const r = stage.getBoundingClientRect();
  const img = document.getElementById('photo');
  const scale = Math.max(r.width / img.naturalWidth, r.height / img.naturalHeight);
  const offX = (r.width - img.naturalWidth * scale) / 2;
  const offY = (r.height - img.naturalHeight * scale) / 2;
  return {
    x: r.left + offX + 0.06 * img.naturalWidth * scale,
    y: r.top + offY + 0.25 * img.naturalHeight * scale,
  };
});
await page.mouse.click(pt.x, pt.y);
await sleep(700);
const wbAfterCal = await page.evaluate(() => localStorage.getItem('lightup.whitePoint'));
await page.click('#srcExample');
await sleep(3000);
const wbAfterSwitch = await page.evaluate(() => localStorage.getItem('lightup.whitePoint'));

await browser.close();

const report = {
  '默认来源=image': s0.source === 'image',
  '示例照片按钮在最左': s0.srcBtns[0].id === 'srcExample',
  '示例照片为选中态': s0.srcBtns[0].pressed === 'true',
  '读色指标数=3': s0.metricOrder === 3,
  '放大镜默认显示': loupeBefore === true,
  '可关闭放大镜': loupeOff === false,
  '可重新打开': loupeBack === true,
  '点卡片弹出说明': s1.tipHidden === false && !!s1.tipTitle,
  'Esc 可关闭': s2.tipHidden === true,
  '关闭后焦点归位': focusBack === true,
  '诊肤色指标数=2': s3.metricOrder === 2,
  '查妆容指标数=2': s4.metricOrder === 2,
  '关闭播报后状态一致': s5.mutePressed === 'false',
  'T 可调语速': s6.rateText !== s5.rateText,
  '有音色开关': /音色/.test(s5.voiceLabel),
  '白平衡校准生效': !!wbAfterCal,
  '切来源后白平衡重置': wbAfterSwitch === null,
  '无控制台错误': errors.length === 0,
};
console.log(JSON.stringify({ report, s0_metrics: s0.metrics, s3_metrics: s3.metrics, s4_metrics: s4.metrics, errors }, null, 2));
const failed = Object.entries(report).filter(([, v]) => !v).map(([k]) => k);
console.log(failed.length ? '未通过: ' + failed.join(', ') : '全部通过');
process.exit(failed.length ? 1 : 0);
