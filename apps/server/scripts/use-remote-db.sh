#!/usr/bin/env bash
# Points wrangler.jsonc at the real D1 database, creating it the first time. The ID isn't kept
# in the repository, so CI runs this before anything that touches the live database.
set -euo pipefail
cd "$(dirname "$0")/.."

find_id() {
  local out
  if ! out=$(pnpm exec wrangler d1 list --json 2>d1-list.err) || ! jq -e . >/dev/null 2>&1 <<<"$out"; then
    echo "$out" >&2
    cat d1-list.err >&2
    echo "::error::Couldn't list D1 databases. The API token needs the Account > D1 > Edit permission." >&2
    return 1
  fi
  jq -r '.[] | select(.name == "whizard") | .uuid' <<<"$out"
}

id=$(find_id)
if [ -z "$id" ] && [ "${CREATE_IF_MISSING:-}" = "1" ]; then
  pnpm exec wrangler d1 create whizard --location weur --update-config=false
  id=$(find_id)
fi
if [ -z "$id" ]; then echo "::error::Couldn't find the D1 database"; exit 1; fi
echo "D1 database: $id"
sed -i -E "s/\"database_id\": \"[^\"]*\"/\"database_id\": \"$id\"/" wrangler.jsonc
