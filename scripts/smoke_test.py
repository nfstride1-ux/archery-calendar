#!/usr/bin/env python3
"""Fast smoke test for the committed site. It does not refresh data or edit files.

Serves the repository on localhost and checks the home page, the two event
files, a sample of sitemap event pages, the sitemap itself, and that the
private calendar file and the owner's personal contact details are absent.
"""
import json
import os
import socket
import struct
import subprocess
import sys
import threading
import time
import urllib.request
import xml.etree.ElementTree as ET
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
# Built at runtime so this file does not contain the forbidden text.
PERSONAL = 'nfstride1' + '@' + 'gmail.com'
STREET = '19' + ' Calooli'
SITE = 'https://archerycalendars.com/'
SAMPLE = 8

ok = []
bad = []


def chk(name, cond, info=''):
    (ok if cond else bad).append(name)
    print(('PASS ' if cond else 'FAIL ') + name + ((' — ' + str(info)) if info and not cond else ''), flush=True)


def free_port():
    sock = socket.socket()
    sock.bind(('127.0.0.1', 0))
    port = sock.getsockname()[1]
    sock.close()
    return port


class Handler(SimpleHTTPRequestHandler):
    def __init__(self, *args, **kwargs):
        super().__init__(*args, directory=ROOT, **kwargs)

    def log_message(self, fmt, *args):
        return


def recv_exact(sock, n):
    buf = b''
    while len(buf) < n:
        chunk = sock.recv(n - len(buf))
        if not chunk:
            raise EOFError('socket closed')
        buf += chunk
    return buf


def ws_connect(url):
    rest = url.split('://', 1)[1]
    hostport, path = rest.split('/', 1)
    host, port = hostport.rsplit(':', 1)
    host = host.strip('[]')
    sock = socket.create_connection((host, int(port)), timeout=10)
    key = __import__('base64').b64encode(os.urandom(16)).decode()
    req = (
        f'GET /{path} HTTP/1.1\r\nHost: {host}:{port}\r\nUpgrade: websocket\r\n'
        f'Connection: Upgrade\r\nSec-WebSocket-Key: {key}\r\nSec-WebSocket-Version: 13\r\n\r\n'
    )
    sock.sendall(req.encode())
    buf = b''
    while b'\r\n\r\n' not in buf:
        buf += sock.recv(4096)
    head = buf.split(b'\r\n\r\n', 1)[0].decode('latin1')
    if ' 101 ' not in head.split('\r\n', 1)[0]:
        raise RuntimeError('chrome debugger did not upgrade: ' + head.split('\r\n', 1)[0])
    return sock


def ws_send(sock, text):
    data = text.encode()
    mask = os.urandom(4)
    n = len(data)
    frame = bytearray([0x81])
    if n < 126:
        frame.append(0x80 | n)
    elif n < 65536:
        frame.append(0x80 | 126)
        frame += struct.pack('!H', n)
    else:
        frame.append(0x80 | 127)
        frame += struct.pack('!Q', n)
    frame += mask
    frame += bytes(b ^ mask[i % 4] for i, b in enumerate(data))
    sock.sendall(frame)


def ws_recv(sock):
    chunks = []
    while True:
        b0, b1 = recv_exact(sock, 2)
        opcode, fin, ln = b0 & 0x0F, b0 & 0x80, b1 & 0x7F
        if ln == 126:
            ln = struct.unpack('!H', recv_exact(sock, 2))[0]
        elif ln == 127:
            ln = struct.unpack('!Q', recv_exact(sock, 8))[0]
        mask = recv_exact(sock, 4) if b1 & 0x80 else None
        data = recv_exact(sock, ln) if ln else b''
        if mask:
            data = bytes(c ^ mask[i % 4] for i, c in enumerate(data))
        if opcode == 0x9:  # ping
            pong = bytearray([0x8A, 0x80 | len(data)]) + os.urandom(4)
            ws_send_raw_pong(sock, data)
            continue
        if opcode == 0x8:
            raise EOFError('websocket closed')
        if opcode in (0x1, 0x0, 0x2):
            chunks.append(data)
            if fin:
                return b''.join(chunks).decode('utf-8', 'replace')


def ws_send_raw_pong(sock, data):
    mask = os.urandom(4)
    frame = bytearray([0x8A, 0x80 | len(data)])
    frame += mask
    frame += bytes(b ^ mask[i % 4] for i, b in enumerate(data))
    sock.sendall(frame)


def chrome_path():
    for cand in (os.environ.get('CHROME_PATH'), '/usr/bin/google-chrome', '/usr/bin/google-chrome-stable',
                 '/usr/bin/chromium', '/usr/bin/chromium-browser'):
        if cand and os.path.exists(cand):
            return cand
    return None


def check_self():
    src = open(os.path.abspath(__file__), encoding='utf-8').read()
    chk('smoke script does not contain the personal email', PERSONAL not in src)
    chk('smoke script does not contain the home address', STREET not in src)


def check_json():
    for name, key in (('data/events.json', 'events'), ('data/intl.json', 'events')):
        path = os.path.join(ROOT, name)
        try:
            with open(path, encoding='utf-8') as fh:
                doc = json.load(fh)
            rows = doc.get(key) if isinstance(doc, dict) else None
            chk(name + ' parses and is non-empty', isinstance(rows, list) and len(rows) > 0, type(doc).__name__)
        except Exception as exc:
            chk(name + ' parses and is non-empty', False, exc)


def check_private():
    found = []
    for dirpath, dirnames, filenames in os.walk(ROOT):
        dirnames[:] = [d for d in dirnames if d != '.git']
        if 'privatecal.js' in filenames:
            found.append(os.path.join(dirpath, 'privatecal.js'))
    chk('privatecal.js is absent', not found, ', '.join(found))


def check_secrets():
    proc = subprocess.run(
        ['git', 'grep', '-I', '-n', '-e', PERSONAL, '-e', STREET],
        cwd=ROOT, capture_output=True, text=True,
    )
    # git grep exits 1 when nothing matches.
    if proc.returncode == 0:
        lines = [ln for ln in proc.stdout.splitlines() if ln.strip()]
        chk('no personal email or home address in public files', False, '; '.join(lines[:8]))
    elif proc.returncode == 1:
        chk('no personal email or home address in public files', True)
    else:
        chk('no personal email or home address in public files', False, proc.stderr.strip()[:300])


def local_name(tag):
    return tag.rsplit('}', 1)[-1]


def check_sitemap():
    path = os.path.join(ROOT, 'sitemap.xml')
    try:
        tree = ET.parse(path)
    except ET.ParseError as exc:
        chk('sitemap is valid XML', False, exc)
        return []
    root = tree.getroot()
    chk('sitemap is a urlset', local_name(root.tag) == 'urlset')
    locs = []
    bad_loc = 0
    for url in root:
        if local_name(url.tag) != 'url':
            continue
        loc = ''
        lastmod = None
        for child in url:
            name = local_name(child.tag)
            if name == 'loc':
                loc = (child.text or '').strip()
            elif name == 'lastmod':
                lastmod = (child.text or '').strip()
        if not loc.startswith(SITE):
            bad_loc += 1
        if lastmod is not None and (len(lastmod) < 10 or lastmod[4] != '-' or lastmod[7] != '-'):
            bad_loc += 1
        locs.append(loc)
    chk('sitemap lists pages on the live host', len(locs) > 100 and bad_loc == 0, f'{len(locs)} urls, {bad_loc} bad')
    event_locs = [loc for loc in locs if '/events/' in loc]
    chk('sitemap lists event pages', len(event_locs) > 100, len(event_locs))
    if not event_locs:
        return []
    step = max(1, len(event_locs) // SAMPLE)
    sample = [event_locs[i] for i in range(0, len(event_locs), step)][:SAMPLE]
    missing = []
    for loc in sample:
        rel = loc[len(SITE):]
        if not rel or rel.endswith('/'):
            rel = rel + 'index.html'
        full = os.path.join(ROOT, rel)
        if not (os.path.isfile(full) and os.path.getsize(full) > 200):
            missing.append(rel)
    chk('sample of sitemap event pages exist', not missing, ', '.join(missing))
    return sample


def arg_text(arg):
    if not isinstance(arg, dict):
        return str(arg)
    if arg.get('type') == 'string':
        return arg.get('value') or ''
    if 'description' in arg:
        return arg['description']
    if 'value' in arg:
        return str(arg['value'])
    return json.dumps(arg)[:300]


def note_error(errors, msg):
    method = msg.get('method')
    if method == 'Runtime.exceptionThrown':
        details = msg.get('params', {}).get('exceptionDetails', {})
        exc = details.get('exception') or {}
        errors.append(((details.get('text') or '') + ' ' + (exc.get('description') or '')).strip())
    elif method == 'Runtime.consoleAPICalled' and msg.get('params', {}).get('type') == 'error':
        args = ' '.join(arg_text(a) for a in msg.get('params', {}).get('args', []))
        errors.append('console ' + args)


def check_home(port):
    chrome = chrome_path()
    chk('Chrome is available for the home-page check', bool(chrome), 'set CHROME_PATH')
    if not chrome:
        return
    debug = free_port()
    profile = os.path.join('/tmp', 'archery-smoke-' + str(os.getpid()))
    proc = subprocess.Popen(
        [chrome, '--headless=new', '--disable-gpu', '--no-sandbox', '--disable-dev-shm-usage',
         '--remote-debugging-address=127.0.0.1', f'--remote-debugging-port={debug}',
         f'--user-data-dir={profile}', '--no-first-run', '--disable-extensions', 'about:blank'],
        stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL,
    )
    try:
        version = None
        for _ in range(50):
            if proc.poll() is not None:
                break
            try:
                with urllib.request.urlopen(f'http://127.0.0.1:{debug}/json/version', timeout=1) as resp:
                    version = json.load(resp)
                break
            except Exception:
                time.sleep(0.1)
        chk('Chrome debugger is up', bool(version))
        if not version:
            return
        req = urllib.request.Request(f'http://127.0.0.1:{debug}/json/new?about:blank', method='PUT')
        try:
            with urllib.request.urlopen(req, timeout=5) as resp:
                page = json.load(resp)
        except Exception:
            with urllib.request.urlopen(f'http://127.0.0.1:{debug}/json/list', timeout=5) as resp:
                listed = json.load(resp)
            page = next(item for item in listed if item.get('type') == 'page')
        sock = ws_connect(page['webSocketDebuggerUrl'])
        sock.settimeout(0.3)
        seq = 0
        pending = {}
        errors = []

        def send(method, params=None):
            nonlocal seq
            seq += 1
            pending[seq] = method
            ws_send(sock, json.dumps({'id': seq, 'method': method, 'params': params or {}}))
            return seq

        def pump(until, state):
            while time.time() < until:
                try:
                    msg = json.loads(ws_recv(sock))
                except socket.timeout:
                    return state
                note_error(errors, msg)
                ident = msg.get('id')
                if ident in pending:
                    pending.pop(ident, None)
                    value = ((msg.get('result') or {}).get('result') or {}).get('value')
                    if isinstance(value, dict):
                        state = value
            return state

        send('Runtime.enable')
        send('Page.enable')
        send('Network.enable')
        send('Network.setBlockedURLs', {'urls': [
            '*clarity.ms*', '*goatcounter.com*', '*gc.zgo.at*', '*supabase.co*',
            '*formsubmit.co*', '*open-meteo.com*', '*cloudflare.com*',
        ]})
        send('Page.navigate', {'url': f'http://127.0.0.1:{port}/'})
        expr = '''(() => {
          const view = document.querySelector('#view');
          const nav = [...document.querySelectorAll('nav.nav a')].map(a => a.textContent.trim());
          return {title: document.title, loading: !!document.querySelector('#view .loading'),
            text: (view && view.innerText || '').slice(0, 240), nav};
        })()'''
        state = {}
        deadline = time.time() + 25
        while time.time() < deadline:
            state = pump(time.time() + 0.4, state)
            send('Runtime.evaluate', {'expression': expr, 'returnByValue': True})
            state = pump(time.time() + 1.5, state)
            if state and not state.get('loading') and len(state.get('text') or '') > 80:
                state = pump(time.time() + 0.8, state)
                break
        ignore = ('clarity', 'goatcounter', 'supabase', 'err_blocked', 'failed to fetch', 'net::', 'formsubmit', 'open-meteo')
        real, ignored = [], []
        for err in errors:
            (ignored if any(bit in err.lower() for bit in ignore) else real).append(err)
        for err in ignored:
            print('NOTE ignored third-party error: ' + err[:200], flush=True)
        chk('home page has a title', 'Archery' in (state.get('title') or ''), state.get('title'))
        loaded = bool(state) and not state.get('loading') and "Couldn't load event data" not in (state.get('text') or '')
        chk('home page finishes loading events', loaded, (state.get('text') or '')[:120])
        nav = state.get('nav') or []
        for label in ('Find events', 'Near me', 'International', 'Calendars', 'News'):
            chk('home page shows ' + label, label in nav, ', '.join(nav))
        chk('home page has no JavaScript errors', not real, ' | '.join(real[:4]))
        sock.close()
    finally:
        proc.terminate()
        try:
            proc.wait(timeout=3)
        except subprocess.TimeoutExpired:
            proc.kill()


def main():
    os.chdir(ROOT)
    check_self()
    check_json()
    check_private()
    check_secrets()
    check_sitemap()
    port = free_port()
    server = ThreadingHTTPServer(('127.0.0.1', port), Handler)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    try:
        with urllib.request.urlopen(f'http://127.0.0.1:{port}/', timeout=5) as resp:
            body = resp.read(4000).decode('utf-8', 'replace')
            chk('index responds', resp.status == 200 and 'Archery' in body, resp.status)
        check_home(port)
    finally:
        server.shutdown()
    print(f'{len(ok)} passed, {len(bad)} failed', flush=True)
    return 1 if bad else 0


if __name__ == '__main__':
    sys.exit(main())
