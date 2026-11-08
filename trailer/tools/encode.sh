#!/bin/sh
# frames/<clip>/0000.jpg ... -> public/footage/<clip>.mp4
set -e
SRC=${1:-frames}
mkdir -p public/footage
for d in "$SRC"/*/; do
  c=$(basename "$d")
  ffmpeg -loglevel error -y -framerate 30 -i "$d/%04d.jpg" -c:v libx264 -preset slow -crf 17 -pix_fmt yuv420p -movflags +faststart "public/footage/$c.mp4"
  echo "$c"
done
