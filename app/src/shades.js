/**
 * shades.js — 口红色卡库
 * ------------------------------------------------------------
 * 说明：色值为行业常见色系的公开近似采样，用于色差匹配与命名，
 * 不对应任何品牌的官方色号，避免误导。
 *
 * family: red / orange / brown / berry / pink / nude
 * tone:   warm / cool / neutral（决定推荐给哪种肤色底色）
 */
export const SHADES = [
  // —— 红调 ——
  { zh: '正红',       en: 'True Red',     hex: '#C8102E', family: 'red',    tone: 'neutral' },
  { zh: '复古红',     en: 'Retro Red',    hex: '#9B1B30', family: 'red',    tone: 'cool'    },
  { zh: '樱桃红',     en: 'Cherry',       hex: '#9C0F2E', family: 'red',    tone: 'cool'    },
  { zh: '牛血红',     en: 'Oxblood',      hex: '#6E1A24', family: 'red',    tone: 'cool'    },
  { zh: '砖红',       en: 'Brick Red',    hex: '#B33A2B', family: 'red',    tone: 'warm'    },
  { zh: '枫叶红',     en: 'Maple',        hex: '#A63A26', family: 'red',    tone: 'warm'    },
  { zh: '番茄红',     en: 'Tomato',       hex: '#D4402E', family: 'red',    tone: 'warm'    },
  { zh: '水红',       en: 'Watermelon',   hex: '#D25A5A', family: 'red',    tone: 'neutral' },
  { zh: '酒红',       en: 'Wine',         hex: '#7B1E33', family: 'red',    tone: 'cool'    },
  { zh: '勃艮第',     en: 'Burgundy',     hex: '#5C1F2B', family: 'red',    tone: 'cool'    },

  // —— 橘调 ——
  { zh: '珊瑚橘',     en: 'Coral',        hex: '#E2725B', family: 'orange', tone: 'warm'    },
  { zh: '蜜桃色',     en: 'Peach',        hex: '#F19C8B', family: 'orange', tone: 'warm'    },
  { zh: '西柚色',     en: 'Grapefruit',   hex: '#E4635B', family: 'orange', tone: 'warm'    },
  { zh: '南瓜橘',     en: 'Pumpkin',      hex: '#D2691E', family: 'orange', tone: 'warm'    },
  { zh: '脏橘',       en: 'Dirty Orange', hex: '#C4623C', family: 'orange', tone: 'warm'    },
  { zh: '奶油杏',     en: 'Cream Apricot',hex: '#E8B49A', family: 'orange', tone: 'warm'    },
  { zh: '蜜糖',       en: 'Honey',        hex: '#C98A5B', family: 'orange', tone: 'warm'    },

  // —— 棕调 ——
  { zh: '焦糖棕',     en: 'Caramel',      hex: '#9C5B3A', family: 'brown',  tone: 'warm'    },
  { zh: '奶茶棕',     en: 'Milk Tea',     hex: '#B08968', family: 'brown',  tone: 'warm'    },
  { zh: '摩卡',       en: 'Mocha',        hex: '#8A5A3B', family: 'brown',  tone: 'warm'    },
  { zh: '豆沙棕',     en: 'Bean Brown',   hex: '#9E6B5C', family: 'brown',  tone: 'warm'    },
  { zh: '裸色',       en: 'Nude',         hex: '#C49A82', family: 'nude',   tone: 'neutral' },

  // —— 莓果 / 紫调 ——
  { zh: '莓果紫',     en: 'Berry',        hex: '#8E3A59', family: 'berry',  tone: 'cool'    },
  { zh: '梅子色',     en: 'Plum',         hex: '#6E2B3E', family: 'berry',  tone: 'cool'    },
  { zh: '浆果红',     en: 'Berry Red',    hex: '#8B1E3F', family: 'berry',  tone: 'cool'    },
  { zh: '蓝调玫红',   en: 'Blue Rose',    hex: '#B03A5B', family: 'berry',  tone: 'cool'    },
  { zh: '紫罗兰',     en: 'Violet',       hex: '#7D4B8C', family: 'berry',  tone: 'cool'    },
  { zh: '火龙果',     en: 'Dragonfruit',  hex: '#E75480', family: 'berry',  tone: 'cool'    },

  // —— 粉调 ——
  { zh: '豆沙色',     en: 'Bean Paste',   hex: '#A8615C', family: 'pink',   tone: 'warm'    },
  { zh: '玫瑰豆沙',   en: 'Rosewood',     hex: '#B0656A', family: 'pink',   tone: 'neutral' },
  { zh: '干枯玫瑰',   en: 'Dusty Rose',   hex: '#B98A8A', family: 'pink',   tone: 'neutral' },
  { zh: '烟熏玫瑰',   en: 'Smoky Rose',   hex: '#9C6B72', family: 'pink',   tone: 'cool'    },
  { zh: '裸粉',       en: 'Nude Pink',    hex: '#D9A6A0', family: 'pink',   tone: 'neutral' },
  { zh: '玫瑰粉',     en: 'Rose Pink',    hex: '#C9787F', family: 'pink',   tone: 'neutral' },
  { zh: '樱花粉',     en: 'Sakura',       hex: '#E8A9B4', family: 'pink',   tone: 'cool'    },
  { zh: '藕粉',       en: 'Lotus',        hex: '#C9A0A0', family: 'pink',   tone: 'neutral' },
  { zh: '蜜桃粉',     en: 'Peach Pink',   hex: '#F0A79A', family: 'pink',   tone: 'warm'    },
  { zh: '奶茶色',     en: 'Milk Tea Nude',hex: '#B98A73', family: 'nude',   tone: 'warm'    },
];

/** 肤色底色 → 推荐色系 */
export const TONE_ADVICE = {
  warm: {
    pick: ['砖红', '枫叶红', '番茄红', '珊瑚橘', '焦糖棕', '南瓜橘', '蜜桃色'],
    avoid: ['蓝调玫红', '紫罗兰', '火龙果', '樱花粉'],
    reason: '暖皮与黄调同源，橘调、砖调能压住肤色的暗沉，蓝调紫调容易显黄。',
  },
  cool: {
    pick: ['正红', '复古红', '樱桃红', '莓果紫', '浆果红', '玫瑰粉', '牛血红'],
    avoid: ['南瓜橘', '脏橘', '焦糖棕', '蜜糖'],
    reason: '冷皮在红蓝轴上，莓果与玫红会显得肤色更透，橘棕调容易显脏。',
  },
  neutral: {
    pick: ['豆沙色', '玫瑰豆沙', '水红', '裸粉', '正红', '奶茶色', '干枯玫瑰'],
    avoid: [],
    reason: '中性调容错率高，豆沙与裸粉这类低饱和色最稳，冷暖和鲜灰都能吃。',
  },
};

/** ΔE 阈值 → 人话（CIEDE2000 经验值） */
export function matchPhrase(deltaE) {
  if (deltaE < 2.0) return '几乎完全一致';
  if (deltaE < 5.0) return '非常接近';
  if (deltaE < 10.0) return '明显接近';
  if (deltaE < 18.0) return '属于同一色系';
  return '色卡中暂无对应';
}
