import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from agent.network import validate_public_url
from agent.opportunities import intake, discover, parse_deadline, assess, parse_feed
from agent.store import Store


class OpportunityTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.store = Store(Path(self.tmp.name))

    def tearDown(self):
        self.tmp.cleanup()

    def test_text_intake_and_deduplication(self):
        payload = {"text": "Research fellowship\nWork on computer vision.", "category": "Research fellowship"}
        a = intake(payload, self.store)
        b = intake(payload, self.store)
        self.assertEqual(a["opportunity"]["title"], "Research fellowship")
        self.assertEqual(a["opportunity"]["id"], b["opportunity"]["id"])
        self.assertFalse(b["created"])

    def test_url_html_extracts_title_and_keeps_source(self):
        with patch("agent.opportunities.fetch_text", return_value=("<title>Open Research Fellow</title><main>Join our lab</main>", "https://example.org/fellow")):
            result = intake({"url": "https://example.org/fellow", "category": "Research fellowship"}, self.store)
        self.assertEqual(result["opportunity"]["title"], "Open Research Fellow")
        self.assertIn("Join our lab", result["opportunity"]["description"])

    def test_deadline_does_not_invent_timezone(self):
        value, note = parse_deadline("2027-01-10")
        self.assertEqual(value, "2027-01-10")
        self.assertIn("timezone", note.lower())
        value, note = parse_deadline("next friday")
        self.assertEqual(value, "")
        self.assertIn("confirm", note.lower())

    def test_explicit_mismatch_and_missing_fact_are_distinct(self):
        listing = {"requirements": {"country": "Canada", "degree": "PhD"}, "description": "Python research", "deadline": ""}
        result = assess({"country": "India", "skills": "Python"}, listing)
        self.assertEqual(result["eligibility"], "mismatch")
        self.assertTrue(any("degree" in x.lower() for x in result["missing"]))
        self.assertEqual(assess({}, listing)["eligibility"], "unknown")

    def test_rss_and_atom_links(self):
        rss = '<rss><channel><item><title>Hack event</title><link>https://e.org/h</link><description>Build tools</description></item></channel></rss>'
        atom = '<feed xmlns="http://www.w3.org/2005/Atom"><entry><title>Fellowship</title><link href="https://e.org/f"/><summary>Research</summary></entry></feed>'
        self.assertEqual(parse_feed(rss)[0]["url"], "https://e.org/h")
        self.assertEqual(parse_feed(atom)[0]["url"], "https://e.org/f")

    def test_partial_failure_does_not_discard_successful_source(self):
        self.store.save_settings({"sources": [
            {"type": "rss", "url": "https://e.org/feed", "name": "Good"},
            {"type": "rss", "url": "https://e.org/broken", "name": "Broken"}]})
        rss = '<rss><channel><item><title>Event</title><link>https://e.org/event</link></item></channel></rss>'
        with patch("agent.opportunities.fetch_text", side_effect=[(rss, "https://e.org/feed"), ValueError("Source could not be reached")]):
            result = discover(self.store)
        self.assertEqual(result["added"], 1)
        self.assertEqual(len(result["errors"]), 1)

    def test_private_and_credential_urls_rejected(self):
        for url in ("http://127.0.0.1/a", "http://169.254.169.254/", "http://[::1]/", "file:///etc/passwd", "https://u:p@example.org/", "http://192.168.1.1/"):
            with self.subTest(url=url), self.assertRaises(ValueError):
                validate_public_url(url)

    def test_dns_resolving_to_private_address_rejected(self):
        with patch("socket.getaddrinfo", return_value=[(2, 1, 6, "", ("10.0.0.2", 443))]):
            with self.assertRaises(ValueError):
                validate_public_url("https://looks-public.example/")

    def test_wrong_shaped_provider_json_is_a_source_error(self):
        self.store.save_settings({"sources": [
            {"type":"greenhouse","url":"example","name":"Bad board"},
            {"type":"rss","url":"https://e.org/feed","name":"Good feed"}]})
        rss='<rss><channel><item><title>Event</title><link>https://e.org/event</link></item></channel></rss>'
        with patch("agent.opportunities.request_json",return_value=[]), patch("agent.opportunities.fetch_text",return_value=(rss,"https://e.org/feed")):
            result=discover(self.store)
        self.assertEqual(result["added"],1)
        self.assertEqual(result["errors"][0]["source"],"Bad board")

    def test_wrong_shaped_search_json_is_reported(self):
        from types import SimpleNamespace
        self.store.save_settings({"sources":[],"search_queries":["research fellowship"]})
        with patch("agent.opportunities.request_json",return_value={"web":[]}):
            result=discover(self.store,SimpleNamespace(search_key="test-key"))
        self.assertEqual(len(result["errors"]),1)
        self.assertEqual(result["errors"][0]["source"],"Web search")


if __name__ == "__main__":
    unittest.main()
