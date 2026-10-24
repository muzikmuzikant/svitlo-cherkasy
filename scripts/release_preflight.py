"""Validate Beta/Production PWA release identities without touching live services."""
import argparse
import json
import re
from pathlib import Path

BETA_API = "https://svitlo-beta-api-staging.up.railway.app"
PROD_API = "https://svitlo-cherkasy-production.up.railway.app"
PROD_DOMAIN = "svitlo-cherkasy.pp.ua"
# Public keys captured from the verified channel configs on 2026-10-24.
# Any future key rotation requires a separately approved subscription migration.
EXPECTED_PUBLIC_KEYS = {
    "beta": "BLj3lNyLkpHXUA8fYUYTRKzIn0LroTD4BMbZHHTUj6jjTQAuAf1DWr5borKdpR4V5CjTYJLr1_fEGW1aoLa_PaQ",
    "production": "BKOZF_fXUtopmrdOdRWZXnw9Od1fQ8uDVVfkNXtMKRTdGNx-s9rpbm8zGdknUWg5C97gCaBDlfrAqUkITiwuFLM",
}

class PreflightFailure(Exception):
    pass

def require(condition, message):
    if not condition:
        raise PreflightFailure(message)

def load_json(path):
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (FileNotFoundError, json.JSONDecodeError) as exc:
        raise PreflightFailure(f"{path}: missing or invalid JSON") from exc

def check(root, expected_channel, require_build=True):
    """Check source identity, routing and assembled site; return release version."""
    root = Path(root)
    release = load_json(root / "release.json")
    manifest = load_json(root / "manifest.webmanifest")
    config = load_json(root / "push-config.json")
    channel = release.get("channel")
    require(expected_channel in ("beta", "production"), "Invalid expected channel")
    require(channel == expected_channel, f"Expected {expected_channel}, found {channel!r}")
    version = release.get("version")
    require(isinstance(version, str) and re.fullmatch(r"\d+\.\d+\.\d+", version), "Invalid version")
    required_api = BETA_API if channel == "beta" else PROD_API
    require(config.get("apiBase") == required_api, f"Wrong Push API for {channel}")
    public_key = config.get("publicKey", "")
    require(public_key == EXPECTED_PUBLIC_KEYS[channel],
            "Public VAPID key changed: require separately approved subscription migration")
    require(manifest.get("display") == "standalone", "PWA standalone mode missing")
    pwa_id = manifest.get("id", "")
    require(isinstance(pwa_id, str), "PWA ID missing")
    robots = (root / "robots.txt").read_text(encoding="utf-8")
    globally_blocked = bool(re.search(r"^\s*Disallow:\s*/\s*$", robots, flags=re.I | re.M))
    cname = root / "CNAME"
    if channel == "beta":
        require("beta" in pwa_id.lower(), "Beta PWA ID is not isolated")
        require(not cname.exists(), "Beta includes Production CNAME")
        require(globally_blocked, "Beta must disallow indexing")
    else:
        require("beta" not in pwa_id.lower(), "Production inherited Beta PWA ID")
        require(cname.exists() and cname.read_text(encoding="utf-8").strip() == PROD_DOMAIN,
                "Production CNAME missing or changed")
        require(not globally_blocked, "Production indexing is blocked")
    if require_build:
        site = root / "_site"
        for filename in ("release.json", "manifest.webmanifest", "push-config.json"):
            require(load_json(site / filename) == load_json(root / filename),
                    f"Built {filename} differs from source")
        require((site / "CNAME").exists() == (channel == "production"),
                "Built CNAME does not match release channel")
        if channel == "production":
            require((site / "CNAME").read_text(encoding="utf-8").strip() == PROD_DOMAIN,
                    "Built CNAME changed")
        sw = (site / "sw.js").read_text(encoding="utf-8")
        match = re.search(r"const VERSION='(svitlo-cherkasy-shell-v[^']+)';", sw)
        require(match is not None, "Service worker cache version is missing")
        cache = match.group(1)
        require(cache.startswith("svitlo-cherkasy-shell-v" + version + "-"),
                "Service worker version does not match release.json")
        require(("-beta-" in cache) == (channel == "beta"),
                "Service worker cache is not isolated by channel")
        html = (site / "index.html").read_text(encoding="utf-8")
        require(f'<span id="appVersion">v{version}' in html, "Published app version was not updated")
    return version

def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--root", type=Path, default=Path("."))
    parser.add_argument("--channel", required=True, choices=("beta", "production"))
    parser.add_argument("--source-only", action="store_true")
    args = parser.parse_args()
    try:
        version = check(args.root, args.channel, require_build=not args.source_only)
    except (PreflightFailure, OSError) as exc:
        parser.exit(1, f"RELEASE BLOCKED: {exc}\n")
    print(f"PASS: {args.channel} {version} identity, routing and build isolation")

if __name__ == "__main__":
    main()
