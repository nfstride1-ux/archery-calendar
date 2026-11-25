#!/usr/bin/env bash
# Publish the files in this checkout as a pull-request preview on main.
# GitHub Pages already serves main, so the preview is a folder on that branch:
#   https://archerycalendars.com/pr-preview/pr-<number>/
# Only that folder is committed. The live site at the root is not edited.
# The daily data refresh is not run here. The preview is the committed site.
set -euo pipefail

PR="${PR:-}"
MODE="${1:-publish}"
if ! [[ "$PR" =~ ^[0-9]+$ ]]; then
  echo "PR must be a number" >&2
  exit 1
fi
if [[ "$MODE" != "stage-only" && "${GITHUB_ACTIONS:-}" != "true" ]]; then
  echo "Refusing to publish outside GitHub Actions." >&2
  exit 1
fi

ROOT="${ROOT:-$(cd "$(dirname "$0")/.." && pwd)}"
# git checkout below replaces this file. Keep running from a copy.
if [[ "${PREVIEW_REEXEC:-}" != 1 ]]; then
  cp "$0" /tmp/archery-publish-preview.sh
  export PREVIEW_REEXEC=1 ROOT PR
  exec bash /tmp/archery-publish-preview.sh "$@"
fi
DEST_REL="pr-preview/pr-${PR}"
COPY="$(mktemp -d)"
trap 'rm -rf "$COPY"' EXIT

cd "$ROOT"

# Visitor-facing site only. Dev tools, test screenshots and the preview
# folder itself stay out, so a preview cannot contain another preview.
python3 - "$ROOT" "$COPY" <<'PY'
import shutil, sys
from pathlib import Path
src, dst = Path(sys.argv[1]), Path(sys.argv[2])
skip = {'.git', '.github', 'pr-preview', 'scripts', 'tools', 'sources', 'supabase', 'map-test', 'incoming', '__pycache__'}
def ignore(path, names):
    return [name for name in names if name in skip or name.startswith('shots-') or name.endswith('.pyc')]
if dst.exists():
    shutil.rmtree(dst)
shutil.copytree(src, dst, ignore=ignore)
PY

python3 - "$COPY/index.html" "$PR" <<'PY'
import pathlib, sys
path, pr = pathlib.Path(sys.argv[1]), sys.argv[2]
text = path.read_text(encoding='utf-8')
banner = (
    '<div id="prPreviewBanner" style="background:#0d1b2a;color:#fff;text-align:center;'
    'padding:8px 12px;font:600 14px/1.4 sans-serif">Preview of pull request #%s. '
    'This is not the live site.</div>' % pr
)
meta = '<meta name="robots" content="noindex">'
if 'name="robots"' not in text:
    text = text.replace('<head>', '<head>\n' + meta, 1)
if 'id="prPreviewBanner"' not in text:
    text = text.replace('<body>', '<body>\n' + banner, 1)
path.write_text(text, encoding='utf-8')
PY

test -s "$COPY/index.html"
test -s "$COPY/data/events.json"
test -s "$COPY/data/intl.json"
test ! -e "$COPY/privatecal.js"

if [[ "$MODE" == "stage-only" ]]; then
  echo "Staged preview copy at $COPY"
  # Keep the copy for inspection when the caller sets KEEP_COPY.
  if [[ -n "${KEEP_COPY:-}" ]]; then
    trap - EXIT
    echo "$COPY"
  fi
  exit 0
fi

git fetch origin main
git checkout -B preview-publish origin/main
python3 - "$COPY" "$ROOT/$DEST_REL" <<'PY'
import shutil, sys
from pathlib import Path
src, dst = Path(sys.argv[1]), Path(sys.argv[2])
if dst.exists():
    shutil.rmtree(dst)
shutil.copytree(src, dst)
PY

git add -A -- "$DEST_REL"
staged="$(git diff --cached --name-only)"
if [[ -z "$staged" ]]; then
  echo "Preview already matches pull request #${PR}."
  exit 0
fi
while IFS= read -r path; do
  case "$path" in
    "$DEST_REL"/*) ;;
    *) echo "Refusing to commit $path" >&2; exit 1 ;;
  esac
done <<< "$staged"

git config user.name "github-actions[bot]"
git config user.email "41898282+github-actions[bot]@users.noreply.github.com"
git commit -m "Publish preview for pull request #${PR}

This folder is a copy of that pull request so it can be opened before merge.
The live site at the repository root is unchanged."

# Rebase onto the latest main, then push. Never force-push.
for attempt in 1 2 3 4; do
  git fetch origin main
  git rebase origin/main
  if git push origin HEAD:main; then
    echo "Pushed preview for pull request #${PR}."
    exit 0
  fi
  echo "Push attempt ${attempt} failed; retrying." >&2
  sleep $((attempt * 2))
done
echo "Could not push the preview." >&2
exit 1
