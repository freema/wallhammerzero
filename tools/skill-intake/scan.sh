#!/bin/sh
# Scan a local folder with NVIDIA SkillSpector: in Docker, offline, static analysis only.
#
#   tools/skill-intake/scan.sh [options] <folder>
#
#   -r, --recursive      scan each direct subfolder that has a SKILL.md as its own skill
#   --name <name>        name of the report files (default: the folder's name)
#   --out <dir>          where the reports go (default:
#                        .tools/skill-intake/reports/<name>-<checksum of the folder's path>/,
#                        so two sources whose folders have one name never share a report folder)
#   --baseline <file>    our own baseline of accepted findings (never the skill author's)
#
# Writes <name>.json and <name>.md, then prints the counts of the findings.
#
# Exit code: 0  risk score at most 50 and the analysis was complete
#            1  risk score above 50, or the analysis was incomplete: read the report and triage
#            2  the scan did not run, or its report is unusable
#
# The scanner container has no network, no host environment (so no API key can reach it), a
# read-only root and a read-only view of the folder. Nothing from the folder is executed.
# The first run builds the image, which needs the network once.
# Procedure: security/skill-intake/README.md
set -eu

usage() {
  sed -n '2,22p' "$0" | sed 's/^# \{0,1\}//'
}

fail() {
  echo "scan: $*" >&2
  exit 2
}

here=$(CDPATH='' cd -- "$(dirname -- "$0")" && pwd -P)
root=$(CDPATH='' cd -- "$here/../.." && pwd -P)

recursive=''
name=''
out=''
baseline=''
target=''
while [ $# -gt 0 ]; do
  case "$1" in
    -h | --help)
      usage
      exit 0
      ;;
    -r | --recursive) recursive=1 ;;
    --name | --out | --baseline)
      [ $# -ge 2 ] || fail "$1 needs a value"
      case "$1" in
        --name) name=$2 ;;
        --out) out=$2 ;;
        --baseline) baseline=$2 ;;
      esac
      shift
      ;;
    --)
      shift
      [ $# -le 1 ] || fail "one folder at a time"
      target=${1:-}
      break
      ;;
    -*) fail "unknown option $1 (see --help)" ;;
    *)
      [ -z "$target" ] || fail "one folder at a time (got '$target' and '$1')"
      target=$1
      ;;
  esac
  shift
done

if [ -z "$target" ]; then
  usage >&2
  exit 2
fi
[ -d "$target" ] || fail "'$target' is not a folder"
target=$(CDPATH='' cd -- "$target" && pwd -P)

safe_name() {
  printf '%s\n' "$1" | grep -Eq '^[A-Za-z0-9][A-Za-z0-9._-]*$'
}

folder=$(basename -- "$target")
[ -n "$name" ] || name=$folder
safe_name "$name" || fail "the report name '$name' must be letters, digits, '.', '_' or '-': pass --name"
# The scanner names a skill after its folder, so keep the folder's name inside the container.
safe_name "$folder" || folder=target

if [ -n "$baseline" ]; then
  [ -f "$baseline" ] || fail "the baseline '$baseline' is not a file"
  baseline_dir=$(CDPATH='' cd -- "$(dirname -- "$baseline")" && pwd -P)
  baseline_file=$(basename -- "$baseline")
  # A baseline that ships inside the scanned folder is its author's, and would silence our scan.
  case "$baseline_dir/" in
    "$target"/*) fail "the baseline is inside the scanned folder: use our own (security/skill-intake/)" ;;
  esac
  safe_name "$baseline_file" || fail "the baseline file name '$baseline_file' must be letters, digits, '.', '_' or '-'"
fi

# The scanned folder is never written to: check the report folder before creating it, and
# again once symlinks are resolved.
# The default report folder is unique per scanned source: its name and a checksum of its
# absolute path. "skills" of one repo and "skills" of another do not overwrite each other, and
# a second scan of the same folder goes to the same place.
[ -n "$out" ] || out="$root/.tools/skill-intake/reports/$name-$(printf '%s' "$target" | cksum | cut -d ' ' -f 1)"
case "$out" in
  /*) ;;
  *) out="$(pwd -P)/$out" ;;
esac
inside_target() {
  case "$1/" in
    "$target"/*) fail "the report folder is inside the scanned folder" ;;
  esac
}
inside_target "$out"
mkdir -p -- "$out"
out=$(CDPATH='' cd -- "$out" && pwd -P)
inside_target "$out"

case "$target$out${baseline:+$baseline_dir}" in
  *:*) fail "Docker cannot mount a path with ':' in it" ;;
esac

command -v docker >/dev/null 2>&1 || fail "docker is not on the PATH (everything runs in Docker, D16)"

# The pin lives in the Dockerfile only.
pin() {
  sed -n "s/^ARG $1=\(.*\)\$/\1/p" "$here/Dockerfile" | head -n 1
}
version=$(pin SKILLSPECTOR_VERSION)
commit=$(pin SKILLSPECTOR_COMMIT)
[ -n "$version" ] && [ -n "$commit" ] || fail "cannot read the SkillSpector pin from $here/Dockerfile"
recipe=$(cksum <"$here/Dockerfile" | cut -d ' ' -f 1)
image="whz-skillspector:$version-$(printf '%s' "$commit" | cut -c1-7)"

built=$(docker image inspect --format '{{ index .Config.Labels "whz.skillspector.recipe" }}' "$image" 2>/dev/null || true)
if [ "$built" != "$recipe" ]; then
  echo "[skill-intake] building $image from the pinned commit (this step needs the network)" >&2
  docker build --quiet --label "whz.skillspector.recipe=$recipe" --tag "$image" - <"$here/Dockerfile" >&2 ||
    fail "cannot build $image"
fi

# One scanner run. $1 is the output format, $2 the file extension of the report.
# The only variable the container gets is HOME, a literal: nothing is forwarded from the host.
run_scanner() {
  set -- "$1" "$2" \
    --rm --network none --read-only --cap-drop ALL --security-opt no-new-privileges \
    --user "$(id -u):$(id -g)" --tmpfs /tmp --env HOME=/tmp \
    --volume "$target:/scan/$folder:ro" --volume "$out:/out"
  [ -z "$baseline" ] || set -- "$@" --volume "$baseline_dir/$baseline_file:/baseline/$baseline_file:ro"
  format=$1
  extension=$2
  shift 2
  set -- "$@" "$image" scan "/scan/$folder" --no-llm --fail-on-incomplete \
    --format "$format" --output "/out/$name.$extension"
  [ -z "$recursive" ] || set -- "$@" --recursive
  [ -z "$baseline" ] || set -- "$@" --baseline "/baseline/$baseline_file" --show-suppressed
  docker run "$@"
}

rm -f -- "$out/$name.json" "$out/$name.md"

echo "[skill-intake] scanning $target with SkillSpector $version (no network, no LLM)" >&2
code=0
run_scanner json json </dev/null >&2 || code=$?
case "$code" in
  0 | 1) ;;
  *) fail "the scanner failed (exit $code)" ;;
esac
[ -s "$out/$name.json" ] || fail "the scanner wrote no JSON report"

# The same scan again for the Markdown report: the scanner writes one format per run.
code_md=0
run_scanner markdown md </dev/null >/dev/null 2>&1 || code_md=$?
[ "$code_md" = "$code" ] || fail "the Markdown run exited $code_md, the JSON run $code"
[ -s "$out/$name.md" ] || fail "the scanner wrote no Markdown report"

# The counts come from the JSON report, through the dev container (Node; nothing on the host).
"$root/dev" node /work/tools/skill-intake/summary.mjs - <"$out/$name.json" ||
  fail "cannot summarise $out/$name.json"

echo "reports:        $out/$name.json"
echo "                $out/$name.md"
if [ "$code" = 0 ]; then
  echo "exit:           0 (risk score at most 50, analysis complete)"
else
  echo "exit:           1 (risk score above 50 or incomplete analysis: triage every HIGH and CRITICAL)"
fi
exit "$code"
