#!/usr/bin/env bash
# TaskCompleted gate for PileScan agent teams.
#
# Blocks a teammate from marking a task complete (exit 2, reason on stderr) when:
#   1. its directories have uncommitted changes, or
#   2. the fast checks for its directories fail.
# The teammate is identified by its name (frontend, backend, integration, vision, qa) or its
# agent type (frontend-dev, backend-dev, vision-dev, qa). Anyone else (the lead, unknown
# names) is never blocked.
#
# Environment problems (missing tool, wrong version) never block: they print a warning.
# Turn the gate off with PILESCAN_TASK_GATE=off (for example in .claude/settings.local.json
# under "env").
#
# Written for macOS bash 3.2: no associative arrays, no jq.

set -u

if [ "${PILESCAN_TASK_GATE:-on}" = "off" ]; then
  exit 0
fi

ROOT="${CLAUDE_PROJECT_DIR:-$(pwd)}"
LOG="$ROOT/.claude/hooks/task-gate.log"   # *.log is git-ignored
INPUT="$(cat)"

json_field() {
  # Extracts a top-level string field from the hook's JSON input without jq.
  printf '%s' "$INPUT" | tr '\n' ' ' |
    sed -n "s/.*\"$1\"[[:space:]]*:[[:space:]]*\"\([^\"]*\)\".*/\1/p" | head -n 1
}

TEAMMATE="$(json_field teammate_name)"
AGENT_TYPE="$(json_field agent_type)"
TASK="$(json_field task_subject)"
WHO="${TEAMMATE:-$AGENT_TYPE}"

{
  printf '%s who=%s task=%s\n' "$(date '+%Y-%m-%dT%H:%M:%S')" "${WHO:-?}" "${TASK:-?}"
  printf '  input: %s\n' "$(printf '%s' "$INPUT" | tr '\n' ' ' | cut -c1-400)"
} >> "$LOG" 2>/dev/null

case "$WHO" in
  frontend|frontend-dev) DIRS="frontend" ;;
  backend|backend-dev)   DIRS="backend" ;;
  integration)           DIRS="backend frontend" ;;
  vision|vision-dev)     DIRS="inference" ;;
  qa)                    DIRS="tests eval" ;;
  *)                     exit 0 ;;
esac

cd "$ROOT" || exit 0
FAILED=""
OUT="$(mktemp -t task-gate.XXXXXX 2>/dev/null || echo /tmp/task-gate.$$)"

warn() { printf 'task-gate: %s\n' "$1" >&2; }

run_check() {
  # run_check <label> <dir> <command...>: records a failure with the output's last lines.
  label="$1"; dir="$2"; shift 2
  if ! ( cd "$ROOT/$dir" && "$@" ) > "$OUT" 2>&1; then
    FAILED="${FAILED}
--- ${label} failed (in ${dir}/): $*
$(tail -n 25 "$OUT")"
  fi
}

node_ok() {
  # frontend engines: ^22.22.3 || >=24.15.0
  v="$(node -v 2>/dev/null | sed 's/^v//')"
  [ -n "$v" ] || return 1
  major="${v%%.*}"; rest="${v#*.}"; minor="${rest%%.*}"; patch="${rest#*.}"; patch="${patch%%[!0-9]*}"
  if [ "$major" -eq 22 ]; then
    [ "$minor" -gt 22 ] || { [ "$minor" -eq 22 ] && [ "${patch:-0}" -ge 3 ]; }
  elif [ "$major" -eq 24 ]; then
    [ "$minor" -ge 15 ]
  else
    [ "$major" -gt 24 ]
  fi
}

fe_run() {
  # Runs a frontend command on a supported Node, falling back to Node 24 through npx.
  if node_ok; then "$@"; else npx -y -p node@24 "$@"; fi
}

java_ok() {
  v="$(java -version 2>&1 | sed -n 's/.*version "\([0-9]*\).*/\1/p' | head -n 1)"
  [ -n "$v" ] && [ "$v" -ge 21 ]
}

# 1. Uncommitted work in the teammate's directories.
DIRTY="$(git status --porcelain -- $DIRS 2>/dev/null)"
if [ -n "$DIRTY" ]; then
  FAILED="${FAILED}
--- uncommitted changes in: ${DIRS}
$(printf '%s\n' "$DIRTY" | head -n 20)
Commit your work (explicit paths, Conventional Commits) before completing the task."
fi

# 2. Fast checks per directory.
for d in $DIRS; do
  case "$d" in
    frontend)
      if ! command -v node >/dev/null 2>&1; then
        warn "node not found: skipped frontend checks"
      elif [ ! -d frontend/node_modules ]; then
        warn "frontend/node_modules missing: run 'npm ci' in frontend/. Skipped frontend checks"
      elif ! node_ok && ! command -v npx >/dev/null 2>&1; then
        warn "node too old and npx missing: skipped frontend checks"
      else
        run_check "frontend check:api" frontend fe_run node scripts/check-api.mjs
        run_check "frontend unit tests" frontend fe_run npm test --silent
      fi
      ;;
    backend)
      if [ ! -x backend/mvnw ]; then
        warn "backend/mvnw missing or not executable: skipped backend tests"
      elif ! java_ok; then
        warn "Java 21+ not found: skipped backend unit tests"
      else
        run_check "backend unit tests" backend ./mvnw -q test
      fi
      ;;
    inference)
      if ! command -v uv >/dev/null 2>&1; then
        warn "uv not found: skipped inference checks"
      else
        run_check "inference tests" inference uv run pytest -q -x
        run_check "inference ruff" inference uv run ruff check .
      fi
      ;;
    eval)
      if ! command -v uv >/dev/null 2>&1; then
        warn "uv not found: skipped eval tests"
      else
        run_check "eval unit tests" eval uv run pytest -q tests
      fi
      ;;
    tests)
      run_check "static frontend-client check" tests bash static/check-frontend-client.sh
      ;;
  esac
done

rm -f "$OUT"

if [ -n "$FAILED" ]; then
  {
    printf 'Task not completed: the quality gate failed for %s.%s\n' "$WHO" "$FAILED"
    case "$DIRS" in
      *frontend*) printf '\nIf a frontend error mentions esbuild or a platform mismatch, run "npm ci" in frontend/.\n' ;;
    esac
    printf '\nFix the cause and complete the task again. If the failure is environmental (tooling, not your code), message team-lead instead of retrying.\n'
  } >&2
  printf '%s BLOCKED %s\n' "$(date '+%Y-%m-%dT%H:%M:%S')" "$WHO" >> "$LOG" 2>/dev/null
  exit 2
fi

printf '%s passed %s\n' "$(date '+%Y-%m-%dT%H:%M:%S')" "$WHO" >> "$LOG" 2>/dev/null
exit 0
