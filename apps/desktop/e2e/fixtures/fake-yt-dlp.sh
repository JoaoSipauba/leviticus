#!/usr/bin/env bash
# Fake yt-dlp for E2E. Reads /tmp/fake-yt-dlp.mode to switch behavior.
# Covers 2 invocations the paste-URL flow emits:
#   metadata: yt-dlp --no-playlist --no-download --print "%(title)s|||%(uploader)s|||%(duration)s" <url>
#   download: yt-dlp --no-playlist -f bestaudio[ext=m4a]/bestaudio --newline --socket-timeout 10 -o <template> <url>
#
# Modes (read from /tmp/fake-yt-dlp.mode at every invocation):
#   happy            — return canned metadata; write fake .m4a on download
#   fail-metadata    — exit 1 with yt-dlp-style stderr on --print
#   fail-download    — return canned metadata, but exit 1 with stderr on -o
#
# Not covered (future): --flat-playlist (search tab), --get-url (preview).

MODE="$(cat /tmp/fake-yt-dlp.mode 2>/dev/null || echo happy)"

TITLE="${FAKE_YTDLP_TITLE:-Test Song Title}"
UPLOADER="${FAKE_YTDLP_UPLOADER:-Test Channel}"
DURATION="${FAKE_YTDLP_DURATION:-123}"

# ── Metadata path ────────────────────────────────────────────────────────────
if printf '%s\n' "$@" | grep -q -- '--print'; then
  if [ "$MODE" = "fail-metadata" ]; then
    echo "ERROR: [youtube] dQw4w9WgXcQ: Video unavailable" >&2
    exit 1
  fi
  printf '%s|||%s|||%s\n' "$TITLE" "$UPLOADER" "$DURATION"
  exit 0
fi

# ── Download path (find -o template, write fake .m4a) ────────────────────────
if [ "$MODE" = "fail-download" ]; then
  echo "ERROR: HTTPSConnectionPool(host='rr1---sn-test.googlevideo.com'): Read timed out." >&2
  exit 1
fi

prev=""
for arg in "$@"; do
  if [ "$prev" = "-o" ]; then
    out_path="$(printf '%s' "$arg" | sed 's/%(ext)s/m4a/g' | sed 's/\.\%([^)]*)s//g')"
    mkdir -p "$(dirname "$out_path")"
    head -c 1024 /dev/zero > "$out_path"
    echo "[download] Destination: $out_path"
    echo "[download] 100% of 1.00KiB"
    exit 0
  fi
  prev="$arg"
done

exit 1
