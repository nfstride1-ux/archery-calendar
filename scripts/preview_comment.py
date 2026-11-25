#!/usr/bin/env python3
"""Post or update the pull-request preview comment. Reads PR, REPO, ACTION and GH_TOKEN."""
import json
import os
import subprocess

PR = os.environ['PR']
REPO = os.environ['REPO']
ACTION = os.environ.get('ACTION', '')
MARK = '<!-- pr-preview -->'


def api(method, path, payload=None):
    cmd = ['gh', 'api', '--method', method, path]
    data = None
    if payload is not None:
        cmd.append('--input')
        cmd.append('-')
        data = json.dumps(payload)
    proc = subprocess.run(cmd, input=data, text=True, capture_output=True)
    if proc.returncode != 0:
        raise SystemExit(proc.stderr.strip() or proc.stdout.strip() or 'gh api failed')
    return proc.stdout


if ACTION == 'closed':
    text = MARK + '\nThe preview for this pull request has been removed. The live site was not changed.\n'
else:
    text = (
        MARK + '\n'
        'Preview of this pull request (a copy of the committed site, not a new data refresh):\n\n'
        f'https://archerycalendars.com/pr-preview/pr-{PR}/\n\n'
        'GitHub Pages usually shows a new folder within a minute. '
        'The live site at https://archerycalendars.com/ is the repository root and is not edited by this job. '
        'Hash links (Find events, Near me, and the rest) stay inside the preview. '
        'Links that start with a slash open the live site. '
        'The folder is removed when the pull request is closed.\n'
    )

raw = subprocess.run(
    ['gh', 'api', '--paginate', f'repos/{REPO}/issues/{PR}/comments', '--jq', '.[] | {id: .id, body: .body}'],
    text=True, capture_output=True,
)
if raw.returncode != 0:
    raise SystemExit(raw.stderr.strip() or 'could not list comments')
existing = None
for line in raw.stdout.splitlines():
    line = line.strip()
    if not line:
        continue
    item = json.loads(line)
    if MARK in (item.get('body') or ''):
        existing = item['id']
        break
if existing:
    api('PATCH', f'repos/{REPO}/issues/comments/{existing}', {'body': text})
else:
    api('POST', f'repos/{REPO}/issues/{PR}/comments', {'body': text})
print('Updated the preview comment.', flush=True)
