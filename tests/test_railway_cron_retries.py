"""Safety checks for transient Railway Cron network failures."""
import json
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch
from requests.exceptions import ConnectionError, Timeout

from scripts import railway_schedule_cron as cron


class Reply:
    def __init__(self, status, body=None, text=""):
        self.status_code = status
        self.body = body or {}
        self.text = text

    def json(self):
        return self.body

    def raise_for_status(self):
        if self.status_code >= 400:
            raise RuntimeError("HTTP %d" % self.status_code)


class Session:
    def __init__(self, *, posts=(), gets=()):
        self.posts = list(posts)
        self.gets = list(gets)
        self.post_count = 0
        self.get_count = 0

    def post(self, *args, **kwargs):
        self.post_count += 1
        response = self.posts.pop(0)
        if isinstance(response, Exception):
            raise response
        return response

    def get(self, *args, **kwargs):
        self.get_count += 1
        response = self.gets.pop(0)
        if isinstance(response, Exception):
            raise response
        return response


class PublicationRetryTests(unittest.TestCase):
    checked = "2026-10-15T00:30:00+03:00"

    def setUp(self):
        self.work = tempfile.TemporaryDirectory()
        directory = Path(self.work.name)
        (directory / "schedules.json").write_text(json.dumps({
            "schemaVersion": 3, "lastChecked": self.checked, "days": []
        }), encoding="utf-8")
        (directory / "source_review.json").write_text(json.dumps({
            "lastChecked": self.checked, "items": []
        }), encoding="utf-8")
        self.data_patch = patch.object(cron, "DATA", directory)
        self.sleep_patch = patch.object(cron.time, "sleep")
        self.data_patch.start()
        self.sleep = self.sleep_patch.start()

    def tearDown(self):
        self.sleep_patch.stop()
        self.data_patch.stop()
        self.work.cleanup()

    def accepted(self):
        return Reply(200, {"ok": True, "lastChecked": self.checked})

    def test_disconnect_before_acceptance_retries_without_reimport(self):
        session = Session(posts=[ConnectionError("reset"), self.accepted()],
                          gets=[Reply(503)])
        result = cron.publish(session, "https://railway.example", "secret")
        self.assertTrue(result["ok"])
        self.assertEqual(session.post_count, 2)
        self.assertEqual(self.sleep.call_count, 1)

    def test_lost_reply_after_server_commits_does_not_publish_again(self):
        status = {"ready": True, "lastChecked": self.checked,
                  "verifiedDays": [], "reviewPending": False}
        session = Session(posts=[ConnectionError("reply lost")],
                          gets=[Reply(200, status)])
        result = cron.publish(session, "https://railway.example", "secret")
        self.assertTrue(result["ok"])
        self.assertEqual(session.post_count, 1)
        self.sleep.assert_not_called()

    def test_502_is_retried(self):
        session = Session(posts=[Reply(502), self.accepted()],
                          gets=[Reply(503)])
        result = cron.publish(session, "https://railway.example", "secret")
        self.assertTrue(result["ok"])
        self.assertEqual(session.post_count, 2)

    def test_authorization_failure_is_not_retried(self):
        session = Session(posts=[Reply(401, text="not authorized")])
        with self.assertRaisesRegex(RuntimeError, "401"):
            cron.publish(session, "https://railway.example", "secret")
        self.assertEqual(session.post_count, 1)
        self.sleep.assert_not_called()

    def test_repeated_network_error_does_not_report_false_success(self):
        session = Session(posts=[Timeout("timed out")] * 4,
                          gets=[Reply(503)] * 4)
        with self.assertRaisesRegex(RuntimeError, "after 4 attempts"):
            cron.publish(session, "https://railway.example", "secret")
        self.assertEqual(session.post_count, 4)
        self.assertEqual(self.sleep.call_count, 3)

    def test_snapshot_download_retries_one_reset(self):
        session = Session(gets=[ConnectionError("reset"), Reply(200, {"days": []})])
        response = cron.download(session, "https://railway.example/api/data/schedules.json")
        self.assertEqual(response.status_code, 200)
        self.assertEqual(session.get_count, 2)

    def test_bootstrap_503_does_not_retry(self):
        session = Session(gets=[Reply(503)])
        response = cron.download(session, "https://railway.example/api/data/schedules.json",
                                 bootstrap=True)
        self.assertEqual(response.status_code, 503)
        self.assertEqual(session.get_count, 1)
        self.sleep.assert_not_called()


if __name__ == "__main__":
    unittest.main()
