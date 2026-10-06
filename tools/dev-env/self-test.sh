#!/bin/sh
# Self-test of the ./dev wrapper. Run it ON THE HOST from anywhere in the repo:
#
#   tools/dev-env/self-test.sh
#
# The gate (./dev npm run check) runs inside the container, so it cannot test the wrapper that
# starts the container. This script does, from outside: exit codes pass through, wrong usage is
# exit 2, the output is the command's output only, the caller's folder is kept, and a failing
# check makes the gate command exit non-zero.
#
# Exit code: 0 = every case passed, 1 = at least one failed (each case prints ok or FAIL).
# It needs Docker and a POSIX shell, and takes about half a minute. It writes only to
# .tools/dev-self-test/ (gitignored) and removes that folder when it ends.
# WHZ_SELF_TEST_PORT (default 4101) is the host port the -p case publishes for a moment.
# Details: docs/dev-environment.md
set -u

root=$(CDPATH='' cd -- "$(dirname -- "$0")/../.." && pwd -P)
dev="$root/dev"
scratch="$root/.tools/dev-self-test"
port=${WHZ_SELF_TEST_PORT:-4101}

rm -rf "$scratch"
mkdir -p "$scratch/failing" "$scratch/passing" "$scratch/out"
trap 'rm -rf "$scratch"' EXIT
trap 'exit 130' INT TERM

passed=0
failed=0

ok() {
  passed=$((passed + 1))
  echo "ok    $1"
}

fail() {
  failed=$((failed + 1))
  echo "FAIL  $1"
  shift
  for line in "$@"; do echo "      $line"; done
}

# run <name>: runs the rest of the arguments from the repo root with stdin closed, and leaves
# the exit code in $code, stdout in $out_file and stderr in $err_file.
out_file="$scratch/out/stdout"
err_file="$scratch/out/stderr"
run() {
  code=0
  (cd "$root" && "$@") >"$out_file" 2>"$err_file" </dev/null || code=$?
}

# expect_code <name> <wanted>: checks $code of the last run.
expect_code() {
  if [ "$code" = "$2" ]; then
    ok "$1"
  else
    fail "$1" "exit code $code, expected $2" "stderr: $(head -n 5 "$err_file" | tr '\n' ' ')"
  fi
}

# expect_stdout <name> <wanted>: stdout of the last run must be exactly <wanted>.
expect_stdout() {
  got=$(cat "$out_file")
  if [ "$code" = 0 ] && [ "$got" = "$2" ]; then
    ok "$1"
  else
    fail "$1" "exit code $code, stdout '$got', expected exit code 0 and '$2'" "stderr: $(head -n 5 "$err_file" | tr '\n' ' ')"
  fi
}

# expect_stderr <name> <pattern>: stderr of the last run must have a line that matches.
expect_stderr() {
  if grep -Eq -- "$2" "$err_file"; then
    ok "$1"
  else
    fail "$1" "stderr has no line matching '$2'" "stderr: $(head -n 5 "$err_file" | tr '\n' ' ')"
  fi
}

command -v docker >/dev/null 2>&1 || {
  echo "self-test: docker is not on the PATH (everything runs in Docker, D16)" >&2
  exit 1
}

echo "self-test of $dev"

# --- exit codes pass through -----------------------------------------------------------------

run "$dev" true
expect_code "a command that succeeds is exit 0" 0

run "$dev" false
expect_code "a command that fails is its exit code (false: 1)" 1

run "$dev" sh -c 'exit 7'
expect_code "any exit code passes through (sh -c 'exit 7': 7)" 7

run "$dev" node -e 'process.exit(42)'
expect_code "the exit code of node passes through (42)" 42

run "$dev" whz-no-such-command
expect_code "a command that does not exist is exit 127" 127

run "$dev" -- sh -c 'exit 5'
expect_code "after --, the command still runs and its exit code passes through (5)" 5

# --- the output is the command's output ------------------------------------------------------

run "$dev" echo hello
expect_stdout "stdout holds only the command's output" hello

run "$dev" sh -c 'echo to-stderr >&2'
if [ "$code" = 0 ] && [ ! -s "$out_file" ]; then
  ok "what the command writes to stderr does not reach stdout"
else
  fail "what the command writes to stderr does not reach stdout" "exit code $code, stdout '$(cat "$out_file")'"
fi
expect_stderr "... and it reaches stderr" '^to-stderr'

code=0
got=$(cd "$root" && printf 'from the host\n' | "$dev" cat 2>"$err_file") || code=$?
if [ "$code" = 0 ] && [ "$got" = "from the host" ]; then
  ok "stdin reaches the command"
else
  fail "stdin reaches the command" "exit code $code, stdout '$got'"
fi

# --- the caller's folder and the environment -------------------------------------------------

run "$dev" pwd
expect_stdout "from the repo root the command runs in /work" /work

code=0
(cd "$root/tools/dev-env" && "$dev" pwd) >"$out_file" 2>"$err_file" </dev/null || code=$?
expect_stdout "from tools/dev-env the command runs in /work/tools/dev-env" /work/tools/dev-env

run "$dev" id -u
expect_stdout "the command runs as the host user" "$(id -u)"

run "$dev" sh -c 'echo "$WHZ_IN_CONTAINER"'
expect_stdout "the command runs in the container (WHZ_IN_CONTAINER=1)" 1

# --- wrong usage is exit 2 -------------------------------------------------------------------

run "$dev"
expect_code "no command: exit 2" 2
expect_stderr "... with the usage on stderr" 'docker compose run --rm dev'
if [ ! -s "$out_file" ]; then ok "... and nothing on stdout"; else fail "... and nothing on stdout" "stdout: $(cat "$out_file")"; fi

run "$dev" -p
expect_code "-p without a port: exit 2" 2
expect_stderr "... with the reason on stderr" '^dev: -p needs a port number'

run "$dev" -p http true
expect_code "-p with a port that is not a number: exit 2" 2
expect_stderr "... with the reason on stderr" "^dev: -p needs a port number, got 'http'"

run "$dev" -p 4101
expect_code "-p with a port and no command: exit 2" 2

run "$dev" --help
expect_code "--help: exit 0" 0
if grep -q 'docker compose run --rm dev' "$out_file"; then ok "... with the usage on stdout"; else fail "... with the usage on stdout" "stdout: $(head -n 3 "$out_file")"; fi

# --- -p and compose --------------------------------------------------------------------------

run "$dev" -p "$port" sh -c 'exit 6'
expect_code "with -p $port the command runs and its exit code passes through (6)" 6

run "$dev" compose config --services
if [ "$code" = 0 ] && grep -qx dev "$out_file"; then
  ok "./dev compose <args> runs docker compose for this checkout (config --services lists dev)"
else
  fail "./dev compose <args> runs docker compose for this checkout (config --services lists dev)" "exit code $code, stdout '$(cat "$out_file")'"
fi

run "$dev" compose no-such-subcommand
if [ "$code" != 0 ]; then ok "./dev compose passes a failure on (exit $code)"; else fail "./dev compose passes a failure on" "exit code 0"; fi

# Plain docker compose must stop: without the wrapper it would use another node_modules volume.
run env -u WHZ_ROOT -u WHZ_UID -u WHZ_GID -u COMPOSE_PROJECT_NAME docker compose --project-directory "$root" --file "$root/compose.yaml" config
if [ "$code" != 0 ] && grep -q 'run this through ./dev' "$err_file"; then
  ok "plain docker compose stops and says to use ./dev"
else
  fail "plain docker compose stops and says to use ./dev" "exit code $code" "stderr: $(head -n 3 "$err_file" | tr '\n' ' ')"
fi

# --- a failing check exits non-zero ----------------------------------------------------------
# Two small repos for the gate's aggregator (tools/check/run.mjs --root): one whose only check
# fails, one whose only check passes. The command line is the gate's, with another root.

cat >"$scratch/failing/package.json" <<'EOF'
{ "name": "self-test-failing", "private": true, "scripts": { "check:red": "node -e \"process.exit(3)\"" } }
EOF
cat >"$scratch/passing/package.json" <<'EOF'
{ "name": "self-test-passing", "private": true, "scripts": { "check:green": "node -e \"\"" } }
EOF

run "$dev" node tools/check/run.mjs --root .tools/dev-self-test/passing
expect_code "the gate's aggregator on a repo whose check passes: exit 0" 0

run "$dev" node tools/check/run.mjs --root .tools/dev-self-test/failing
if [ "$code" != 0 ] && grep -q '^FAIL  *root:red' "$out_file"; then
  ok "the gate's aggregator on a repo whose check fails: exit $code, and the summary names the check"
else
  fail "the gate's aggregator on a repo whose check fails: non-zero, and the summary names the check" "exit code $code" "stdout: $(tail -n 4 "$out_file" | tr '\n' ' ')"
fi

run "$dev" npm run check -- @whz/no-such-check
expect_code "npm run check with a check that does not exist: exit 2, through npm and the wrapper" 2

# A pipe would hide all of the above: the doc says never to pipe the gate. Show why.
code=0
(cd "$root" && "$dev" false | cat) >/dev/null 2>&1 </dev/null || code=$?
if [ "$code" = 0 ]; then
  ok "(why the gate is never piped: './dev false | cat' is exit 0)"
else
  fail "(why the gate is never piped: './dev false | cat' is exit 0)" "exit code $code"
fi

echo
if [ "$failed" = 0 ]; then
  echo "self-test: all $passed cases passed"
  exit 0
fi
echo "self-test: $failed of $((passed + failed)) cases FAILED"
exit 1
