/**
 * _dev/check-fit.mjs — 「适合我」是否真的依赖肤色数据
 * 1) 没测肤色时：筛选给出说明，卡片数量不受影响
 * 2) 测完肤色后：只留下与推荐色接近的少数色号（不能整库都“适合”）
 * 3) 换图后：上一张图的肤色数据被清空
 */
import puppeteer from 'puppeteer-core';

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const URL = 'http://127.0.0.1:8765/index.html';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: 'new',
  args: ['--no-sandbox', '--disable-gpu', '--mute-audio'],
  defaultViewport: { width: 1440, height: 900 },
});
const page = await browser.newPage();
await page.goto(URL, { waitUntil: 'networkidle2' });
await sleep(9000);

const openLib = async () => {
  await page.click('#btnLibrary');
  await sleep(500);
};
const closeLib = async () => {
  await page.keyboard.press('Escape');
  await sleep(400);
};
const meState = () =>
  page.evaluate(() => {
    const me = document.getElementById('libMeFilter');
    return {
      cards: document.querySelectorAll('.lib-card').length,
      empty: !!document.querySelector('.lib-empty'),
      dimmed: me.classList.contains('is-off'),
      disabled: me.getAttribute('aria-disabled'),
      count: document.getElementById('libCount').textContent,
    };
  });

// 1) 未测肤色
await openLib();
await page.click('#libMeFilter');
await sleep(400);
const beforeSkin = await meState();
await closeLib();

// 2) 测肤色后再筛
await page.click('#modeSkin');
await sleep(1200);
await page.keyboard.press('Space');
await sleep(2500);
await openLib();
await page.click('#libMeFilter');
await sleep(400);
const afterSkin = await meState();
await closeLib();

// 3) 换一张图，肤色应被清空
const input = await page.$('#fileInput');
await input.uploadFile('D:\\桌面\\AI creation\\Production\\loreal-lightup\\docs\\screenshots\\read.jpg');
await sleep(4000);
await openLib();
await page.click('#libMeFilter');
await sleep(400);
const afterSwitch = await meState();
await closeLib();

await browser.close();

const report = {
  '未测肤色：给出说明': beforeSkin.empty === true,
  '未测肤色：按钮是禁用态': beforeSkin.dimmed === true && beforeSkin.disabled === 'true',
  '测完肤色：能筛出结果': afterSkin.empty === false && afterSkin.cards > 0,
  '测完肤色：不是整库都适合': afterSkin.cards < 20,
  '换图后：肤色数据被清空': afterSwitch.empty === true && afterSwitch.dimmed === true,
};
console.log(JSON.stringify({ report, beforeSkin, afterSkin, afterSwitch }, null, 2));
const failed = Object.entries(report).filter(([, v]) => !v).map(([k]) => k);
console.log(failed.length ? '未通过: ' + failed.join(', ') : '「适合我」检查通过');
process.exit(failed.length ? 1 : 0);
