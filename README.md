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

## Deploy

`vite.config.js` sets `base: './'`, so the build drops into any CDN
subdirectory and is embedded on the product domain through an iframe.
`lab.html` ships alongside it on purpose (~10 KB, linked from nowhere) so the
motion designer can review the 3D presets on a phone.

## Architecture in brief

- `public/video/story.{mp4,webm}` is the **master clock**; everything else reads
  `video.currentTime`.
- The journal is real DOM in a `preserve-3d` stage. Its pose is one measured
  path (`JOURNAL_PATH` in `src/story/slides.js`), not a tween per slide.
- 17 pages are mounted at once and switched by `visibility` from the rAF loop,
  frame-exactly (ADR-0008).
- Flying objects are siblings of the journal in the same 3D scene, so the
  browser sorts them by depth (ADR-0006).
- Timings, poses and layouts are **data**: `story/slides.js`, `story/timing.js`,
  `story/flyObjects.js`, `story/pageLayouts.js`. No preset holds a bare number.
- **Pages the link has no data for are dropped** and the story shortened —
  `src/story/storyPlan.js`. See _URL parameters_ below.

## URL parameters

Everything a player sees comes off the query string; nothing is looked up
server-side. **The full table with types, formats and examples is
[`docs/marketing/link-parameters.md`](docs/marketing/link-parameters.md)** —
that is the document to hand to marketing.

Full example:

```
?user_language=de&user_currency=EUR&name=Marianna
 &days=257&points=1200000&level=GOLD
 &total_wins=2222577
 &biggest_win=222257&biggest_win_game=Dragon+Coins
 &biggest_win_game_thunbnail=https://cdn.example.com/dragon.png
 &top_multiplier=2257&top_multiplier_game=Tiger+Jackpots
 &favorite_game_name=Tiger+Jackpots
 &favorite_game_thunbnail=https://cdn.example.com/tiger.png
 &bonuses=2572257&sports_wins=2572257&sports_multiplier=257
 &final_link=https://example.com/promotions/andromeda
```

| Parameter                                        | Page it fills         | When the page is dropped             |
| ------------------------------------------------ | --------------------- | ------------------------------------ |
| `name`                                           | Cover, Editor's Note  | never — greeting goes without a name |
| `days`                                           | Days in the Spotlight | missing, empty or `0`                |
| `points`                                         | Seasonal Power        | missing, empty or `0`                |
| `level`                                          | VIP Status            | missing or not one of the seven      |
| `total_wins`                                     | Money Talks           | missing, empty or `0`                |
| `biggest_win`                                    | Headline Win          | missing, empty or `0`                |
| `top_multiplier`                                 | Multiplier Moment     | missing, empty or `0`                |
| `favorite_game_name` / `favorite_game_thunbnail` | Player's Pick         | both missing                         |
| `bonuses`                                        | Bonus Report          | missing, empty or `0`                |
| `sports_wins`                                    | Sports Desk           | missing, empty or `0`                |
| `sports_multiplier`                              | Top Sport Signal      | missing, empty or `0`                |
| `user_language`                                  | locale                | unknown → English                    |
| `user_currency`                                  | currency symbol       | —                                    |
| `final_link`                                     | CTA and close         | missing → close just closes          |

**Levels:** `IRON`, `BRONZE`, `SILVER`, `GOLD`, `PLATINUM`, `DIAMOND`.
`REGULAR` shows the Iron badge (`SHOW_IRON_FOR_REGULAR` in `levelConfig.js`).
Anything else drops the page.

> The misspelling `thunbnail` is deliberate — it is the name already used by
> Thor's links and by the campaign templates built on them.

**Ten pages can be dropped** (the run from Days in the Spotlight to Top Sport
Signal). The cover, the editor's note and the closing run always play. A player
with none of the ten gets about 51 seconds instead of 94, and the steps bar
counts only the pages that are shown.

⚠️ **A typo in a parameter name now costs a page rather than showing a blank
one.** `bigest_win=5000` does not fill Headline Win — it drops it, silently.
Open a link before a campaign goes out and count the steps in the bar.

## Localisation

Files: `src/i18n/{en,fr,de,it}.json`. `npm run check-locales` verifies that all
four carry the same keys and that every page is covered.

To add a language: create `<lang>.json` with `en.json`'s keys, then import it
into `MESSAGES` in `src/composables/useStoryData.js` and add the code to
`LOCALES` in `src/story/params.js`.

> Thor has five languages (`pt` as well). A `language=pt` link here does not
> fail — it silently shows English.

## Integration (postMessage)

Sent to the parent frame as `{ source: 'alpa-vip-stories', message }`:

| Event                              | When                         |
| ---------------------------------- | ---------------------------- |
| `reach_end`                        | the timeline reached the end |
| `bonuses_btn`                      | CONTINUE JOURNEY pressed     |
| `watch_again`                      | WATCH AGAIN pressed          |
| `close`                            | the cross pressed            |
| `click_forward` / `click_backward` | arrow or tap navigation      |
| `click_pause` / `click_start`      | hold-to-pause and release    |

`getGift()` and `closeStory()` then move `window.parent.location.href` to
`final_link`.

## Verification

Run the gates **one at a time**: two headless Chromes fight over the profile
directory and produce phantom failures and hangs.

```sh
npm run check-locales   # all four locales carry the same keys
npm run build           # must be clean
npm run fit:check       # the scene fits the stage whole, the video covers it
npm run pose:check      # every slide's on-screen box against slides.js
npm run journal:selftest
npm run clip:selftest
npm run tiles:fit       # a report, not a verdict
npm run fly:check       # flights against scripts/fly-reference.json
npm run preloader:fit   # the loading logo against the clip's opening frame
npm run smooth:scan && node scripts/smooth-report.mjs _refs/smooth/scan-0-94.3667.json
```

⚠️ **A green gate is not a correct build.** Every gate above except the last two
compares the build against a TABLE that was itself derived from the mock —
`pose:check` cannot report a pose error, because the pose table is what it
checks against, and it was green throughout a build the owner rejected on sight.

**What actually compares us with the mock** is the pair written in session AE:

```sh
node scripts/shoot-pages.mjs /tmp/pages en     # 17 pages shot flat, one PNG each
python3 scripts/mock-overlay.py <config.json>  # each page against its Figma node
```

It prints the share of disagreeing pixels per page and writes a red/cyan
overlay where agreement is grey, the mock red and us cyan. The ranking of all
17 pages is in `_context/90-next-session.md`.

⚠️ Take the Figma export at its **natural size** (`get_screenshot`, `maxDimension`
at or above `original_width`), or the tool aligns at the wrong scale and lies.

> `npm run audit` used to stand here and was removed on 2026-09-13. It compared
> our render, the clip and the storyboard frame by the width of the white
> heading type — a cruder answer to the same question `mock-overlay.py` answers
> per pixel, and its clip half stopped meaning anything when the reference pair
> was re-rendered on 09-12. Its last run was 09-04. It is in git history.

## The lab

`lab.html` renders the real journal in the real 3D stage with a control panel:
fire any preset, drag its params, park a pose, walk the slides, and play the
reference clip **underneath** the DOM journal. Every control is a URL param,
which makes it scriptable:

```
lab.html?panel=0&bg=preview&frame=11&lead=2.4      # park slide 11 over the reference
lab.html?panel=0&bg=grid&rotY=90&jd=34             # edge-on: proves the 3D volume
lab.html?frame=13&rot=0&rotX=0&rotY=0&scale=0.62   # a page FLAT, for mock-overlay
```

`bg=preview|clean|grid` · `frame` (Figma frame №) · `lead` (seconds past the cut)
· `journal=0` · `rotX/rotY/rot/scale/z/cx/cy` · `persp` · `jd` · `face` ·
`play=1` · `panel=0`

## Video

Raw motion-designer deliverables live in `_refs/` (gitignored, 187 MB each).
`scripts/encode-video.sh dev|prod` is the only sanctioned way to produce
`public/video/`, so the encode settings are versioned rather than living in
someone's shell history. `-g 30` (1-second GOP) and `+faststart` are
non-negotiable — the reasons are in the script's header.

⚠️ **`-an` strips the audio, and that is one of three things blocking sound.**
The header's sound button is wired to nothing yet. When the soundtrack lands,
all three have to change together: drop `-an` here, turn `muted` in `Story.vue`
into a binding, and assign `video.muted` from `soundOn`. The
start-muted-then-unmute-on-tap shape must stay — a browser refuses to autoplay
a video with sound, so the button is the gesture that earns it.

⚠️ The reference clips in `public/video/ref-*.mp4` are for the lab and the dev
server. They are 34 MB and they ship, because `lab.html` ships; cut them only
together with the lab.

## The one rule that will bite you

Every element in the 3D chain has **exactly one author of its `transform`**.
Elements GSAP animates carry no CSS `transform` at all — they are centred with
negative margins. Break that and GSAP's transform cache freezes a percentage
into stale pixels. The full contract, the layer-by-layer ownership table and the
list of properties that silently flatten a 3D scene are at the top of
`src/styles/_stage.scss`. Read it before editing anything under `src/styles/` or
`src/journal3d/`.
