"""No network or Railway credentials required: monitor cadence contract."""
import unittest
from scripts.schedule_minute_worker import loop


class FakeTime:
    def __init__(self):
        self.now = 0.0
        self.pauses = []

    def monotonic(self):
        return self.now

    def sleep(self, seconds):
        self.pauses.append(seconds)
        self.now += seconds


class ScheduleMinuteWorkerTests(unittest.TestCase):
    def test_check_runs_every_sixty_seconds_with_nonoverlapping_imports(self):
        t = FakeTime()
        started = []

        def job():
            started.append(t.now)
            t.now += 7.0
            return 0

        self.assertEqual(loop(job, monotonic=t.monotonic, wait=t.sleep, max_runs=4), 4)
        self.assertEqual(started, [0.0, 60.0, 120.0, 180.0])
        self.assertEqual(t.pauses, [53.0, 53.0, 53.0])

    def test_slow_imports_do_not_overlap(self):
        t = FakeTime()
        started = []

        def job():
            started.append(t.now)
            t.now += 75.0
            return 0

        loop(job, monotonic=t.monotonic, wait=t.sleep, max_runs=3)
        self.assertEqual(started, [0, 77, 154])
        self.assertEqual(t.pauses, [2.0, 2.0])

    def test_failures_retry_with_bounded_backoff_then_reset(self):
        t = FakeTime()
        attempts = []

        def job():
            attempts.append(t.now)
            if len(attempts) <= 3:
                raise RuntimeError("upstream unavailable")
            return 0

        with self.assertLogs("railway-minute-worker", level="ERROR"):
            loop(job, monotonic=t.monotonic, wait=t.sleep, max_runs=5)
        self.assertEqual(attempts, [0, 60, 180, 420, 480])
        self.assertEqual(t.pauses, [60, 120, 240, 60])

    def test_stop_exits_without_restarting_import(self):
        t = FakeTime()
        count = []

        def job():
            count.append(1)
            return 0

        loop(job, monotonic=t.monotonic, wait=t.sleep, stopped=lambda: bool(count))
        self.assertEqual(len(count), 1)
        self.assertEqual(t.pauses, [])

    def test_invalid_interval_is_rejected(self):
        with self.assertRaises(ValueError):
            loop(lambda: None, interval=1)


if __name__ == "__main__":
    unittest.main()
