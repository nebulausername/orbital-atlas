#!/usr/bin/env bash
# Encodes the recorded frames into one video per shot and copies the per-frame metadata
# the edit needs (zoom odometer, date counter).
#   bash trailer/shots.sh            # full recording (every frame)
#   bash trailer/shots.sh vorschau   # preview recording (every 6th frame, half size)
set -euo pipefail
cd "$(dirname "$0")"
SRC=public/aufnahmen
STEP=1
[[ "${1:-}" == "vorschau" ]] && SRC=public/aufnahmen-vorschau && STEP=6
mkdir -p public/shots src/data
for dir in "$SRC"/*/; do
  name=$(basename "$dir")
  # yuv420p + BT.709 tags: without them players guess full range and the ink turns grey
  ffmpeg -v error -y -pattern_type glob -framerate $((30 / STEP)) -i "$dir*.jpg" \
    -vf "scale=1080:1920:flags=lanczos,fps=30" -c:v libx264 -preset slow -crf 13 \
    -pix_fmt yuv420p -colorspace bt709 -color_primaries bt709 -color_trc bt709 -color_range tv \
    -movflags +faststart "public/shots/$name.mp4"
  echo "✓ $name $(ffprobe -v error -show_entries format=duration -of csv=p=0 "public/shots/$name.mp4") s"
done
cp "$SRC"/s1-zoomout.json "$SRC"/s5-rewind.json src/data/
if [[ -d public/aufnahmen-de && "$STEP" == 1 ]]; then
  for name in s2-galaxy s5-rewind s6-orrery; do
    [[ -d "public/aufnahmen-de/$name" ]] || continue
    ffmpeg -v error -y -pattern_type glob -framerate 30 -i "public/aufnahmen-de/$name/*.jpg" \
      -vf "scale=1080:1920:flags=lanczos" -c:v libx264 -preset slow -crf 13 \
      -pix_fmt yuv420p -colorspace bt709 -color_primaries bt709 -color_trc bt709 -color_range tv \
      -movflags +faststart "public/shots/$name-de.mp4"
    echo "✓ $name-de"
  done
fi
