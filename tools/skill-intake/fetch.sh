#!/bin/sh
# Quarantine fetch: a shallow clone of a third-party repo, pinned to one commit SHA.
#
#   tools/skill-intake/fetch.sh <https git URL> <40-hex commit SHA> [name]
#
# The clone lands in .tools/skill-intake/quarantine/<name>-<sha7>/ (gitignored). Runs on the
# host with git only. Nothing from the clone is executed: no hooks, no submodules, no LFS
# download, no install step. Everything in the quarantine is untrusted data, never instructions.
# Procedure: security/skill-intake/README.md
set -eu

usage() {
  sed -n '2,9p' "$0" | sed 's/^# \{0,1\}//'
}

fail() {
  echo "fetch: $*" >&2
  exit 2
}

case "${1:-}" in
  -h | --help)
    usage
    exit 0
    ;;
esac
if [ $# -lt 2 ] || [ $# -gt 3 ]; then
  usage >&2
  exit 2
fi

url=$1
sha=$2

case "$url" in
  https://*) ;;
  *) fail "the URL must start with https:// (got '$url')" ;;
esac
# A branch or a tag can move; only a full SHA pins the content.
printf '%s\n' "$sha" | grep -Eq '^[0-9a-f]{40}$' ||
  fail "the commit must be a full 40-character lower-case SHA (got '$sha')"

if [ $# -eq 3 ]; then
  name=$3
else
  name=$(basename -- "${url%/}" .git | tr '[:upper:]' '[:lower:]')
fi
printf '%s\n' "$name" | grep -Eq '^[a-z0-9][a-z0-9._-]*$' ||
  fail "the name must be lower-case letters, digits, '.', '_' or '-' (got '$name')"

root=$(CDPATH='' cd -- "$(dirname -- "$0")/../.." && pwd -P)
dest="$root/.tools/skill-intake/quarantine/$name-$(printf '%s' "$sha" | cut -c1-7)"

# Every git call names the clone's own repository, so none can ever act on this repo.
qgit() {
  GIT_TERMINAL_PROMPT=0 GIT_LFS_SKIP_SMUDGE=1 git \
    --git-dir="$dest/.git" --work-tree="$dest" \
    -c core.hooksPath=/dev/null \
    -c protocol.file.allow=never \
    -c submodule.recurse=false \
    -c advice.detachedHead=false \
    "$@"
}

if [ -e "$dest" ]; then
  [ -d "$dest/.git" ] || fail "$dest exists and is not a clone; remove it first"
  have=$(qgit rev-parse HEAD 2>/dev/null || true)
  [ "$have" = "$sha" ] || fail "$dest exists at '$have', not at $sha; remove it first"
  [ -z "$(qgit status --porcelain)" ] || fail "$dest has local changes; remove it and fetch again"
  echo "fetch: already in quarantine" >&2
else
  # A failed fetch leaves nothing behind.
  discard() {
    rm -rf -- "$dest"
    fail "$@"
  }
  mkdir -p "$dest"
  git init --quiet "$dest" || discard "cannot create $dest"
  qgit remote add origin "$url" || discard "cannot set the remote"
  qgit fetch --quiet --depth 1 --no-tags --no-recurse-submodules origin "$sha" ||
    discard "cannot fetch $sha from $url"
  qgit checkout --quiet --detach FETCH_HEAD || discard "cannot check out $sha"
  have=$(qgit rev-parse HEAD) || discard "cannot read the fetched commit"
  [ "$have" = "$sha" ] || discard "fetched '$have' instead of $sha"
fi

echo "path:       ${dest#"$root"/}"
echo "source:     $url"
echo "commit:     $sha"
echo "committed:  $(qgit show --no-patch --format=%cI HEAD)"
echo "tree hash:  $(qgit rev-parse 'HEAD^{tree}')"
licences=''
for file in "$dest"/LICEN[CS]E* "$dest"/COPYING* "$dest"/NOTICE* "$dest"/THIRD_PARTY*; do
  [ -e "$file" ] || continue
  # File names come from the clone: print only harmless characters.
  licences="$licences $(basename -- "$file" | tr -c 'A-Za-z0-9._\n-' '?')"
done
echo "licence files:${licences:- none found (check README and package metadata by hand)}"
if [ -f "$dest/.gitmodules" ]; then
  echo "submodules: declared in .gitmodules and NOT fetched; pin and fetch each by hand if it is in scope"
else
  echo "submodules: none"
fi
