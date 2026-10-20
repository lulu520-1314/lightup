/**
 * _dev/check-fallback.mjs — 模型不可用时的降级验证
 * 场景：拦截人脸模型请求，模拟"模型加载失败/很慢"
 * 期望：示例照片仍然显示、取色器仍在、读色仍然给出结果（不退回"选择来源"）
 */
import puppeteer from 'puppeteer-core';

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const BASE = 'http://127.0.0.1:8765/index.html';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: 'new',
  args: ['--no-sandbox', '--disable-gpu', '--mute-audio'],
  defaultViewport: { width: 1440, height: 900 },
});

async function run(blockModel) {
  const page = await browser.newPage();
  if (blockModel) {
    await page.setRequestInterception(true);
    page.on('request', (req) => {
      if (req.url().includes('face_landmarker.task')) req.abort();
      else req.continue();
    });
  }
  await page.goto(BASE, { waitUntil: 'networkidle2' });
  await sleep(9000);

  const st = await page.evaluate(() => ({
    source: window.__lightup?.getState?.().source || null,
    chooserHidden: document.getElementById('chooser')?.hidden,
    photoVisible: !document.getElementById('photo')?.hidden && document.getElementById('photo').naturalWidth > 0,
    loupeVisible: !document.getElementById('loupeWrap')?.hidden,
    result: (document.getElementById('result')?.innerText || '').replace(/\n+/g, ' ').slice(0, 40),
  }));
  await page.screenshot({ path: `_dev/shots/92-fallback-${blockModel ? 'no-model' : 'normal'}.png` });
  await page.close();
  return st;
}

const normal = await run(false);
const degraded = await run(true);
await browser.close();

const report = {
  '正常：默认示例照片': normal.source === 'image' && normal.photoVisible === true,
  '正常：取色器可见': normal.loupeVisible === true,
  '降级：仍显示示例照片': degraded.photoVisible === true,
  '降级：不退回选择来源': degraded.chooserHidden === true,
  '降级：取色器仍在': degraded.loupeVisible === true,
  '降级：仍能给出读色结果': /红|色/.test(degraded.result),
};
console.log(JSON.stringify({ report, normal, degraded }, null, 2));
const failed = Object.entries(report).filter(([, v]) => !v).map(([k]) => k);
console.log(failed.length ? '未通过: ' + failed.join(', ') : '降级检查通过');
process.exit(failed.length ? 1 : 0);
