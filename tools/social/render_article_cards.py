#!/usr/bin/env python3
"""Render preview PNGs for the LinkedIn article post pack with Pillow.

These are previews for approval. The production renderer on the Mac is
tools/social/av_cards.py; this script only reads the same card shape
(headline, sub, layout, date) from linkedin_cards_articles.json.

Brand system:
  plum #1B0F2E (type cards) or porcelain #F8F4EF (phone cards), gold #C9A24B
  accent, Cormorant Garamond SemiBold for the headline, Inter for body.
  Only the word "Before." is ever gold. Cards are 1080x1350. When the card
  implies a preview, the line "Illustrative preview — not a guaranteed result"
  is burned in.

Fonts: the script looks for Cormorant Garamond and Inter in tools/social/fonts/
and the system font folders. If missing, it tries to download the OFL files from
Google Fonts' GitHub repository into tools/social/fonts/ (gitignored). If that
fails it falls back to DejaVu Serif / DejaVu Sans and says so.

Usage: python3 tools/social/render_article_cards.py [--only SLUG] [--no-download]
"""
from __future__ import annotations

import argparse
import json
import sys
import urllib.request
from pathlib import Path

try:
    from PIL import Image, ImageDraw, ImageFont
except ImportError:  # pragma: no cover
    sys.exit("Pillow is required: python3 -m pip install Pillow")

ROOT = Path(__file__).resolve().parents[2]
PACK = ROOT / "06_Media" / "social_launch" / "linkedin_page"
CARDS_JSON = PACK / "linkedin_cards_articles.json"
FONT_DIR = Path(__file__).resolve().parent / "fonts"

W, H = 1080, 1350
MARGIN = 84
PLUM, PLUM2, GOLD, PORCELAIN = "#1B0F2E", "#2E1A47", "#C9A24B", "#F8F4EF"
ILLUSTRATIVE_LINE = "Illustrative preview — not a guaranteed result"
WORDMARK = "AfterVue"
SITE = "getaftervue.com"

GITHUB_RAW = "https://raw.githubusercontent.com/google/fonts/main/ofl/"
FONT_SOURCES = {
    "CormorantGaramond[wght].ttf": GITHUB_RAW + "cormorantgaramond/CormorantGaramond%5Bwght%5D.ttf",
    "Inter[opsz,wght].ttf": GITHUB_RAW + "inter/Inter%5Bopsz%2Cwght%5D.ttf",
}
SYSTEM_CANDIDATES = {
    "serif": ["CormorantGaramond-SemiBold.ttf", "CormorantGaramond[wght].ttf",
              "/Library/Fonts/CormorantGaramond-SemiBold.ttf",
              "/usr/share/fonts/truetype/dejavu/DejaVuSerif-Bold.ttf",
              "/Library/Fonts/Georgia.ttf", "/System/Library/Fonts/Supplemental/Georgia.ttf"],
    "sans": ["Inter-Regular.otf", "Inter[opsz,wght].ttf",
             "/usr/share/fonts/opentype/inter/Inter-Regular.otf",
             "/usr/share/fonts/truetype/inter/Inter-Regular.ttf",
             "/Library/Fonts/Inter-Regular.ttf",
             "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
             "/System/Library/Fonts/Supplemental/Arial.ttf"],
    "sans_medium": ["Inter-Medium.otf", "Inter[opsz,wght].ttf",
                    "/usr/share/fonts/opentype/inter/Inter-Medium.otf",
                    "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
                    "/System/Library/Fonts/Supplemental/Arial Bold.ttf"],
}


def find_font(kind: str, allow_download: bool) -> tuple[Path | None, bool]:
    """Return (path, is_brand_font)."""
    FONT_DIR.mkdir(exist_ok=True)
    wanted = "CormorantGaramond[wght].ttf" if kind == "serif" else "Inter[opsz,wght].ttf"
    for cand in SYSTEM_CANDIDATES[kind]:
        p = Path(cand) if cand.startswith("/") else FONT_DIR / cand
        if p.exists():
            return p, ("Cormorant" in p.name or "Inter" in p.name)
    if allow_download:
        target = FONT_DIR / wanted
        try:
            print(f"[fonts] downloading {wanted} from Google Fonts GitHub")
            urllib.request.urlretrieve(FONT_SOURCES[wanted], target)
            if target.stat().st_size > 50_000:
                return target, True
            target.unlink(missing_ok=True)
        except Exception as exc:  # noqa: BLE001
            print(f"[fonts] download failed ({exc}); using fallback")
    for cand in SYSTEM_CANDIDATES[kind]:
        p = Path(cand)
        if p.is_absolute() and p.exists():
            return p, False
    return None, False


def load(path: Path | None, size: int, variation: str | None = None) -> ImageFont.FreeTypeFont:
    if path is None:
        return ImageFont.load_default(size)
    f = ImageFont.truetype(str(path), size)
    if variation:
        try:
            f.set_variation_by_name(variation)
        except Exception:  # noqa: BLE001  (static font or no variation support)
            pass
    return f


def wrap(draw: ImageDraw.ImageDraw, text: str, font, max_width: int) -> list[str]:
    words, lines, cur = text.split(), [], ""
    for w in words:
        trial = f"{cur} {w}".strip()
        if draw.textlength(trial, font=font) <= max_width or not cur:
            cur = trial
        else:
            lines.append(cur)
            cur = w
    if cur:
        lines.append(cur)
    return lines


def draw_headline(draw, lines, font, x, y, color, gold_word, line_h):
    """Draw wrapped headline lines; only `gold_word` is drawn in gold."""
    for line in lines:
        cx = x
        for i, word in enumerate(line.split(" ")):
            piece = word + (" " if i < len(line.split(" ")) - 1 else "")
            col = GOLD if (gold_word and word == gold_word) else color
            draw.text((cx, y), piece, font=font, fill=col)
            cx += draw.textlength(piece, font=font)
        y += line_h
    return y


def draw_phone(draw, x, y, w, h, fg, bg):
    """A simple phone silhouette standing in for the product shot."""
    r = 72
    draw.rounded_rectangle((x, y, x + w, y + h), radius=r, fill=fg)
    inset = 14
    draw.rounded_rectangle((x + inset, y + inset, x + w - inset, y + h - inset), radius=r - inset, fill=bg)
    # notch / dynamic island
    draw.rounded_rectangle((x + w // 2 - 60, y + 34, x + w // 2 + 60, y + 62), radius=14, fill=fg)
    # before/after split hint
    mid = x + w // 2
    top, bottom = y + 150, y + h - 170
    draw.rectangle((x + inset + 30, top, mid - 2, bottom), fill="#E7DCCF")
    draw.rectangle((mid + 2, top, x + w - inset - 30, bottom), fill="#EFE4D6")
    draw.line((mid, top, mid, bottom), fill=GOLD, width=4)
    draw.ellipse((mid - 22, (top + bottom) // 2 - 22, mid + 22, (top + bottom) // 2 + 22), fill=GOLD)


def render(card: dict, fonts: dict, out: Path) -> None:
    layout = card.get("layout", "type")
    phone = layout == "phone"
    bg = PORCELAIN if phone else PLUM
    fg = PLUM if phone else PORCELAIN
    img = Image.new("RGB", (W, H), bg)
    d = ImageDraw.Draw(img)

    # top rule + wordmark
    d.text((MARGIN, MARGIN), WORDMARK, font=fonts["wordmark"], fill=fg)
    d.text((W - MARGIN - d.textlength("AfterVue AI", font=fonts["small"]), MARGIN + 10),
           "AfterVue AI", font=fonts["small"], fill=GOLD)
    d.line((MARGIN, MARGIN + 70, W - MARGIN, MARGIN + 70), fill=GOLD, width=2)

    col_w = 420 if phone else 880
    if phone:
        pw, ph = 420, 860
        draw_phone(d, W - MARGIN - pw, 300, pw, ph, PLUM, "#FFFFFF")

    headline = card["headline"]
    size = 96 if not phone else 72
    lines = wrap(d, headline, fonts["serif"] if size == 96 else fonts["serif_s"], col_w)
    while len(lines) > (5 if phone else 4) and size > 56:
        size -= 8
        f = load(fonts["_serif_path"], size, "SemiBold")
        lines = wrap(d, headline, f, col_w)
    hfont = fonts["serif"] if size == 96 else (fonts["serif_s"] if size == 72 else load(fonts["_serif_path"], size, "SemiBold"))
    line_h = int(size * 1.08)
    sub_lines = wrap(d, card.get("sub", ""), fonts["sans_m"], col_w)
    block_h = len(lines) * line_h + 28 + len(sub_lines) * 44
    y = max(300, (H - block_h) // 2 - 60)
    y = draw_headline(d, lines, hfont, MARGIN, y, fg, card.get("gold_word"), line_h)

    # sub line
    y += 28
    for line in sub_lines:
        d.text((MARGIN, y), line, font=fonts["sans_m"], fill=GOLD if not phone else PLUM2)
        y += 44

    # bottom block
    base = H - MARGIN
    d.text((MARGIN, base - 34), SITE, font=fonts["small"], fill=fg)
    if card.get("illustrative_line"):
        d.text((MARGIN, base - 84), ILLUSTRATIVE_LINE, font=fonts["tiny"], fill=GOLD if not phone else PLUM2)
    d.line((MARGIN, base - 110, MARGIN + 120, base - 110), fill=GOLD, width=3)

    out.parent.mkdir(parents=True, exist_ok=True)
    img.save(out, "PNG", optimize=True)


def main() -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--only", help="render only cards for this slug")
    ap.add_argument("--no-download", action="store_true")
    ap.add_argument("--cards", default=str(CARDS_JSON))
    args = ap.parse_args()

    serif_path, serif_brand = find_font("serif", not args.no_download)
    sans_path, sans_brand = find_font("sans", not args.no_download)
    sans_m_path, _ = find_font("sans_medium", False)
    print(f"[fonts] headline: {serif_path} ({'Cormorant Garamond' if serif_brand else 'serif fallback'})")
    print(f"[fonts] body:     {sans_path} ({'Inter' if sans_brand else 'sans fallback'})")

    fonts = {
        "_serif_path": serif_path,
        "serif": load(serif_path, 96, "SemiBold"),
        "serif_s": load(serif_path, 72, "SemiBold"),
        "sans_m": load(sans_m_path or sans_path, 34, "Medium"),
        "wordmark": load(serif_path, 48, "SemiBold"),
        "small": load(sans_path, 26, "Regular"),
        "tiny": load(sans_path, 22, "Regular"),
    }

    data = json.loads(Path(args.cards).read_text(encoding="utf-8"))
    cards = data["cards"] if isinstance(data, dict) else data
    n = 0
    for card in cards:
        if args.only and card.get("slug") != args.only:
            continue
        out = PACK / card.get("file", f"cards/{card['date']}_{n}.png")
        render(card, fonts, out)
        n += 1
    print(f"rendered {n} cards to {PACK / 'cards'}")
    return 0


if __name__ == "__main__":
    sys.exit(main())
