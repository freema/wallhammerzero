#!/bin/sh
# File-watch probe, host half. Run it ON THE HOST from anywhere in the repo:
#
#   tools/dev-env/watch-probe.sh [--json]
#
# It starts the container half (watch-probe.mjs) through ./dev and then writes files into
# .tools/watch-probe/ whenever the container asks for them, so the writes come from the host
# side of the bind mount, like the writes of Claude Code or an editor.
# Exit code: 0 = no event was missed, 3 = some were, anything else = the probe broke.
#
# It needs only a POSIX shell. While it waits for a command it spins on one core, on purpose:
# a sleep would add its own delay to the measured latency. A run takes about a minute.
set -eu

root=$(CDPATH='' cd -- "$(dirname -- "$0")/../.." && pwd -P)
dir="$root/.tools/watch-probe"
rm -rf "$dir"
mkdir -p "$dir/cmd" "$dir/files"

"$root/dev" node tools/dev-env/watch-probe.mjs /work/.tools/watch-probe "$@" &
container=$!
trap 'kill "$container" 2>/dev/null || true; rm -rf "$dir"' INT TERM

n=1
while :; do
  cmd="$dir/cmd/$n"
  if [ -e "$cmd" ]; then
    read -r op count name <"$cmd"
    i=0
    case "$op" in
      create)
        while [ "$i" -lt "$count" ]; do
          echo created >"$dir/files/$name-$i"
          i=$((i + 1))
        done
        ;;
      modify)
        while [ "$i" -lt "$count" ]; do
          echo modified >>"$dir/files/$name-$i"
          i=$((i + 1))
        done
        ;;
      rename)
        while [ "$i" -lt "$count" ]; do
          echo replaced >"$dir/files/.tmp-$name-$i"
          mv "$dir/files/.tmp-$name-$i" "$dir/files/$name-$i"
          i=$((i + 1))
        done
        ;;
      mkdir)
        while [ "$i" -lt "$count" ]; do
          mkdir "$dir/files/$name-$i.d"
          echo created >"$dir/files/$name-$i.d/file"
          i=$((i + 1))
        done
        ;;
      quit) break ;;
      *)
        echo "watch-probe: unknown command '$op'" >&2
        kill "$container" 2>/dev/null || true
        exit 1
        ;;
    esac
    n=$((n + 1))
  elif ! kill -0 "$container" 2>/dev/null; then
    break # the container half ended early; report its exit code below
  fi
done

status=0
wait "$container" || status=$?
rm -rf "$dir"
exit "$status"
