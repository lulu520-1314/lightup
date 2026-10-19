/**
 * speech.js — 语音播报层
 * ------------------------------------------------------------
 * 设计要点（无障碍产品必须处理的细节）：
 * 1. 播报前先 cancel，避免队列堆积，用户连按时不会「说话说个没完」
 * 2. 长文本按句切分逐句播报，方便用户随时打断
 * 3. 语速可调（低视力用户常需要更慢）
 * 4. 无 speechSynthesis 时静默降级，不影响其他功能
 */

let enabled = true;
let rate = 1.05;
let gender = 'female';          // 'female' | 'male'
let voiceCache = [];

export function setSpeechEnabled(v) {
  enabled = v;
  if (!v) stopSpeaking();
}

export function isSpeechEnabled() {
  return enabled;
}

export function setSpeechRate(v) {
  rate = v;
}

/* ---------- 音色：男声 / 女声 ---------- */
const MALE_HINT = /(kangkang|yunxi|yunyang|yunjian|yunze|yuppy|male|男)/i;
const FEMALE_HINT = /(huihui|xiaoxiao|xiaoyi|yaoyao|xiaomo|female|女)/i;

/** 浏览器语音列表是异步加载的，必须监听 onvoiceschanged */
export function initVoices() {
  if (!('speechSynthesis' in window)) return;
  const load = () => { voiceCache = window.speechSynthesis.getVoices() || []; };
  load();
  window.speechSynthesis.onvoiceschanged = load;
}

export function setVoiceGender(g) {
  gender = g === 'male' ? 'male' : 'female';
}

export function getVoiceGender() {
  return gender;
}

/** 挑一个中文音色；挑不到就靠 pitch 区分（男低女高） */
function pickVoice() {
  if (!voiceCache.length) return null;
  const zh = voiceCache.filter((v) => /^zh|chinese/i.test(`${v.lang} ${v.name}`));
  const pool = zh.length ? zh : voiceCache;
  const want = gender === 'male' ? MALE_HINT : FEMALE_HINT;
  const avoid = gender === 'male' ? FEMALE_HINT : MALE_HINT;
  return pool.find((v) => want.test(v.name))
      || pool.find((v) => !avoid.test(v.name))
      || pool[0]
      || null;
}

export function stopSpeaking() {
  if ('speechSynthesis' in window) window.speechSynthesis.cancel();
}

export function speak(text, { interrupt = true, priority = false } = {}) {
  if (!enabled || !text) return;
  if (!('speechSynthesis' in window)) return;

  if (interrupt) window.speechSynthesis.cancel();

  // 按中文句末标点切分，逐句播报
  const chunks = String(text)
    .split(/(?<=[。！？；\n])/)
    .map((s) => s.trim())
    .filter(Boolean);

  for (const chunk of chunks) {
    const u = new SpeechSynthesisUtterance(chunk);
    u.lang = 'zh-CN';
    u.rate = rate;
    u.pitch = gender === 'male' ? 0.82 : 1.08;
    u.volume = 1.0;
    const v = pickVoice();
    if (v) u.voice = v;
    if (priority) u.volume = 1.0;
    window.speechSynthesis.speak(u);
  }
}

/** 极简播报，适合状态提示，不打断当前长句时传 interrupt:false */
export function announce(text) {
  speak(text, { interrupt: true });
}

// 部分浏览器首次调用需要用户手势，这里挂一个一次性解锁
export function primeSpeech() {
  if (!('speechSynthesis' in window)) return;
  const u = new SpeechSynthesisUtterance(' ');
  u.volume = 0;
  window.speechSynthesis.speak(u);
}
