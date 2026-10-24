"""Unit tests for channel isolation. No external network or server mutations."""
import json
import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
from release_preflight import check, PreflightFailure, BETA_API, PROD_API, PROD_DOMAIN, EXPECTED_PUBLIC_KEYS

class ReleasePreflightTests(unittest.TestCase):
    def setUp(self):
        temp = tempfile.TemporaryDirectory()
        self.addCleanup(temp.cleanup)
        self.root = Path(temp.name)

    def write(self, name, value):
        dest = self.root / name
        dest.parent.mkdir(parents=True, exist_ok=True)
        dest.write_text(json.dumps(value) if isinstance(value, dict) else value, encoding="utf-8")

    def fixture(self, channel):
        self.write("release.json", {"channel": channel, "version": "7.9.12"})
        self.write("push-config.json", {"apiBase": BETA_API if channel == "beta" else PROD_API,
                                        "publicKey": EXPECTED_PUBLIC_KEYS[channel]})
        self.write("manifest.webmanifest", {"id": "./?app=beta" if channel == "beta" else "./",
                                            "display": "standalone"})
        self.write("robots.txt", "User-agent: *\nDisallow: /\n" if channel == "beta" else
                                 "User-agent: *\nDisallow: /admin.html\n")
        if channel == "production":
            self.write("CNAME", PROD_DOMAIN)

    def test_beta_identity_passes(self):
        self.fixture("beta")
        self.assertEqual(check(self.root, "beta", require_build=False), "7.9.12")

    def test_production_identity_passes(self):
        self.fixture("production")
        self.assertEqual(check(self.root, "production", require_build=False), "7.9.12")

    def test_beta_api_rejected_in_production(self):
        self.fixture("production")
        self.write("push-config.json", {"apiBase": BETA_API, "publicKey": EXPECTED_PUBLIC_KEYS["production"]})
        with self.assertRaises(PreflightFailure):
            check(self.root, "production", require_build=False)

    def test_beta_public_vapid_rejected_in_production(self):
        self.fixture("production")
        self.write("push-config.json", {"apiBase": PROD_API, "publicKey": EXPECTED_PUBLIC_KEYS["beta"]})
        with self.assertRaises(PreflightFailure):
            check(self.root, "production", require_build=False)

    def test_beta_pwa_id_rejected_in_production(self):
        self.fixture("production")
        self.write("manifest.webmanifest", {"id": "./?app=svitlo-beta", "display": "standalone"})
        with self.assertRaises(PreflightFailure):
            check(self.root, "production", require_build=False)

    def test_production_domain_rejected_in_beta(self):
        self.fixture("beta")
        self.write("CNAME", PROD_DOMAIN)
        with self.assertRaises(PreflightFailure):
            check(self.root, "beta", require_build=False)

    def test_block_all_robots_rejected_in_production(self):
        self.fixture("production")
        self.write("robots.txt", "User-agent: *\nDisallow: /\n")
        with self.assertRaises(PreflightFailure):
            check(self.root, "production", require_build=False)

    def test_service_worker_cache_must_match_channel(self):
        self.fixture("beta")
        for name in ("release.json", "manifest.webmanifest", "push-config.json"):
            self.write("_site/" + name, json.loads((self.root / name).read_text()))
        self.write("_site/sw.js", "const VERSION='svitlo-cherkasy-shell-v7.9.12-fff';")
        self.write("_site/index.html", '<span id="appVersion">v7.9.12</span>')
        with self.assertRaises(PreflightFailure):
            check(self.root, "beta")
        self.write("_site/sw.js", "const VERSION='svitlo-cherkasy-shell-v7.9.12-beta-fff';")
        self.assertEqual(check(self.root, "beta"), "7.9.12")

if __name__ == "__main__":
    unittest.main()
