# -*- coding: utf-8 -*-
"""
build_deck.py — 生成初赛提案 PPT（黑金极简 · 16:9 · 14 页）

设计约定：
  · 单一金色强调（#C9A227），其余靠灰阶层级
  · 每页只讲一件事；标题一句，正文不超过 4 行
  · 所有截图来自真实运行的 Demo（app/_dev/shots）
"""
import os
from pptx import Presentation
from pptx.util import Inches, Pt
from pptx.dml.color import RGBColor
from pptx.enum.text import PP_ALIGN, MSO_ANCHOR
from pptx.enum.shapes import MSO_SHAPE
from pptx.oxml.ns import qn
from PIL import Image

# ---------- 主题 ----------
BG      = RGBColor(0x08, 0x08, 0x0A)
PANEL   = RGBColor(0x10, 0x10, 0x13)
GOLD    = RGBColor(0xC9, 0xA2, 0x27)
GOLD_B  = RGBColor(0xE8, 0xCF, 0x7A)
TEXT    = RGBColor(0xEC, 0xEC, 0xEE)
DIM     = RGBColor(0x9A, 0x9A, 0xA3)
FAINT   = RGBColor(0x64, 0x64, 0x6D)
LINE    = RGBColor(0x23, 0x23, 0x29)

FONT = "Microsoft YaHei"
W, H = 13.333, 7.5          # 英寸
M = 0.85                     # 页边距

ROOT = os.path.dirname(os.path.abspath(__file__))
APP = os.path.abspath(os.path.join(ROOT, "..", "app"))
SHOTS = os.path.join(APP, "_dev", "shots")
OUT = os.environ.get("DECK_OUT") or os.path.join(ROOT, "LightUp_初赛提案.pptx")


# ---------- 基础工具 ----------
def new_slide(prs):
    s = prs.slides.add_slide(prs.slide_layouts[6])
    s.background.fill.solid()
    s.background.fill.fore_color.rgb = BG
    return s


def set_run(run, size, color, bold=False, spacing=None):
    run.font.size = Pt(size)
    run.font.color.rgb = color
    run.font.bold = bold
    run.font.name = FONT
    rPr = run._r.get_or_add_rPr()
    ea = rPr.find(qn("a:ea"))
    if ea is None:
        ea = rPr.makeelement(qn("a:ea"), {})
        rPr.append(ea)
    ea.set("typeface", FONT)


def text(s, x, y, w, h, content, size=14, color=TEXT, bold=False,
         align=PP_ALIGN.LEFT, anchor=MSO_ANCHOR.TOP, line=1.5, space_after=0):
    tb = s.shapes.add_textbox(Inches(x), Inches(y), Inches(w), Inches(h))
    tf = tb.text_frame
    tf.word_wrap = True
    tf.margin_left = tf.margin_right = tf.margin_top = tf.margin_bottom = 0
    tf.vertical_anchor = anchor
    lines = content if isinstance(content, (list, tuple)) else [content]
    for i, ln in enumerate(lines):
        p = tf.paragraphs[0] if i == 0 else tf.add_paragraph()
        p.alignment = align
        p.line_spacing = line
        p.space_after = Pt(space_after)
        r = p.add_run()
        r.text = ln
        set_run(r, size, color, bold)
    return tb


def rich(s, x, y, w, h, parts, align=PP_ALIGN.LEFT, line=1.5, anchor=MSO_ANCHOR.TOP):
    """parts: [(text, size, color, bold), ...] 同一段落内混排"""
    tb = s.shapes.add_textbox(Inches(x), Inches(y), Inches(w), Inches(h))
    tf = tb.text_frame
    tf.word_wrap = True
    tf.margin_left = tf.margin_right = tf.margin_top = tf.margin_bottom = 0
    tf.vertical_anchor = anchor
    p = tf.paragraphs[0]
    p.alignment = align
    p.line_spacing = line
    for (t, sz, c, b) in parts:
        r = p.add_run()
        r.text = t
        set_run(r, sz, c, b)
    return tb


def _strip_style(sh):
    """移除形状自带的 p:style（它会给形状加上主题阴影，破坏极简风）"""
    el = sh._element
    style = el.find(qn("p:style"))
    if style is not None:
        el.remove(style)


def rule(s, x, y, w, h, color=LINE):
    sh = s.shapes.add_shape(MSO_SHAPE.RECTANGLE, Inches(x), Inches(y), Inches(w), Inches(h))
    sh.fill.solid()
    sh.fill.fore_color.rgb = color
    sh.line.fill.background()
    sh.shadow.inherit = False
    _strip_style(sh)
    return sh


def box(s, x, y, w, h, fill=PANEL, border=None, radius=True):
    shape = MSO_SHAPE.ROUNDED_RECTANGLE if radius else MSO_SHAPE.RECTANGLE
    sh = s.shapes.add_shape(shape, Inches(x), Inches(y), Inches(w), Inches(h))
    sh.fill.solid()
    sh.fill.fore_color.rgb = fill
    if border:
        sh.line.color.rgb = border
        sh.line.width = Pt(0.75)
    else:
        sh.line.fill.background()
    sh.shadow.inherit = False
    _strip_style(sh)
    if radius:
        try:
            sh.adjustments[0] = 0.06
        except Exception:
            pass
    return sh


def picture(s, path, x, y, w, h, border=True):
    """等比裁切填满目标框（object-fit: cover）"""
    iw, ih = Image.open(path).size
    box_ratio = w / h
    img_ratio = iw / ih
    pic = s.shapes.add_picture(path, Inches(x), Inches(y), Inches(w), Inches(h))
    if img_ratio > box_ratio:
        crop = (1 - box_ratio / img_ratio) / 2
        pic.crop_left = crop
        pic.crop_right = crop
    elif img_ratio < box_ratio:
        crop = (1 - img_ratio / box_ratio) / 2
        pic.crop_top = crop
        pic.crop_bottom = crop
    if border:
        fr = s.shapes.add_shape(MSO_SHAPE.RECTANGLE, Inches(x), Inches(y), Inches(w), Inches(h))
        fr.fill.background()
        fr.line.color.rgb = LINE
        fr.line.width = Pt(0.75)
        fr.shadow.inherit = False
    return pic


def page_no(s, n, total=13):
    text(s, M, 0.42, 1.6, 0.3, f"{n:02d}", size=10, color=GOLD)
    text(s, M + 0.42, 0.42, 4.0, 0.3, "LIGHTUP 光引", size=10, color=FAINT)
    text(s, W - M - 1.2, 0.42, 1.2, 0.3, f"/ {total:02d}", size=10, color=FAINT,
         align=PP_ALIGN.RIGHT)


def title(s, main, sub=None, y=1.05):
    text(s, M, y, W - 2 * M, 0.9, main, size=34, color=TEXT, bold=True, line=1.25)
    if sub:
        text(s, M, y + 0.78, W - 2 * M, 0.5, sub, size=13, color=DIM, line=1.6)
    rule(s, M, y + (1.32 if sub else 0.82), 0.9, 0.035, GOLD)


# =====================================================================
prs = Presentation()
prs.slide_width = Inches(W)
prs.slide_height = Inches(H)

# ---------------------------------------------------------------- 01 封面
s = new_slide(prs)
# 右侧声波柱
import math
base_x, base_y, bar_w, gap = 9.55, 2.55, 0.085, 0.135
for i in range(28):
    hgt = 0.28 + 1.65 * abs(math.sin(i * 0.55)) * (0.55 + 0.45 * math.cos(i * 0.22))
    rule(s, base_x + i * (bar_w + gap), base_y + (1.9 - hgt) / 2, bar_w, hgt,
         GOLD if i % 3 == 0 else RGBColor(0x3A, 0x30, 0x14))

text(s, M, 1.15, 7.6, 0.4, "欧莱雅「无界体验家」美妆科技赛 · 赛题 3 · 主题二", size=12, color=GOLD)
text(s, M, 1.75, 8.2, 1.4, "听见颜色", size=76, color=TEXT, bold=True, line=1.05)
text(s, M, 3.35, 8.0, 0.9, "LightUp 光引 —— 面向视障人群的无障碍美妆决策助手", size=19, color=DIM, line=1.6)
rule(s, M, 4.55, 1.6, 0.04, GOLD)
text(s, M, 4.95, 8.0, 0.5, "让美，不依赖眼睛。", size=16, color=GOLD_B, line=1.5)
text(s, M, 6.55, 9.0, 0.4,
     "AI 如何在美妆结合社会与企业责任的领域发挥作用？", size=11, color=FAINT)

# ---------------------------------------------------------------- 02 他们买口红时
s = new_slide(prs)
page_no(s, 2)
title(s, "他们买口红时，是在赌一个看不见的答案",
      "美妆是社交与就业的“隐形门槛”，而这道门槛对视障人群几乎不可跨越。")

quotes = [
    ("“这个红，是哪个红？”", "柜台前，只能请陌生人帮忙描述——而描述永远停在“挺好看的”。"),
    ("“柜姐说显白，我不知道什么叫显白。”", "没有肤色判断的参照系，只能反复买错、反复闲置。"),
    ("“涂完出门，我不知道有没有涂出界。”", "没有人能随时告诉她：嘴唇边缘还差一点点。"),
]
x = M
for i, (q, d) in enumerate(quotes):
    box(s, x, 3.15, 3.55, 2.05, PANEL, LINE)
    text(s, x + 0.32, 3.45, 2.9, 0.4, f"0{i+1}", size=11, color=GOLD)
    text(s, x + 0.32, 3.78, 2.95, 0.5, q, size=14, color=TEXT, bold=True, line=1.45)
    text(s, x + 0.32, 4.42, 2.95, 0.7, d, size=10.5, color=DIM, line=1.55)
    x += 3.72

rich(s, M, 5.62, 11.6, 0.5,
     [("中国视力残疾人群 ", 13, DIM, False), ("1700 万+", 24, GOLD_B, True),
      ("　　其中女性约占一半，正是美妆的核心用户。", 13, DIM, False)], line=1.2)
text(s, M, 6.35, 11.6, 0.4,
     "数据口径：中国残联 / 世界卫生组织公开资料整理；用于说明需求规模，非精确统计。",
     size=9, color=FAINT)

# ---------------------------------------------------------------- 03 空白
s = new_slide(prs)
page_no(s, 3)
title(s, "我们检索了 GitHub：零件都在，场景是空的",
      "这说明问题不在“技术做不到”，而在“没人把它翻译成他们能用的形式”。")

stats = [("0", "visually impaired makeup", "视障 × 美妆：无开源项目"),
         ("36", "cosmetic ingredient ocr", "成分识别：组件成熟"),
         ("11", "sonification accessibility blind", "声化无障碍：范式成熟")]
x = M
for num, kw, desc in stats:
    text(s, x, 3.0, 3.6, 0.9, num, size=54, color=GOLD_B, bold=True, line=1.0)
    text(s, x, 3.95, 3.6, 0.35, kw, size=9.5, color=FAINT)
    text(s, x, 4.35, 3.6, 0.6, desc, size=12, color=TEXT, line=1.5)
    x += 3.72

rule(s, M, 5.35, W - 2 * M, 0.012, LINE)
rich(s, M, 5.6, W - 2 * M, 0.8,
     [("结论：", 14, GOLD, True),
      ("把成熟的视觉、色差、声化组件接起来，只补“美妆语境下的翻译层”，就能做出别人没做过的东西。", 14, TEXT, False)],
     line=1.6)
text(s, M, 6.35, 11.6, 0.4,
     "检索时间 2026-10；关键词为 GitHub 仓库搜索，结果为仓库总数。", size=9, color=FAINT)

# ---------------------------------------------------------------- 04 核心洞察
s = new_slide(prs)
page_no(s, 4)
title(s, "核心洞察：颜色需要一段「可记忆的指纹」",
      "现有 AI 都在“描述世界”，但视障者需要的不是描述，是“能记住、能复述”的判断依据。")

rows = [("色相 h", "五声音阶 · 两个八度（10 个音位）", "任何颜色都有唯一音高位置"),
        ("冷暖调", "大三和弦 / 小三和弦", "听一秒就知道偏橘还是偏莓果"),
        ("明度 v", "音量 + 八度微调", "深色沉、浅色亮"),
        ("饱和度 s", "正弦 → 三角 → 锯齿", "越艳，泛音越亮")]
y = 2.92
for i, (k, v, note) in enumerate(rows):
    if i % 2 == 0:
        rule(s, M, y - 0.1, W - 2 * M, 0.4, RGBColor(0x0D, 0x0D, 0x10))
    text(s, M + 0.1, y, 1.5, 0.35, k, size=12, color=GOLD, bold=True)
    text(s, M + 1.7, y, 4.3, 0.35, v, size=12, color=TEXT)
    text(s, M + 6.2, y, 5.2, 0.35, note, size=11, color=DIM)
    y += 0.60

rule(s, M, 5.28, 1.2, 0.03, GOLD)
# 10 个音位的色相条：把「色相 → 五声音阶」直接画出来
notes = ["宫", "商", "角", "徵", "羽", "宫'", "商'", "角'", "徵'", "羽'"]
import colorsys
x = M
for i in range(10):
    hue = i * 36 / 360.0
    r, g, b = colorsys.hsv_to_rgb(hue, 0.72, 0.92)
    col = RGBColor(int(r * 255), int(g * 255), int(b * 255))
    rule(s, x, 5.5, 0.98, 0.24, col)
    text(s, x, 5.81, 0.98, 0.24, notes[i], size=8.5, color=FAINT, align=PP_ALIGN.CENTER)
    x += 1.07
text(s, M, 6.18, 11.6, 0.35,
     "360° 色相被切成 10 个音位，每个音位对应一段固定旋律——颜色从此可以被“背下来”。",
     size=11, color=DIM)

text(s, M, 6.66, 11.6, 0.45,
     "不是“把颜色说出来”，而是“让颜色被记住”——这是本项目与现有无障碍工具最本质的区别。",
     size=13, color=GOLD_B, line=1.5)

# ---------------------------------------------------------------- 05 三个能力
s = new_slide(prs)
page_no(s, 5)
title(s, "四个模块，从选色到试色都在同一个页面",
      "选色 → 试色 → 验妆，全程不需要第三个人在场。")

caps = [("读色", "举到镜头前", "色号名 · 冷暖调 · 相近色 · 一段旋律"),
        ("诊肤色", "正对镜头", "肤色深浅 · 冷暖 · 3 支推荐色号"),
        ("查妆容", "涂完再测", "与目标色的 ΔE 偏差 · 补涂建议"),
        ("试色", "选一支色号", "直接涂在唇形上，可快速换色")]
cw, cgap = 2.72, 0.24
x = M
for i, (name, act, out) in enumerate(caps):
    box(s, x, 3.0, cw, 2.35, PANEL, LINE)
    text(s, x + 0.26, 3.26, cw - 0.4, 0.4, f"0{i+1}", size=10, color=GOLD)
    text(s, x + 0.26, 3.56, cw - 0.4, 0.45, name, size=20, color=TEXT, bold=True)
    text(s, x + 0.26, 4.06, cw - 0.4, 0.3, act, size=10, color=DIM)
    rule(s, x + 0.26, 4.42, 0.5, 0.03, GOLD)
    text(s, x + 0.26, 4.58, cw - 0.34, 0.6, out, size=10, color=GOLD_B, line=1.55)
    x += cw + cgap

text(s, M, 5.72, 11.6, 0.5,
     "配套无障碍设计：纯键盘可操作 · 语音与字幕双通道 · 大字 / 高对比模式 · 焦点可见 · 结果区 aria-live",
     size=11, color=DIM, line=1.6)
text(s, M, 6.22, 11.6, 0.4,
     "另有：可调取样半径 + 放大镜 · 实时试色 · 离线问答 · 播报/操作提示/语速（全部离线，不依赖任何 API）。",
     size=10.5, color=FAINT)

# ---------------------------------------------------------------- 06 演示①
s = new_slide(prs)
page_no(s, 6)
text(s, M, 0.95, 6.0, 0.4, "演示 ①  读色", size=11, color=GOLD)
text(s, M, 1.3, 7.2, 0.55, "它读出了「复古红」，偏差 6.4", size=26, color=TEXT, bold=True)
picture(s, os.path.join(SHOTS, "10-read.png"), M, 2.05, 8.55, 4.55)
notes = [("478 点人脸网格", "MediaPipe 本地推理，GPU 委托"),
         ("CIEDE2000 色差", "不是 RGB 距离，与人眼感知一致"),
         ("同步声化 + 播报", "先听旋律，再听结论")]
y = 2.2
for k, v in notes:
    rule(s, 9.72, y + 0.06, 0.035, 0.62, GOLD)
    text(s, 9.95, y, 2.6, 0.3, k, size=12, color=TEXT, bold=True)
    text(s, 9.95, y + 0.3, 2.7, 0.4, v, size=9.5, color=DIM, line=1.5)
    y += 1.05
text(s, 9.95, 5.55, 2.7, 0.9, "同一支口红，不同人听，是同一段旋律。", size=10, color=GOLD_B, line=1.6)

# ---------------------------------------------------------------- 07 演示②
s = new_slide(prs)
page_no(s, 7)
text(s, M, 0.95, 8.0, 0.4, "演示 ②  验妆 & 诊肤色", size=11, color=GOLD)
text(s, M, 1.3, 9.5, 0.55, "从“买对色”到“涂对色”，闭环了", size=26, color=TEXT, bold=True)

picture(s, os.path.join(SHOTS, "11-check.png"), M, 2.1, 5.6, 3.15)
text(s, M, 5.42, 5.6, 0.35, "验妆：记住目标色 → 涂完再测", size=11.5, color=TEXT, bold=True)
text(s, M, 5.76, 5.6, 0.6, "偏差小于 4 判为一致，5–10 提示再补一层，超过 20 建议擦掉重涂。",
     size=9.5, color=DIM, line=1.5)

picture(s, os.path.join(SHOTS, "12-skin.png"), 6.85, 2.1, 5.6, 3.15)
text(s, 6.85, 5.42, 5.6, 0.35, "诊肤色：ITA° 把“显白”变成可计算", size=11.5, color=TEXT, bold=True)
text(s, 6.85, 5.76, 5.6, 0.6, "ITA 65°（非常浅）· 暖调 · L* 71 → 推荐砖红、枫叶红，避开蓝紫。",
     size=9.5, color=DIM, line=1.5)

rule(s, M, 6.55, 1.2, 0.035, GOLD)
text(s, M, 6.75, 11.6, 0.4,
     "两句提示都是可以直接播报的中文短句——不是把技术指标丢给用户。", size=11, color=GOLD_B)

# ---------------------------------------------------------------- 08 架构
s = new_slide(prs)
page_no(s, 8)
title(s, "技术架构：一条本地流水线，没有任何一环依赖云",
      "纯前端实现，浏览器即可运行；模型与 WASM 全部本地化，断网可用。")

steps = [("采集", "摄像头 / 照片"), ("几何", "478 点网格"), ("采样", "唇 / 颊 / 中心"),
         ("色彩科学", "CIELAB → ΔE / ITA"), ("输出", "声化 + 语音")]
bw, gap = 1.95, 0.32
x = M
for i, (k, v) in enumerate(steps):
    box(s, x, 3.2, bw, 1.25, PANEL, LINE)
    text(s, x + 0.2, 3.4, bw - 0.3, 0.3, f"0{i+1}", size=9, color=GOLD)
    text(s, x + 0.2, 3.68, bw - 0.3, 0.3, k, size=13, color=TEXT, bold=True)
    text(s, x + 0.2, 4.02, bw - 0.25, 0.3, v, size=9, color=DIM)
    if i < len(steps) - 1:
        text(s, x + bw - 0.02, 3.6, 0.3, 0.4, "›", size=22, color=GOLD, align=PP_ALIGN.CENTER)
    x += bw + gap

labels = ["全本地推理", "无画面上传", "无 GPU 依赖", "模型 3.6 MB"]
x = M
for lb in labels:
    wdt = 0.34 + len(lb) * 0.19
    box(s, x, 5.05, wdt, 0.42, RGBColor(0x14, 0x12, 0x08), GOLD)
    text(s, x, 5.14, wdt, 0.3, lb, size=9.5, color=GOLD_B, align=PP_ALIGN.CENTER)
    x += wdt + 0.24

text(s, M, 5.85, 11.6, 0.9,
     "关键取舍：不训练模型，只做“翻译层”。因为赛题明确说明不需要微调 LLM，"
     "而真正的门槛在交互设计，不在算力。", size=11.5, color=DIM, line=1.6)

# ---------------------------------------------------------------- 09 实测
s = new_slide(prs)
page_no(s, 9)
title(s, "实测结果：这些数字可以一条命令复现",
      "内置示例人像，运行 app/_dev/check.mjs 即得下表。")

rows = [("人脸网格", "478 点", "GPU 委托"),
        ("唇色识别", "复古红", "ΔE2000 = 6.4（明显接近）"),
        ("相近色号", "枫叶红 / 樱桃红", "ΔE 7.2 / 7.4"),
        ("肤色判定", "ITA 65° · 暖调", "L* 71 · b* 10"),
        ("模型体积", "3.6 MB", "含 WASM，离线可用"),
        ("控制台错误", "0", "端到端自检通过")]
y = 2.88
for i, (a, b, c) in enumerate(rows):
    if i % 2 == 0:
        rule(s, M, y - 0.1, W - 2 * M, 0.42, RGBColor(0x0D, 0x0D, 0x10))
    text(s, M + 0.1, y, 2.4, 0.3, a, size=11.5, color=DIM)
    text(s, M + 2.6, y, 3.2, 0.3, b, size=11.5, color=TEXT, bold=True)
    text(s, M + 5.9, y, 5.4, 0.3, c, size=10.5, color=FAINT)
    y += 0.58

rule(s, M, 6.45, 1.2, 0.035, GOLD)
text(s, M, 6.63, 11.6, 0.5,
     "取色准确度（模拟偏色 + 镜面高光，13 支色卡）：色号命中率 31% → 92%，平均色差 6.67 → 3.46",
     size=10.5, color=GOLD_B)

# ---------------------------------------------------------------- 10 可行性
s = new_slide(prs)
page_no(s, 10)
title(s, "可行性：一台普通笔记本就够，不需要采购任何云资源",
      "这也是我们能绕开平台依赖、独立完成作品的根本原因。")

quads = [("离线", "断网可用", "模型与 WASM 全部本地，展会现场无网也能演示"),
         ("零算力成本", "CPU 可跑", "11 fps @ CPU，无需 GPU、无需实例"),
         ("隐私", "画面不出设备", "本地推理，适合无障碍与未成年人场景"),
         ("低成本复制", "一个浏览器", "专柜平板、手机、智慧屏都能直接部署")]
for i, (k, v, d) in enumerate(quads):
    cx = M + (i % 2) * 6.0
    cy = 2.95 + (i // 2) * 1.85
    text(s, cx, cy, 5.6, 0.32, k, size=11, color=GOLD)
    text(s, cx, cy + 0.32, 5.6, 0.4, v, size=17, color=TEXT, bold=True)
    text(s, cx, cy + 0.78, 5.4, 0.45, d, size=10, color=DIM, line=1.5)

# ---------------------------------------------------------------- 11 商业价值
s = new_slide(prs)
page_no(s, 11)
title(s, "对欧莱雅意味着什么：不是公益成本，是新的用户入口",
      "把 1700 万人第一次真正纳入美妆消费，这件事只有品牌方做得到。")

lines4 = [("专柜", "无障碍试色台", "一台平板 + 一盏补光灯，让视障顾客独立完成选色"),
          ("电商", "色号语音详情页", "把“正红/豆沙”变成可听的样本，降低退货率"),
          ("公益", "与盲协共创", "用户共创、开源工具包，形成可传播的品牌资产"),
          ("ESG", "包容性可量化", "首次把“无障碍美妆”写进年度报告的指标")]
for i, (k, v, d) in enumerate(lines4):
    cx = M + (i % 2) * 6.0
    cy = 2.95 + (i // 2) * 1.75
    text(s, cx, cy, 0.9, 0.3, k, size=10, color=GOLD)
    text(s, cx + 0.95, cy - 0.05, 4.8, 0.4, v, size=15, color=TEXT, bold=True)
    text(s, cx + 0.95, cy + 0.42, 4.7, 0.5, d, size=9.5, color=DIM, line=1.5)

rule(s, M, 6.3, 1.2, 0.035, GOLD)
text(s, M, 6.5, 11.6, 0.5, "先做对的事，再做大的生意。", size=12, color=GOLD_B)

# ---------------------------------------------------------------- 12 路线图
s = new_slide(prs)
page_no(s, 12)
title(s, "路线图：从可运行原型，到门店里的一台机器",
      "每一步都有可验证的交付物，不是空泛的规划。")

rule(s, M + 0.2, 4.02, 8.35, 0.02, LINE)
stages = [("初赛 · 已完成", "可运行原型", "三个模式 + 声化引擎 + 无障碍 UI，代码可复现", True),
          ("决赛 · 进行中", "硬件形态与成分解读", "智能镜形态、触觉反馈编码、成分表 OCR", False),
          ("试点 · 6 个月", "1 家门店 · 100 位用户", "与盲协共创测试，形成可用性报告", False)]
for i, (phase, name, detail, done) in enumerate(stages):
    cx = M + 0.2 + i * 4.2
    dot = s.shapes.add_shape(MSO_SHAPE.OVAL, Inches(cx - 0.09), Inches(3.93), Inches(0.18), Inches(0.18))
    dot.fill.solid()
    dot.fill.fore_color.rgb = GOLD if done else BG
    dot.line.color.rgb = GOLD
    dot.line.width = Pt(1.2)
    dot.shadow.inherit = False
    _strip_style(dot)

    text(s, cx - 0.1, 3.35, 3.8, 0.3, phase, size=10, color=GOLD if done else FAINT)
    text(s, cx - 0.1, 4.32, 3.8, 0.4, name, size=16, color=TEXT, bold=True)
    text(s, cx - 0.1, 4.82, 3.7, 0.9, detail, size=9.5, color=DIM, line=1.55)

rule(s, M, 6.02, 1.2, 0.035, GOLD)
text(s, M, 6.22, 11.6, 0.4,
     "初赛已交付：可运行 Demo（含离线部署）· 本提案 · 90 秒演示视频。", size=11, color=GOLD_B)

# ---------------------------------------------------------------- 13 结尾
s = new_slide(prs)
rule(s, M, 2.2, 0.9, 0.04, GOLD)
text(s, M, 2.55, 10.5, 1.2, "让美，不依赖眼睛。", size=56, color=TEXT, bold=True, line=1.2)
text(s, M, 3.95, 9.5, 0.6, "LightUp 光引 · 无障碍美妆决策助手", size=16, color=GOLD_B)
text(s, M, 4.9, 10.0, 1.2,
     ["我们做的不是一款无障碍 App，",
      "而是一套让“颜色”可以被听见、被记住、被复述的翻译标准。"],
     size=12, color=DIM, line=1.7)
text(s, M, 6.6, 10.0, 0.4, "仓库与可运行 Demo 随作品一并提交，欢迎现场体验。", size=10, color=FAINT)

prs.save(OUT)
print("saved:", OUT)
print("slides:", len(prs.slides.__iter__.__self__._sldIdLst))
