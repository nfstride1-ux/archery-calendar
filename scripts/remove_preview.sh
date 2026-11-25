#!/usr/bin/env bash
# Remove one pull-request preview folder from main. Does not touch the live site.
set -euo pipefail

PR="${PR:-}"
if ! [[ "$PR" =~ ^[0-9]+$ ]]; then
  echo "PR must be a number" >&2
  exit 1
fi
if [[ "${GITHUB_ACTIONS:-}" != "true" ]]; then
  echo "Refusing to remove a preview outside GitHub Actions." >&2
  exit 1
fi

ROOT="${ROOT:-$(cd "$(dirname "$0")/.." && pwd)}"
if [[ "${PREVIEW_REEXEC:-}" != 1 ]]; then
  cp "$0" /tmp/archery-remove-preview.sh
  export PREVIEW_REEXEC=1 ROOT PR
  exec bash /tmp/archery-remove-preview.sh "$@"
fi
DEST_REL="pr-preview/pr-${PR}"
cd "$ROOT"

git fetch origin main
git checkout -B preview-remove origin/main
if [[ ! -e "$DEST_REL" ]]; then
  echo "No preview folder for pull request #${PR}."
  exit 0
fi
git rm -r -- "$DEST_REL"
git config user.name "github-actions[bot]"
git config user.email "41898282+github-actions[bot]@users.noreply.github.com"
git commit -m "Remove preview for pull request #${PR}

The pull request is closed, so its preview folder is removed.
The live site at the repository root is unchanged."

for attempt in 1 2 3 4; do
  git fetch origin main
  git rebase origin/main
  if git push origin HEAD:main; then
    echo "Removed preview for pull request #${PR}."
    exit 0
  fi
  echo "Push attempt ${attempt} failed; retrying." >&2
  sleep $((attempt * 2))
done
echo "Could not push the preview removal." >&2
exit 1
