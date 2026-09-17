#!/usr/bin/env bash
# Encode the motion designer's raw deliverables into what the app ships.
#
# The raw files are 1080x1920 @ 15.7 Mbps, ~187 MB each, and live in _refs/
# (gitignored). This script is the ONLY sanctioned way to produce public/video/,
# so the settings are versioned instead of living in somebody's shell history —
# which is what actually bites when v2 of the video lands in three weeks.
#
#   scripts/encode-video.sh dev     -> low-res proxies for the lab/dev server
#   scripts/encode-video.sh prod    -> shipping mp4 + webm
#
# NON-NEGOTIABLE SETTINGS AND WHY
#   -g 30 (GOP = 1 s)  every tap-navigation and debug seek lands on a keyframe.
#                      A 10-second GOP means up to 300 frames of decode before
#                      the picture appears, which on iOS is exactly the "shaking
#                      overlay" that Thor's seekBoth protocol exists to paper
#                      over. A 1-second GOP makes that protocol's job easy.
#   -movflags +faststart   moov atom to the front, so playback starts before the
#                      file is fully fetched.
#   AUDIO IS KEPT on the prod encodes since 2026-09-16, because the soundtrack
#                      arrived inside the video master and the owner asked for
#                      one file, not two. The proxies keep `-an`: the lab and the
#                      dev server play the reference clip under the DOM scene and
#                      have no business making noise.
#                      ⚠️ A video WITH sound cannot autoplay. The <video> still
#                      starts muted and the header's sound button unmutes it —
#                      that button IS the user gesture the browser waits for.
#                      Take `muted` off the element and the story stops starting.
set -euo pipefail

MODE="${1:-dev}"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
REFS="$ROOT/_refs"
OUT="$ROOT/public/video"
mkdir -p "$OUT"

CLEAN="$REFS/DP-15152 - clean bg.mp4"
PREVIEW="$REFS/DP-15152 - preview.mp4"
# THE PROD SOURCE since 2026-09-16: the same picture as CLEAN (per-frame PSNR
# above 30 dB on all 2831 frames, measured) plus the soundtrack. CLEAN is silent
# and stays the reference for the proxies only.
SFX="$REFS/DP-15152 - clean bg sfx.mp4"

need() { [ -f "$1" ] || { echo "missing: $1" >&2; exit 1; }; }

# ⚠️ A KEYFRAME ON EVERY SECOND THE PLAYER CAN BE SENT TO — see
# scripts/seek-targets.mjs, which reads them out of the story rather than
# restating them.
#
# WHY. In WebKit, `video.currentTime = x` becomes an AVFoundation seek with zero
# tolerance on both sides, and Apple's own documentation says that mode "may
# incur additional decoding delay": the decoder must start from the sync sample
# at or before the target and throw away every frame in between. Our targets
# used to miss by 4 to 22 frames, every one of them. On this machine that is a
# few milliseconds; on the owner's iPhone it was a visible stop, reported three
# times. With a sync sample ON the target there is nothing to decode forward,
# and `fastSeek()` — which Safari has and Chrome does not — can land exactly.
#
# WHAT IT COSTS: 63 extra I-frames in a 94 s clip, measured at about +1.6 MB.
KEYFRAMES="$(node "$ROOT/scripts/seek-targets.mjs")"

case "$MODE" in
  dev)
    # Proxies for the lab underlay. Quality is irrelevant here, alignment isn't:
    # keep the exact frame rate and duration so timecodes still match.
    # `clean` comes off the SFX master and KEEPS ITS SOUND: the dev server plays
    # this proxy in place of story.mp4, and a sound button that is silent on
    # `npm run dev` is a trap — you cannot tell it apart from a broken one. The
    # lab plays the same file muted (Lab.vue), so nothing starts making noise
    # there. `preview` stays silent; it is only ever an underlay.
    need "$SFX"; need "$PREVIEW"
    for pair in "clean:$SFX:keep" "preview:$PREVIEW:drop"; do
      name="${pair%%:*}"; rest="${pair#*:}"; src="${rest%:*}"; snd="${rest##*:}"
      echo "-> ref-$name.mp4 (540x960 proxy, sound: $snd)"
      [ "$snd" = keep ] && AFLAGS=(-c:a aac -b:a 96k -ac 2) || AFLAGS=(-an)
      ffmpeg -nostdin -v error -y -i "$src" \
        -c:v libx264 -preset ultrafast -crf 30 \
        -vf scale=540:960 -pix_fmt yuv420p \
        -g 30 -keyint_min 30 -sc_threshold 0 \
        -movflags +faststart "${AFLAGS[@]}" \
        "$OUT/ref-$name.mp4"
    done
    ;;

  prod)
    # 720x1280 is what Thor shipped and what looked fine on these devices; the
    # stage is only ~400 CSS px wide on a phone. If banding shows up in the
    # starfield, lower the CRF first (24 -> 21, ~+8 MB); only then consider
    # 810x1440. Do NOT reach for 1080x1920 — 4x the bytes for detail no phone
    # displays.
    SRC="${2:-$SFX}"
    need "$SRC"
    echo "-> story.mp4 (720x1280 h264)"
    ffmpeg -nostdin -v error -y -i "$SRC" \
      -c:v libx264 -preset slow -crf 24 -profile:v high -level 4.0 \
      -vf scale=720:1280 -pix_fmt yuv420p \
      -g 30 -keyint_min 30 -sc_threshold 0 -flags +cgop \
      -force_key_frames "$KEYFRAMES" \
      -bf 0 \
      -c:a aac -b:a 128k -ar 48000 -ac 2 \
      -movflags +faststart \
      "$OUT/story.mp4"

    # ⚠️ `-bf 0` AND `-flags +cgop`, AND THEY ARE NOT TIDINESS.
    #
    # B-frames make the decoder hold a reorder queue, which every seek has to
    # drain — and WebKit had a seek bug caused specifically by them, fixed only
    # in Safari 26.0: "Fixed MP4 seeking with b-frames to prevent out-of-order
    # frame display by suppressing frames with earlier presentation timestamps
    # following the seek point". Every iPhone below that release has it. A
    # closed GOP makes each group decodable on its own, so a sync sample really
    # is a place the decoder can start.
    #
    # WHAT IT COSTS: about +1.3 MB on top of the keyframes, +2.9 MB in total
    # against the old file — 11.6 MB to 14.5 MB. It is the background of a story
    # that is fetched once.
    echo "-> story.webm (720x1280 vp9, two-pass)"
    PASSLOG="$(mktemp -d)/vp9"
    ffmpeg -nostdin -v error -y -i "$SRC" \
      -c:v libvpx-vp9 -b:v 0 -crf 32 -row-mt 1 -g 30 \
      -vf scale=720:1280 -pix_fmt yuv420p \
      -pass 1 -passlogfile "$PASSLOG" -an -f null /dev/null
    ffmpeg -nostdin -v error -y -i "$SRC" \
      -c:v libvpx-vp9 -b:v 0 -crf 32 -row-mt 1 -g 30 \
      -vf scale=720:1280 -pix_fmt yuv420p \
      -pass 2 -passlogfile "$PASSLOG" -c:a libopus -b:a 96k -ar 48000 -ac 2 \
      "$OUT/story.webm"
    ;;

  *)
    echo "usage: $0 dev|prod [source.mp4]" >&2
    exit 2
    ;;
esac

echo "--- $OUT ---"
ls -lh "$OUT"
