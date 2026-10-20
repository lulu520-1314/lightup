/**
 * _dev/check-copy.mjs — 文案与结构一致性守卫
 *
 * 规则（把踩过的坑固化成检查）：
 *   1. 按钮写「动作」：重放统一叫「再听一次」，任何按钮里不得出现「听旋律」
 *   2. 说明文字可以谈「旋律」：色卡库副标题这类描述性文案不做限制
 *   3. 底部快捷键条不重复按钮上已有的键（空格 / R），只放按钮没有的（1·2·3 / L / M）
 *   4. 声音控制只有一个入口：总开关、语音、语速都在同一个 .audio-ctl 里，右侧不得再出现「播报」
 */
import puppeteer from 'puppeteer-core';

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const BASE = 'http://127.0.0.1:8765/index.html';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: 'new',
  args: ['--no-sandbox', '--disable-gpu', '--mute-audio'],
  defaultViewport: { width: 1600, height: 900 },
});
const page = await browser.newPage();
await page.goto(BASE, { waitUntil: 'networkidle2' });
await sleep(4500);
await page.click('#btnLibrary');
await sleep(500);

const copy = await page.evaluate(() => {
  const t = (el) => (el?.textContent || '').replace(/\s+/g, ' ').trim();
  const buttons = [...document.querySelectorAll('button')].map(t);
  const audio = document.querySelector('.audio-ctl');
  return {
    buttons,
    replayBtn: t(document.getElementById('btnReplay')),
    libReplayBtn: t(document.getElementById('libPlay')),
    libCount: t(document.getElementById('libCount')),
    bodyText: document.body.textContent,
    footer: t(document.querySelector('.subtitle-bar')),
    audioButtons: audio ? [...audio.querySelectorAll('button')].map(t) : [],
    replayInFooter: !!document.querySelector('.subtitle-bar #btnReplay'),
    replayInPanel: !!document.querySelector('.panel-foot #btnReplay'),
    footerRCount: (t(document.querySelector('.subtitle-bar')).match(/R/g) || []).length,
    speechCount: document.querySelectorAll('#btnSpeech').length,
    actionsText: t(document.querySelector('.topbar-actions')),
  };
});
await browser.close();

const report = {
  '按钮里没有「听旋律」': !copy.buttons.some((b) => b.includes('听旋律')),
  '主面板重放按钮=再听一次': copy.replayBtn.includes('再听一次'),
  '色卡库重放按钮=再听一次': copy.libReplayBtn.includes('再听一次'),
  '说明文字允许出现「旋律」': copy.bodyText.includes('旋律'),
  '底栏不重复空格键': !copy.footer.includes('空格'),
  '重放按钮在底栏': copy.replayInFooter === true && copy.replayInPanel === false,
  '底栏 R 只出现一次': copy.footerRCount === 1,
  '底栏覆盖 L 色卡库': copy.footer.includes('L'),
  '底栏覆盖 M 播报': copy.footer.includes('M'),
  '播报组含总开关/操作/语速/音色': ['开', '操作', '语速', '音色'].every((k) => copy.audioButtons.some((b) => b.includes(k))),
  '不再有独立的语音子开关': !copy.audioButtons.some((b) => b.trim() === '语音'),
  '右侧只有显示类开关': !/播报|语音/.test(copy.actionsText),
};

console.log(JSON.stringify({
  report,
  samples: { footer: copy.footer, libCount: copy.libCount, audioButtons: copy.audioButtons, actions: copy.actionsText },
}, null, 2));
const failed = Object.entries(report).filter(([, v]) => !v).map(([k]) => k);
console.log(failed.length ? '未通过: ' + failed.join(', ') : '文案与结构一致性检查通过');
process.exit(failed.length ? 1 : 0);
