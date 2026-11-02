#!/usr/bin/env bash
# Static checks: the frontend must call the API only through the generated client.
set -uo pipefail
ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
SRC="$ROOT/frontend/src"
fail=0
[ -d "$SRC" ] || { echo "SKIPPED: $SRC missing"; exit 0; }

# Generated client location: first dir whose path contains api/generated or 'generated' (override with GEN_DIR).
GEN_DIR="${GEN_DIR:-$(find "$SRC" -type d \( -path '*generated*' -o -path '*/api-client*' \) -prune | head -1)}"
echo "generated client dir: ${GEN_DIR:-<not found>}"
[ -n "$GEN_DIR" ] || { echo "FAIL: no generated client directory found"; fail=1; }

excl=()
[ -n "$GEN_DIR" ] && excl=(--exclude-dir="$(basename "$GEN_DIR")")

echo "== hand-written /api URLs outside the generated client =="
if grep -rnE "['\"\`]/?(https?://[^'\"\`]+)?/api/" "$SRC" --include='*.ts' --include='*.html' "${excl[@]}" --exclude='*.spec.ts'; then fail=1; fi

echo "== HttpClient usage outside the generated client =="
if grep -rnE "HttpClient|fetch\(|XMLHttpRequest|axios" "$SRC" --include='*.ts' "${excl[@]}" --exclude='*.spec.ts' \
   | grep -vE "provideHttpClient|app\.config"; then fail=1; fi

echo "== 'any' type =="
if grep -rnE ":\s*any\b|<any>|as any" "$SRC" --include='*.ts' "${excl[@]}"; then fail=1; fi

echo "== generated client drift (npm run check:api) =="
if [ -f "$ROOT/frontend/package.json" ] && grep -q '"check:api"' "$ROOT/frontend/package.json"; then
  (cd "$ROOT/frontend" && npm run -s check:api) || fail=1
else
  echo "SKIPPED: frontend has no check:api script yet"
fi

[ $fail -eq 0 ] && echo "PASS" || echo "FAIL"
exit $fail
