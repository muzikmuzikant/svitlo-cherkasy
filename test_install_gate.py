from pathlib import Path
import re
ROOT=Path(__file__).resolve().parent.parent

def test_browser_gate_and_admin_link():
    html=(ROOT/'index.html').read_text()
    install=(ROOT/'install.js').read_text()
    assert 'id="installLanding"' in html
    assert 'display-mode: standalone' in html
    assert 'navigator.standalone' in html
    assert 'id="adminDashboard"' in (ROOT/'admin.html').read_text()
    assert '<script defer src="./app.js"' not in html
    assert 'hour.onload' in install
    assert 'beforeinstallprompt' in install
    assert 'href="./admin.html"' in html

def test_sessions_are_server_side():
    server=(ROOT/'push-server/admin.js').read_text()
    assert 'crypto.randomBytes(32)' in server
    assert '/api/admin/logout' in server
    assert 'SESSIONS.delete(tokenHash)' in server
    assert 'req.headers.origin!==origin' in server
    assert 'ADMIN_PASSWORD' not in (ROOT/'install.js').read_text()
