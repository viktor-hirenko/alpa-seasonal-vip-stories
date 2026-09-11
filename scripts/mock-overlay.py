#!/usr/bin/env python3
"""
PIXEL OVERLAY: our rendered journal page against its Figma node. `V-85`.

WHY THIS EXISTS. Trap 23 says no gate compares us with the mock; session AC
closed half of that by shooting the 17 pages flat and looking at them beside the
Figma exports. Looking is not measuring: the owner still found, by eye on his
phone, art that is the wrong size and a logo that lands on the cow. This puts a
number on the same question and ranks the pages, so the eye is pointed at the
worst one first instead of at all seventeen.

HOW TO USE IT, in three steps.

1. Shoot our pages FLAT, one PNG per page, clipped to `.journal-page--active`:
     lab.html?frame=<N>&rot=0&rotX=0&rotY=0&cx=50&cy=50&scale=0.62&jd=34
              &panel=0&bg=grid&objects=0&journal=1&lang=en
   (CDP `Page.captureScreenshot` with `clip` on that element's box.)

2. Pull the matching Figma node with `get_screenshot` at maxDimension 1000 and
   download the PNG. Node ids per page and per language: _context/31-pages.md.

3. Run:  python3 scripts/mock-overlay.py <config.json>
   where the config is
     { "out": "/tmp/overlay",
       "pages": [ {"name": "space_milk",
                   "ours": "...png", "mock": "...png",
                   "w": 1564, "h": 1911} ] }
   `w`/`h` are the Figma NODE's size; the cover is 1465x1868, data pages
   1564x1911. It prints a table sorted by disagreement and writes
   `<name>-mock.png`, `<name>-ours.png`, `<name>-diff.png` plus `report.json`.

TWO THINGS THE NUMBER DOES NOT MEAN, both learned the hard way on 11.09.

  * A page whose demo data differs from the mock's scores high for no reason.
    `headline_win` came top of the ranking at 17.6 % purely because the mock
    shows Dragon Coins and our sample data shows Tiger Jackpots. Read the
    picture before believing the rank.
  * Thin outlines around every letter are ANTIALIASING, not a defect. A real
    difference is a SOLID patch — that is what the Space Milk logo looked like,
    and it turned out to be genuinely mis-placed.

WHEN THE DIFF IS AMBIGUOUS, put the two through the red/cyan overlay instead:
`Image.merge('RGB', (mock_gray, ours_gray, ours_gray))`. Agreement goes grey,
disagreement goes red or cyan, and a shift of a few pixels becomes impossible to
misread. That is what settled the Space Milk logo after two numeric attempts
disagreed with each other.

ALIGNMENT IS SEARCHED, NOT ASSUMED. The export is the node plus its drop shadow,
and the shadow is offset, so the node is not centred in the PNG. The rough crop
below uses the shadow's own numbers and the search then refines scale and offset;
both are printed, so a bad alignment shows up as a scale at the edge of the
search range rather than as a wrong answer. `days_in_spotlight` lands on 1.04
that way — its export bounds differ from the rest and its score is the one not
to trust.
"""
from PIL import Image, ImageChops, ImageFilter
import sys, os, json

# The mock's page shadow, from _context/31-pages.md ("shadow season"):
#   7.294px 23.965px 68.976px  and  -2.987px 4.481px 27.184px
PAD_L, PAD_R, PAD_T, PAD_B = 61.68, 76.27, 45.01, 92.94

def rough_crop(mock, node_w, node_h):
    """Undo the shadow padding, in the export's own pixels."""
    W, H = mock.size
    total_w = node_w + PAD_L + PAD_R
    total_h = node_h + PAD_T + PAD_B
    s = min(W / total_w, H / total_h)
    x0, y0 = PAD_L * s, PAD_T * s
    return mock.crop((round(x0), round(y0), round(x0 + node_w * s), round(y0 + node_h * s)))

def gray(im, size=(220, 269)):
    return im.convert('L').resize(size, Image.LANCZOS).filter(ImageFilter.GaussianBlur(1))

def score(a, b):
    d = ImageChops.difference(a, b)
    h = d.histogram()
    return sum(i * v for i, v in enumerate(h)) / sum(h)

def align(ours, mock_crop):
    """Search scale and offset; return (best_score, scale, dx, dy, aligned_ours)."""
    base = gray(mock_crop)
    W, H = base.size
    best = (1e9, 1.0, 0, 0)
    for si in range(-4, 5):
        sc = 1 + si * 0.01
        cand = gray(ours, (round(W * sc), round(H * sc)))
        for dx in range(-6, 7, 2):
            for dy in range(-6, 7, 2):
                canvas = Image.new('L', (W, H), 0)
                canvas.paste(cand, (round((W - cand.width) / 2) + dx, round((H - cand.height) / 2) + dy))
                s = score(canvas, base)
                if s < best[0]:
                    best = (s, sc, dx, dy)
    return best

def run(name, ours_path, mock_path, node_w, node_h, out_dir):
    ours = Image.open(ours_path).convert('RGB')
    mock = Image.open(mock_path).convert('RGB')
    mc = rough_crop(mock, node_w, node_h)
    s, sc, dx, dy = align(ours, mc)
    # render the comparison at a readable size
    W = 700; H = round(W * node_h / node_w)
    m_big = mc.resize((W, H), Image.LANCZOS)
    o_big = ours.resize((round(W * sc), round(H * sc)), Image.LANCZOS)
    canvas = Image.new('RGB', (W, H), (0, 0, 0))
    canvas.paste(o_big, (round((W - o_big.width) / 2) + round(dx * W / 220),
                         round((H - o_big.height) / 2) + round(dy * H / 269)))
    diff = ImageChops.difference(canvas, m_big).convert('L')
    hot = diff.point(lambda v: 255 if v > 60 else 0)
    os.makedirs(out_dir, exist_ok=True)
    m_big.save(f'{out_dir}/{name}-mock.png')
    canvas.save(f'{out_dir}/{name}-ours.png')
    diff.save(f'{out_dir}/{name}-diff.png')
    hist = diff.histogram()
    mean = sum(i * v for i, v in enumerate(hist)) / sum(hist)
    over = sum(hist[61:]) / sum(hist) * 100
    return {'page': name, 'mean': round(mean, 1), 'hot_pct': round(over, 1),
            'scale': round(sc, 3), 'dx': dx, 'dy': dy, 'bbox': hot.getbbox()}

if __name__ == '__main__':
    cfg = json.load(open(sys.argv[1]))
    out = []
    for c in cfg['pages']:
        out.append(run(c['name'], c['ours'], c['mock'], c.get('w', 1564), c.get('h', 1911), cfg['out']))
    out.sort(key=lambda r: -r['hot_pct'])
    print(f"{'страница':22}{'расх.%':>8}{'средн.':>8}{'масштаб':>9}{'dx':>4}{'dy':>4}")
    for r in out:
        print(f"{r['page']:22}{r['hot_pct']:>8}{r['mean']:>8}{r['scale']:>9}{r['dx']:>4}{r['dy']:>4}")
    json.dump(out, open(f"{cfg['out']}/report.json", 'w'), indent=1)
