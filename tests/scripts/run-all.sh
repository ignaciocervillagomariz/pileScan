#!/usr/bin/env bash
# Runs every suite, continues on failure, prints a summary. Requires the stack to be up (npm run stack:e2e).
cd "$(dirname "$0")/.."
declare -a names codes
for s in lint:spec test:static test:contract test:e2e; do
  echo; echo "=== $s ==="; npm run -s "$s"; names+=("$s"); codes+=($?)
done
echo; echo "=== summary ==="; rc=0
for i in "${!names[@]}"; do [ "${codes[$i]}" -eq 0 ] && r=PASS || { r=FAIL; rc=1; }; echo "$r ${names[$i]}"; done
exit $rc
