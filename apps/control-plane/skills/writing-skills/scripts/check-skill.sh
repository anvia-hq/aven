#!/bin/sh
# Checks a skill folder: a SKILL.md that starts with frontmatter, with a name that matches the
# folder and a description.
set -eu

dir=${1:?usage: check-skill.sh <skill folder>}
file="$dir/SKILL.md"
[ -f "$file" ] || { echo "missing $file" >&2; exit 1; }
[ "$(head -n 1 "$file")" = "---" ] || { echo "SKILL.md must start with ---" >&2; exit 1; }

frontmatter=$(sed -n '2,/^---$/p' "$file" | sed '$d')
name=$(printf '%s\n' "$frontmatter" | sed -n 's/^name:[[:space:]]*//p' | head -n 1)
description=$(printf '%s\n' "$frontmatter" | sed -n 's/^description:[[:space:]]*//p' | head -n 1)

[ -n "$name" ] || { echo "frontmatter has no name" >&2; exit 1; }
printf '%s' "$name" | grep -Eq '^[a-z0-9]+(-[a-z0-9]+)*$' ||
  { echo "name must be lowercase letters, numbers and hyphens" >&2; exit 1; }
[ "${#name}" -le 64 ] || { echo "name is longer than 64 characters" >&2; exit 1; }
[ "$name" = "$(basename "$(cd "$dir" && pwd)")" ] ||
  { echo "name \"$name\" does not match the folder's name" >&2; exit 1; }
[ -n "$description" ] || { echo "frontmatter has no description" >&2; exit 1; }

echo "ok: $name"
