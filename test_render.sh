#!/usr/bin/env bash
set -euo pipefail
cd -- "$(dirname -- "${BASH_SOURCE[0]}")"

tmp=$(mktemp -d "${TMPDIR:-/tmp}/arshjul-test.XXXXXXXX")
trap 'rm -rf -- "$tmp"' EXIT

check_page() {
  local name=$1
  shift
  typst compile --format svg "$@" arshjul.typ "$tmp/$name-{p}.svg"
  local pages=("$tmp/$name-"*.svg)
  [[ ${#pages[@]} == 1 && -f ${pages[0]} ]]
  # Typst's SVG page dimensions are in points: A4 landscape = 841.89 x 595.28.
  grep -Eq 'viewBox="0 0 841\.88[0-9]* 595\.27[0-9]*"' "${pages[0]}"
  printf 'PASS: %s (one A4 landscape page)\n' "$name"
}

expect_error() {
  local name=$1 json=$2 message=$3
  if typst compile --input "data=$json" arshjul.typ "$tmp/rejected.pdf" >"$tmp/error" 2>&1; then
    printf 'FAIL: %s should have been rejected\n' "$name" >&2
    exit 1
  fi
  grep -Fq -- "$message" "$tmp/error"
  printf 'PASS: %s rejected with a helpful error\n' "$name"
}

check_page example
check_page file --input data-file=example.json
check_page empty --input 'data={}'
check_page stdin --input "data=$(cat example.json)"
check_page multiple --input 'data={"events":[{"month":1,"title":"Kick-off","date":"12 Jan","description":"Agree on priorities."},{"month":1,"title":"Workshop","description":"Review the roadmap."},{"month":12,"title":"Wrap-up"}]}'
check_page custom --input 'data={"year":2030,"months":["Jan","Feb","Mar","Apr","May","Jun","Jul","Aug","Sep","Oct","Nov","Dec"],"colors":["#123456","#345678","#567890","#789012"]}'
expect_error month-zero '{"events":[{"month":0,"title":"Invalid"}]}' 'Event months must be between 1 and 12'
expect_error month-thirteen '{"events":[{"month":13,"title":"Invalid"}]}' 'Event months must be between 1 and 12'
expect_error missing-title '{"events":[{"month":1}]}' 'Every event needs a title string'
expect_error non-array '{"events":{}}' 'events must be an array'
expect_error months '{"months":["January"]}' 'months must contain exactly 12 names'
expect_error overflow '{"events":[{"month":1,"title":"ThisTitleIsFarTooLongToFitInOneYearWheelSectorEvenAtTheMinimumFontSize"}]}' 'Januar wheel titles is too long for A4'
printf 'All render checks passed.\n'
