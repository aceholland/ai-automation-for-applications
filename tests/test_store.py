import tempfile
import unittest
from pathlib import Path

from agent.store import Store, canonical_url


class StoreTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.path = Path(self.tmp.name)
        self.store = Store(self.path)

    def tearDown(self):
        self.tmp.cleanup()

    def add(self, **kw):
        return self.store.upsert_opportunity({"title": "Research intern", "url": "https://example.org/apply/1", **kw})

    def test_profile_survives_restart(self):
        self.store.save_profile({"name": "Asha", "email": "asha@example.org", "skills": "Python"})
        self.assertEqual(Store(self.path).get_profile()["name"], "Asha")

    def test_url_tracking_deduplicates_without_losing_distinct_queries(self):
        first, created = self.add(url="https://EXAMPLE.org/apply/1/?utm_source=mail&job=7")
        second, again = self.add(url="https://example.org/apply/1?job=7#form")
        other, distinct = self.add(url="https://example.org/apply/1?job=8")
        self.assertTrue(created)
        self.assertFalse(again)
        self.assertTrue(distinct)
        self.assertEqual(first["id"], second["id"])
        self.assertNotEqual(first["id"], other["id"])

    def test_pack_version_history_and_submitted_status_survive_repreparation(self):
        item, _ = self.add()
        self.store.save_pack(item["id"], {"answers": [{"question": "Name", "answer": "Asha"}]})
        self.store.set_status(item["id"], "submitted")
        submitted = self.store.get_opportunity(item["id"])["submitted_at"]
        self.store.save_pack(item["id"], {"answers": []})
        current = self.store.get_opportunity(item["id"])
        self.assertEqual(current["status"], "submitted")
        self.assertEqual(current["submitted_at"], submitted)
        self.assertEqual(current["pack"]["version"], 2)
        self.assertEqual(len(current["history"]), 3)

    def test_filling_never_reverts_submitted_status(self):
        item, _ = self.add()
        self.store.save_pack(item["id"], {"answers": []})
        self.store.set_status(item["id"], "submitted")
        self.store.set_status(item["id"], "filled")
        self.assertEqual(self.store.get_opportunity(item["id"])["status"], "submitted")

    def test_invalid_status_and_unprepared_fill_are_rejected(self):
        item, _ = self.add()
        with self.assertRaises(ValueError):
            self.store.set_status(item["id"], "imaginary")
        with self.assertRaises(ValueError):
            self.store.set_status(item["id"], "filled")

    def test_text_only_intake_deduplicates(self):
        a, _ = self.add(url="", description="A research fellowship", organization="Institute")
        b, created = self.add(url="", description="A research fellowship", organization="Institute")
        self.assertEqual(a["id"], b["id"])
        self.assertFalse(created)

    def test_blank_title_rejected(self):
        with self.assertRaises(ValueError):
            self.add(title=" ")


if __name__ == "__main__":
    unittest.main()
