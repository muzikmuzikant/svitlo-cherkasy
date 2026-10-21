"""Publish only web files; never accidentally ship .env, server secrets or subscription data.
GitHub Pages deployment runs from GitHub Actions and doesn't depend on GITHUB_TOKEN push-build behavior.
"""
from pathlib import Path
import shutil
import json
import re
import hashlib

ROOT=Path(__file__).resolve().parent.parent
DEST=ROOT/'_site'
FILES=['index.html','admin.html','app.js','notification-center.js','notification-text.js','inbox-ui.js','site-mode.js','admin-control.js','admin-richtext.js','admin-help-richtext.js','admin-control.css','admin-feedback.css','admin-dashboard.js','admin-analytics.js','admin-security-ui.js','admin-users.js','admin-users.css','admin-workspace.js','admin-workspace.css','admin-system.js','admin-system.css','admin-address.js','admin-address.css','admin-office.js','admin-office.css','admin-quality.js','admin-schedule-diff.js','admin-source-review.js','admin-categories.js','admin-features.js','admin-command.js','address-lookup.js','data-merge.js','admin.js','hour-paint.js','install.js','version-check.js','release.json','style.css','maintenance-ui.css','install.css','sw.js','manifest.webmanifest','privacy.html','terms.html','about.html','feedback.html','feedback.js','feedback.css','help.html','help.css','help.js','admin-extra.js','admin-planner.js','schedule-planner.js','client-errors.js','admin-errors.js','admin-reports.js','motion.js','motion.css','internal-pages.js','internal-pages.css','legal-consent.js','legal-consent.css','admin-legal.js','beta-ads.js','admin-ads.js','admin-ads.css','ad-detail.html','advertising.html','support-project.html','robots.txt','sitemap.xml']
if DEST.exists():shutil.rmtree(DEST)
DEST.mkdir()
for filename in FILES:
    shutil.copy2(ROOT/filename,DEST/filename)
# One published release.json drives the published app version and service-worker cache.
release=json.loads((ROOT/'release.json').read_text(encoding='utf-8'))
version=release.get('version', '')
if not re.fullmatch(r'[0-9]+\.[0-9]+\.[0-9]+', version):
    raise ValueError('release.json: version must be semantic x.y.z')
index_path=DEST/'index.html'
html=index_path.read_text(encoding='utf-8')
html=re.sub(r'(<meta name="svitlo-version" content=")[^"]+(")',lambda m:m.group(1)+version+m.group(2),html,count=1)
html=re.sub(r'(<span id="appVersion">)v[^<]+',lambda m:m.group(1)+'v'+version,html,count=1)
index_path.write_text(html,encoding='utf-8')
feedback_path=DEST/'feedback.html'
support_html=feedback_path.read_text(encoding='utf-8')
support_html=re.sub(r'(<meta name="svitlo-version" content=")[^"]+(")',lambda m:m.group(1)+version+m.group(2),support_html,count=1)
feedback_path.write_text(support_html,encoding='utf-8')

sw_path=DEST/'sw.js'
sw=sw_path.read_text(encoding='utf-8')
channel_suffix='-beta' if release.get('channel') == 'beta' else ''
# A version may have many beta builds. Fingerprint static assets to invalidate
# outdated service-worker caches without changing the public release version.
signature=hashlib.sha256()
for filename in FILES:
    if filename == 'sw.js':
        continue
    signature.update(filename.encode('utf-8'))
    signature.update((ROOT/filename).read_bytes())
build_hash=signature.hexdigest()[:12]
sw=re.sub(r"const VERSION='[^']+';","const VERSION='svitlo-cherkasy-shell-v"+version+channel_suffix+"-"+build_hash+"';",sw,count=1)
sw_path.write_text(sw,encoding='utf-8')
for icon in ROOT.glob('favicon*'):
    if icon.is_file():shutil.copy2(icon, DEST/icon.name)
# iOS home-screen icons live at the site root; without these, iOS displays
# a fallback initial instead of the application icon.
for icon in ROOT.glob('apple-touch-icon*.png'):
    shutil.copy2(icon, DEST/icon.name)
# Always ship the canonical icon; iOS otherwise falls back to the first letter.
if not (DEST/'apple-touch-icon.png').is_file():
    raise FileNotFoundError('Missing apple-touch-icon.png in published site')
if not (DEST/'apple-touch-icon-v692.png').is_file():
    raise FileNotFoundError('Missing apple-touch-icon-v692.png in published site')
for folder in ('assets','data'):
    shutil.copytree(ROOT/folder,DEST/folder)
# User-owned public configuration and custom domain must survive the release build.
optional_files=('push-config.json',) if release.get('channel') == 'beta' else ('push-config.json','CNAME')
for optional in optional_files:
    if (ROOT/optional).is_file():shutil.copy2(ROOT/optional,DEST/optional)
print('Prepared public site with',len(list(DEST.rglob('*'))),'entries.')
