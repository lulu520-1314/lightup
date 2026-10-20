# -*- coding: utf-8 -*-
"""
build_deck_v2.py — 初赛提案（赛事官方模版版）

模版规则：16:9；封面/THANKS 用模版原版式；内容页白底 + 底部紫波纹（layout[1]）
标题 思源黑体 CN Bold（按字数自适应 34/30/27pt）；正文 思源黑体 CN Light
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
OUT = os.environ.get("DECK_OUT") or os.path.join(ROOT, "LightUp_初赛提案_官方模版.pptx")
QR = os.path.join(ROOT, "assets", "qr-demo.png")

PAGE_URL = "https://lulu520-1314.github.io/lightup/"
REPO_URL = "https://github.com/lulu520-1314/lightup"

ACCENT = RGBColor(0x7C, 0x1C, 0xA6)
ACCENT2 = RGBColor(0xC4, 0x2D, 0xD6)
INK = RGBColor(0x1F, 0x1F, 0x24)
SUB = RGBColor(0x3A, 0x3A, 0x42)
MUTED = RGBColor(0x6B, 0x6B, 0x76)
TINT = RGBColor(0xF7, 0xF1, 0xFB)
LINE = RGBColor(0xE3, 0xD6, 0xEC)

FONT_B = "思源黑体 CN Bold"
FONT_L = "思源黑体 CN Light"

W = 13.333
M = 0.91
TITLE_Y = 0.78
BODY_Y = 2.02
TOTAL = 17


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
    """整段替换，清掉模版残留 run（例如“44号”）"""
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


def page_no(s, n):
    tb(s, W - M - 1.0, TITLE_Y + 0.04, 1.0, 0.3, f"{n:02d} / {TOTAL:02d}",
       size=10, color=MUTED, align=PP_ALIGN.RIGHT)


def bullets(s, x, y, w, items, gap=0.82, head_size=12.5, body_size=10.5):
    for i, (head, desc) in enumerate(items):
        yy = y + i * gap
        tb(s, x, yy, w, 0.3, head, size=head_size, color=INK, bold=True)
        tb(s, x, yy + 0.29, w, 0.44, desc, size=body_size, color=MUTED, line=1.4)


def module_page(prs, n, idx, name, tagline, shot, items, big, big_label, footer):
    s = content_page(prs, f"{idx}  {name}", tagline)
    pic(s, os.path.join(SHOTS, shot), M, BODY_Y + 0.08, 5.95, 3.30)
    tb(s, M, BODY_Y + 3.46, 5.95, 0.3, "真实运行截图", size=9.5, color=MUTED)

    rx = M + 6.35
    rw = 5.05
    bullets(s, rx, BODY_Y + 0.08, rw, items, gap=0.76)

    rect(s, rx, BODY_Y + 3.20, rw, 0.60, TINT, LINE)
    tb(s, rx + 0.20, BODY_Y + 3.30, 1.75, 0.40, big, size=16, color=ACCENT, bold=True)
    tb(s, rx + 1.95, BODY_Y + 3.38, rw - 2.1, 0.34, big_label, size=10, color=MUTED)

    tb(s, M, 5.92, 11.4, 0.55, footer, size=10.5, color=MUTED, line=1.35)
    page_no(s, n)
    return s


# =====================================================================
prs = Presentation(TPL)

# ---------------------------------------------------------------- 01 封面
s1 = prs.slides[0]
for sh in s1.shapes:
    if not sh.has_text_frame:
        continue
    if sh.name == "文本框 3":
        tf = sh.text_frame
        set_para(tf.paragraphs[0], "听见颜色", 44, RGBColor(0xFF, 0xFF, 0xFF), True)
        p2 = tf.paragraphs[1]
        set_para(p2, "LightUp 光引 · 无界体验家（主题二）· 队伍：翰林仕",
                 20, RGBColor(0xFF, 0xFF, 0xFF), False)
        p2.line_spacing = 1.2
    elif sh.name == "矩形 28":
        tf = sh.text_frame
        set_para(tf.paragraphs[0],
                 "面向视障人群的无障碍美妆助手：把口红色号翻译成声音与语言。",
                 15, RGBColor(0xFF, 0xFF, 0xFF), False)
        p2 = tf.paragraphs[1]
        set_para(p2, f"在线体验 {PAGE_URL}", 12, RGBColor(0xEF, 0xE2, 0xF7), False)

# ---------------------------------------------------------------- 02 背景
s = content_page(prs, "她们买口红时，是在赌一个看不见的答案",
                 "美妆是社交与就业的“隐形门槛”，而这道门槛对视障人群几乎不可跨越。")
cards = [("地域局限", "小镇没有专柜", "试色只能靠网购盲猜，买错就闲置。"),
         ("认知局限", "长辈看不懂成分表", "“烟酰胺”“视黄醇”像天书，不敢用。"),
         ("感官局限", "分不清口红色号", "“正红”和“豆沙”在她们那里是同一个词。")]
x = M
for tag, head, body in cards:
    rect(s, x, BODY_Y + 0.05, 3.5, 1.90, TINT, LINE)
    tb(s, x + 0.28, BODY_Y + 0.24, 3.0, 0.3, tag, size=11, color=ACCENT2, bold=True)
    tb(s, x + 0.28, BODY_Y + 0.58, 3.0, 0.4, head, size=17, color=INK, bold=True)
    tb(s, x + 0.28, BODY_Y + 1.04, 2.95, 0.7, body, size=12, color=MUTED, line=1.45)
    x += 3.72

tb(s, M, 4.36, 2.2, 0.35, "中国视力残疾人群", size=12.5, color=MUTED)
tb(s, M, 4.68, 3.2, 0.85, "1700万+", size=42, color=ACCENT, bold=True)
tb(s, M + 3.10, 4.84, 8.3, 0.6, "其中女性约占一半，正是美妆的核心用户；她们的需求长期被当作“不需要”。",
   size=14, color=SUB)
tb(s, M, 5.58, 11.4, 0.3, "数据口径：中国残联 / 世界卫生组织公开资料整理，用于说明需求规模，非精确统计。",
   size=9.5, color=MUTED)
page_no(s, 2)

# ---------------------------------------------------------------- 03 场景洞察
s = content_page(prs, "买前、买时、买后，每一步都在失效",
                 "把一次购买拆开看：现有的数字化服务，每一步都只服务“看得见的人”。")
stages = [("买前", "不知道买哪支", "色号靠描述，图片靠想象；问客服也只能得到“很显白”。",
           "需要的不是参数，而是“这支和那支差在哪”"),
          ("买时", "涂上不知道对不对", "没有镜子可以判断，只能凭手感，常常涂出界。",
           "需要的是一次可复核的自检：偏了多少"),
          ("买后", "换个光线就说不准", "同一支口红在不同光线下看起来完全不同。",
           "需要的是与“颜色本身”比，而不是与画面比")]
y = BODY_Y + 0.02
for i, (phase, pain, detail, need) in enumerate(stages):
    filled = (i == 1)
    rect(s, M, y, 1.22, 0.46, ACCENT if filled else TINT, None)
    tb(s, M, y + 0.11, 1.22, 0.28, phase, size=12,
       color=RGBColor(0xFF, 0xFF, 0xFF) if filled else ACCENT, bold=True, align=PP_ALIGN.CENTER)
    tb(s, M + 1.50, y - 0.02, 3.6, 0.32, pain, size=14, color=INK, bold=True)
    tb(s, M + 1.50, y + 0.34, 4.7, 0.6, detail, size=11, color=MUTED, line=1.4)
    tb(s, M + 6.55, y + 0.06, 4.8, 0.55, need, size=11.5, color=ACCENT, line=1.4)
    y += 1.38
page_no(s, 3)

# ---------------------------------------------------------------- 04 空白
s = content_page(prs, "组件都成熟，场景是空的",
                 "我们检索了开源社区：技术不是瓶颈，缺的是“把它翻译成她们能用的形式”。")
stats = [("0", "视障 × 美妆", "几乎没有开源项目"), ("36", "成分识别", "组件成熟，可直接用"),
         ("11", "声音化无障碍", "范式成熟，可直接借")]
x = M
for num, label, desc in stats:
    tb(s, x, BODY_Y + 0.08, 3.4, 0.9, num, size=52, color=ACCENT, bold=True)
    tb(s, x, BODY_Y + 1.02, 3.4, 0.35, label, size=14, color=INK, bold=True)
    tb(s, x, BODY_Y + 1.38, 3.3, 0.4, desc, size=11.5, color=MUTED)
    x += 3.72
rect(s, M, 4.52, 11.5, 0.012, LINE, None, round_=False)
tb(s, M, 4.75, 11.4, 1.3,
   ["结论：把视觉、色差、声化这些现成能力接起来，只补“美妆语境下的翻译层”，",
    "就能做出别人没做过的东西——门槛在体验设计，不在算力。"], size=15, color=SUB, line=1.55)
page_no(s, 4)

# ---------------------------------------------------------------- 05 创意
s = content_page(prs, "核心创意：把颜色翻译成一段可记忆的旋律",
                 "现有 AI 都在“描述世界”，视障者需要的却是“能记住、能复述”的判断依据。")
rows = [("色相", "五声音阶 · 两个八度（10 个音位）", "任何颜色都有唯一音高位置"),
        ("冷暖", "大三和弦 / 小三和弦", "听一秒就知道偏橘还是偏莓果"),
        ("明度", "音量 + 八度微调", "深色沉、浅色亮"),
        ("饱和度", "正弦 → 三角 → 锯齿", "越艳，泛音越亮")]
y = BODY_Y + 0.02
for i, (k, v, note) in enumerate(rows):
    if i % 2 == 0:
        rect(s, M, y - 0.08, 11.5, 0.50, TINT, None, round_=False)
    tb(s, M + 0.12, y, 1.1, 0.32, k, size=12.5, color=ACCENT, bold=True)
    tb(s, M + 1.35, y, 4.6, 0.32, v, size=12.5, color=INK)
    tb(s, M + 6.2, y, 5.2, 0.32, note, size=11.5, color=MUTED)
    y += 0.54

notes = ["宫", "商", "角", "徵", "羽", "宫′", "商′", "角′", "徵′", "羽′"]
x = M
for i in range(10):
    r, g, b = colorsys.hsv_to_rgb(i * 36 / 360.0, 0.72, 0.92)
    rect(s, x, 4.70, 1.02, 0.24, RGBColor(int(r*255), int(g*255), int(b*255)), None, round_=False)
    tb(s, x, 4.98, 1.02, 0.24, notes[i], size=9, color=MUTED, align=PP_ALIGN.CENTER)
    x += 1.11
tb(s, M, 5.34, 11.4, 0.4,
   "360° 色相被切成 10 个音位，每个音位对应一段固定旋律——颜色从此可以被“背下来”。",
   size=11.5, color=MUTED)
tb(s, M, 5.82, 11.4, 0.5, "不是“把颜色说出来”，而是“让颜色被记住”。", size=17, color=ACCENT, bold=True)
page_no(s, 5)

# ---------------------------------------------------------------- 06 链路
s = content_page(prs, "一条完整链路：从“不知道买哪支”到“涂完确认没出界”",
                 "四个模块不是四个孤立功能，而是一次购买的前、中、后三段。")
flow = [("选色", "读色 + 诊肤色", "读到这支是什么色，也读到自己的肤色适合什么"),
        ("试色", "试色", "在唇形上直接看效果，一秒换一支"),
        ("验妆", "查妆容", "涂完再测一次，与刚才记住的目标色比"),
        ("复述", "语音 + 旋律", "每一步都能“听”到结论，也能再听一次")]
x = M
for i, (name, mod, desc) in enumerate(flow):
    rect(s, x, BODY_Y + 0.22, 2.55, 2.30, TINT, LINE)
    tb(s, x + 0.24, BODY_Y + 0.42, 2.2, 0.26, f"0{i+1}", size=10, color=ACCENT2, bold=True)
    tb(s, x + 0.24, BODY_Y + 0.72, 2.2, 0.4, name, size=19, color=INK, bold=True)
    tb(s, x + 0.24, BODY_Y + 1.18, 2.15, 0.3, mod, size=10.5, color=ACCENT)
    tb(s, x + 0.24, BODY_Y + 1.52, 2.1, 0.72, desc, size=10, color=MUTED, line=1.4)
    if i < 3:
        tb(s, x + 2.58, BODY_Y + 1.14, 0.36, 0.4, "›", size=24, color=ACCENT2)
    x += 2.95
tb(s, M, 5.10, 11.4, 0.9,
   ["每个模块都能单独使用，串起来才是一条“闭着眼也能完成”的动线。",
    "接下来四页，逐个展示它们真实运行的样子。"], size=14, color=SUB, line=1.6)
page_no(s, 6)

# ---------------------------------------------------------------- 07 读色
module_page(prs, 7, "01", "读色：点哪读哪",
            "把口红对准圆框，或点击画面任意位置，立刻得到色号与判断。",
            "10-read.png",
            [("任意位置取样", "点击画面即可；圆框随点移动，3–90 px 可调"),
             ("放大镜微调", "右下角实时显示取样区域，方向键可逐像素挪动"),
             ("三层结果", "色号 + 冷暖 + ΔE 偏差 + 最接近的 3 支色号"),
             ("双通道输出", "旋律 + 语音播报，可只听不看，也能再听一次")],
            "ΔE 6.4", "判定“明显接近”，对应色卡 复古红",
            "对应无障碍：整个过程不需要看见屏幕；点击位置可由他人协助一次，之后可重复。")

# ---------------------------------------------------------------- 08 诊肤色
module_page(prs, 8, "02", "诊肤色：先知道“我是谁”",
            "两颊 + 额头三点取样，避开头发与阴影，输出肤色与适配色。",
            "82-skin-enriched.png",
            [("三点中位取样", "左颊 / 右颊 / 额头各取一次，取中位数抵抗发丝遮挡"),
             ("两个核心指标", "ITA° 深浅分级 + 冷暖倾向（暖 / 中性 / 冷）"),
             ("推荐而非限定", "按肤色给 3 支“更稳妥”的色号，仍可自由选择"),
             ("直接接力", "选中推荐色可一键进入试色，不用再读一次")],
            "ITA 66°", "非常浅 · 暖调，推荐 3 支",
            "肤色判断比“白/黄/黑”细一档：ITA° 能区分“偏白”和“偏黄”，推荐才不至于拍脑袋。")

# ---------------------------------------------------------------- 09 查妆容
module_page(prs, 9, "03", "查妆容：涂完自己验一遍",
            "先记住目标色，涂完再测一次，比的是颜色本身，不是你当下的画面。",
            "11-check.png",
            [("记住这个色号", "读色后一键存入目标色，后续比对都以它为准"),
             ("再测一次", "对着镜头露出嘴唇，重新取唇部颜色"),
             ("偏差分级", "几乎一致 / 明显接近 / 有差别 / 偏差较大"),
             ("给下一步", "偏差大就提示补涂方向，而不是只报一个数字")],
            "ΔE 6.4", "与目标色“明显接近”，建议补涂一次",
            "这是“社会与企业责任”最实在的一环：它让一次失败的化妆可以被自己发现并修正。")

# ---------------------------------------------------------------- 10 试色
module_page(prs, 10, "04", "试色：先看见，再决定",
            "选一支色号，直接涂在唇形上看效果，不满意一秒换一支。",
            "80-tryon.png",
            [("38 支色卡库", "方向键网格浏览，点一下就试；可按冷暖 / 深浅筛选"),
             ("真实质感", "只替换唇部的色相与饱和度，保留唇纹与高光"),
             ("快速对比", "连续换色，比“想象这支涂上去什么样”靠谱得多"),
             ("可复述", "试色同时播报色号与冷暖，视障用户同样能选")],
            "38 支", "覆盖正红 / 豆沙 / 砖红 / 裸粉等常用色系",
            "试色不依赖购买：先在家里看清效果，能显著降低“买错闲置”的浪费。")

# ---------------------------------------------------------------- 11 界面一览
s = content_page(prs, "界面一览：能用的不止四个模块",
                 "这些页面都在同一个应用里，README 与仓库中都有对应截图。")
shots = [("ui-library.png", "色卡库：38 支，可按冷暖筛选、逐支试听"),
         ("ui-tip.png", "指标解释：点任意数字，弹出通俗说明"),
         ("ui-qa.png", "问一问：离线回答“这个色适合我吗”"),
         ("ui-calib.png", "白平衡：对着白纸点一下，纠正偏色"),
         ("ui-loupe.png", "放大镜：取样区域实时放大，可逐像素微调"),
         ("ui-default.png", "默认界面：示例照片开箱即读")]
gw, gh, gapx, gapy = 3.72, 1.86, 0.16, 0.30
for i, (name, cap) in enumerate(shots):
    cx = M + (i % 3) * (gw + gapx)
    cy = BODY_Y + 0.02 + (i // 3) * (gh + gapy + 0.30)
    path = os.path.join(ROOT, "assets", name)
    if not os.path.exists(path):
        continue
    pic(s, path, cx, cy, gw, gh)
    tb(s, cx, cy + gh + 0.08, gw, 0.28, cap, size=9.5, color=MUTED, line=1.3)
page_no(s, 11)

# ---------------------------------------------------------------- 11 技术流水线
s = content_page(prs, "技术方案：一条跑在浏览器里的本地流水线",
                 "模型 3.6 MB，随页面下载；首屏不等它，切到人脸功能时才加载。")
steps = [("采集", "摄像头 / 图片"), ("定位", "478 点人脸网格"), ("采样", "唇 / 颊 / 中心"),
         ("色彩科学", "CIELAB · ΔE · ITA°"), ("输出", "声化 + 语音")]
bw, gap = 2.05, 0.32
x = M
for i, (k, v) in enumerate(steps):
    rect(s, x, BODY_Y + 0.12, bw, 1.22, TINT, LINE)
    tb(s, x + 0.2, BODY_Y + 0.28, bw - 0.3, 0.26, f"0{i+1}", size=9, color=ACCENT2, bold=True)
    tb(s, x + 0.2, BODY_Y + 0.54, bw - 0.3, 0.3, k, size=13, color=INK, bold=True)
    tb(s, x + 0.2, BODY_Y + 0.90, bw - 0.25, 0.3, v, size=9.5, color=MUTED)
    if i < len(steps) - 1:
        tb(s, x + bw + 0.02, BODY_Y + 0.54, 0.28, 0.3, "›", size=20, color=ACCENT2)
    x += bw + gap

tags = ["全本地推理", "无画面外传", "无需 GPU", "断网可用", "首屏 55 KB"]
x = M
for t in tags:
    wdt = 0.46 + len(t) * 0.19
    rect(s, x, 4.48, wdt, 0.40, TINT, ACCENT)
    tb(s, x, 4.56, wdt, 0.26, t, size=10.5, color=ACCENT, align=PP_ALIGN.CENTER)
    x += wdt + 0.18

tb(s, M, 5.08, 11.4, 0.9,
   ["关键取舍：不训练模型，只做“翻译层”。赛题也明确不需要微调大模型，",
    "真正的门槛在交互设计，而不在算力。"], size=14, color=SUB, line=1.55)
tb(s, M, 5.95, 11.4, 0.3, f"源码与运行说明：{REPO_URL}", size=9.5, color=MUTED)
page_no(s, 12)

# ---------------------------------------------------------------- 12 色彩科学
s = content_page(prs, "技术方案：让“偏一点”和“差很多”分得开",
                 "同一个颜色在不同光线下会变，所以不能直接比 RGB。")
items = [("① 换到 Lab 比", "sRGB → CIELAB，用 CIEDE2000 算色差：ΔE<2 几乎看不出，>10 一眼不同。"),
         ("② 用 ITA° 判深浅", "ITA° = atan((L*−50) / b*)，比“白/黄/黑”细，能区分偏白与偏黄。"),
         ("③ 先做白平衡", "线性光下按 von Kries 校正，抵消冷光暖光，避免同一支口红读出两个色号。"),
         ("④ 取样要稳", "剔除高光、多像素取中位、唇部按彩度加权——头发与牙齿不干扰。")]
y = BODY_Y + 0.02
for i, (h, d) in enumerate(items):
    if i % 2 == 0:
        rect(s, M, y - 0.10, 11.5, 0.84, TINT, None, round_=False)
    tb(s, M + 0.15, y, 2.9, 0.3, h, size=12.5, color=ACCENT, bold=True)
    tb(s, M + 3.2, y, 8.2, 0.62, d, size=11.5, color=SUB, line=1.45)
    y += 0.92
tb(s, M, 5.90, 11.4, 0.4, "结果：同一支口红，在偏冷 / 偏暖 / 偏暗的三种光线下，判定保持一致。",
   size=13, color=INK, bold=True)
page_no(s, 13)

# ---------------------------------------------------------------- 13 实测
s = content_page(prs, "实测：这些数字可以复现",
                 "仓库里的自检脚本跑一遍即可得到下表，不是估计值。")
rows = [("人脸网格", "478 点", "浏览器内推理，GPU 委托"),
        ("唇色识别", "复古红 · ΔE 6.4", "判定“明显接近”"),
        ("肤色判定", "ITA 66° · 暖调", "三点中位取样，避开头发"),
        ("取色准确度", "31% → 92%", "模拟偏色 + 高光，13 支色卡"),
        ("还原精度", "ΔE 6.67 → 3.46", "平均色差，开启白平衡后"),
        ("端到端自检", "6 套 · 0 报错", "文案 / 交互 / 试色 / 色卡库 / 色彩 / 布局")]
y = BODY_Y + 0.02
for i, (a, b, c) in enumerate(rows):
    if i % 2 == 0:
        rect(s, M, y - 0.08, 11.5, 0.48, TINT, None, round_=False)
    tb(s, M + 0.15, y, 2.6, 0.3, a, size=11.5, color=MUTED)
    tb(s, M + 2.9, y, 3.5, 0.3, b, size=11.5, color=INK, bold=True)
    tb(s, M + 6.5, y, 4.9, 0.3, c, size=10.5, color=MUTED)
    y += 0.54
tb(s, M, 5.68, 11.4, 0.6, "限制也写在明处：深肤色样本不足，还需与盲协共创、补充人群测试。",
   size=12, color=SUB)
page_no(s, 14)

# ---------------------------------------------------------------- 14 落地价值
s = content_page(prs, "落地价值：一件对三方都成立的事",
                 "对企业社会责任来说，它不是宣传物料，而是能被用户真正用起来的产品。")
vals = [("对用户", "把“能不能买对”变成可判断的事",
         "不用再赌运气，也不用每次都麻烦别人；独立完成一次选择，是尊严问题。"),
        ("对品牌", "一个长期缺席的高价值客群",
         "无障碍不是成本而是增量：1700 万视障人群背后的家庭决策链，同样在买美妆。"),
        ("对社会", "把“无障碍”从口号变成可复制的样板",
         "同一套声化与色差能力，可迁移到衣物配色、药品识别、食品保质期等场景。")]
y = BODY_Y + 0.02
for who, head, desc in vals:
    rect(s, M, y, 0.06, 1.22, ACCENT2, None, round_=False)
    tb(s, M + 0.26, y, 1.5, 0.3, who, size=11, color=ACCENT2, bold=True)
    tb(s, M + 1.70, y - 0.02, 4.5, 0.34, head, size=14.5, color=INK, bold=True)
    tb(s, M + 6.45, y - 0.02, 4.9, 0.9, desc, size=11.5, color=MUTED, line=1.45)
    y += 1.40
page_no(s, 15)

# ---------------------------------------------------------------- 15 规划
s = content_page(prs, "未来规划：三步，每一步都有交付物",
                 "不画大饼：先证明可用，再证明可复制。")
bar(s, M + 0.15, 3.40, 7.45, 0.02, LINE)
stages = [("已完成 · 初赛版本", "可运行原型", "四模块 + 色卡库 + 离线问答，开源可演示", True),
          ("3 个月 · 共创测试", "与盲协 20 位用户共创", "真实任务测试，形成可用性报告与问题清单", False),
          ("6–12 个月 · 门店试点", "1 家门店 · 100 位用户", "专柜平板形态落地，沉淀服务流程", False)]
for i, (phase, name, detail, done) in enumerate(stages):
    cx = M + 0.15 + i * 3.78
    dot = s.shapes.add_shape(MSO_SHAPE.OVAL, Inches(cx - 0.09), Inches(3.31), Inches(0.18), Inches(0.18))
    dot.fill.solid()
    dot.fill.fore_color.rgb = ACCENT if done else RGBColor(0xFF, 0xFF, 0xFF)
    dot.line.color.rgb = ACCENT
    dot.shadow.inherit = False
    el = dot._element
    st = el.find(qn("p:style"))
    if st is not None:
        el.remove(st)
    tb(s, cx - 0.05, 2.70, 3.5, 0.3, phase, size=10, color=ACCENT2 if done else MUTED, bold=True)
    tb(s, cx - 0.05, 3.66, 3.5, 0.5, name, size=13.5, color=INK, bold=True, line=1.2)
    tb(s, cx - 0.05, 4.20, 3.42, 0.95, detail, size=10.5, color=MUTED, line=1.45)
tb(s, M, 5.42, 11.4, 0.6, "长期：把这套“颜色 → 声音”的能力开放成组件，让更多无障碍产品直接接入。",
   size=12, color=SUB)
page_no(s, 16)

# ---------------------------------------------------------------- 16 THANKS
s = prs.slides[2]
for sh in s.shapes:
    if sh.has_text_frame and "THANKS" in sh.text_frame.text:
        tf = sh.text_frame
        set_para(tf.paragraphs[0], "让美，不依赖眼睛。", 44, RGBColor(0xFF, 0xFF, 0xFF), True)
        for extra in list(tf.paragraphs)[1:]:
            extra._p.getparent().remove(extra._p)
        for text, size, color in [(f"在线体验  {PAGE_URL}", 15, RGBColor(0xF2, 0xE6, 0xFA)),
                                  (f"源码  {REPO_URL}", 12, RGBColor(0xE6, 0xD2, 0xF2))]:
            p = tf.add_paragraph()
            r = p.add_run()
            r.text = text
            set_run(r, size, color, False)
            p.alignment = tf.paragraphs[0].alignment
            p.line_spacing = 1.45

if os.path.exists(QR):
    pic(s, QR, W - M - 1.35, 4.80, 1.1, 1.1)
    tb(s, W - M - 1.55, 6.00, 1.5, 0.3, "扫码在线体验", size=10,
       color=RGBColor(0xF2, 0xE6, 0xFA), align=PP_ALIGN.CENTER)

# 删除模版示例页，THANKS 移到最后
xml = prs.slides._sldIdLst
ids = list(xml)
thanks_el, example_el = ids[2], ids[1]
xml.remove(example_el)
xml.remove(thanks_el)
xml.append(thanks_el)

prs.save(OUT)
print("saved:", OUT, "slides:", len(prs.slides))
