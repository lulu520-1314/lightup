/**
 * color.js — 色彩科学计算层
 * ------------------------------------------------------------
 * 为什么不用 RGB 欧氏距离：RGB 距离与人眼感知严重不一致。
 * 这里统一走 sRGB → CIELAB → CIEDE2000，与印刷/美妆行业的色差口径对齐。
 */

/* ---------- 基础转换 ---------- */
export function hexToRgb(hex) {
  const h = hex.replace('#', '');
  return [
    parseInt(h.slice(0, 2), 16),
    parseInt(h.slice(2, 4), 16),
    parseInt(h.slice(4, 6), 16),
  ];
}

export function rgbToHex(r, g, b) {
  const f = (n) => Math.round(Math.max(0, Math.min(255, n))).toString(16).padStart(2, '0');
  return '#' + f(r) + f(g) + f(b);
}

/** sRGB(0-255) → CIELAB，D65 白点 */
export function rgb2lab(r, g, b) {
  const lin = (c) => {
    c /= 255;
    return c > 0.04045 ? Math.pow((c + 0.055) / 1.055, 2.4) : c / 12.92;
  };
  const R = lin(r), G = lin(g), B = lin(b);

  let X = (R * 0.4124564 + G * 0.3575761 + B * 0.1804375) / 0.95047;
  let Y = (R * 0.2126729 + G * 0.7151522 + B * 0.0721750) / 1.0;
  let Z = (R * 0.0193339 + G * 0.1191920 + B * 0.9503041) / 1.08883;

  const f = (t) => (t > 0.008856 ? Math.cbrt(t) : 7.787 * t + 16 / 116);
  X = f(X); Y = f(Y); Z = f(Z);

  return [116 * Y - 16, 500 * (X - Y), 200 * (Y - Z)];
}

export function lab2lch(lab) {
  const [L, a, b] = lab;
  const C = Math.sqrt(a * a + b * b);
  let h = (Math.atan2(b, a) * 180) / Math.PI;
  if (h < 0) h += 360;
  return [L, C, h];
}

/* ---------- CIEDE2000（完整实现，含色相补偿项） ---------- */
export function deltaE2000(lab1, lab2, kL = 1, kC = 1, kH = 1) {
  const [L1, a1, b1] = lab1;
  const [L2, a2, b2] = lab2;

  const C1 = Math.hypot(a1, b1);
  const C2 = Math.hypot(a2, b2);
  const Cbar = (C1 + C2) / 2;
  const G = 0.5 * (1 - Math.sqrt(Math.pow(Cbar, 7) / (Math.pow(Cbar, 7) + Math.pow(25, 7))));

  const a1p = (1 + G) * a1;
  const a2p = (1 + G) * a2;
  const C1p = Math.hypot(a1p, b1);
  const C2p = Math.hypot(a2p, b2);

  const hp = (b, a) => {
    if (b === 0 && a === 0) return 0;
    let h = (Math.atan2(b, a) * 180) / Math.PI;
    return h < 0 ? h + 360 : h;
  };
  const h1p = hp(b1, a1p);
  const h2p = hp(b2, a2p);

  const dLp = L2 - L1;
  const dCp = C2p - C1p;

  let dhp = 0;
  if (C1p * C2p !== 0) {
    dhp = h2p - h1p;
    if (dhp > 180) dhp -= 360;
    else if (dhp < -180) dhp += 360;
  }
  const dHp = 2 * Math.sqrt(C1p * C2p) * Math.sin((dhp * Math.PI) / 360);

  const Lbarp = (L1 + L2) / 2;
  const Cbarp = (C1p + C2p) / 2;

  let hbarp = h1p + h2p;
  if (C1p * C2p !== 0) {
    if (Math.abs(h1p - h2p) > 180) hbarp += h1p + h2p < 360 ? 360 : -360;
    hbarp /= 2;
  }

  const T =
    1 -
    0.17 * Math.cos(((hbarp - 30) * Math.PI) / 180) +
    0.24 * Math.cos((2 * hbarp * Math.PI) / 180) +
    0.32 * Math.cos(((3 * hbarp + 6) * Math.PI) / 180) -
    0.20 * Math.cos(((4 * hbarp - 63) * Math.PI) / 180);

  const dTheta = 30 * Math.exp(-Math.pow((hbarp - 275) / 25, 2));
  const RC = 2 * Math.sqrt(Math.pow(Cbarp, 7) / (Math.pow(Cbarp, 7) + Math.pow(25, 7)));
  const SL = 1 + (0.015 * Math.pow(Lbarp - 50, 2)) / Math.sqrt(20 + Math.pow(Lbarp - 50, 2));
  const SC = 1 + 0.045 * Cbarp;
  const SH = 1 + 0.015 * Cbarp * T;
  const RT = -Math.sin((2 * dTheta * Math.PI) / 180) * RC;

  return Math.sqrt(
    Math.pow(dLp / (kL * SL), 2) +
      Math.pow(dCp / (kC * SC), 2) +
      Math.pow(dHp / (kH * SH), 2) +
      RT * (dCp / (kC * SC)) * (dHp / (kH * SH))
  );
}

/* ---------- 反向转换：Lab → sRGB ---------- */
export function lab2rgb(L, a, b) {
  const fy = (L + 16) / 116;
  const fx = fy + a / 500;
  const fz = fy - b / 200;

  const finv = (t) => (t * t * t > 0.008856 ? t * t * t : (t - 16 / 116) / 7.787);
  const X = 0.95047 * finv(fx);
  const Y = 1.0 * finv(fy);
  const Z = 1.08883 * finv(fz);

  let R = X * 3.2404542 + Y * -1.5371385 + Z * -0.4985314;
  let G = X * -0.9692660 + Y * 1.8760108 + Z * 0.0415560;
  let B = X * 0.0556434 + Y * -0.2040259 + Z * 1.0572252;

  const gam = (c) => (c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055);
  const to255 = (c) => Math.max(0, Math.min(255, Math.round(gam(Math.max(c, 0)) * 255)));
  return [to255(R), to255(G), to255(B)];
}

const lin = (c) => {
  c /= 255;
  return c > 0.04045 ? Math.pow((c + 0.055) / 1.055, 2.4) : c / 12.92;
};
const unlin = (c) =>
  255 * (c <= 0.0031308 ? 12.92 * c : 1.055 * Math.pow(c, 1 / 2.4) - 0.055);

/* ---------- 白平衡：von Kries 对角校正 ---------- */
/**
 * 把「被照成什么颜色」换算回「本来是什么颜色」。
 * @param {number[]} rgb       要校正的像素
 * @param {number[]} whiteRef  现场测到的"白"（白纸/白墙）
 * @param {number} strength    0=不校正，1=完全校正；默认 0.85，避免把画面拉灰
 * 原理：在**线性光**空间里按通道做除法，而不是在 gamma 空间硬减。
 */
export function applyWhiteBalance(rgb, whiteRef, strength = 0.85) {
  if (!whiteRef) return rgb.slice();
  const wl = whiteRef.map(lin);
  const scale = wl.map((w) => Math.pow(1 / Math.max(w, 0.015), strength));
  return rgb.map((c, i) => Math.max(0, Math.min(255, Math.round(unlin(lin(c) * scale[i])))));
}

/* ---------- 稳健取色：去掉高光与死黑，再在 Lab 里取中位 ---------- */
function medianNum(arr) {
  const s = [...arr].sort((x, y) => x - y);
  return s[Math.floor(s.length / 2)];
}

/**
 * 为什么不在 sRGB 里求平均：
 *   sRGB 是 gamma 编码的，直接平均会被高光和白点带偏；
 *   而且高光（镜面反射）几乎不携带物体本色，必须剔除。
 *
 * @param {Array<[number,number,number]>} pixels
 * @param {number[]|null} whiteRef
 * @param {{chromaTop?:number}} opts
 *   chromaTop — 只保留彩度最高的这一比例像素（用于唇部：膏体本色是高彩度那一簇，
 *   阴影与唇缝会把中位数拉灰，实测该图唇部中位彩度仅 12.9，而高彩度簇达 35）
 * @returns {{lab:number[], rgb:number[], kept:number, total:number}|null}
 */
export function robustColor(pixels, whiteRef = null, opts = {}) {
  const { chromaTop = 0 } = opts;
  if (!pixels || !pixels.length) return null;

  const kept = [];
  for (const px of pixels) {
    const rgb = whiteRef ? applyWhiteBalance(px, whiteRef) : px;
    const lab = rgb2lab(rgb[0], rgb[1], rgb[2]);
    const C = Math.hypot(lab[1], lab[2]);
    // 只剔除镜面高光：很亮且几乎无彩，几乎不携带物体本色。
    // 注意：不能剔除"很暗"的像素——黑色物体（瞳孔、黑管）会被整体误删，
    // 剩下的亮边把中位数抬高，黑就变成了棕。中位数本身已经抗噪。
    if (lab[0] > 93 && C < 14) continue;
    kept.push({ lab, C });
  }
  let pool = kept.length >= 8 ? kept : pixels.map((p) => {
    const rgb = whiteRef ? applyWhiteBalance(p, whiteRef) : p;
    const lab = rgb2lab(rgb[0], rgb[1], rgb[2]);
    return { lab, C: Math.hypot(lab[1], lab[2]) };
  });
  if (pool.length < 3) return null;

  if (chromaTop > 0 && pool.length >= 12) {
    const sorted = [...pool].sort((a, b) => a.C - b.C);
    const hi = sorted.slice(Math.floor(sorted.length * (1 - chromaTop)));
    if (hi.length >= 8) pool = hi;
  }

  const lab = [
    medianNum(pool.map((x) => x.lab[0])),
    medianNum(pool.map((x) => x.lab[1])),
    medianNum(pool.map((x) => x.lab[2])),
  ];
  return { lab, rgb: lab2rgb(lab[0], lab[1], lab[2]), kept: kept.length, total: pixels.length };
}

/** 多次读数做时间平滑：对 Lab 逐通道取中位，避免帧间跳动 */
export function smoothLabs(history) {
  if (!history.length) return null;
  const n = history[0].length;
  return Array.from({ length: n }, (_, i) => medianNum(history.map((l) => l[i])));
}

/* ---------- HSV ---------- */
export function rgb2hsv(r, g, b) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;
  let h = 0;
  if (d !== 0) {
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h *= 60;
    if (h < 0) h += 360;
  }
  return { h, s: max === 0 ? 0 : d / max, v: max };
}

/* ---------- 皮肤光型：ITA° ---------- */
/**
 * Individual Typology Angle，皮肤科客观分型指标：
 *   ITA° = arctan((L* − 50) / b*) × 180/π
 * 数值越大肤色越浅。比“平均亮度”稳健得多，因为 b*（黄度）参与归一化。
 */
export function itaAngle(lab) {
  const [, , bStar] = lab;
  const denom = Math.abs(bStar) < 0.5 ? 0.5 * Math.sign(bStar || 1) : bStar;
  return (Math.atan((lab[0] - 50) / denom) * 180) / Math.PI;
}

export function itaBand(ita) {
  if (ita > 55) return { label: '非常浅', level: 1 };
  if (ita > 41) return { label: '浅', level: 2 };
  if (ita > 28) return { label: '中等', level: 3 };
  if (ita > 10) return { label: '小麦', level: 4 };
  if (ita > -30) return { label: '深', level: 5 };
  return { label: '非常深', level: 6 };
}

/**
 * 冷暖调判定
 * ------------------------------------------------------------
 * 不能只看色相角：几乎所有红色都落在色相 0–40°，用色相会把砖红也判成冷调。
 * 行业里区分「蓝调红 / 橘调红」看的是**黄度相对于红度的比例**（即 b* 与 a* 的比值）：
 *   比值高 → 黄调主导 → 暖
 *   比值低甚至为负 → 蓝调主导 → 冷
 * 阈值来自对全量色卡的实测标定：
 *   暖调组比值 0.55–2.25（均值 1.11），冷调组 −0.85–0.43（均值 0.14），
 *   因此取 0.60 / 0.40 作为分界，中间留出中性带。
 * 这是启发式判断，不是医学结论，界面上必须注明。
 */
export function undertoneOf(lab) {
  const [L, a, b] = lab;
  const [, C, h] = lab2lch(lab);
  const ratio = b / Math.max(Math.abs(a), 4);

  if (C < 6) return { key: 'neutral', label: '中性调', hue: h, ratio };
  if (ratio >= 0.60) return { key: 'warm', label: '暖调', hue: h, ratio };
  if (ratio >= 0.40) return { key: 'neutral', label: '中性调', hue: h, ratio };
  return { key: 'cool', label: '冷调', hue: h, ratio };
}

/* ---------- 通用色名（用于非口红物体） ---------- */
/**
 * 口红卡只有红粉色系，拿它去命名"眼睛、衣服、杯子"必然荒谬。
 * 这里给出一套独立的通用命名：先判明度/饱和，再判色相，最后补棕、米等实物词。
 */
function hueWord(h) {
  const bands = [
    [0, '红'], [12, '朱红'], [22, '橘'], [32, '橙'], [45, '橘黄'],
    [62, '黄'], [85, '黄绿'], [140, '绿'], [170, '青绿'], [196, '青'],
    [210, '蓝'], [255, '蓝紫'], [285, '紫'], [320, '玫红'], [345, '红'],
  ];
  for (let i = bands.length - 1; i >= 0; i--) {
    if (h >= bands[i][0]) return bands[i][1];
  }
  return '红';
}

export function genericColorName(h, s, v) {
  if (v < 0.09) return '黑色';
  if (s < 0.09) {
    if (v > 0.92) return '白色';
    if (v > 0.72) return '浅灰';
    if (v > 0.45) return '中灰';
    if (v > 0.22) return '深灰';
    return '近黑';
  }
  if (s < 0.22) {
    // 低饱和：灰调 + 色相（灰蓝、灰绿……）
    const tone = v > 0.66 ? '浅' : v < 0.30 ? '深' : '';
    return `灰${tone}${hueWord(h)}`;
  }
  // 暖而暗 = 棕 / 褐
  if (h >= 8 && h <= 52 && v < 0.58 && s < 0.80) return v < 0.28 ? '深棕' : '棕色';
  // 暖而亮、低饱和 = 米 / 卡其
  if (h >= 20 && h <= 60 && v >= 0.58 && s < 0.42) return v > 0.85 ? '米白' : '米色';
  if (v < 0.26 && s > 0.45) return '深' + hueWord(h);
  const pre = v < 0.40 ? '深' : (v > 0.86 && s < 0.55 ? '浅' : '');
  return pre + hueWord(h);
}
