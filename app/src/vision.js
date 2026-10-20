/**
 * vision.js — 人脸几何层
 * ------------------------------------------------------------
 * 基于 Google MediaPipe Tasks Vision 的 FaceLandmarker（478 点网格，含虹膜）。
 * 关键点索引采用 MediaPipe 官方拓扑（唇、眼、脸廓的固定编号）。
 * 肤色判据使用 ITA°（见 color.js），避免"平均亮度"在过曝/欠曝时失真。
 *
 * 全部在浏览器本地推理（WASM，CPU 可跑），画面不出设备——这是无障碍产品的隐私底线。
 */

import { FilesetResolver, FaceLandmarker } from '../vendor/vision_bundle.mjs';

/** 外唇轮廓（闭合成多边形） */
export const LIP_OUTER = [
  61, 185, 40, 39, 37, 0, 267, 269, 270, 409, 291,
  375, 321, 405, 314, 17, 84, 181, 91, 146,
];

/** 内唇轮廓（用于判断「唇缝」位置，避免把牙齿算进去） */
export const LIP_INNER = [
  78, 191, 80, 81, 82, 13, 312, 311, 310, 415, 308,
  324, 318, 402, 317, 14, 87, 178, 88, 95,
];

/** 脸部轮廓（用于估算脸宽、排除背景） */
export const FACE_OVAL = [
  10, 338, 297, 332, 284, 251, 389, 356, 454, 323, 361, 288,
  397, 365, 379, 378, 400, 377, 152, 148, 176, 149, 150, 136,
  172, 58, 132, 93, 234, 127, 162, 21, 54, 103, 67, 109,
];

const P = {
  noseTip: 1,
  leftEdge: 234,   // 画面左侧（被摄者右脸）
  rightEdge: 454,  // 画面右侧
  chin: 152,
  forehead: 10,
};

export class FaceEngine {
  constructor() {
    this.landmarker = null;
    this.ready = false;
    this.delegate = null;
    this.mode = null;
    this.lastError = null;
  }

  async init(onProgress = () => {}) {
    onProgress('正在加载本地人脸模型…');
    const fileset = await FilesetResolver.forVisionTasks('./vendor');

    // 先试 GPU，再退 CPU——低端设备/远程桌面常常没有 WebGL
    for (const delegate of ['GPU', 'CPU']) {
      try {
        this.landmarker = await FaceLandmarker.createFromOptions(fileset, {
          baseOptions: {
            modelAssetPath: './vendor/face_landmarker.task',
            delegate,
          },
          runningMode: 'VIDEO',
          numFaces: 1,
          minFaceDetectionConfidence: 0.5,
          minFacePresenceConfidence: 0.5,
          minTrackingConfidence: 0.5,
        });
        this.delegate = delegate;
        break;
      } catch (err) {
        this.lastError = err;
        this.landmarker = null;
      }
    }

    if (!this.landmarker) {
      this.ready = false;
      return false;
    }
    this.ready = true;
    this.mode = 'VIDEO';
    onProgress(`人脸模型就绪（${this.delegate}）`);
    return true;
  }

  /**
   * 切到静态图模式（用于「示例照片」演示，不占用摄像头）
   * MediaPipe 的 runningMode 不可在 VIDEO/IMAGE 间混用，必须显式切换。
   */
  async setImageMode() {
    if (!this.landmarker) return false;
    if (this.mode === 'IMAGE') return true;
    try {
      await this.landmarker.setOptions({ runningMode: 'IMAGE' });
      this.mode = 'IMAGE';
      return true;
    } catch (err) {
      this.lastError = err;
      return false;
    }
  }

  /** 从静态图切回视频流 */
  async setVideoMode() {
    if (!this.landmarker) return false;
    if (this.mode === 'VIDEO') return true;
    try {
      await this.landmarker.setOptions({ runningMode: 'VIDEO' });
      this.mode = 'VIDEO';
      return true;
    } catch (err) {
      this.lastError = err;
      return false;
    }
  }

  /** @param {HTMLImageElement|HTMLCanvasElement} source */
  detectImage(source) {
    if (!this.ready || !this.landmarker) return null;
    try {
      const res = this.landmarker.detect(source);
      if (!res || !res.faceLandmarks || !res.faceLandmarks.length) return null;
      return { landmarks: res.faceLandmarks[0] };
    } catch (err) {
      this.lastError = err;
      return null;
    }
  }

  /**
   * @param {HTMLVideoElement} video
   * @param {number} timestampMs 必须单调递增
   * @returns {{landmarks:Array<{x:number,y:number}>}|null}
   */
  detect(video, timestampMs) {
    if (!this.ready || !this.landmarker || video.videoWidth === 0) return null;
    try {
      const res = this.landmarker.detectForVideo(video, timestampMs);
      if (!res || !res.faceLandmarks || res.faceLandmarks.length === 0) return null;
      return { landmarks: res.faceLandmarks[0] };
    } catch (err) {
      this.lastError = err;
      return null;
    }
  }
}

/* ---------- 几何工具 ---------- */

export function toPixels(landmarks, w, h) {
  return landmarks.map((p) => ({ x: p.x * w, y: p.y * h }));
}

export function pick(pointsPx, indices) {
  return indices.map((i) => pointsPx[i]).filter(Boolean);
}

export function centroid(points) {
  const n = points.length || 1;
  const sx = points.reduce((a, p) => a + p.x, 0);
  const sy = points.reduce((a, p) => a + p.y, 0);
  return { x: sx / n, y: sy / n };
}

/** 多边形向质心收缩，避开唇线边缘的抗锯齿与阴影 */
export function shrinkPolygon(points, factor = 0.78) {
  const c = centroid(points);
  return points.map((p) => ({
    x: c.x + (p.x - c.x) * factor,
    y: c.y + (p.y - c.y) * factor,
  }));
}

export function dist(a, b) {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/**
 * 计算采样区域（全部基于关键点，不靠固定比例，因此不受画面裁剪影响）
 * @returns {{lipOuter:Array,lipInner:Array,cheeks:Array<{x,y,r}>,faceWidth:number,faceBox:{x,y,w,h}}}
 */
export function buildGeometry(landmarksPx) {
  const lipOuter = pick(landmarksPx, LIP_OUTER);
  const lipInner = pick(landmarksPx, LIP_INNER);
  const oval = pick(landmarksPx, FACE_OVAL);

  const nose = landmarksPx[P.noseTip];
  const lEdge = landmarksPx[P.leftEdge];
  const rEdge = landmarksPx[P.rightEdge];
  const faceWidth = dist(lEdge, rEdge);

  // 脸颊采样点：鼻尖 → 脸缘 连线上 0.66 处，再下移一点，
  // 避开鼻翼高光与颧骨反光（这两处最容易被误当成肤色主体）
  const lerp = (a, b, t) => ({ x: a.x + (b.x - a.x) * t, y: a.y + (b.y - a.y) * t });
  const cheekY = 0.10 * faceWidth;
  const leftCheek = lerp(nose, lEdge, 0.66);
  const rightCheek = lerp(nose, rEdge, 0.66);

  const xs = oval.map((p) => p.x);
  const ys = oval.map((p) => p.y);
  const faceBox = {
    x: Math.min(...xs),
    y: Math.min(...ys),
    w: Math.max(...xs) - Math.min(...xs),
    h: Math.max(...ys) - Math.min(...ys),
  };

  // 第三个点取额头（发际线下方、眉心上方）：脸颊被头发遮挡时的兜底
  const forehead = lerp(landmarksPx[P.forehead], nose, 0.42);
  const r = 0.045 * faceWidth;

  const skinPoints = [
    { x: leftCheek.x, y: leftCheek.y + cheekY, r, part: 'left' },
    { x: rightCheek.x, y: rightCheek.y + cheekY, r, part: 'right' },
    { x: forehead.x, y: forehead.y, r: 0.04 * faceWidth, part: 'forehead' },
  ];

  return {
    lipOuter,
    lipInner,
    skinPoints,
    cheeks: skinPoints,      // 兼容旧命名
    faceWidth,
    faceBox,
  };
}
