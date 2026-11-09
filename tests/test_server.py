import base64
import http.client
import json
import tempfile
import threading
import unittest
from pathlib import Path

from agent.config import Config
from agent.server import make_server


class ServerTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.config = Config(Path(self.tmp.name), port=0, token="test-pairing-token")
        self.server = make_server(self.config)
        self.port = self.server.server_address[1]
        self.thread = threading.Thread(target=self.server.serve_forever, daemon=True)
        self.thread.start()

    def tearDown(self):
        self.server.shutdown()
        self.server.server_close()
        self.thread.join()
        self.tmp.cleanup()

    def call(self, method, path, body=None, auth=True, origin=None, raw=False):
        conn = http.client.HTTPConnection("127.0.0.1", self.port, timeout=5)
        headers = {"Content-Type": "application/json"}
        if auth:
            headers["X-Opportunity-Token"] = self.config.token
        if origin:
            headers["Origin"] = origin
        conn.request(method, path, json.dumps(body) if body is not None else None, headers)
        response = conn.getresponse()
        data = response.read()
        status = response.status
        conn.close()
        return status, data.decode() if raw else json.loads(data)

    def test_auth_and_cross_origin_protection(self):
        self.assertEqual(self.call("GET", "/api/state", auth=False)[0], 401)
        self.assertEqual(self.call("POST", "/api/intake", {}, origin="https://evil.example")[0], 403)
        self.assertEqual(self.call("GET", "/api/bootstrap", auth=False, origin="https://evil.example")[0], 403)
        self.assertEqual(self.call("GET", "/api/bootstrap", auth=False)[1]["token"], self.config.token)
        state = self.call("GET", "/api/state")[1]
        self.assertNotIn(self.config.token, json.dumps(state))

    def test_full_profile_intake_preparation_and_submission(self):
        self.assertEqual(self.call("PUT", "/api/profile", {"name": "Asha", "email": "a@example.org", "skills": "Python"})[0], 200)
        _, result = self.call("POST", "/api/intake", {"text": "Python internship\nBuild accessible tools", "category": "Internship"})
        item_id = result["opportunity"]["id"]
        _, prepared = self.call("POST", f"/api/opportunities/{item_id}/prepare", {"use_ai": False})
        self.assertEqual(prepared["opportunity"]["status"], "prepared")
        status, document = self.call("GET", f"/api/opportunities/{item_id}/documents/resume", raw=True)
        self.assertEqual(status, 200)
        self.assertIn("Asha", document)
        self.call("POST", f"/api/opportunities/{item_id}/status", {"status": "submitted"})
        _, result = self.call("GET", f"/api/opportunities/{item_id}")
        self.assertTrue(result["opportunity"]["submitted_at"])

    def test_validation_and_not_found_are_readable(self):
        status, body = self.call("POST", "/api/intake", {})
        self.assertEqual(status, 400)
        self.assertIn("Paste", body["error"])
        self.assertEqual(self.call("GET", "/api/opportunities/missing")[0], 404)

    def test_resume_rejects_disguised_file_and_accepts_pdf(self):
        bad = {"filename": "resume.pdf", "data": base64.b64encode(b"executable").decode()}
        self.assertEqual(self.call("POST", "/api/resume", bad)[0], 400)
        good = {"filename": "resume.pdf", "data": base64.b64encode(b"%PDF-1.4\nfixture").decode()}
        self.assertEqual(self.call("POST", "/api/resume", good)[0], 200)

    def test_editing_stale_pack_is_rejected(self):
        self.call("PUT", "/api/profile", {"name": "Asha", "email": "a@example.org"})
        _, result = self.call("POST", "/api/intake", {"text": "Fellowship details"})
        path = "/api/opportunities/" + result["opportunity"]["id"]
        self.call("POST", path + "/prepare", {"use_ai": False})
        self.call("PUT", path + "/pack", {"base_version": 1, "resume": "Updated", "statement": "Draft", "answers": []})
        self.assertEqual(self.call("PUT", path + "/pack", {"base_version": 1, "answers": []})[0], 409)


if __name__ == "__main__":
    unittest.main()
