#!/bin/sh
# Entrypoint of every Node service in compose.yaml.
#
# 1. As root: give the roots of the named volumes to the host user. A new named volume is
#    root-owned, and the host UID is only known at run time.
# 2. Drop to WHZ_UID:WHZ_GID for good, so files written to the bind mount belong to the host user.
# 3. If node_modules is behind package-lock.json, run `npm ci` (one container at a time).
# 4. exec the command, so its exit code is the container's exit code.
set -eu

: "${WHZ_UID:?WHZ_UID is not set: run this through ./dev}"
: "${WHZ_GID:?WHZ_GID is not set: run this through ./dev}"

if [ "$(id -u)" = 0 ] && [ "${WHZ_DROPPED:-0}" != 1 ]; then
  for dir in /work/node_modules "$HOME" "$HOME/.npm"; do
    mkdir -p "$dir"
    [ "$(stat -c %u:%g "$dir")" = "$WHZ_UID:$WHZ_GID" ] || chown "$WHZ_UID:$WHZ_GID" "$dir"
  done
  export WHZ_DROPPED=1
  exec setpriv --reuid "$WHZ_UID" --regid "$WHZ_GID" --clear-groups -- /bin/sh "$0" "$@"
fi

[ $# -gt 0 ] || { echo "entrypoint: no command given" >&2; exit 2; }

# Commands that install on their own are left alone.
installs_itself() {
  [ "${1:-}" = npm ] || return 1
  case "${2:-}" in
    ci | install | i | add | uninstall | remove | rm | un | update | up | upgrade | dedupe | prune | install-test | it | clean-install | install-clean) return 0 ;;
  esac
  return 1
}

in_sync() {
  node /work/tools/dev-env/deps-in-sync.mjs /work
}

if [ "${WHZ_SKIP_INSTALL:-0}" != 1 ] && [ -f /work/package-lock.json ] && ! installs_itself "$@"; then
  if ! in_sync >/dev/null; then
    # The lock is the node_modules mount point itself: `npm ci` empties the directory, so a
    # lock file inside it would not survive.
    (
      flock 9
      if ! reason=$(in_sync); then
        echo "[dev] node_modules is behind package-lock.json ($reason): running npm ci" >&2
        cd /work
        npm ci >&2
      fi
    ) 9</work/node_modules
  fi
fi

exec "$@"
