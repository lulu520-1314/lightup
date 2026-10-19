/**
 * audio.js — 声化引擎（本项目的核心原创设计）
 * ------------------------------------------------------------
 * 目标不是「把颜色变成噪音」，而是让每支口红拥有一段**可记忆、可复述**的短旋律。
 *
 * 映射规则：
 *   色相 h  → 五声音阶（宫商角徵羽）的两个八度，共 10 个槽位
 *   明度 v  → 音量 + 八度微调（越亮越靠上）
 *   饱和度 s → 音色（正弦 → 三角 → 锯齿，越饱和泛音越亮）
 *   冷暖    → 三和弦性质（暖 = 大三和弦，冷 = 小三和弦，中性 = 挂四和弦）
 *
 * 为什么是五声音阶：任意两音同时或先后出现都不会刺耳（无半音冲突），
 * 这对「长时间佩戴助听/耳机的视障用户」非常关键。
 */

const PENTATONIC = [0, 2, 4, 7, 9]; // 宫 商 角 徵 羽（C 大调五声）
const C4 = 261.63;

let ctx = null;
let muted = false;

/** 总开关：关掉后旋律与提示音都不再发出（语音由 speech.js 单独控制） */
export function setMuted(v) {
  muted = !!v;
}
export function isMuted() {
  return muted;
}

export function getAudioContext() {
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
  }
  if (ctx.state === 'suspended') ctx.resume();
  return ctx;
}

/** 单音，带 ADSR 包络，避免爆音 */
function playNote(ac, freq, when, duration, peak, type) {
  const osc = ac.createOscillator();
  const gain = ac.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, when);

  const attack = 0.012;
  const release = duration * 0.85;
  gain.gain.setValueAtTime(0.0001, when);
  gain.gain.linearRampToValueAtTime(peak, when + attack);
  gain.gain.exponentialRampToValueAtTime(0.0001, when + attack + release);

  osc.connect(gain).connect(ac.destination);
  osc.start(when);
  osc.stop(when + duration + 0.05);
}

/**
 * 颜色 → 旋律
 * @param {{h:number,s:number,v:number}} hsv
 * @param {'warm'|'cool'|'neutral'} tone
 */
export function sonifyColor({ h, s, v }, tone = 'neutral') {
  if (muted) return;
  const ac = getAudioContext();
  if (!ac) return;

  const now = ac.currentTime + 0.02;

  // 色相 → 槽位（0..9）
  const slot = Math.min(9, Math.floor((h / 360) * 10));
  const octave = Math.floor(slot / 5);
  const degree = slot % 5;

  // 明度参与八度选择：很亮的颜色整体升高一个八度
  const brightShift = v > 0.82 ? 1 : 0;
  const baseFreq = C4 * Math.pow(2, octave + brightShift + PENTATONIC[degree] / 12);

  // 和弦性质由冷暖决定
  const third = tone === 'cool' ? 3 : tone === 'warm' ? 4 : 5; // 小三 / 大三 / 挂四
  const chord = [0, third, 7];

  // 音色由饱和度决定
  const timbre = s > 0.75 ? 'sawtooth' : s > 0.45 ? 'triangle' : 'sine';
  const peak = 0.10 + v * 0.09;

  chord.forEach((semitone, i) => {
    const f = baseFreq * Math.pow(2, semitone / 12);
    playNote(ac, f, now + i * 0.12, 0.42, peak * (i === 0 ? 1 : 0.72), timbre);
  });
}

/** 界面音效（earcon）——无障碍产品的标准做法，用声音替代视觉反馈 */
export function earcon(kind) {
  if (muted) return;
  const ac = getAudioContext();
  if (!ac) return;
  const now = ac.currentTime + 0.01;

  switch (kind) {
    case 'ready': // 上扬两音：准备好了
      playNote(ac, C4 * 1.5, now, 0.12, 0.07, 'sine');
      playNote(ac, C4 * 2.0, now + 0.1, 0.16, 0.07, 'sine');
      break;
    case 'detect': // 单音短促：已锁定
      playNote(ac, C4 * 2.25, now, 0.08, 0.05, 'sine');
      break;
    case 'error': // 下行两音：失败
      playNote(ac, C4 * 1.2, now, 0.14, 0.08, 'triangle');
      playNote(ac, C4 * 0.9, now + 0.13, 0.2, 0.08, 'triangle');
      break;
    case 'done': // 三音上行：完成
      [1.0, 1.25, 1.5].forEach((m, i) =>
        playNote(ac, C4 * m, now + i * 0.09, 0.22, 0.07, 'sine')
      );
      break;
  }
}
