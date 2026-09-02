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
#   -an                strip audio. The soundtrack ships as a separate <audio>
#                      so the video can stay permanently `muted` (kills a whole
#                      class of autoplay failures) and swapping the track is a
#                      1.5 MB asset change rather than a 30 MB re-encode.
set -euo pipefail

MODE="${1:-dev}"
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
REFS="$ROOT/_refs"
OUT="$ROOT/public/video"
mkdir -p "$OUT"

CLEAN="$REFS/DP-15152 - clean bg.mp4"
PREVIEW="$REFS/DP-15152 - preview.mp4"

need() { [ -f "$1" ] || { echo "missing: $1" >&2; exit 1; }; }

case "$MODE" in
  dev)
    # Proxies for the lab underlay. Quality is irrelevant here, alignment isn't:
    # keep the exact frame rate and duration so timecodes still match.
    need "$CLEAN"; need "$PREVIEW"
    for pair in "clean:$CLEAN" "preview:$PREVIEW"; do
      name="${pair%%:*}"; src="${pair#*:}"
      echo "-> ref-$name.mp4 (540x960 proxy)"
      ffmpeg -nostdin -v error -y -i "$src" \
        -c:v libx264 -preset ultrafast -crf 30 \
        -vf scale=540:960 -pix_fmt yuv420p \
        -g 30 -keyint_min 30 -sc_threshold 0 \
        -movflags +faststart -an \
        "$OUT/ref-$name.mp4"
    done
    ;;

  prod)
    # 720x1280 is what Thor shipped and what looked fine on these devices; the
    # stage is only ~400 CSS px wide on a phone. If banding shows up in the
    # starfield, lower the CRF first (24 -> 21, ~+8 MB); only then consider
    # 810x1440. Do NOT reach for 1080x1920 — 4x the bytes for detail no phone
    # displays.
    SRC="${2:-$CLEAN}"
    need "$SRC"
    echo "-> story.mp4 (720x1280 h264)"
    ffmpeg -nostdin -v error -y -i "$SRC" \
      -c:v libx264 -preset slow -crf 24 -profile:v high -level 4.0 \
      -vf scale=720:1280 -pix_fmt yuv420p \
      -g 30 -keyint_min 30 -sc_threshold 0 \
      -movflags +faststart -an \
      "$OUT/story.mp4"

    echo "-> story.webm (720x1280 vp9, two-pass)"
    PASSLOG="$(mktemp -d)/vp9"
    ffmpeg -nostdin -v error -y -i "$SRC" \
      -c:v libvpx-vp9 -b:v 0 -crf 32 -row-mt 1 -g 30 \
      -vf scale=720:1280 -pix_fmt yuv420p \
      -pass 1 -passlogfile "$PASSLOG" -an -f null /dev/null
    ffmpeg -nostdin -v error -y -i "$SRC" \
      -c:v libvpx-vp9 -b:v 0 -crf 32 -row-mt 1 -g 30 \
      -vf scale=720:1280 -pix_fmt yuv420p \
      -pass 2 -passlogfile "$PASSLOG" -an \
      "$OUT/story.webm"
    ;;

  *)
    echo "usage: $0 dev|prod [source.mp4]" >&2
    exit 2
    ;;
esac

echo "--- $OUT ---"
ls -lh "$OUT"
