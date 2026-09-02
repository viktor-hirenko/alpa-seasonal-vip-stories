#!/usr/bin/env bash
# Pull reference stills out of the preview clip for offline pose checks.
#
# The live underlay in the lab (`?bg=preview`) is the primary fidelity tool —
# it runs at 30 fps so it verifies MOTION, not just static poses. These stills
# are the fallback for when the 187 MB reference isn't available.
#
# Timecodes are the slide cuts plus the entrance/exit landmarks, each offset by
# LEAD so the frame shows the NEW page, settled, rather than the last frame of
# the previous one or a frame from the middle of the page turn. The default
# clears TIMING.flip.out + TIMING.flip.back (see the note in src/lab/Lab.vue).
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
SRC="$ROOT/_refs/DP-15152 - preview.mp4"
OUT="$ROOT/_refs/frames"
LEAD="${LEAD:-0.95}"
[ -f "$SRC" ] || { echo "missing: $SRC" >&2; exit 1; }
mkdir -p "$OUT"

# Slide cuts (see _context/30-timecodes.md) plus entrance/exit landmarks.
CUTS="2.50 3.30 3.93 4.60 6.00 11.07 17.10 22.07 26.07 30.10 34.07 39.07 44.03 49.10 53.27 57.07 61.10 67.07 73.07 78.07 83.03 85.00 88.10 92.83"

for t in $CUTS; do
  at=$(python3 -c "print(f'{$t + $LEAD:.3f}')")
  name=$(python3 -c "print(f'{$t:07.3f}'.replace('.','_'))")
  ffmpeg -nostdin -v error -y -ss "$at" -i "$SRC" -frames:v 1 "$OUT/t${name}.png"
done

echo "--- $OUT ---"
ls "$OUT" | wc -l | xargs echo "frames:"
