#!/usr/bin/env bash
# Pick the usable cut-out asset out of a Figma node's raw image fills.
#
# WHY THIS EXISTS
# The 3D object nodes in the Alpa Hub file (21770:2722 … 21770:2737, 2710, 2714, 2718)
# are rounded-rectangles carrying a SOLID #2F3646 fill plus 6–8 stacked image fills.
# `download_assets.export` therefore renders the object ON TOP OF an opaque navy square —
# useless for a flying object over video. The usable asset is one of the raw image fills:
# the one that is RGBA, has a transparent corner pixel, and is the largest.
#
# Verified on the pen (21770:2722): of 6 fills, #1/#4 are opaque 314px, #2/#5 are opaque
# rgb24 1254px, #3 is RGBA 1254px transparent (the asset), #6 is RGBA 314px transparent
# (same art, lower res).
#
# USAGE
#   scripts/figma-pick-transparent.sh <manifest> <out-dir>
# manifest lines: "<name> <figma-asset-id> <figma-asset-id> ..."
# Get the ids from the `rawImages[].url` list returned by the Figma MCP `download_assets`
# tool. The URLs are short-lived — run this in the same session you fetched them.
set -uo pipefail

MANIFEST="${1:?usage: $0 <manifest> <out-dir>}"
OUT="${2:?usage: $0 <manifest> <out-dir>}"
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT
mkdir -p "$OUT"

printf '%-14s %-6s %-12s %s\n' OBJECT PICK WxH SIZE
fail=0

while read -r name ids; do
  [ -z "${name:-}" ] && continue
  case "$name" in \#*) continue ;; esac

  best=''; bestpx=0; bestwh=''; bestk=0; k=0
  for id in $ids; do
    k=$((k + 1))
    f="$TMP/${name}_$k.png"
    curl -sL -o "$f" "https://www.figma.com/api/mcp/asset/$id" </dev/null || continue

    info=$(ffprobe -v error -show_entries stream=width,height,pix_fmt \
             -of csv=p=0 "$f" </dev/null 2>/dev/null) || continue
    [ -z "$info" ] && continue
    w=${info%%,*}; rest=${info#*,}; h=${rest%%,*}; pf=${rest#*,}
    [ "$pf" = rgba ] || continue

    # corner alpha must be 0 -> the art is a real cut-out, not a padded square
    a=$(ffmpeg -nostdin -v error -i "$f" -vf 'crop=2:2:0:0,format=rgba' \
          -f rawvideo -pix_fmt rgba - 2>/dev/null | od -An -tu1 -N4 | awk '{print $4}')
    [ "${a:-255}" = 0 ] || continue

    px=$((w * h))
    if [ "$px" -gt "$bestpx" ]; then
      bestpx=$px; best=$f; bestwh="${w}x${h}"; bestk=$k
    fi
  done

  if [ -z "$best" ]; then
    printf '%-14s %-6s %-12s %s\n' "$name" FAIL - 'no transparent RGBA fill'
    fail=$((fail + 1))
    continue
  fi

  cwebp -quiet -q 90 -alpha_q 100 -m 6 "$best" -o "$OUT/$name.webp"
  printf '%-14s %-6s %-12s %s\n' "$name" "#$bestk" "$bestwh" "$(du -h "$OUT/$name.webp" | cut -f1)"
done < "$MANIFEST"

echo "---"
du -shc "$OUT"/*.webp 2>/dev/null | tail -1
[ "$fail" -eq 0 ] || { echo "FAILED: $fail asset(s)"; exit 1; }
