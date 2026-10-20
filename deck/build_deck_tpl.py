# -*- coding: utf-8 -*-
"""
build_deck_tpl.py — 按欧莱雅官方模版重排初赛提案

模版规则（读自 template.pptx）：
  · 16:9，白底内容页 + 底部紫色波纹（来自 layout[1]）
  · 标题：思源黑体 CN Bold，44pt，黑色，位于 (0.91", 0.83")
  · 正文：思源黑体 CN Light，14pt
  · 封面 / THANKS 用模版自带版式，只替换文案
"""
import os
import colorsys
from pptx import Presentation
from pptx.util import Inches, Pt
from pptx.dml.color import RGBColor
from pptx.enum.text import PP_ALIGN, MSO_ANCHOR
from pptx.enum.shapes import MSO_SHAPE
from pptx.oxml.ns import qn
from PIL import Image

ROOT = os.path.dirname(os.path.abspath(__file__))
APP = os.path.abspath(os.path.join(ROOT, "..", "app"))
SHOTS = os.path.join(APP, "_dev", "shots")
TPL = os.path.join(ROOT, "template.pptx")
OUT = os.environ.get("DECK_OUT") or os.path.join(ROOT, "LightUp_初赛提案.pptx")
QR = os.path.join(ROOT, "assets", "qr-demo.png")

# ---------- 模版色 ----------
ACCENT = RGBColor(0x7C, 0x1C, 0xA6)      # 深紫
ACCENT2 = RGBColor(0xC4, 0x2D, 0xD6)     # 洋红
INK = RGBColor(0x1F, 0x1F, 0x24)
MUTED = RGBColor(0x6B, 0x6B, 0x76)
TINT = RGBColor(0xF7, 0xF1, 0xFB)
LINE = RGBColor(0xE3, 0xD6, 0xEC)

FONT_B = "思源黑体 CN Bold"
FONT_L = "思源黑体 CN Light"

W, H = 13.333, 7.5
M = 0.91
TITLE_Y = 0.80
BODY_Y = 2.02
BAND_TOP = 6.75


def set_run(run, size, color, bold=False, font=None):
    run.font.size = Pt(size)
    run.font.color.rgb = color
    run.font.bold = bold
    name = font or (FONT_B if bold else FONT_L)
    run.font.name = name
    rPr = run._r.get_or_add_rPr()
    ea = rPr.find(qn("a:ea"))
    if ea is None:
        ea = rPr.makeelement(qn("a:ea"), {})
        rPr.append(ea)
    ea.set("typeface", name)


def set_para(p, text, size, color, bold=False, font=None):
    """整段替换：清掉多余 run，避免模版残留文字（如 “44号”）"""
    runs = list(p.runs)
    if not runs:
        runs = [p.add_run()]
    runs[0].text = text
    set_run(runs[0], size, color, bold, font)
    for r in runs[1:]:
        r._r.getparent().remove(r._r)


def tb(slide, x, y, w, h, text, size=14, color=INK, bold=False,
       align=PP_ALIGN.LEFT, line=1.35, space_after=0, anchor=MSO_ANCHOR.TOP):
    box = slide.shapes.add_textbox(Inches(x), Inches(y), Inches(w), Inches(h))
    tf = box.text_frame
    tf.word_wrap = True
    tf.margin_left = tf.margin_right = tf.margin_top = tf.margin_bottom = 0
    tf.vertical_anchor = anchor
    lines = text if isinstance(text, (list, tuple)) else [text]
    for i, ln in enumerate(lines):
        p = tf.paragraphs[0] if i == 0 else tf.add_paragraph()
        p.alignment = align
        p.line_spacing = line
        p.space_after = Pt(space_after)
        r = p.add_run()
        r.text = ln
        set_run(r, size, color, bold)
    return box


def rect(slide, x, y, w, h, fill=TINT, line=None, round_=True, adj=0.06):
    shape = MSO_SHAPE.ROUNDED_RECTANGLE if round_ else MSO_SHAPE.RECTANGLE
    s = slide.shapes.add_shape(shape, Inches(x), Inches(y), Inches(w), Inches(h))
    s.fill.solid()
    s.fill.fore_color.rgb = fill
    if line:
        s.line.color.rgb = line
        s.line.width = Pt(0.75)
    else:
        s.line.fill.background()
    s.shadow.inherit = False
    el = s._element
    st = el.find(qn("p:style"))
    if st is not None:
        el.remove(st)
    if round_:
        try:
            s.adjustments[0] = adj
        except Exception:
            pass
    return s


def bar(slide, x, y, w, h, color=ACCENT2):
    return rect(slide, x, y, w, h, fill=color, line=None, round_=False)


def pic(slide, path, x, y, w, h, border=True):
    iw, ih = Image.open(path).size
    box_ratio, img_ratio = w / h, iw / ih
    p = slide.shapes.add_picture(path, Inches(x), Inches(y), Inches(w), Inches(h))
    if img_ratio > box_ratio:
        c = (1 - box_ratio / img_ratio) / 2
        p.crop_left = p.crop_right = c
    elif img_ratio < box_ratio:
        c = (1 - img_ratio / box_ratio) / 2
        p.crop_top = p.crop_bottom = c
    if border:
        f = slide.shapes.add_shape(MSO_SHAPE.RECTANGLE, Inches(x), Inches(y), Inches(w), Inches(h))
        f.fill.background()
        f.line.color.rgb = LINE
        f.line.width = Pt(0.75)
        f.shadow.inherit = False
        el = f._element
        st = el.find(qn("p:style"))
        if st is not None:
            el.remove(st)
    return p


def content_page(prs, title, kicker=None):
    """标题按字数自适应，保证永远单行、不压副标题"""
    s = prs.slides.add_slide(prs.slide_layouts[1])
    n = len(title)
    size = 34 if n <= 15 else (30 if n <= 21 else 27)
    tb(s, M, TITLE_Y, 11.45, 0.8, title, size=size, color=INK, bold=True, line=1.05)
    y = TITLE_Y + (0.60 if size >= 30 else 0.54)
    if kicker:
        tb(s, M, y + 0.04, 11.2, 0.4, kicker, size=13, color=MUTED, line=1.3)
        bar(s, M, y + 0.50, 0.9, 0.045, ACCENT2)
    else:
        bar(s, M, y + 0.04, 0.9, 0.045, ACCENT2)
    return s


def page_no(s, n, total):
    tb(s, W - M - 1.0, TITLE_Y + 0.04, 1.0, 0.3, f"{n:02d} / {total:02d}",
       size=10, color=MUTED, align=PP_ALIGN.RIGHT)


# =====================================================================
prs = Presentation(TPL)
TOTAL = 12

# ---------------------------------------------------------------- 01 封面
s1 = prs.slides[0]
for sh in s1.shapes:
    if not sh.has_text_frame:
        continue
    if sh.name == "文本框 3":          # 主标题 + 注明行
        tf = sh.text_frame
        set_para(tf.paragraphs[0], "听见颜色", 44, RGBColor(0xFF, 0xFF, 0xFF), True)
        p2 = tf.paragraphs[1]
        set_para(p2, "LightUp 光引 · 无界体验家（主题二）· 队伍：翰林仕",
                 20, RGBColor(0xFF, 0xFF, 0xFF), False)
        p2.line_spacing = 1.2
    elif sh.name == "矩形 28":         # 模版说明文字 → 一句话定位
        tf = sh.text_frame
        set_para(tf.paragraphs[0],
                 "面向视障人群的无障碍美妆助手：把口红色号翻译成声音与语言。",
                 15, RGBColor(0xFF, 0xFF, 0xFF), False)
        p2 = tf.paragraphs[1]
        set_para(p2, "在线体验：lulu520-1314.github.io/lightup", 13, RGBColor(0xEF, 0xE2, 0xF7), False)

# ---------------------------------------------------------------- 02 背景
s = content_page(prs, "她们买口红时，是在赌一个看不见的答案",
                 "美妆是社交与就业的“隐形门槛”，而这道门槛对视障人群几乎不可跨越。")
cards = [
    ("地域局限", "小镇没有专柜", "试色只能靠网购盲猜，买错就闲置。"),
    ("认知局限", "长辈看不懂成分表", "“烟酰胺”“视黄醇”像天书，不敢用。"),
    ("感官局限", "分不清口红色号", "“正红”和“豆沙”在她们那里是同一个词。"),
]
x = M
for i, (tag, head, body) in enumerate(cards):
    rect(s, x, BODY_Y + 0.1, 3.5, 2.05, TINT, LINE)
    tb(s, x + 0.28, BODY_Y + 0.32, 3.0, 0.3, tag, size=11, color=ACCENT2, bold=True)
    tb(s, x + 0.28, BODY_Y + 0.68, 3.0, 0.4, head, size=18, color=INK, bold=True)
    tb(s, x + 0.28, BODY_Y + 1.18, 2.95, 0.7, body, size=12.5, color=MUTED, line=1.5)
    x += 3.72

tb(s, M, 4.62, 2.2, 0.4, "中国视力残疾人群", size=13, color=MUTED)
tb(s, M, 4.98, 3.2, 0.85, "1700万+", size=44, color=ACCENT, bold=True)
tb(s, M + 3.3, 5.12, 8.0, 0.5, "其中女性约占一半，正是美妆的核心用户。", size=15, color=INK)
tb(s, M, 5.85, 11.4, 0.4, "数据口径：中国残联 / 世界卫生组织公开资料整理；用于说明需求规模，非精确统计。",
   size=10, color=MUTED)
page_no(s, 2, TOTAL)

# ---------------------------------------------------------------- 03 空白
s = content_page(prs, "组件都成熟，场景是空的",
                 "我们检索了开源社区：技术不是瓶颈，缺的是“把它翻译成她们能用的形式”。")
stats = [("0", "视障 × 美妆", "几乎没有开源项目"),
         ("36", "成分识别", "组件成熟，可直接用"),
         ("11", "声音化无障碍", "范式成熟，可直接借")]
x = M
for num, label, desc in stats:
    tb(s, x, BODY_Y + 0.15, 3.4, 0.9, num, size=54, color=ACCENT, bold=True)
    tb(s, x, BODY_Y + 1.15, 3.4, 0.35, label, size=14, color=INK, bold=True)
    tb(s, x, BODY_Y + 1.55, 3.3, 0.4, desc, size=12, color=MUTED)
    x += 3.72
rect(s, M, 4.72, 11.5, 0.012, LINE, None, round_=False)
tb(s, M, 4.95, 11.4, 1.2,
   ["结论：把视觉、色差、声化这些现成能力接起来，只补“美妆语境下的翻译层”，",
    "就能做出别人没做过的东西——门槛在体验设计，不在算力。"],
   size=16, color=INK, line=1.6)
page_no(s, 3, TOTAL)

# ---------------------------------------------------------------- 04 创意
s = content_page(prs, "核心创意：把颜色翻译成一段可记忆的旋律",
                 "现有 AI 都在“描述世界”，视障者需要的却是“能记住、能复述”的判断依据。")
rows = [("色相", "五声音阶 · 两个八度（10 个音位）", "任何颜色都有唯一音高位置"),
        ("冷暖", "大三和弦 / 小三和弦", "听一秒就知道偏橘还是偏莓果"),
        ("明度", "音量 + 八度微调", "深色沉、浅色亮"),
        ("饱和度", "正弦 → 三角 → 锯齿", "越艳，泛音越亮")]
y = BODY_Y + 0.05
for i, (k, v, note) in enumerate(rows):
    if i % 2 == 0:
        rect(s, M, y - 0.1, 11.5, 0.52, TINT, None, round_=False)
    tb(s, M + 0.12, y, 1.1, 0.34, k, size=13, color=ACCENT, bold=True)
    tb(s, M + 1.35, y, 4.6, 0.34, v, size=13, color=INK)
    tb(s, M + 6.2, y, 5.2, 0.34, note, size=12, color=MUTED)
    y += 0.56

notes = ["宫", "商", "角", "徵", "羽", "宫'", "商'", "角'", "徵'", "羽'"]
x = M
for i in range(10):
    r, g, b = colorsys.hsv_to_rgb(i * 36 / 360.0, 0.72, 0.92)
    rect(s, x, 4.95, 1.02, 0.26, RGBColor(int(r*255), int(g*255), int(b*255)), None, round_=False)
    tb(s, x, 5.25, 1.02, 0.24, notes[i], size=9, color=MUTED, align=PP_ALIGN.CENTER)
    x += 1.11
tb(s, M, 5.62, 11.4, 0.4, "360° 色相被切成 10 个音位，每个音位对应一段固定旋律——颜色从此可以被“背下来”。",
   size=12, color=MUTED)
tb(s, M, 6.12, 11.4, 0.4, "不是“把颜色说出来”，而是“让颜色被记住”。", size=15, color=ACCENT, bold=True)
page_no(s, 4, TOTAL)

# ---------------------------------------------------------------- 05 四模块
s = content_page(prs, "四个模块，覆盖“选色 → 试色 → 验妆”",
                 "全部在浏览器本地运行，不需要联网、不需要 GPU。")
caps = [("读色", "点哪读哪", "色号 · 冷暖 · 相近色 · 旋律"),
        ("诊肤色", "两颊 + 额头", "肤色深浅 · 冷暖 · 3 支推荐"),
        ("查妆容", "涂完再测", "与目标色的偏差 · 补涂建议"),
        ("试色", "选一支色号", "直接涂在唇形上，可快速换色")]
cw, gap = 2.72, 0.24
x = M
for i, (name, how, out) in enumerate(caps):
    rect(s, x, BODY_Y + 0.15, cw, 2.5, TINT, LINE)
    tb(s, x + 0.26, BODY_Y + 0.38, cw - 0.4, 0.3, f"0{i+1}", size=10, color=ACCENT2, bold=True)
    tb(s, x + 0.26, BODY_Y + 0.72, cw - 0.4, 0.42, name, size=20, color=INK, bold=True)
    tb(s, x + 0.26, BODY_Y + 1.20, cw - 0.4, 0.3, how, size=11, color=MUTED)
    tb(s, x + 0.26, BODY_Y + 1.62, cw - 0.36, 0.75, out, size=11, color=ACCENT, line=1.5)
    x += cw + gap
tb(s, M, 5.55, 11.4, 0.4, "配套无障碍设计：纯键盘可操作 · 语音与字幕双通道 · 大字 / 高对比 · 焦点不丢。",
   size=12, color=MUTED)
page_no(s, 5, TOTAL)

# ---------------------------------------------------------------- 06 演示
s = content_page(prs, "核心功能演示：它读出了「复古红」", "以下均为真实运行截图，非渲染图。")
pics = [("10-read.png", "读色：偏差 6.4，判定“明显接近”"),
        ("11-check.png", "查妆容：记住目标色后比对偏差"),
        ("82-skin-enriched.png", "诊肤色：深浅 + 冷暖 + 3 支推荐")]
x = M
for name, cap in pics:
    path = os.path.join(SHOTS, name)
    if not os.path.exists(path):
        continue
    pic(s, path, x, BODY_Y, 3.62, 2.55)
    tb(s, x, BODY_Y + 2.66, 3.62, 0.4, cap, size=11, color=MUTED, line=1.3)
    x += 3.82

rect(s, M, 5.42, 11.5, 0.012, LINE, None, round_=False)
tb(s, M, 5.62, 11.4, 0.9,
   ["同一段真实操作：读出「复古红」→ 记住它 → 涂完后自检偏差 6.4。",
    "每一步都有声音与文字双通道，闭眼也能完成。"],
   size=14, color=INK, line=1.55)
page_no(s, 6, TOTAL)

# ---------------------------------------------------------------- 07 技术
s = content_page(prs, "技术实现：一条本地流水线", "模型 3.6 MB，随页面下载，断网可用；画面不出设备。")
steps = [("采集", "摄像头 / 图片"), ("定位", "478 点人脸网格"), ("采样", "唇 / 颊 / 中心"),
         ("色彩科学", "CIELAB · ΔE · ITA°"), ("输出", "声化 + 语音")]
bw, gap = 2.05, 0.32
x = M
for i, (k, v) in enumerate(steps):
    rect(s, x, BODY_Y + 0.15, bw, 1.3, TINT, LINE)
    tb(s, x + 0.2, BODY_Y + 0.34, bw - 0.3, 0.28, f"0{i+1}", size=9, color=ACCENT2, bold=True)
    tb(s, x + 0.2, BODY_Y + 0.62, bw - 0.3, 0.3, k, size=13, color=INK, bold=True)
    tb(s, x + 0.2, BODY_Y + 0.98, bw - 0.25, 0.3, v, size=9.5, color=MUTED)
    if i < len(steps) - 1:
        tb(s, x + bw + 0.02, BODY_Y + 0.62, 0.28, 0.3, "›", size=20, color=ACCENT2)
    x += bw + gap

tags = ["全本地推理", "无画面上传", "无 GPU 依赖", "模型 3.6 MB"]
x = M
for t in tags:
    wdt = 0.5 + len(t) * 0.19
    rect(s, x, 4.62, wdt, 0.42, TINT, ACCENT)
    tb(s, x, 4.70, wdt, 0.28, t, size=11, color=ACCENT, align=PP_ALIGN.CENTER)
    x += wdt + 0.22

tb(s, M, 5.35, 11.4, 1.0,
   ["关键取舍：不训练模型，只做“翻译层”。赛题明确不需要微调 LLM，",
    "真正的门槛在交互设计，不在算力。"],
   size=15, color=INK, line=1.6)
page_no(s, 7, TOTAL)

# ---------------------------------------------------------------- 08 可行性
s = content_page(prs, "可行性：一台普通笔记本就够", "这也是我们能绕开平台依赖、独立完成作品的原因。")
quads = [("离线", "断网可用", "模型与 WASM 全部本地，展会现场无网也能演示"),
         ("零算力成本", "CPU 可跑", "无需 GPU、无需云实例，浏览器即可"),
         ("隐私", "画面不出设备", "本地推理，适合无障碍与个人场景"),
         ("低成本复制", "一个浏览器", "专柜平板、手机、智慧屏都能部署")]
for i, (k, v, d) in enumerate(quads):
    cx = M + (i % 2) * 5.95
    cy = BODY_Y + 0.15 + (i // 2) * 1.85
    tb(s, cx, cy, 5.4, 0.3, k, size=11, color=ACCENT2, bold=True)
    tb(s, cx, cy + 0.32, 5.4, 0.4, v, size=18, color=INK, bold=True)
    tb(s, cx, cy + 0.80, 5.3, 0.5, d, size=12, color=MUTED, line=1.5)
page_no(s, 8, TOTAL)

# ---------------------------------------------------------------- 09 实测
s = content_page(prs, "实测结果：这些数字可以复现", "运行仓库里的自检脚本，即可得到下表。")
rows = [("人脸网格", "478 点", "GPU 委托，浏览器内推理"),
        ("唇色识别", "复古红", "ΔE2000 = 6.4（明显接近）"),
        ("肤色判定", "ITA 66° · 暖调", "三点中位采样"),
        ("取色准确度", "31% → 92%", "模拟偏色 + 高光，13 支色卡"),
        ("模型体积", "3.6 MB", "含 WASM，离线可用"),
        ("控制台错误", "0", "端到端自检通过")]
y = BODY_Y + 0.05
for i, (a, b, c) in enumerate(rows):
    if i % 2 == 0:
        rect(s, M, y - 0.1, 11.5, 0.5, TINT, None, round_=False)
    tb(s, M + 0.15, y, 2.6, 0.3, a, size=12, color=MUTED)
    tb(s, M + 2.9, y, 3.0, 0.3, b, size=12, color=INK, bold=True)
    tb(s, M + 6.1, y, 5.2, 0.3, c, size=11, color=MUTED)
    y += 0.56
page_no(s, 9, TOTAL)

# ---------------------------------------------------------------- 10 场景
s = content_page(prs, "用在哪：三个能被看见的场景", "赛题提到的三类落地形态，我们都做了可演示的最小版本。")
scenes = [("家庭梳妆台", "智能化妆镜", "镜前语音引导上妆，化完自检是否出界；家人不在也能独立完成。"),
          ("商场专柜", "无障碍试色台", "一台平板 + 一盏补光灯，视障顾客自己选色，柜姐只做补充。"),
          ("随身携带", "出行美妆小助手", "手机打开网页即可：色卡库听一遍、出门前查一次妆。")]
y = BODY_Y + 0.15
for i, (a, b, c) in enumerate(scenes):
    tb(s, M, y, 2.6, 0.35, a, size=15, color=ACCENT, bold=True)
    tb(s, M + 2.7, y, 3.0, 0.35, b, size=15, color=INK, bold=True)
    tb(s, M + 5.9, y, 5.7, 0.6, c, size=12, color=MUTED, line=1.5)
    y += 1.15
page_no(s, 10, TOTAL)

# ---------------------------------------------------------------- 11 规划
s = content_page(prs, "未来规划：从可运行原型，到门店里的一台机器", "每一步都有可验证的交付物。")
bar(s, M + 0.15, 3.55, 9.2, 0.02, LINE)
stages = [("初赛 · 已完成", "可运行原型", "四模块 + 色卡库 + 离线问答，代码开源可复现", True),
          ("决赛 · 进行中", "硬件形态与成分解读", "智能镜形态、触觉反馈编码、成分表 OCR", False),
          ("试点 · 6 个月", "1 家门店 · 100 位用户", "与盲协共创测试，形成可用性报告", False)]
for i, (phase, name, detail, done) in enumerate(stages):
    cx = M + 0.15 + i * 4.6
    dot = s.shapes.add_shape(MSO_SHAPE.OVAL, Inches(cx - 0.09), Inches(3.46), Inches(0.18), Inches(0.18))
    dot.fill.solid()
    dot.fill.fore_color.rgb = ACCENT if done else RGBColor(0xFF, 0xFF, 0xFF)
    dot.line.color.rgb = ACCENT
    dot.shadow.inherit = False
    el = dot._element
    st = el.find(qn("p:style"))
    if st is not None:
        el.remove(st)
    tb(s, cx - 0.05, 2.85, 4.2, 0.3, phase, size=10, color=ACCENT2 if done else MUTED, bold=True)
    tb(s, cx - 0.05, 3.85, 4.2, 0.4, name, size=15, color=INK, bold=True)
    tb(s, cx - 0.05, 4.30, 4.1, 0.9, detail, size=11, color=MUTED, line=1.5)
page_no(s, 11, TOTAL)

# ---------------------------------------------------------------- 12 THANKS
s = prs.slides[2]
for sh in s.shapes:
    if sh.has_text_frame and "THANKS" in sh.text_frame.text:
        tf = sh.text_frame
        p = tf.paragraphs[0]
        set_para(p, "让美，不依赖眼睛。", 44, RGBColor(0xFF, 0xFF, 0xFF), True)
        for extra in list(tf.paragraphs)[1:]:
            extra._p.getparent().remove(extra._p)
        p2 = tf.add_paragraph()
        r2 = p2.add_run()
        r2.text = "LightUp 光引 · 在线体验 lulu520-1314.github.io/lightup"
        set_run(r2, 16, RGBColor(0xF2, 0xE6, 0xFA), False)
        p2.alignment = p.alignment
        p2.line_spacing = 1.6

if os.path.exists(QR):
    pic(s, QR, W - M - 1.35, 4.85, 1.1, 1.1)
    tb(s, W - M - 1.55, 6.05, 1.5, 0.3, "扫码在线体验", size=10,
       color=RGBColor(0xF2, 0xE6, 0xFA), align=PP_ALIGN.CENTER)

# 删除模版自带的内容页示例（第 2 页），并把 THANKS 移到最后
xml = prs.slides._sldIdLst
ids = list(xml)          # [封面, 内容页示例, THANKS, ...新增内容页]
thanks_el = ids[2]
example_el = ids[1]
xml.remove(example_el)
xml.remove(thanks_el)
xml.append(thanks_el)     # THANKS 永远在最后

prs.save(OUT)
print("saved:", OUT, "slides:", len(prs.slides))
