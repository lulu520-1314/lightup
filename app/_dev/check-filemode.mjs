/**
 * _dev/check-filemode.mjs — 验证「双击打开」时的引导页，以及 http 模式未受影响
 */
import puppeteer from 'puppeteer-core';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const CHROME = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const INDEX = path.resolve('index.html');
const fileUrl = pathToFileURL(INDEX).href;

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: 'new',
  args: ['--no-sandbox', '--disable-gpu'],
  defaultViewport: { width: 1200, height: 760, deviceScaleFactor: 2 },
});
const page = await browser.newPage();

await page.goto(fileUrl, { waitUntil: 'domcontentloaded' });
await new Promise((r) => setTimeout(r, 800));
const fileState = await page.evaluate(() => ({
  title: document.title,
  hasGuide: !!document.querySelector('.filemode'),
  heading: document.querySelector('.filemode h1')?.textContent,
}));
await page.screenshot({ path: '_dev/shots/40-filemode.png' });

const page2 = await browser.newPage();
await page2.goto('http://127.0.0.1:8765/index.html?photo=1', { waitUntil: 'networkidle2' });
await new Promise((r) => setTimeout(r, 3500));
const httpState = await page2.evaluate(() => ({
  hasGuide: !!document.querySelector('.filemode'),
  pill: document.getElementById('enginePill')?.textContent,
}));

await browser.close();
console.log(JSON.stringify({ fileUrl, fileState, httpState }, null, 2));
