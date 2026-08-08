#!/usr/bin/env bash
# Regenerates the audio fixtures used by import-formats.test.ts.
# Requires ffmpeg on PATH. Every file is ~0.3s of a 440Hz sine so the whole
# fixture set stays well under 200 KB.
set -euo pipefail
cd "$(dirname "$0")"

FF="${FFMPEG:-ffmpeg}"
TAGS=(-metadata "title=Fixture Title"
      -metadata "artist=Fixture Artist"
      -metadata "album=Fixture Album"
      -metadata "date=2024"
      -metadata "track=3/12"
      -metadata "disc=1/2")

gen() { # gen <output> <ffmpeg args...>
  local out="$1"; shift
  "$FF" -hide_banner -loglevel error -y -i source.wav "${TAGS[@]}" "$@" "$out"
}

"$FF" -hide_banner -loglevel error -y \
  -f lavfi -i "sine=frequency=440:duration=0.3:sample_rate=44100" \
  -ac 2 -c:a pcm_s16le source.wav

# 1x1 red PNG used as the embedded cover art.
printf '%s' 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==' \
  | base64 -d > cover.png

gen sample.wav  -c:a pcm_s16le
gen sample.mp3  -c:a libmp3lame -b:a 128k
gen sample.flac -c:a flac
gen sample.ogg  -c:a libvorbis -q:a 2
gen sample.opus -c:a libopus -b:a 64k
gen sample.m4a  -c:a aac -b:a 128k
gen sample.aac  -c:a aac -b:a 128k -f adts
gen sample.webm -c:a libopus -b:a 64k -f webm
gen sample.wma  -c:a wmav2 -b:a 128k
gen sample.alac -c:a alac -f ipod

# MP3 carrying an embedded front cover.
"$FF" -hide_banner -loglevel error -y -i source.wav -i cover.png \
  -map 0:a -map 1:v -c:a libmp3lame -b:a 128k -c:v copy -id3v2_version 3 \
  -metadata:s:v title="Album cover" -metadata:s:v comment="Cover (front)" \
  "${TAGS[@]}" with-cover.mp3

# FLAC with no tags at all — exercises the "Unknown Title" fallback.
"$FF" -hide_banner -loglevel error -y -i source.wav -map_metadata -1 \
  -c:a flac untagged.flac

rm -f source.wav cover.png

# Non-audio / malformed inputs.
printf 'this is definitely not audio\n' > not-audio.txt
head -c 4096 /dev/urandom > corrupt.mp3
: > empty.mp3

ls -la
