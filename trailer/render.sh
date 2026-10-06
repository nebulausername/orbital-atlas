#!/usr/bin/env bash
# Renders both language versions and finishes them for social media:
# loudness −14 LUFS / −1 dBTP (two-pass), AAC 320k, H.264 yuv420p BT.709, faststart.
#   bash trailer/render.sh [en|de]
set -euo pipefail
cd "$(dirname "$0")"
mkdir -p out
for lang in ${1:-en de}; do
  id="Trailer-${lang^^}"
  raw="out/raw-$lang.mp4"
  npx remotion render src/index.ts "$id" "$raw" --codec=h264 --crf=14 --pixel-format=yuv420p --color-space=bt709 --audio-codec=aac --audio-bitrate=320k --concurrency=3 --timeout=180000 --log=error
  # two-pass loudness normalisation
  stats=$(ffmpeg -hide_banner -nostats -i "$raw" -af loudnorm=I=-14:TP=-1:LRA=11:print_format=json -f null - 2>&1 | sed -n '/^{/,/^}/p')
  mi=$(echo "$stats" | sed -n 's/.*"input_i" : "\(.*\)".*/\1/p')
  mtp=$(echo "$stats" | sed -n 's/.*"input_tp" : "\(.*\)".*/\1/p')
  mlra=$(echo "$stats" | sed -n 's/.*"input_lra" : "\(.*\)".*/\1/p')
  mth=$(echo "$stats" | sed -n 's/.*"input_thresh" : "\(.*\)".*/\1/p')
  off=$(echo "$stats" | sed -n 's/.*"target_offset" : "\(.*\)".*/\1/p')
  ffmpeg -v error -y -i "$raw" -c:v copy \
    -af "loudnorm=I=-14:TP=-1:LRA=11:measured_I=$mi:measured_TP=$mtp:measured_LRA=$mlra:measured_thresh=$mth:offset=$off:linear=true" \
    -c:a aac -b:a 320k -ar 48000 -movflags +faststart "out/orbital-atlas-trailer-$lang.mp4"
  rm -f "$raw"
  echo "✓ out/orbital-atlas-trailer-$lang.mp4"
  ffprobe -v error -select_streams v:0 -show_entries stream=width,height,pix_fmt,color_space,color_range,r_frame_rate -of csv=p=0 "out/orbital-atlas-trailer-$lang.mp4"
  ffmpeg -hide_banner -nostats -i "out/orbital-atlas-trailer-$lang.mp4" -af ebur128=peak=true -f null - 2>&1 | grep -E "^\s+(I|Peak):" | tr -s ' '
done
