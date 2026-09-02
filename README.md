# Alpa Seasonal VIP Stories

Personalised season-recap stories for Alpa / RocketPlay. A vertical 1080×1920
scene runs inside an iframe on the product domain: a pre-rendered background
video plays, and on top of it a **journal is animated in real CSS 3D with GSAP**
while 3D objects fly around it. Per-player content arrives through query
parameters.

Internal documentation (tickets, decisions, timecodes, pose tables, progress
log) lives in `_context/` and is **not** in git — the canonical copy sits with
the project in DevHubVault. Start at `_context/README.md`.

## Run

```sh
npm install
npm run dev        # story
npm run lab        # 3D animation lab (the primary authoring surface)
npm run build      # -> dist/
npm run preview
```

## The lab

`lab.html` renders the real journal in the real 3D stage with a control panel:
fire any preset, drag its params, park a pose, walk the slides, and — the
important part — play the reference clip **underneath** the DOM journal. If the
pose is right the two coincide and the composite reads as one object; any error
shows up as a doubled edge whose size *and direction* are readable.

Every control is also a URL param, which makes the lab scriptable:

```
lab.html?panel=0&bg=preview&frame=11&lead=2.4      # park slide 11 over the reference
lab.html?panel=0&bg=grid&rotY=90&jd=34             # edge-on: proves the 3D volume
lab.html?frame=9&journal=0                         # reference alone
```

`bg=preview|clean|grid` · `frame` (Figma frame №) · `lead` (seconds past the cut)
· `journal=0` · `rotX/rotY/rot/scale/z/cx/cy` · `persp` · `jd` · `face` ·
`play=1` · `panel=0`

## Verification

```sh
npm run pose:check   # measure every slide's on-screen AABB vs slides.js
npm run probe -- "lab.html?frame=11"
npm run frames       # reference stills into _refs/frames/ (needs _refs/)
```

`scripts/probe.mjs` drives headless Chrome over the DevTools Protocol using
Node's built-in WebSocket — no dependencies. It reports the journal's bounding
box in design pixels and the delta against the pose table, which is what turns
"looks a bit off" into "cy is 4.2 design px low". Current state: all 21 poses
reproduce the Figma mock within ±1.5 design px.

## Video

Raw motion-designer deliverables live in `_refs/` (gitignored, 187 MB each).
`scripts/encode-video.sh dev|prod` is the only sanctioned way to produce
`public/video/` so the encode settings are versioned rather than living in
someone's shell history. `-g 30` (1-second GOP), `+faststart` and `-an` are
non-negotiable — the reasons are in the script's header.

## The one rule that will bite you

Every element in the 3D chain has **exactly one author of its `transform`**.
Elements GSAP animates carry no CSS `transform` at all — they are centred with
negative margins. Break that and GSAP's transform cache freezes a percentage
into stale pixels. The full contract, the layer-by-layer ownership table and the
list of properties that silently flatten a 3D scene are at the top of
`src/styles/_stage.scss`. Read it before editing anything under `src/styles/` or
`src/journal3d/`.
