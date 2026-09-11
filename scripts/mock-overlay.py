#!/usr/bin/env python3
"""
PIXEL OVERLAY: our rendered journal page against its Figma node. `V-85`.

WHY THIS EXISTS. Trap 23 says no gate compares us with the mock; session AC
closed half of that by shooting the 17 pages flat and looking at them beside the
Figma exports. Looking is not measuring: the owner still found, by eye on his
phone, art that is the wrong size and a logo that lands on the cow. This puts a
number on the same question and ranks the pages, so the eye is pointed at the
worst one first instead of at all seventeen.

⚠️ THE ALIGNMENT IS NOT SEARCHED IN SCALE, AND THAT IS THE WHOLE POINT (session
AE, 11.09). The first version of this tool hunted for scale AND offset because it
did not know where the node sat inside the export — and on `days_in_spotlight` it
settled 4 % out and reported 9.1 % disagreement for a page that is actually at
1.8 %. Ask Figma for the node at its NATURAL size (`get_screenshot` with
`maxDimension` at or above `original_width`) and one export pixel is one design
px: the scale is known, and only the offset is left to find. A 1:1 search has one
sharp minimum and nothing can silently rescale a page.

⚠️ THE MARGIN AROUND THE NODE IS PER PAGE. It is the node's own render bounds —
the drop shadow on most pages, something else on others — so it is 1695x2048 on
`space_milk`, 1606x2005 on `days_in_spotlight`, 1581x2006 on `final` and exactly
1465x1868 (no margin at all) on the cover. Do NOT crop by a shadow constant; that
is what the offset search is for. On `space_milk` the found offset was checked
against two landmarks 1600 px apart — the digits and the footer — and both agree
to 1 px.

HOW TO USE IT, in three steps.

1. Shoot our pages FLAT, one PNG per page, clipped to `.journal-page--active`:
     lab.html?frame=<N>&rot=0&rotX=0&rotY=0&cx=50&cy=50&scale=0.62&jd=34
              &panel=0&bg=grid&objects=0&journal=1&lang=en
   (CDP `Page.captureScreenshot` with `clip` on that element's box, and a
   `scale` high enough that the shot is not smaller than the node.)

2. Pull the matching Figma node with `get_screenshot` at `maxDimension` 2048 and
   download the PNG. Node ids per page and per language: _context/31-pages.md.

3. Run:  python3 scripts/mock-overlay.py <config.json>
   where the config is
     { "out": "/tmp/overlay",
       "pages": [ {"name": "space_milk", "ours": "...png", "mock": "...png"} ] }
   `size` is optional and defaults to a data page's 1564x1911; the cover has its
   own smaller skeleton and needs "size": [1465, 1868]. It prints a table sorted
   by disagreement and writes `<name>-mock.png`, `<name>-ours.png`,
   `<name>-rc.png` (red/cyan) plus `report.json`.

TWO THINGS THE NUMBER DOES NOT MEAN, both learned the hard way on 11.09.

  * A page whose demo data differs from the mock's scores high for no reason.
    `headline_win` leads the ranking at 10.1 % purely because the mock shows
    Dragon Coins and our sample data shows Tiger Jackpots. Read the picture
    before believing the rank.
  * Thin outlines around every letter are ANTIALIASING, not a defect. A real
    difference is a SOLID patch — that is what the Space Milk logo looked like,
    and it turned out to be genuinely mis-placed. `solid` in the report is that
    patch's box: the difference eroded by 9 px, so only broad disagreement
    survives.

WHEN THE DIFF IS AMBIGUOUS, read `<name>-rc.png`. Agreement goes grey, the mock
goes red and ours goes cyan, and a shift of a few pixels becomes impossible to
misread. That is what settled the Space Milk logo after two numeric attempts
disagreed with each other, and what showed the ball sitting off its cup.
"""
from PIL import Image, ImageChops, ImageFilter, ImageStat
import sys, os, json


def align(mock, ours, w, h):
    """Offset of our page inside the export. Coarse at 1/4, then exact."""
    k = 4
    ms = mock.resize((mock.width // k, mock.height // k), Image.LANCZOS)
    os_ = ours.resize((w // k, h // k), Image.LANCZOS)
    best = (1e9, 0, 0)
    for y in range(0, ms.height - h // k + 1):
        for x in range(0, ms.width - w // k + 1):
            v = ImageStat.Stat(ImageChops.difference(ms.crop((x, y, x + w // k, y + h // k)), os_)).mean[0]
            if v < best[0]:
                best = (v, x * k, y * k)
    bx, by = best[1], best[2]
    best = (1e9, bx, by)
    for y in range(max(0, by - 6), min(mock.height - h, by + 7)):
        for x in range(max(0, bx - 6), min(mock.width - w, bx + 7)):
            v = ImageStat.Stat(ImageChops.difference(mock.crop((x, y, x + w, y + h)), ours)).mean[0]
            if v < best[0]:
                best = (v, x, y)
    return best


def run(name, ours_path, mock_path, size, out_dir):
    w, h = size
    mock = Image.open(mock_path).convert('L')
    ours = Image.open(ours_path).convert('L').resize((w, h), Image.LANCZOS)
    _, dx, dy = align(mock, ours, w, h)
    mm = mock.crop((dx, dy, dx + w, dy + h))
    d = ImageChops.difference(mm, ours)
    hist = d.histogram(); tot = sum(hist)
    os.makedirs(out_dir, exist_ok=True)
    Image.open(mock_path).convert('RGB').crop((dx, dy, dx + w, dy + h)).save(f'{out_dir}/{name}-mock.png')
    Image.open(ours_path).convert('RGB').resize((w, h), Image.LANCZOS).save(f'{out_dir}/{name}-ours.png')
    Image.merge('RGB', (mm, ours, ours)).save(f'{out_dir}/{name}-rc.png')
    solid = d.filter(ImageFilter.MinFilter(9)).point(lambda v: 255 if v > 60 else 0)
    return {'page': name,
            'hot_pct': round(sum(hist[61:]) / tot * 100, 1),
            'mean': round(sum(i * v for i, v in enumerate(hist)) / tot, 1),
            'offset': [dx, dy], 'export': list(mock.size), 'solid': solid.getbbox()}


if __name__ == '__main__':
    cfg = json.load(open(sys.argv[1]))
    out = [run(c['name'], c['ours'], c['mock'], c.get('size', (1564, 1911)), cfg['out'])
           for c in cfg['pages']]
    out.sort(key=lambda r: -r['hot_pct'])
    print(f"{'страница':22}{'расх.%':>8}{'средн.':>8}{'сдвиг':>12}{'экспорт':>14}  сплошное пятно")
    for r in out:
        print(f"{r['page']:22}{r['hot_pct']:>8}{r['mean']:>8}"
              f"{str(tuple(r['offset'])):>12}{str(tuple(r['export'])):>14}  {r['solid']}")
    json.dump(out, open(f"{cfg['out']}/report.json", 'w'), indent=1)
