/**
 * main.js — 应用编排层
 * ------------------------------------------------------------
 * 画面来源三选一：摄像头 / 上传图片 / 示例照片。
 * 「读色」支持点哪读哪（点击画面任意位置取色）。
 * 所有判断在 color.js / shades.js，这里只做流程与交互。
 */

import {
  rgb2hsv, rgb2lab, lab2rgb, deltaE2000,
  itaAngle, itaBand, undertoneOf, genericColorName,
  rgbToHex, hexToRgb, robustColor, smoothLabs,
} from './color.js';

import { SHADES, TONE_ADVICE, matchPhrase } from './shades.js';
import { sonifyColor, earcon, setMuted } from './audio.js';
import {
  speak, speakUI, setSpeechEnabled, primeSpeech, stopSpeaking, setSpeechRate,
  initVoices, setUIEnabled,
} from './speech.js';
import { FaceEngine, buildGeometry, shrinkPolygon, centroid } from './vision.js';

/* ================= 元素 ================= */
const $ = (id) => document.getElementById(id);
const video = $('video');
const photo = $('photo');
const overlay = $('overlay');
const octx = overlay.getContext('2d');

const els = {
  stage: document.querySelector('.stage'),
  pill: $('enginePill'),
  hint: $('stageHint'),
  swatch: $('swatch'),
  result: $('result'),
  read: $('btnRead'),
  readLabel: $('btnReadLabel'),
  replay: $('btnReplay'),
  remember: $('btnRemember'),
  goRead: $('btnGoRead'),
  help: $('btnHelp'),
  legend: $('legend'),
  subtitle: $('subtitle'),
  chooser: $('chooser'),
  fileInput: $('fileInput'),
  srcName: $('srcName'),
  srcCamera: $('srcCamera'),
  srcUpload: $('srcUpload'),
  srcExample: $('srcExample'),
  bigText: $('btnBigText'),
  contrast: $('btnHighContrast'),
  loupe: $('loupe'),
  loupeWrap: $('loupeWrap'),
  loupeLabel: $('loupeLabel'),
  qa: $('btnQA'),
  qaPanel: $('qaPanel'),
  qaAnswer: $('qaAnswer'),
  calibBanner: $('calibBanner'),
  btnMute: $('btnMute'),
  btnRate: $('btnRate'),
  btnUI: $('btnUI'),
  btnLoupe: $('btnLoupe'),
  loupeClose: $('loupeClose'),
  tip: $('tip'),
  tipTitle: $('tipTitle'),
  tipText: $('tipText'),
  tipClose: $('tipClose'),
  btnLibrary: $('btnLibrary'),
  lib: $('lib'),
  libGrid: $('libGrid'),
  libCount: $('libCount'),
  libClose: $('libClose'),
  libSel: $('libSel'),
  libPlay: $('libPlay'),
  libTryon: $('libTryon'),
  libTarget: $('libTarget'),
};

// 元素自检：漏注册会在这里立刻暴露，而不是等某个监听器报 undefined
{
  const missing = Object.entries(els).filter(([, v]) => !v).map(([k]) => k);
  if (missing.length) console.warn('[LightUp] 未找到的界面元素：', missing.join(', '));
}

const lctx = els.loupe.getContext('2d');

/**
 * 默认打开「示例照片」（第一次访问就能看到效果，不用先给摄像头权限）。
 * ?camera=1 可直接进实时模式，便于演示与自动化测试。
 */
const params = new URLSearchParams(location.search);
const FORCE_CAMERA = params.get('camera') === '1';

/* ================= 状态 ================= */
const state = {
  mode: 'object',                              // object | skin | check
  engine: new FaceEngine(),
  source: { kind: 'none', label: '' },         // none | camera | image
  stream: null,
  objectUrl: null,
  targetShade: null,
  lastResult: null,
  lastGeometry: null,
  pick: { x: 0.5, y: 0.5 },                    // 归一化取色点
  radius: 12,                                  // 取样半径（源图像素）
  whitePoint: null,                            // 白平衡参考（现场测到的"白"）
  calibrating: false,
  labHistory: [],                              // 摄像头模式下的时间平滑窗口
  tryonShade: null,                            // 试色模式当前选中的色号
  skinProfile: null,                           // 最近一次测得的肤色档案
  broadcast: true,                             // 播报总开关
  uiSpeech: true,                              // 操作类播报（按钮/切换提示）
  loupeOn: true,                               // 右下角放大镜是否显示
};

/* ================= 取帧画布 ================= */
const frameCanvas = document.createElement('canvas');
const fctx = frameCanvas.getContext('2d', { willReadFrequently: true });
const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const isNum = (v) => typeof v === 'number' && Number.isFinite(v);

function sourceInfo() {
  if (state.source.kind === 'image') {
    if (!photo.naturalWidth) return null;
    return { el: photo, w: photo.naturalWidth, h: photo.naturalHeight };
  }
  if (state.source.kind === 'camera' && video.videoWidth) {
    return { el: video, w: video.videoWidth, h: video.videoHeight };
  }
  return null;
}

function grabFrame() {
  const src = sourceInfo();
  if (!src) return null;
  const { w, h } = src;
  if (frameCanvas.width !== w || frameCanvas.height !== h) {
    frameCanvas.width = w;
    frameCanvas.height = h;
  }
  fctx.drawImage(src.el, 0, 0, w, h);
  return { w, h };
}

/* ================= 采样 ================= */
function medianOf(list) {
  if (!list.length) return 0;
  const s = [...list].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
}

/** 收集圆盘内的全部像素（交给 robustColor 做高光剔除与 Lab 中位） */
function collectDisc(cx, cy, radius, step = 1) {
  if (!isNum(cx) || !isNum(cy) || !isNum(radius) || radius <= 0) return null;
  const { width: w, height: h } = frameCanvas;
  const x0 = clamp(Math.round(cx - radius), 0, w - 1);
  const y0 = clamp(Math.round(cy - radius), 0, h - 1);
  const x1 = clamp(Math.round(cx + radius), 0, w - 1);
  const y1 = clamp(Math.round(cy + radius), 0, h - 1);
  const bw = Math.max(1, x1 - x0);
  const bh = Math.max(1, y1 - y0);

  const data = fctx.getImageData(x0, y0, bw, bh).data;
  const px = [];
  const r2 = radius * radius;

  for (let y = 0; y < bh; y += step) {
    for (let x = 0; x < bw; x += step) {
      const dx = x0 + x - cx;
      const dy = y0 + y - cy;
      if (dx * dx + dy * dy > r2) continue;
      const i = (y * bw + x) * 4;
      px.push([data[i], data[i + 1], data[i + 2]]);
    }
  }
  return px.length >= 8 ? px : null;
}

function pointInPolygon(px, py, pts) {
  let inside = false;
  for (let i = 0, j = pts.length - 1; i < pts.length; j = i++) {
    const xi = pts[i].x, yi = pts[i].y;
    const xj = pts[j].x, yj = pts[j].y;
    if ((yi > py) !== (yj > py) && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) {
      inside = !inside;
    }
  }
  return inside;
}

function collectPolygon(points, opts = {}) {
  const { minSat = 0 } = opts;
  if (!points || points.length < 3) return null;
  const xs = points.map((p) => p.x);
  const ys = points.map((p) => p.y);
  if (!xs.every(isNum) || !ys.every(isNum)) return null;

  const x0 = clamp(Math.floor(Math.min(...xs)), 0, frameCanvas.width - 1);
  const y0 = clamp(Math.floor(Math.min(...ys)), 0, frameCanvas.height - 1);
  const x1 = clamp(Math.ceil(Math.max(...xs)), 1, frameCanvas.width);
  const y1 = clamp(Math.ceil(Math.max(...ys)), 1, frameCanvas.height);
  const bw = x1 - x0;
  const bh = y1 - y0;
  if (bw <= 0 || bh <= 0) return null;

  const data = fctx.getImageData(x0, y0, bw, bh).data;
  const px = [];

  for (let y = 0; y < bh; y += 2) {
    for (let x = 0; x < bw; x += 2) {
      if (!pointInPolygon(x0 + x, y0 + y, points)) continue;
      const i = (y * bw + x) * 4;
      const r = data[i], g = data[i + 1], b = data[i + 2];
      if (minSat > 0) {
        const mx = Math.max(r, g, b);
        const mn = Math.min(r, g, b);
        if (mx === 0 || (mx - mn) / mx < minSat) continue;
      }
      px.push([r, g, b]);
    }
  }
  return px.length >= 12 ? px : null;
}

/* ================= 分析 ================= */
function nearestShade(lab, topN = 3) {
  return SHADES
    .map((s) => {
      const [r, g, b] = hexToRgb(s.hex);
      return { shade: s, dE: deltaE2000(lab, rgb2lab(r, g, b)) };
    })
    .sort((a, b) => a.dE - b.dE)
    .slice(0, topN);
}

function analyzeObject(lab) {
  const [r, g, b] = lab2rgb(lab[0], lab[1], lab[2]);
  const hsv = rgb2hsv(r, g, b);
  const tone = undertoneOf(lab);
  const ranked = nearestShade(lab);
  const best = ranked[0];

  // 色卡是口红卡，不是通用色卡：差太远就不能硬套色号名
  const isShade = best.dE < 12;
  const generic = genericColorName(hsv.h, hsv.s, hsv.v);
  const name = isShade ? best.shade.zh : generic;

  const sentence = isShade
    ? `这是 ${best.shade.zh}，${tone.label}，与色卡偏差 ${best.dE.toFixed(1)}，${matchPhrase(best.dE)}。`
    : `这是 ${generic}，${tone.label}。口红卡里最接近的是 ${best.shade.zh}（ΔE ${best.dE.toFixed(1)}），仅供参考。`;

  return {
    kind: 'object',
    name,
    en: isShade ? best.shade.en : 'OBJECT COLOR',
    hsv, lab, tone, dE: best.dE, ranked, isShade,
    hex: rgbToHex(r, g, b),
    sentence,
    tags: [tone.label, isShade ? best.shade.family : '物体色'],
    // 三个指标各自回答一个问题：像不像、什么色、深浅如何
    metrics: [
      { key: 'de', value: best.dE.toFixed(1), label: '色差 ΔE' },
      { key: 'hue', value: `${hsv.h.toFixed(0)}°`, label: '色相' },
      { key: 'light', value: `${lab[0].toFixed(0)}`, label: '明度' },
    ],
  };
}

function analyzeSkin(lab) {
  const [r, g, b] = lab2rgb(lab[0], lab[1], lab[2]);
  const ita = itaAngle(lab);
  const band = itaBand(ita);
  const tone = undertoneOf(lab);
  const advice = TONE_ADVICE[tone.key] || TONE_ADVICE.neutral;
  const hsv = rgb2hsv(r, g, b);

  const sentence =
    `你的肤色属于${band.label}，${tone.label}。` +
    `建议选择${advice.pick.slice(0, 3).join('、')}这类颜色。` +
    (advice.avoid.length ? `尽量避开${advice.avoid.slice(0, 2).join('和')}。` : '');

  // 从色卡里挑 3 支：色调匹配、且尽量不在同一个色系，避免推荐的全是红
  const seenFamily = new Set();
  const recommend = [];
  for (const sh of SHADES) {
    if (!(sh.tone === tone.key || sh.tone === 'neutral')) continue;
    if (seenFamily.has(sh.family)) continue;
    seenFamily.add(sh.family);
    recommend.push(sh);
    if (recommend.length >= 3) break;
  }

  return {
    kind: 'skin', name: `${tone.label} · ${band.label}`, en: band.label,
    hsv, lab, tone, ita, band, advice, recommend,
    hex: rgbToHex(r, g, b), sentence,
    tags: [tone.label, `ITA ${ita.toFixed(0)}°`],
    // 肤色判断真正用到的只有两个量：深浅、冷暖。
    // 原始 b*（黄度）是计算中间量，对用户没有意义，所以不展示。
    metrics: [
      { key: 'ita', value: `${ita.toFixed(0)}°`, label: '肤色深浅' },
      { key: 'tone', value: tone.label, label: '冷暖调' },
    ],
  };
}

function analyzeCheck(lab) {
  const [r, g, b] = lab2rgb(lab[0], lab[1], lab[2]);
  const ranked = nearestShade(lab);
  const current = ranked[0];
  const hsv = rgb2hsv(r, g, b);
  const tone = undertoneOf(lab);

  let name = current.shade.zh;
  let sentence;
  let dE = null;

  if (state.targetShade) {
    const [tr, tg, tb] = hexToRgb(state.targetShade.hex);
    dE = deltaE2000(lab, rgb2lab(tr, tg, tb));
    if (dE < 4) sentence = `和你要的${state.targetShade.zh}基本一致，可以了。`;
    else if (dE < 10) sentence = `和${state.targetShade.zh}很接近，偏差 ${dE.toFixed(1)}，再薄薄补一层会更准。`;
    else if (dE < 20) sentence = `明显偏离了${state.targetShade.zh}，偏差 ${dE.toFixed(1)}。`;
    else sentence = `现在不太像${state.targetShade.zh}，偏差 ${dE.toFixed(1)}，建议擦掉重涂。`;
    name = current.shade.zh === state.targetShade.zh
      ? current.shade.zh
      : `${current.shade.zh}（目标 ${state.targetShade.zh}）`;
  } else {
    // 没有目标时给出可执行的下一步，而不是把用户堵在这里
    sentence = `唇色接近 ${current.shade.zh}。还没有设定目标色——请先到「读色」读取口红并记住色号。`;
  }

  return {
    kind: 'check', name, en: current.shade.en,
    hsv, lab, tone, dE, ranked,
    hex: rgbToHex(r, g, b), sentence,
    needsTarget: !state.targetShade,
    tags: [tone.label, state.targetShade ? `目标 ${state.targetShade.zh}` : '未设目标'],
    // 验妆只关心两件事：差多少、现在是什么色。
    metrics: [
      { key: 'de', value: dE == null ? '—' : dE.toFixed(1), label: '与目标色差' },
      { key: 'match', value: current.shade.zh, label: '最接近的色号' },
    ],
  };
}

/* ================= 渲染 ================= */
function setSubtitle(text) {
  els.subtitle.textContent = text;
}

function renderResult(res) {
  const toneClass = res.tone?.key === 'warm' ? 'warm' : res.tone?.key === 'cool' ? 'cool' : '';
  const tags = res.tags
    .map((t, i) => `<span class="tag ${i === 0 && toneClass ? toneClass : 'gold'}">${t}</span>`)
    .join('');

  const metricCards = (res.metrics && res.metrics.length)
    ? `<div class="metric-row">${res.metrics.map((m) => `
        <button type="button" class="metric" data-tip="${m.key}"
                aria-label="${m.label} ${m.value}，点按查看说明">
          <strong title="${m.value}">${m.value}</strong><span>${m.label}</span>
        </button>`).join("")}</div>
       <p class="metric-hint">点指标卡片，看它是什么意思</p>`
    : "";

  const alternatives = res.ranked && res.ranked.length > 1
    ? `<div class="result-sentence" style="color:var(--text-faint);font-size:.82rem">
         相近色号：${res.ranked.slice(1, 3).map((x) => `${x.shade.zh}（ΔE ${x.dE.toFixed(1)}）`).join('　')}
       </div>`
    : '';

  const skinExtra = res.kind === 'skin' ? `
    <p class="strip-title">适合你的色号（点一下直接试色）</p>
    <div class="strip">
      ${(res.recommend || []).map((x) => `
        <button class="strip-chip" data-rec="${x.zh}" aria-label="${x.zh}，去试色">
          <span class="sw" style="background:${x.hex}"></span><span>${x.zh}</span>
        </button>`).join("")}
    </div>
    ${res.advice?.avoid?.length
      ? `<p class="strip-title">建议避开：${res.advice.avoid.join('、')}</p>` : ""}
  ` : "";

  els.result.innerHTML = `
    <div class="result-name">${res.name}</div>
    <div class="result-en">${res.en}</div>
    <div class="result-sentence">${res.sentence}</div>
    <div class="tags">${tags}</div>
    ${metricCards}
    ${skinExtra}
    ${alternatives}
  `;
}

/* ================= 覆盖层 ================= */
function resizeOverlay() {
  const rect = overlay.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  overlay.width = Math.max(1, Math.round(rect.width * dpr));
  overlay.height = Math.max(1, Math.round(rect.height * dpr));
}
window.addEventListener('resize', resizeOverlay);

function coverMap(srcW, srcH) {
  const w = overlay.width;
  const h = overlay.height;
  const scale = Math.max(w / srcW, h / srcH);
  const offX = (w - srcW * scale) / 2;
  const offY = (h - srcH * scale) / 2;
  return {
    scale, offX, offY,
    toScreen: (p) => ({ x: p.x * scale + offX, y: p.y * scale + offY }),
  };
}

function drawOverlay(geo, srcW, srcH) {
  const w = overlay.width;
  const h = overlay.height;
  octx.clearRect(0, 0, w, h);
  if (!srcW || !srcH) return;

  const dpr = window.devicePixelRatio || 1;
  const m = coverMap(srcW, srcH);
  const mode = state.mode;

  // 读色：只画取色圈，不画身体部位
  if (mode === 'object') {
    const p = m.toScreen({ x: state.pick.x * srcW, y: state.pick.y * srcH });
    const r = state.radius * m.scale;
    octx.beginPath();
    octx.arc(p.x, p.y, r, 0, Math.PI * 2);
    octx.strokeStyle = 'rgba(201,162,39,.95)';
    octx.lineWidth = 1.8 * dpr;
    octx.stroke();
    octx.beginPath();
    octx.arc(p.x, p.y, 2.2 * dpr, 0, Math.PI * 2);
    octx.fillStyle = 'rgba(201,162,39,.95)';
    octx.fill();
    return;
  }

  if (!geo) return;
  octx.lineWidth = 1.6 * dpr;

  // 诊肤色：只标出脸颊采样区与脸部范围，不画嘴唇
  if (mode === 'skin') {
    (geo.skinPoints || geo.cheeks).forEach((c) => {
      const p = m.toScreen(c);
      octx.beginPath();
      octx.arc(p.x, p.y, c.r * m.scale, 0, Math.PI * 2);
      octx.strokeStyle = 'rgba(255,255,255,.55)';
      octx.setLineDash([4 * dpr, 4 * dpr]);
      octx.stroke();
      octx.setLineDash([]);
    });

    const f0 = m.toScreen({ x: geo.faceBox.x, y: geo.faceBox.y });
    const f1 = m.toScreen({ x: geo.faceBox.x + geo.faceBox.w, y: geo.faceBox.y + geo.faceBox.h });
    const c2 = 18 * dpr;
    octx.strokeStyle = 'rgba(255,255,255,.22)';
    octx.beginPath();
    octx.moveTo(f0.x, f0.y + c2); octx.lineTo(f0.x, f0.y); octx.lineTo(f0.x + c2, f0.y);
    octx.moveTo(f1.x - c2, f0.y); octx.lineTo(f1.x, f0.y); octx.lineTo(f1.x, f0.y + c2);
    octx.moveTo(f0.x, f1.y - c2); octx.lineTo(f0.x, f1.y); octx.lineTo(f0.x + c2, f1.y);
    octx.moveTo(f1.x - c2, f1.y); octx.lineTo(f1.x, f1.y); octx.lineTo(f1.x, f1.y - c2);
    octx.stroke();
    return;
  }

  // 查妆容 / 试色：只画唇部
  octx.beginPath();
  geo.lipOuter.map(m.toScreen).forEach((p, i) => (i ? octx.lineTo(p.x, p.y) : octx.moveTo(p.x, p.y)));
  octx.closePath();

  if (mode === 'tryon' && state.tryonShade) {
    paintLips(geo, m, srcW, srcH);
  }

  octx.strokeStyle = 'rgba(201,162,39,.92)';
  octx.stroke();

  octx.beginPath();
  geo.lipInner.map(m.toScreen).forEach((p, i) => (i ? octx.lineTo(p.x, p.y) : octx.moveTo(p.x, p.y)));
  octx.closePath();
  octx.strokeStyle = 'rgba(201,162,39,.36)';
  octx.stroke();
}

/* ================= 试色上妆 ================= */
/**
 * 直接盖一层半透明色块会像贴纸。正确做法：
 *   1) 把原图裁到唇形（边缘羽化），保住唇纹与高光
 *   2) 用 color 混合模式只替换"色相/饱和度"，保留原图的明暗
 * 这样唇珠、唇缝、反光都还在，颜色看起来是"长在上面"的。
 */
const tryCanvas = document.createElement('canvas');
const tryCtx = tryCanvas.getContext('2d');

function lipPath(geo, m) {
  const path = new Path2D();
  geo.lipOuter.map(m.toScreen).forEach((p, i) => (i ? path.lineTo(p.x, p.y) : path.moveTo(p.x, p.y)));
  path.closePath();
  return path;
}

function paintLips(geo, m, srcW, srcH) {
  const w = overlay.width;
  const h = overlay.height;
  if (tryCanvas.width !== w || tryCanvas.height !== h) {
    tryCanvas.width = w;
    tryCanvas.height = h;
  }
  const path = lipPath(geo, m);
  tryCtx.clearRect(0, 0, w, h);

  // 1) 底图（整幅，稍后裁掉唇外部分）
  tryCtx.globalCompositeOperation = 'source-over';
  tryCtx.globalAlpha = 1;
  tryCtx.filter = 'none';
  tryCtx.drawImage(frameCanvas, 0, 0, srcW, srcH, m.offX, m.offY, srcW * m.scale, srcH * m.scale);

  // 2) 只留唇部，并用 blur 让边界柔和过渡
  tryCtx.globalCompositeOperation = 'destination-in';
  tryCtx.filter = 'blur(3px)';
  tryCtx.fillStyle = '#fff';
  tryCtx.fill(path);
  tryCtx.filter = 'none';

  // 3) 上色：color 混合 = 替换色相与饱和度，保留明暗纹理
  tryCtx.globalCompositeOperation = 'color';
  tryCtx.globalAlpha = 0.92;
  tryCtx.fillStyle = state.tryonShade.hex;
  tryCtx.fill(path);

  // 4) 叠回覆盖层
  tryCtx.globalCompositeOperation = 'source-over';
  tryCtx.globalAlpha = 1;
  octx.drawImage(tryCanvas, 0, 0);
}

/* ================= 放大镜 ================= */
function drawLoupe() {
  if (!state.loupeOn) { els.loupeWrap.hidden = true; return; }
  if (state.mode !== 'object' || state.source.kind === 'none') {
    els.loupeWrap.hidden = true;
    return;
  }
  const src = sourceInfo();
  if (!src || !grabFrame()) {
    els.loupeWrap.hidden = true;
    return;
  }
  els.loupeWrap.hidden = false;

  const size = els.loupe.width;
  const R = Math.max(2, state.radius);
  const px = state.pick.x * src.w;
  const py = state.pick.y * src.h;
  const sx = clamp(px - R, 0, Math.max(0, src.w - 2 * R));
  const sy = clamp(py - R, 0, Math.max(0, src.h - 2 * R));

  lctx.imageSmoothingEnabled = false;
  lctx.clearRect(0, 0, size, size);
  lctx.drawImage(frameCanvas, sx, sy, R * 2, R * 2, 0, 0, size, size);

  // 圆形取样区示意（正好落在放大图边界上）
  lctx.beginPath();
  lctx.arc(size / 2, size / 2, size / 2 - 3, 0, Math.PI * 2);
  lctx.strokeStyle = 'rgba(201,162,39,.95)';
  lctx.lineWidth = 4;
  lctx.stroke();

  // 圆心十字
  const c = size / 2;
  lctx.strokeStyle = 'rgba(255,255,255,.85)';
  lctx.lineWidth = 2;
  lctx.beginPath();
  lctx.moveTo(c - 10, c); lctx.lineTo(c + 10, c);
  lctx.moveTo(c, c - 10); lctx.lineTo(c, c + 10);
  lctx.stroke();

  els.loupeLabel.textContent = `取样半径 ${Math.round(R)} px`;
}

/** 放大图内点击/拖动 → 微调取色点 */
function loupePointer(e) {
  const src = sourceInfo();
  if (!src) return;
  const rect = els.loupe.getBoundingClientRect();
  const fx = (e.clientX - rect.left) / rect.width;
  const fy = (e.clientY - rect.top) / rect.height;
  const px = state.pick.x * src.w + (fx - 0.5) * 2 * state.radius;
  const py = state.pick.y * src.h + (fy - 0.5) * 2 * state.radius;
  state.pick = { x: clamp(px / src.w, 0, 1), y: clamp(py / src.h, 0, 1) };
  drawOverlay(state.lastGeometry, src.w, src.h);
  drawLoupe();
}

let loupeDragging = false;
els.loupe.addEventListener('pointerdown', (e) => {
  loupeDragging = true;
  els.loupe.setPointerCapture(e.pointerId);
  loupePointer(e);
});
els.loupe.addEventListener('pointermove', (e) => {
  if (loupeDragging) loupePointer(e);
});
els.loupe.addEventListener('pointerup', (e) => {
  loupeDragging = false;
  els.loupe.releasePointerCapture(e.pointerId);
});

/* 滚轮缩放取样半径 */
els.stage.addEventListener('wheel', (e) => {
  if (state.source.kind === 'none' || state.mode !== 'object') return;
  e.preventDefault();
  const factor = e.deltaY > 0 ? 1.15 : 1 / 1.15;
  state.radius = clamp(Math.round(state.radius * factor), 3, 90);
  const src = sourceInfo();
  drawOverlay(state.lastGeometry, src.w, src.h);
  drawLoupe();
}, { passive: false });

/** 方向键微调取色点（Shift 加速） */
function nudgePick(dx, dy) {
  const src = sourceInfo();
  if (!src || state.source.kind === 'none') return;
  const step = 1 / Math.max(src.w, src.h);
  state.pick = {
    x: clamp(state.pick.x + dx * step, 0, 1),
    y: clamp(state.pick.y + dy * step, 0, 1),
  };
  drawOverlay(state.lastGeometry, src.w, src.h);
  drawLoupe();
}
let lastDetect = 0;
function loop(ts) {
  requestAnimationFrame(loop);
  if (state.source.kind !== 'camera' || !state.engine.ready) return;
  if (ts - lastDetect < 90) return;
  lastDetect = ts;

  if (state.engine.mode !== 'VIDEO') return;
  const res = state.engine.detect(video, ts);
  if (res) {
    const { w, h } = grabFrame() || {};
    if (!w) return;
    const geo = buildGeometry(res.landmarks.map((p) => ({ x: p.x * w, y: p.y * h })));
    state.lastGeometry = geo;
    drawOverlay(geo, w, h);
    els.pill.textContent = `人脸已锁定 · ${state.engine.delegate}`;
    els.pill.classList.add('ok');
  } else {
    state.lastGeometry = null;
    drawOverlay(null, video.videoWidth, video.videoHeight);
    els.pill.textContent = state.engine.ready ? '未检测到人脸' : '视觉引擎加载中';
    els.pill.classList.remove('ok');
  }
}

/* ================= 画面来源 ================= */
function setSourceUI(kind, label) {
  state.source = { kind, label };
  const isCam = kind === 'camera';
  const isImg = kind === 'image';
  els.srcCamera.setAttribute('aria-pressed', String(isCam));
  els.srcUpload.setAttribute('aria-pressed', String(isImg && label !== '示例照片'));
  els.srcExample.setAttribute('aria-pressed', String(isImg && label === '示例照片'));
  els.srcName.textContent = label || '';
  els.chooser.hidden = kind !== 'none';
  video.hidden = !isCam;
  photo.hidden = !isImg;
  document.body.classList.toggle('image-mode', isImg);
  resizeOverlay();
}

function stopCamera() {
  if (state.stream) {
    state.stream.getTracks().forEach((t) => t.stop());
    state.stream = null;
  }
}

async function useCamera() {
  if (state.source.kind === 'camera' && state.stream) return true;
  if (state.source.kind === 'image') clearWhitePoint({ announce: false });
  clearObjectUrl();
  els.hint.textContent = '正在请求摄像头权限…';
  try {
    if (!navigator.mediaDevices?.getUserMedia) throw new Error('no-usermedia');
    const stream = await Promise.race([
      navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'user', width: { ideal: 1280 }, height: { ideal: 960 } },
        audio: false,
      }),
      new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), 8000)),
    ]);
    state.stream = stream;
    video.srcObject = stream;
    await video.play();
    await state.engine.setVideoMode();
    setSourceUI('camera', '摄像头');
    els.pill.textContent = '摄像头已就绪';
    els.hint.textContent = MODE_META[state.mode].hint;
    state.pick = { x: 0.5, y: 0.5 };
    state.radius = clamp(Math.round(Math.min(video.videoWidth, video.videoHeight) * 0.012), 4, 24);
    drawOverlay(null);
    return true;
  } catch (err) {
    stopCamera();
    setSourceUI('none', '');
    els.pill.textContent = '无法访问摄像头';
    els.hint.textContent = '没有摄像头权限，可以上传图片或使用示例照片';
    return false;
  }
}

function clearObjectUrl() {
  if (state.objectUrl) {
    URL.revokeObjectURL(state.objectUrl);
    state.objectUrl = null;
  }
}

/** 载入一张图片作为画面来源 */
async function loadImageSource(url, label) {
  stopCamera();
  // 从别的来源切过来时，旧的白参考不再成立，必须重置
  if (state.source.kind !== 'none') clearWhitePoint({ announce: false });
  setSourceUI('image', label);
  els.pill.textContent = '正在读取图片…';

  photo.src = url;

  // 等图片真正可用：不依赖 decode()（部分浏览器/移动端会提前 reject）
  await new Promise((resolve) => {
    if (photo.complete && photo.naturalWidth) return resolve();
    const done = () => resolve();
    photo.addEventListener('load', done, { once: true });
    photo.addEventListener('error', done, { once: true });
    setTimeout(done, 5000);
  });

  if (!photo.naturalWidth) {
    els.pill.textContent = '图片读取失败';
    els.pill.classList.remove('ok');
    announceAndShow('这张图片读不出来，请换一张 JPG 或 PNG。');
    return false;
  }

  const w = photo.naturalWidth;
  const h = photo.naturalHeight;
  state.radius = clamp(Math.round(Math.min(w, h) * 0.012), 4, 24);

  // 先把图显示出来：这一步与"人脸模型是否就绪"无关
  state.lastGeometry = null;
  state.pick = { x: 0.5, y: 0.5 };
  drawOverlay(null, w, h);
  drawLoupe();
  els.hint.textContent = window.matchMedia('(pointer: coarse)').matches
    ? '点一下画面取色；双指缩放取样大小'
    : '点击画面取色；滚轮调取样大小，放大图内可微调';

  // 再尝试人脸检测；模型不可用时仍然保留读色能力
  const imageModeReady = await state.engine.setImageMode();
  if (!imageModeReady) {
    els.pill.textContent = '仅读色（人脸模型未就绪）';
    els.pill.classList.remove('ok');
    if (state.mode === 'object') readNow();
    return true;
  }

  const res = state.engine.detectImage(photo);
  if (res) {
    const geo = buildGeometry(res.landmarks.map((p) => ({ x: p.x * w, y: p.y * h })));
    state.lastGeometry = geo;
    const c = centroid(geo.lipOuter);
    state.pick = { x: c.x / w, y: c.y / h };
    els.pill.textContent = `人脸已锁定 · ${state.engine.delegate}`;
    els.pill.classList.add('ok');
    drawOverlay(geo, w, h);
  } else {
    els.pill.textContent = '图片中未检测到人脸';
    els.pill.classList.remove('ok');
    drawOverlay(null, w, h);
  }

  drawLoupe();
  if (state.mode === 'object') readNow();
  return true;
}

function useExample() {
  clearObjectUrl();
  return loadImageSource('./assets/demo-face.jpg', '示例照片');
}

function handleFile(file) {
  if (!file || !file.type.startsWith('image/')) {
    announceAndShow('请选择一张图片。');
    return;
  }
  clearObjectUrl();
  const url = URL.createObjectURL(file);
  state.objectUrl = url;
  loadImageSource(url, file.name.length > 24 ? file.name.slice(0, 22) + '…' : file.name);
}

/* ================= 取色点 ================= */
function stagePointToSource(clientX, clientY) {
  const src = sourceInfo();
  if (!src) return null;
  const rect = els.stage.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  const m = coverMap(src.w, src.h);
  const scaleCss = m.scale / dpr;
  const offXCss = m.offX / dpr;
  const offYCss = m.offY / dpr;

  let dx = clientX - rect.left;
  const dy = clientY - rect.top;
  // 摄像头画面是镜像显示的（照镜子直觉），点击位置要水平翻转回源坐标
  if (state.source.kind === 'camera') dx = rect.width - dx;

  const px = (dx - offXCss) / scaleCss;
  const py = (dy - offYCss) / scaleCss;
  return {
    x: clamp(px / src.w, 0, 1),
    y: clamp(py / src.h, 0, 1),
    px, py,
  };
}

els.stage.addEventListener('click', (e) => {
  if (state.source.kind === 'none') return;
  if (e.target.closest('.chooser')) return;
  const p = stagePointToSource(e.clientX, e.clientY);
  if (!p) return;
  state.pick = { x: p.x, y: p.y };
  const src = sourceInfo();
  drawOverlay(state.lastGeometry, src.w, src.h);

  if (state.calibrating) {
    calibrateFromPick(src);
    return;
  }
  if (state.mode === 'object') readNow();
  else announceAndShow('已重新取色。肤色与妆容模式使用人脸关键点，不需要点选。');
});

/* ================= 动作 ================= */
function announceAndShow(text) {
  setSubtitle(text);
  speakUI(text);
  earcon('error');
}

function finish(res) {
  state.lastResult = res;
  els.swatch.style.background = res.hex;
  renderResult(res);
  setSubtitle(res.sentence);
  sonifyColor(res.hsv, res.tone.key);
  setTimeout(() => speak(res.sentence), 620);
  els.replay.disabled = false;
  els.remember.hidden = res.kind !== 'object' || res.isShade === false;
  els.goRead.hidden = !(res.kind === 'check' && res.needsTarget);
  if (res.kind === 'skin') {
    state.skinProfile = { tone: res.tone.key, band: res.band.label, ita: res.ita };
  }
  earcon('detect');
  drawLoupe();
}

function readNow() {
  if (state.source.kind === 'none') {
    els.chooser.hidden = false;
    announceAndShow('先选择一个画面来源：摄像头、上传图片，或用示例照片。');
    return;
  }
  const src = grabFrame();
  if (!src) {
    announceAndShow('画面还没准备好，稍等一下。');
    return;
  }

  if (state.mode === 'object') {
    if (state.calibrating) return calibrateFromPick(src);
    const px0 = state.pick.x * src.w;
    const py0 = state.pick.y * src.h;
    const geo = state.lastGeometry;

    // 点在嘴唇上：按唇膏规则取色（高彩度簇 = 膏体本色，避免被阴影拉灰）
    if (geo && geo.lipOuter.length > 3 && pointInPolygon(px0, py0, geo.lipOuter)) {
      const lipPx = collectPolygon(shrinkPolygon(geo.lipOuter, 0.9), { minSat: 0.12 });
      const lip = robustColor(lipPx, state.whitePoint, { chromaTop: 0.25 });
      if (lip) return finish(analyzeObject(withSmoothing(lip.lab)));
    }

    const px = collectDisc(px0, py0, state.radius);
    const robust = robustColor(px, state.whitePoint);
    if (!robust) return announceAndShow('取色失败，请换一个位置再点一次。');
    state.lastSample = {
      px: Math.round(px0), py: Math.round(py0), radius: state.radius,
      rgb: robust.rgb, hex: rgbToHex(robust.rgb[0], robust.rgb[1], robust.rgb[2]),
      kept: robust.kept, total: robust.total,
    };
    return finish(analyzeObject(withSmoothing(robust.lab)));
  }

  const geo = state.lastGeometry;
  if (!geo) {
    earcon('error');
    return announceAndShow('没有检测到人脸。请正对镜头，或换一张更清晰的正脸照片。');
  }

  if (state.mode === 'skin') {
    // 三个点各自取一次，再对三组 Lab 取中位：
    // 任一点落在头发/阴影上，中位数仍能守住肤色主体
    const perPoint = geo.skinPoints
      .map((c) => robustColor(collectDisc(c.x, c.y, c.r, 2), state.whitePoint))
      .filter(Boolean)
      .map((r) => r.lab);
    if (!perPoint.length) return announceAndShow('脸颊取色失败。');
    const lab = [0, 1, 2].map((i) => medianOf(perPoint.map((l) => l[i])));
    return finish(analyzeSkin(lab));
  }

  const px = collectPolygon(shrinkPolygon(geo.lipOuter, 0.74), { minSat: 0.15 });
  const robust = robustColor(px, state.whitePoint, { chromaTop: 0.25 });
  if (!robust) return announceAndShow('唇部取色失败，请换一张正脸照片。');

  if (state.mode === 'tryon') {
    const best = nearestShade(robust.lab)[0].shade;
    setTryonShade(best.zh);
    setSubtitle(`你现在的唇色接近 ${best.zh}，已按这个色号试色。`);
    speak(`你现在的唇色接近 ${best.zh}。`);
    return;
  }
  finish(analyzeCheck(withSmoothing(robust.lab)));
}

/** 摄像头模式下对最近几次读数取中位，抑制帧间跳动 */
function withSmoothing(lab) {
  if (state.source.kind !== 'camera') {
    state.labHistory = [];
    return lab;
  }
  state.labHistory.push(lab);
  if (state.labHistory.length > 5) state.labHistory.shift();
  return state.labHistory.length >= 3 ? smoothLabs(state.labHistory) : lab;
}

/** 用当前取色点作为"白参考"，校正现场光源偏色 */
function calibrateFromPick(src) {
  const r = Math.max(18, state.radius * 3);
  const px = collectDisc(state.pick.x * src.w, state.pick.y * src.h, r, 2);
  if (!px) return announceAndShow('没取到颜色，请靠近白纸或白墙再点一次。');

  const med = [0, 1, 2].map((i) => medianOf(px.map((p) => p[i])));
  const lab = rgb2lab(med[0], med[1], med[2]);
  const chroma = Math.hypot(lab[1], lab[2]);

  // 白参考必须"又亮又中性"：只卡彩度不够，暗灰也会被误当成白
  if (chroma > 12) {
    return announceAndShow('这块明显带颜色。请在当前画面里点一处白色；如果这张图里没有白色，可以跳过校准。');
  }
  if (lab[0] < 40) {
    return announceAndShow('这块太暗了，当不了白参考。请点更亮一点的白纸或白墙。');
  }
  if (med.every((v) => v > 248)) {
    return announceAndShow('这块过曝了（接近纯白）。换一处柔和一点的白再点。');
  }

  state.whitePoint = med;
  state.calibrating = false;
  try {
    localStorage.setItem('lightup.whitePoint', JSON.stringify(med));
  } catch (_) { /* 隐私模式下忽略 */ }
  updateCalibUI();
  announceAndShow(`白平衡已校准（参考 ${rgbToHex(med[0], med[1], med[2])}）。把口红对准画面，按空格再读一次。`);
}

/* ================= 模式 ================= */
const MODE_META = {
  object: { name: '读色', label: '读一读这个颜色', hint: '把口红对准圆框，或点击画面任意位置' },
  skin: { name: '诊肤色', label: '测一测我的肤色', hint: '正对镜头，让脸颊填满画面' },
  check: { name: '查妆容', label: '看一看涂得准不准', hint: '正对镜头，露出嘴唇' },
  tryon: { name: '试色', label: '挑一支试试颜色', hint: '选一支色号，直接涂在唇形上看' },
};

const MODE_KEYS = ['object', 'skin', 'check', 'tryon'];

function setMode(mode, fromInit = false) {
  state.mode = mode;
  MODE_KEYS.forEach((m) => {
    const btn = $('mode' + m[0].toUpperCase() + m.slice(1));
    btn.setAttribute('aria-selected', String(m === mode));
    btn.tabIndex = m === mode ? 0 : -1;
  });
  els.readLabel.textContent = MODE_META[mode].label;
  els.hint.textContent = MODE_META[mode].hint;
  if (!fromInit) speakUI(`${MODE_META[mode].name}模式。`);
  els.remember.hidden = true;
  els.goRead.hidden = true;

  const src = sourceInfo();
  if (src) drawOverlay(state.lastGeometry, src.w, src.h);
  drawLoupe();

  if (mode === 'tryon') {
    if (!state.tryonShade) {
      state.tryonShade = SHADES.find((x) => x.zh === '豆沙色') || SHADES[0];
    }
    renderTryonPanel();
    setSubtitle(MODE_META.tryon.hint);
    return;
  }

  els.result.innerHTML = `<div class="result-placeholder">
      <p>${MODE_META[mode].hint}。</p>
      <p class="dim">${mode === 'check'
        ? '先在「读色」里记住一支口红的色号，再来比对实际唇色。'
        : '所有计算在本机完成，画面不会上传。'}</p>
    </div>`;
  setSubtitle(MODE_META[mode].hint);
}

/* ---------------- 试色面板 ---------------- */
const QUICK_SHADES = ['正红', '复古红', '砖红', '番茄红', '珊瑚橘', '蜜桃色',
                      '焦糖棕', '奶茶色', '豆沙色', '裸粉', '莓果紫', '火龙果'];

function renderTryonPanel() {
  const cur = state.tryonShade || SHADES[0];
  const chips = QUICK_SHADES.map((zh) => SHADES.find((x) => x.zh === zh)).filter(Boolean);

  els.result.innerHTML = `
    <div class="result-name">${cur.zh}</div>
    <div class="result-en">${cur.en}</div>
    <div class="result-sentence">已经涂在你的唇形上。换一支看看，或按空格读取你现在的唇色。</div>
    <div class="tags">
      <span class="tag gold">${TONE_LABEL[cur.tone]}</span>
      <span class="tag">${cur.hex.toUpperCase()}</span>
    </div>
    <p class="strip-title">快速换色</p>
    <div class="strip">
      ${chips.map((x) => `
        <button class="strip-chip ${x.zh === cur.zh ? 'on' : ''}" data-shade="${x.zh}"
                aria-pressed="${x.zh === cur.zh}" aria-label="${x.zh}，${TONE_LABEL[x.tone]}">
          <span class="sw" style="background:${x.hex}"></span><span>${x.zh}</span>
        </button>`).join("")}
      <button class="strip-chip more" data-more="1" aria-label="打开色卡库，浏览全部色号">
        <span class="sw">＋</span><span>更多</span>
      </button>
    </div>
    <div class="metric-row">
      <button class="metric" data-act="target"><strong>${cur.zh}</strong><span>设为验妆目标</span></button>
      <button class="metric" data-act="listen"><strong>♪</strong><span>再听一次</span></button>
    </div>`;
}

function setTryonShade(zh) {
  const shade = SHADES.find((x) => x.zh === zh);
  if (!shade) return;
  state.tryonShade = shade;
  const src = sourceInfo();
  grabFrame();                       // 上妆要用当前帧做底图
  if (src) drawOverlay(state.lastGeometry, src.w, src.h);
  renderTryonPanel();
  const [r, g, b] = hexToRgb(shade.hex);
  sonifyColor(rgb2hsv(r, g, b), shade.tone);
  setTimeout(() => speak(`${shade.zh}，${TONE_LABEL[shade.tone]}。`), 520);
}

/* ================= 离线问答（不依赖任何 API） ================= */
const TONE_LABEL = { warm: '暖调', cool: '冷调', neutral: '中性调' };

function answerQuestion(q) {
  const r = state.lastResult;
  const clean = (t) => t.replace(/<[^>]+>/g, '');
  const say = (html) => {
    els.qaAnswer.innerHTML = html;
    setSubtitle(clean(html));
    speak(clean(html));
  };

  if (q === 'accurate') {
    return say('三步：一，点左下角<b>白平衡</b>，再点画面里的白纸；二，用<b>滚轮</b>把取样圈缩到刚好盖住目标；三，在右下<b>放大图</b>里拖到最均匀的位置，避开反光点。');
  }

  if (q === 'check') {
    if (state.targetShade) {
      setMode('check');
      return say(`已切到「查妆容」，按空格就能比较你现在涂的和 <b>${state.targetShade.zh}</b> 差多少。`);
    }
    return say('还没有目标色。先在「读色」里点<b>记住这个色号</b>，涂完再回来比对。');
  }

  if (!r) return say('先读一个颜色，我才有东西可讲。');

  if (q === 'fit') {
    if (r.kind === 'skin') return say(`你的肤色是 <b>${r.name}</b>。再读一支口红，我就能判断适不适合。`);
    const shade = r.ranked?.[0]?.shade;
    if (!shade) return say('这支还没匹配到色号，换一个位置再读一次。');
    const sp = state.skinProfile;
    if (!sp) return say(`这支是${r.tone.label}的 <b>${shade.zh}</b>。要判断适不适合你，先切到「诊肤色」测一下。`);
    const mine = sp.tone;
    const good = shade.tone === mine || shade.tone === 'neutral' || mine === 'neutral';
    return say(good
      ? `适合。你是${sp.band}的${TONE_LABEL[mine]}，这支 <b>${shade.zh}</b> 是${TONE_LABEL[shade.tone]}，方向一致。`
      : `不太建议。你是${sp.band}的${TONE_LABEL[mine]}，这支 <b>${shade.zh}</b> 偏${shade.tone === 'warm' ? '暖' : '冷'}，容易显脏。`);
  }

  if (q === 'dupe') {
    if (r.kind !== 'object') return say('先读一支口红，我再找替代色。');
    const alt = (r.ranked || []).slice(1, 3);
    if (!alt.length) return say('色卡里没有足够接近的替代色。');
    return say(`有。${alt.map((a) => `<b>${a.shade.zh}</b>（ΔE ${a.dE.toFixed(1)}）`).join('、')}和它几乎是同一个色，买不到时可以直接换。`);
  }

  return say('这个问题我还没学会，试试上面那几个。');
}

/* ================= 播报控制 ================= */
const RATES = [0.8, 1.0, 1.2, 1.4];
let rateIdx = 1;

/** 一级开关：同时控制旋律、提示音与语音 */
function setBroadcast(on) {
  state.broadcast = on;
  setMuted(!on);
  setSpeechEnabled(on);
  els.btnMute.setAttribute('aria-pressed', String(on));
  els.btnMute.textContent = '';
  const dot = document.createElement('span');
  dot.className = 'dot-sm';
  els.btnMute.append(dot, document.createTextNode(on ? '开' : '关'));
  if (!on) stopSpeaking();
}

function cycleRate() {
  rateIdx = (rateIdx + 1) % RATES.length;
  const r = RATES[rateIdx];
  setSpeechRate(r);
  els.btnRate.textContent = `语速 ${r.toFixed(1)}×`;
  if (state.broadcast) {
    primeSpeech();
    speakUI(`语速 ${r.toFixed(1)} 倍。`);
  }
}

els.btnMute.addEventListener('click', () => {
  setBroadcast(!state.broadcast);
  if (state.broadcast) {
    primeSpeech();
    speakUI('播报已开启。');
  }
});
els.btnRate.addEventListener('click', cycleRate);

function setLoupe(on, announce = true) {
  state.loupeOn = on;
  els.btnLoupe.setAttribute('aria-pressed', String(on));
  try { localStorage.setItem('lightup.loupe', on ? '1' : '0'); } catch (_) { /* ignore */ }
  drawLoupe();
  if (announce) speakUI(on ? '放大镜已打开。' : '放大镜已关闭。');
}
els.btnLoupe.addEventListener('click', () => setLoupe(!state.loupeOn));
els.loupeClose.addEventListener('click', () => setLoupe(false));

function toggleUI() {
  state.uiSpeech = !state.uiSpeech;
  setUIEnabled(state.uiSpeech);
  els.btnUI.setAttribute('aria-pressed', String(state.uiSpeech));
  els.btnUI.textContent = state.uiSpeech ? '操作' : '操作·关';
  try { localStorage.setItem('lightup.uiSpeech', state.uiSpeech ? '1' : '0'); } catch (_) { /* ignore */ }
  if (state.uiSpeech) {
    primeSpeech();
    speakUI('操作提示已开启。');
  }
}
els.btnUI.addEventListener('click', toggleUI);

/* ================= 色卡库 ================= */
let libFilter = 'all';
let libSelected = -1;
let libTrigger = null;

/** 是否适合当前测得的肤色；没测过肤色则返回 null（不评价） */
function fitsMe(shade) {
  const sp = state.skinProfile;
  if (!sp) return null;
  return shade.tone === sp.tone || shade.tone === 'neutral' || sp.tone === 'neutral';
}

function renderLibrary() {
  const list = SHADES.map((s, i) => ({ s, i })).filter(({ s }) => {
    if (libFilter === 'all') return true;
    if (libFilter === 'me') return fitsMe(s) === true;
    return s.tone === libFilter;
  });

  if (libFilter === 'me' && !state.skinProfile) {
    els.libCount.textContent = '还没有测过肤色';
    els.libGrid.innerHTML = '<p class="lib-empty">先到「诊肤色」测一次，这里就只列出适合你的色号。</p>';
    return;
  }
  els.libCount.textContent = `${list.length} 支 · 方向键浏览，选中即试听`;
  els.libGrid.innerHTML = list.map(({ s, i }) => {
    const fit = fitsMe(s);
    const fitTxt = fit === true ? ' · <span class="fits">适合你</span>' : '';
    const tabbable = (libSelected >= 0 ? i === libSelected : i === list[0].i);
    return `<button class="lib-card" role="option" data-idx="${i}" tabindex="${tabbable ? 0 : -1}"
        aria-selected="${i === libSelected}"
        aria-label="${s.zh}，${TONE_LABEL[s.tone]}，色值 ${s.hex}${fit === true ? '，适合你的肤色' : ''}">
      <span class="lib-sw" style="background:${s.hex}"></span>
      <span class="lib-name">${s.zh}</span>
      <span class="lib-tone">${TONE_LABEL[s.tone]}${fitTxt}</span>
    </button>`;
  }).join('');
}

/** 方向键在当前网格里找"最接近的那个方向"的卡片，兼容任意列数 */
function moveLibFocus(dir) {
  const cards = [...els.libGrid.querySelectorAll('.lib-card')];
  if (!cards.length) return;
  const cur = cards.indexOf(document.activeElement);
  if (cur < 0) return cards[0].focus();

  const r = cards[cur].getBoundingClientRect();
  const cx = r.left + r.width / 2;
  const cy = r.top + r.height / 2;

  let best = -1;
  let bestScore = Infinity;
  cards.forEach((card, i) => {
    if (i === cur) return;
    const cr = card.getBoundingClientRect();
    const dx = cr.left + cr.width / 2 - cx;
    const dy = cr.top + cr.height / 2 - cy;

    const inDir =
      (dir === 'left' && dx < -4) ||
      (dir === 'right' && dx > 4) ||
      (dir === 'up' && dy < -4) ||
      (dir === 'down' && dy > 4);
    if (!inDir) return;

    const horizontal = dir === 'left' || dir === 'right';
    const primary = horizontal ? Math.abs(dx) : Math.abs(dy);
    const cross = horizontal ? Math.abs(dy) : Math.abs(dx);
    const score = primary + cross * 3;   // 偏轴惩罚：优先正上/正下/正左/正右

    if (score < bestScore) { bestScore = score; best = i; }
  });

  if (best >= 0) {
    cards[best].focus();
    cards[best].scrollIntoView({ block: 'nearest' });
  }
}

function syncLibTabindex() {
  const cards = [...els.libGrid.querySelectorAll('.lib-card')];
  const focused = cards.indexOf(document.activeElement);
  cards.forEach((c, i) => c.setAttribute('tabindex', String(i === focused || (focused < 0 && i === 0) ? 0 : -1)));
}

els.libGrid.addEventListener('keydown', (e) => {
  const dirs = { ArrowLeft: 'left', ArrowRight: 'right', ArrowUp: 'up', ArrowDown: 'down' };
  if (dirs[e.key]) {
    e.preventDefault();
    moveLibFocus(dirs[e.key]);
    return;
  }
  if (e.key === 'Home' || e.key === 'End') {
    const cards = [...els.libGrid.querySelectorAll('.lib-card')];
    if (!cards.length) return;
    e.preventDefault();
    (e.key === 'Home' ? cards[0] : cards[cards.length - 1]).focus();
  }
});

els.libGrid.addEventListener('focusin', syncLibTabindex);

function selectShade(idx, { play = true } = {}) {
  const shade = SHADES[idx];
  if (!shade) return;
  libSelected = idx;

  els.libGrid.querySelectorAll('.lib-card').forEach((card) => {
    card.setAttribute('aria-selected', String(Number(card.dataset.idx) === idx));
  });

  const fit = fitsMe(shade);
  els.libSel.innerHTML =
    `已选 <b>${shade.zh}</b> · ${TONE_LABEL[shade.tone]} · ${shade.hex.toUpperCase()}` +
    (fit === true ? ' · 适合你的肤色' : fit === false ? ' · 与你的肤色不太搭' : '');
  els.libPlay.disabled = false;
  els.libTryon.disabled = false;
  els.libTarget.disabled = false;

  if (play) {
    const [r, g, b] = hexToRgb(shade.hex);
    sonifyColor(rgb2hsv(r, g, b), shade.tone);
    setTimeout(() => {
      speak(`${shade.zh}，${TONE_LABEL[shade.tone]}${fit === true ? '，适合你的肤色' : ''}。`);
    }, 520);
  }
}

function openLibrary() {
  libTrigger = document.activeElement;
  renderLibrary();
  els.lib.hidden = false;
  const first = els.libGrid.querySelector('.lib-card');
  (first || els.libClose).focus();
  speakUI(`色卡库，共 ${SHADES.length} 支。用方向键浏览，选中即试听。`);
}

function closeLibrary() {
  if (els.lib.hidden) return;
  els.lib.hidden = true;
  if (libTrigger) libTrigger.focus();
  libTrigger = null;
}

els.btnLibrary.addEventListener('click', openLibrary);
els.libClose.addEventListener('click', closeLibrary);
els.lib.addEventListener('click', (e) => {
  if (e.target === els.lib) closeLibrary();
  const card = e.target.closest('.lib-card');
  if (card) selectShade(Number(card.dataset.idx));
});

document.querySelectorAll('.lib-filters .src-btn').forEach((btn) => {
  btn.addEventListener('click', () => {
    libFilter = btn.dataset.f;
    document.querySelectorAll('.lib-filters .src-btn').forEach((b) => {
      b.setAttribute('aria-pressed', String(b === btn));
    });
    renderLibrary();
    const n = els.libGrid.querySelectorAll('.lib-card').length;
    speak(`${btn.textContent}，${n} 支。`);
  });
});

els.libPlay.addEventListener('click', () => {
  if (libSelected >= 0) selectShade(libSelected);
});

els.libTryon.addEventListener('click', () => {
  const shade = SHADES[libSelected];
  if (!shade) return;
  closeLibrary();
  setMode('tryon');
  setTryonShade(shade.zh);
  setSubtitle(`正在试 ${shade.zh}`);
});

els.libTarget.addEventListener('click', () => {
  const shade = SHADES[libSelected];
  if (!shade) return;
  state.targetShade = shade;
  setSubtitle(`已把 ${shade.zh} 设为验妆目标`);
  speak(`已把 ${shade.zh} 设为验妆目标。切到查妆容就能比对。`);
  closeLibrary();
});

/* ================= 指标说明（点击卡片弹出） ================= */
const TIPS = {
  de: {
    title: '色差 ΔE',
    text: '衡量两个颜色有多像。数字越小越像：小于 4 基本一模一样，10 以内很接近，超过 20 就能看出差别。',
  },
  hue: {
    title: '色相',
    text: '颜色偏哪个方向：0 度偏红，30 度偏橘，60 度偏黄。数字只是方位，不用记，听播报的色名就行。',
  },
  light: {
    title: '明度',
    text: '颜色的深浅。数字越大越亮、越浅；越小越暗、越深。',
  },
  ita: {
    title: '肤色深浅（ITA°）',
    text: '皮肤深浅的标准值，数字越大肤色越浅。它比"看起来白不白"更稳定，不容易被灯光骗到。',
  },
  tone: {
    title: '冷暖调',
    text: '偏黄叫暖调，偏粉叫冷调，介于中间叫中性调。口红和肤色的冷暖一致时，通常更协调。',
  },
  match: {
    title: '最接近的色号',
    text: `刚测到的颜色，在 ${SHADES.length} 支口红色卡里最像哪一支。仅供参考，不代表品牌官方色号。`,
  },
};

let tipTrigger = null;

function openTip(key, trigger) {
  const tip = TIPS[key];
  if (!tip) return;
  tipTrigger = trigger || null;
  els.tipTitle.textContent = tip.title;
  els.tipText.textContent = tip.text;
  els.tip.hidden = false;
  els.tipClose.focus();
  speak(`${tip.title}。${tip.text}`);
}

/** 弹层内的焦点循环：Tab / Shift+Tab 只在弹层里转，不会跑到背后的页面 */
function trapFocus(container, e) {
  const items = [...container.querySelectorAll('button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])')]
    .filter((el) => el.offsetParent !== null && !el.disabled);
  if (!items.length) return;
  const first = items[0];
  const last = items[items.length - 1];
  if (e.shiftKey && document.activeElement === first) {
    e.preventDefault();
    last.focus();
  } else if (!e.shiftKey && document.activeElement === last) {
    e.preventDefault();
    first.focus();
  }
}

function closeTip() {
  if (els.tip.hidden) return;
  els.tip.hidden = true;
  if (tipTrigger) tipTrigger.focus();
  tipTrigger = null;
}

els.result.addEventListener('click', (e) => {
  const tipBtn = e.target.closest('.metric[data-tip]');
  if (tipBtn) return openTip(tipBtn.dataset.tip, tipBtn);

  const shadeBtn = e.target.closest('[data-shade]');
  if (shadeBtn && state.mode === 'tryon') return setTryonShade(shadeBtn.dataset.shade);

  const recBtn = e.target.closest('[data-rec]');
  if (recBtn) {
    setMode('tryon');
    return setTryonShade(recBtn.dataset.rec);
  }

  if (e.target.closest('[data-more]')) return openLibrary();

  const act = e.target.closest('[data-act]');
  if (act) {
    const shade = state.tryonShade;
    if (!shade) return;
    if (act.dataset.act === 'target') {
      state.targetShade = shade;
      setSubtitle(`已把 ${shade.zh} 设为验妆目标`);
      speak(`已把 ${shade.zh} 设为验妆目标。`);
    } else if (act.dataset.act === 'listen') {
      const [r, g, b] = hexToRgb(shade.hex);
      sonifyColor(rgb2hsv(r, g, b), shade.tone);
      setTimeout(() => speak(`${shade.zh}，${TONE_LABEL[shade.tone]}。`), 520);
    }
  }
});
els.tipClose.addEventListener('click', closeTip);
els.tip.addEventListener('click', (e) => {
  if (e.target === els.tip) closeTip();
});

/* ================= 事件 ================= */
els.read.addEventListener('click', () => { primeSpeech(); readNow(); });

$('modeObject').addEventListener('click', () => setMode('object'));
$('modeSkin').addEventListener('click', () => setMode('skin'));
$('modeCheck').addEventListener('click', () => setMode('check'));
$('modeTryon').addEventListener('click', () => setMode('tryon'));

els.replay.addEventListener('click', () => {
  if (!state.lastResult) return;
  sonifyColor(state.lastResult.hsv, state.lastResult.tone.key);
  setTimeout(() => speak(state.lastResult.sentence), 400);
});

els.remember.addEventListener('click', () => {
  if (!state.lastResult || state.lastResult.kind !== 'object') return;
  const best = state.lastResult.ranked[0].shade;
  state.targetShade = best;
  const msg = `已记住：${best.zh}。1 秒后切到「查妆容」，涂完直接比对。`;
  setSubtitle(msg);
  speak(msg);
  els.remember.textContent = `已记住 ${best.zh}`;
  setTimeout(() => {
    els.remember.textContent = '记住这个色号';
    els.remember.hidden = true;
    setMode('check');
  }, 1100);
});

els.goRead.addEventListener('click', () => {
  setMode('object');
  announceAndShow('请把口红对准画面，点击或按空格读出颜色，然后点「记住这个色号」。');
});

els.help.addEventListener('click', () => {
  const willOpen = els.legend.hidden;
  els.legend.hidden = !willOpen;
  els.help.setAttribute('aria-expanded', String(willOpen));
});

/* 问一问 */
els.qa.addEventListener('click', () => {
  const open = els.qaPanel.hidden;
  els.qaPanel.hidden = !open;
  els.qa.setAttribute('aria-expanded', String(open));
  if (open) {
    primeSpeech();
    speak('你可以问我：这个色适合我吗、有没有替代色、我涂得对不对、怎么读得更准。');
  }
});

document.querySelectorAll('.qa-chip').forEach((btn) => {
  btn.addEventListener('click', () => {
    primeSpeech();
    answerQuestion(btn.dataset.q);
  });
});

els.bigText.addEventListener('click', () => {
  const on = document.body.classList.toggle('big-text');
  els.bigText.setAttribute('aria-pressed', String(on));
  resizeOverlay();
});

els.contrast.addEventListener('click', () => {
  const on = document.body.classList.toggle('high-contrast');
  els.contrast.setAttribute('aria-pressed', String(on));
});

/* 白平衡校准 */
function updateCalibUI() {
  const btn = $('btnCalib');
  const on = !!state.whitePoint;
  btn.textContent = state.calibrating ? '点画面上的白纸…' : on ? '白平衡 · 已开' : '白平衡';
  btn.setAttribute('aria-pressed', String(on || state.calibrating));
  els.calibBanner.hidden = !state.calibrating;

  // 已校准时在按钮后面显示测到的"白"
  if (on) {
    const dot = document.createElement('span');
    dot.className = 'wb-swatch';
    dot.style.background = rgbToHex(state.whitePoint[0], state.whitePoint[1], state.whitePoint[2]);
    btn.appendChild(dot);
  }
}

function clearWhitePoint({ announce = true } = {}) {
  const had = !!state.whitePoint;
  state.whitePoint = null;
  state.calibrating = false;
  try { localStorage.removeItem('lightup.whitePoint'); } catch (_) { /* ignore */ }
  updateCalibUI();
  if (had && announce) announceAndShow('已关闭白平衡校正。');
  return had;
}

function resetWhitePoint() {
  clearWhitePoint({ announce: true });
}

$('btnCalib').addEventListener('click', () => {
  if (state.whitePoint) return resetWhitePoint();
  state.calibrating = !state.calibrating;
  updateCalibUI();
  if (state.calibrating) {
    announceAndShow('请把一张白纸或白墙凑到画面里，点一下它。');
  }
});

/* 画面来源按钮 */
$('chCamera').addEventListener('click', () => useCamera());
$('chUpload').addEventListener('click', () => els.fileInput.click());
$('chExample').addEventListener('click', () => useExample());
els.srcCamera.addEventListener('click', () => useCamera());
els.srcUpload.addEventListener('click', () => els.fileInput.click());
els.srcExample.addEventListener('click', () => useExample());

els.fileInput.addEventListener('change', (e) => {
  const f = e.target.files?.[0];
  if (f) handleFile(f);
  e.target.value = '';
});

/* 拖拽上传 */
['dragenter', 'dragover'].forEach((ev) =>
  els.stage.addEventListener(ev, (e) => {
    e.preventDefault();
    els.stage.classList.add('dragover');
  })
);
['dragleave', 'drop'].forEach((ev) =>
  els.stage.addEventListener(ev, (e) => {
    e.preventDefault();
    if (ev === 'dragleave' && els.stage.contains(e.relatedTarget)) return;
    els.stage.classList.remove('dragover');
  })
);
els.stage.addEventListener('drop', (e) => {
  const f = e.dataTransfer?.files?.[0];
  if (f) handleFile(f);
});

/* 键盘 */
document.addEventListener('keydown', (e) => {
  if (e.target instanceof HTMLInputElement) return;

  // 色卡库优先接管：Esc 关闭，R 重听
  if (e.key === 'Escape' && !els.lib.hidden) {
    e.preventDefault();
    closeLibrary();
    return;
  }
  if (!els.lib.hidden) {
    if (e.key === 'Tab') return trapFocus(els.lib, e);
    if (e.key === 'r' || e.key === 'R') els.libPlay.click();
    return;
  }

  // 说明弹层打开时：Esc 关闭，其余快捷键一律让路
  if (e.key === 'Escape' && !els.tip.hidden) {
    e.preventDefault();
    closeTip();
    return;
  }
  if (!els.tip.hidden) {
    if (e.key === 'Tab') return trapFocus(els.tip, e);
    return;
  }

  // 焦点在指标卡片上时，空格应该"打开说明"，而不是触发读色
  if (e.code === 'Space' && document.activeElement?.closest('.metric')) return;

  if (e.code === 'Space') { e.preventDefault(); primeSpeech(); readNow(); }
  if (e.key === '1') setMode('object');
  if (e.key === '2') setMode('skin');
  if (e.key === '3') setMode('check');
  if (e.key === '4') setMode('tryon');
  if (e.key === 'r' || e.key === 'R') els.replay.click();
  if (e.key === 'b' || e.key === 'B') els.bigText.click();
  if (e.key === 'c' || e.key === 'C') els.contrast.click();
  if (e.key === 'u' || e.key === 'U') els.fileInput.click();
  if (e.key === 'l' || e.key === 'L') els.btnLibrary.click();
  if (e.key === 'm' || e.key === 'M') els.btnMute.click();
  if (e.key === 't' || e.key === 'T') els.btnRate.click();
  if (e.key === 'o' || e.key === 'O') els.btnUI.click();
  if (e.key === 'g' || e.key === 'G') els.btnLoupe.click();
  // 方向键微调取色点
  const nudges = { ArrowLeft: [-1, 0], ArrowRight: [1, 0], ArrowUp: [0, -1], ArrowDown: [0, 1] };
  if (nudges[e.key] && state.source.kind !== 'none') {
    e.preventDefault();
    const k = e.shiftKey ? 10 : 1;
    nudgePick(nudges[e.key][0] * k, nudges[e.key][1] * k);
  }
});

/* ================= 启动 ================= */
/* 供自动化测试使用的调试钩子（不影响正常交互） */
window.__lightup = {
  setPick(x, y) {
    state.pick = { x, y };
    const src = sourceInfo();
    if (src) drawOverlay(state.lastGeometry, src.w, src.h);
    drawLoupe();
  },
  setRadius(r) {
    state.radius = clamp(r, 3, 90);
    const src = sourceInfo();
    if (src) drawOverlay(state.lastGeometry, src.w, src.h);
    drawLoupe();
  },
  read: () => readNow(),
  getState: () => ({
    mode: state.mode,
    pick: { ...state.pick },
    radius: state.radius,
    source: state.source.kind,
    sample: state.lastSample || null,
    geometry: state.lastGeometry,
    skinProfile: state.skinProfile,
    whitePoint: state.whitePoint,
    result: state.lastResult
      ? { name: state.lastResult.name, isShade: state.lastResult.isShade, dE: state.lastResult.dE }
      : null,
  }),
};

async function boot() {
  resizeOverlay();
  setMode('object');
  initVoices();
  try {
    if (localStorage.getItem('lightup.uiSpeech') === '0') {
      state.uiSpeech = false;
      setUIEnabled(false);
      els.btnUI.setAttribute('aria-pressed', 'false');
      els.btnUI.textContent = '操作·关';
    }
  } catch (_) { /* ignore */ }
  try {
    const savedLoupe = localStorage.getItem('lightup.loupe');
    if (savedLoupe === '0') {
      state.loupeOn = false;
      els.btnLoupe.setAttribute('aria-pressed', 'false');
    } else if (savedLoupe === null && window.innerWidth < 620) {
      // 手机上放大镜会挡住画面，默认收起（用户仍可手动打开）
      state.loupeOn = false;
      els.btnLoupe.setAttribute('aria-pressed', 'false');
    }
  } catch (_) { /* ignore */ }
  setBroadcast(true);

  // 恢复上次的白平衡参考
  try {
    const saved = localStorage.getItem('lightup.whitePoint');
    if (saved) {
      const wp = JSON.parse(saved);
      if (Array.isArray(wp) && wp.length === 3 && wp.every(isNum)) state.whitePoint = wp;
    }
  } catch (_) { /* ignore */ }
  updateCalibUI();

  const engineInit = (async () => {
    try {
      const ok = await state.engine.init((msg) => {
        els.pill.textContent = msg;
        setSubtitle(msg);
      });
      if (ok) {
        els.pill.textContent = `视觉引擎就绪 · ${state.engine.delegate}`;
        els.pill.classList.add('ok');
      } else {
        els.pill.textContent = '视觉引擎不可用（仅读色）';
        setSubtitle('人脸模型加载失败，读色功能仍可使用。');
      }
    } catch (err) {
      console.error(err);
      els.pill.textContent = '视觉引擎不可用（仅读色）';
    }
  })();

  if (FORCE_CAMERA) {
    const camOk = await useCamera();
    await engineInit;
    if (!camOk) {
      setSourceUI('none', '');
      els.hint.textContent = '没有摄像头权限，可以上传图片或使用示例照片';
    }
  } else {
    await engineInit;
    const ok = await useExample();      // 默认来源：示例照片
    if (!ok) {
      setSourceUI('none', '');
      els.chooser.hidden = false;
    }
  }

  requestAnimationFrame(loop);
}

boot();
