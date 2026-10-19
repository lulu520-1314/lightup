/**
 * _dev/eval-color.mjs — 取色准确度的量化评估
 * ------------------------------------------------------------
 * 做法：拿色卡里已知的 sRGB 真值，模拟真实拍摄条件——
 *   1) 暖色光源偏色（相机白平衡没对准时就是这样）
 *   2) 镜面高光（膏体/唇釉表面一定会有）
 *   3) 横向明暗渐变（离光源远近不同）
 * 然后比较两套流程对"真值"的还原误差：
 *   A. 旧流程：sRGB 直接取中位数 → Lab → 最近色号
 *   B. 新流程：剔除高光/死黑 → 白平衡校正 → Lab 中位数 → 最近色号
 *
 * 输出：平均 ΔE、ΔE<5 的比例、色号命中率。
 */
import { rgb2lab, deltaE2000, robustColor, hexToRgb, genericColorName } from '../src/color.js';
import { SHADES } from '../src/shades.js';

const clamp255 = (v) => Math.max(0, Math.min(255, Math.round(v)));

/** 模拟一次"拍摄"：返回像素数组 */
function capture(hex, cast, { highlight = true, gradient = true } = {}) {
  const [r, g, b] = hexToRgb(hex);
  const N = 36;
  const px = [];
  for (let y = 0; y < N; y++) {
    for (let x = 0; x < N; x++) {
      const t = gradient ? 0.84 + 0.28 * (x / N) : 1;
      let rr = r * t, gg = g * t, bb = b * t;

      if (highlight) {
        const dx = x / N - 0.32, dy = y / N - 0.30;
        const d = Math.hypot(dx, dy);
        if (d < 0.17) {
          const k = Math.pow(1 - d / 0.17, 2) * 0.8;
          rr = rr * (1 - k) + 255 * k;
          gg = gg * (1 - k) + 255 * k;
          bb = bb * (1 - k) + 255 * k;
        }
      }
      px.push([clamp255(rr * cast[0]), clamp255(gg * cast[1]), clamp255(bb * cast[2])]);
    }
  }
  return px;
}

const median = (arr) => {
  const s = [...arr].sort((a, b) => a - b);
  return s[Math.floor(s.length / 2)];
};

/** A. 旧流程 */
function legacyLab(px) {
  const r = median(px.map((p) => p[0]));
  const g = median(px.map((p) => p[1]));
  const b = median(px.map((p) => p[2]));
  return rgb2lab(r, g, b);
}

/** B. 新流程 */
function improvedLab(px, whiteRef) {
  const res = robustColor(px, whiteRef);
  return res ? res.lab : null;
}

function nearest(lab) {
  let best = null, bestD = Infinity;
  for (const s of SHADES) {
    const [r, g, b] = hexToRgb(s.hex);
    const d = deltaE2000(lab, rgb2lab(r, g, b));
    if (d < bestD) { bestD = d; best = s; }
  }
  return { shade: best, dE: bestD };
}

/* ---------- 实验 ---------- */
const CAST = [1.10, 1.0, 0.82];        // 偏暖的室内光
const TRUE_WHITE = [255, 255, 255];
const whitePatch = capture('#FFFFFF', CAST, { highlight: false, gradient: false });
const whiteRef = [0, 1, 2].map((i) => median(whitePatch.map((p) => p[i])));

const samples = SHADES.filter((_, i) => i % 3 === 0);   // 取 1/3 作为测试集（14 支）

const rows = [];
for (const s of samples) {
  const truth = hexToRgb(s.hex);
  const truthLab = rgb2lab(truth[0], truth[1], truth[2]);
  const px = capture(s.hex, CAST);

  const lA = legacyLab(px);
  const lB = improvedLab(px, whiteRef);

  const hitA = nearest(lA);
  const hitB = nearest(lB);

  rows.push({
    name: s.zh,
    rawDE: deltaE2000(truthLab, lA),
    newDE: deltaE2000(truthLab, lB),
    oldName: hitA.shade.zh,
    newName: hitB.shade.zh,
    oldHit: hitA.shade.zh === s.zh,
    newHit: hitB.shade.zh === s.zh,
    oldShadeDE: hitA.dE,
    newShadeDE: hitB.dE,
  });
}

const avg = (arr) => arr.reduce((a, b) => a + b, 0) / arr.length;
const pct = (arr, f) => (arr.filter(f).length / arr.length) * 100;

console.log('测试集:', rows.length, '支色卡 | 模拟光源偏色:', CAST.join(','), '| 白参考:', whiteRef.join(','));
console.log('');
console.log('色号        | 旧:还原ΔE 新:还原ΔE | 旧判定      新判定      ');
console.log('------------|---------------------|---------------------------');
for (const r of rows) {
  console.log(
    r.name.padEnd(8, '　') + ' | ' +
    r.rawDE.toFixed(1).padStart(7) + '   ' + r.newDE.toFixed(1).padStart(7) + '   | ' +
    (r.oldName + (r.oldHit ? '✓' : '✗')).padEnd(10, '　') + ' ' +
    (r.newName + (r.newHit ? '✓' : '✗'))
  );
}
console.log('');
console.log('—— 汇总 ——');
console.log('平均还原 ΔE    : 旧 ' + avg(rows.map((r) => r.rawDE)).toFixed(2) +
            '  →  新 ' + avg(rows.map((r) => r.newDE)).toFixed(2));
console.log('ΔE<5 的比例    : 旧 ' + pct(rows, (r) => r.rawDE < 5).toFixed(0) + '%' +
            '  →  新 ' + pct(rows, (r) => r.newDE < 5).toFixed(0) + '%');
console.log('色号命中率     : 旧 ' + pct(rows, (r) => r.oldHit).toFixed(0) + '%' +
            '  →  新 ' + pct(rows, (r) => r.newHit).toFixed(0) + '%');
console.log('最近色号平均ΔE : 旧 ' + avg(rows.map((r) => r.oldShadeDE)).toFixed(2) +
            '  →  新 ' + avg(rows.map((r) => r.newShadeDE)).toFixed(2));

/* ---------- 通用命名自检（非口红物体不能被叫成"某某红"） ---------- */
console.log('');
console.log('—— 通用色名自检 ——');
const namingCases = [
  [0, 0.0, 0.05, '黑色', '瞳孔'],
  [0, 0.0, 0.30, '深灰', '深灰'],
  [0, 0.02, 0.55, '中灰', '中灰'],
  [0, 0.0, 0.95, '白色', '白纸'],
  [30, 0.55, 0.35, '棕色', '木桌'],
  [38, 0.30, 0.92, '米白', '米白墙'],
  [210, 0.72, 0.50, '蓝', '天空'],
  [120, 0.60, 0.45, '绿', '树叶'],
  [190, 0.12, 0.62, '灰青', '灰青'],
];
let namingOk = 0;
for (const [h, s, v, expect, label] of namingCases) {
  const got = genericColorName(h, s, v);
  const ok = got === expect || got.includes(expect);
  if (ok) namingOk++;
  console.log(`${label.padEnd(6, '　')} 期望 ${expect.padEnd(4, '　')} 实得 ${got} ${ok ? '✓' : '✗'}`);
}
console.log(`命名自检：${namingOk}/${namingCases.length} 通过`);
