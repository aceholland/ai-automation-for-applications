"""Single-user local HTTP service, with token-authenticated JSON endpoints."""

import base64
import csv
import hmac
import io
import json
import mimetypes
import re
import sys
import zipfile
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer
from pathlib import Path
from urllib.parse import unquote, urlsplit

from .config import ROOT
from .opportunities import assess, discover, intake, parse_deadline
from .preparation import configured_ai, prepare, render_document
from .store import CATEGORIES, STATUSES, ConflictError, Store

MAX_BODY = 7_100_000


def make_server(config):
    store = Store(config.data_dir)

    class Handler(BaseHTTPRequestHandler):
        server_version = "OpportunityDesk/1.0"

        def log_message(self, fmt, *args):
            # Do not log URLs, request bodies, profile data, or credentials.
            return

        def _origin_allowed(self, bootstrap=False):
            host = self.headers.get("Host", "")
            parsed_host = urlsplit("http://" + host)
            if parsed_host.hostname not in ("127.0.0.1", "localhost", "agent", "::1"):
                return False
            origin = self.headers.get("Origin", "")
            if not origin:
                return self.headers.get("Sec-Fetch-Site", "") != "cross-site" or not bootstrap
            if origin == "http://" + host:
                return True
            return not bootstrap and bool(re.fullmatch(r"chrome-extension://[a-p]{32}", origin))

        def _send(self, status, value, content_type="application/json; charset=utf-8", filename=None):
            raw = json.dumps(value, ensure_ascii=False).encode() if content_type.startswith("application/json") else value.encode() if isinstance(value, str) else value
            self.send_response(status)
            self.send_header("Content-Type", content_type)
            self.send_header("Content-Length", str(len(raw)))
            self.send_header("Cache-Control", "no-store")
            self.send_header("X-Content-Type-Options", "nosniff")
            self.send_header("Referrer-Policy", "no-referrer")
            self.send_header("Content-Security-Policy", "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'")
            origin = self.headers.get("Origin", "")
            if origin and self._origin_allowed():
                self.send_header("Access-Control-Allow-Origin", origin)
                self.send_header("Vary", "Origin")
            if filename:
                safe = re.sub(r"[^a-zA-Z0-9_.-]", "_", filename)[:120]
                self.send_header("Content-Disposition", f'attachment; filename="{safe}"')
            self.end_headers()
            self.wfile.write(raw)

        def _body(self):
            try:
                length = int(self.headers.get("Content-Length", "0"))
            except ValueError as exc:
                raise ValueError("Invalid request size.") from exc
            if not 0 <= length <= MAX_BODY:
                raise ValueError("Request is too large. Resume attachments are limited to 5 MB.")
            if not length:
                return {}
            try:
                value = json.loads(self.rfile.read(length))
            except (ValueError, UnicodeError) as exc:
                raise ValueError("Send a valid JSON object.") from exc
            if not isinstance(value, dict):
                raise ValueError("Send a JSON object.")
            return value

        def _authenticated(self):
            return hmac.compare_digest(self.headers.get("X-Opportunity-Token", ""), config.token)

        def do_OPTIONS(self):
            if not self._origin_allowed():
                self._send(403, {"error": "This origin is not allowed."})
                return
            self.send_response(204)
            self.send_header("Access-Control-Allow-Origin", self.headers.get("Origin", ""))
            self.send_header("Access-Control-Allow-Headers", "X-Opportunity-Token, Content-Type")
            self.send_header("Access-Control-Allow-Methods", "GET, POST, PUT, OPTIONS")
            self.end_headers()

        def do_GET(self):
            self._handle("GET")

        def do_POST(self):
            self._handle("POST")

        def do_PUT(self):
            self._handle("PUT")

        def _handle(self, method):
            try:
                path = unquote(urlsplit(self.path).path)
                if not self._origin_allowed(bootstrap=path == "/api/bootstrap"):
                    self._send(403, {"error": "This origin is not allowed. Open the dashboard at its localhost address."})
                    return
                if path == "/api/health" and method == "GET":
                    self._send(200, {"ok": True, "version": "1.0.0"})
                    return
                if path == "/api/bootstrap" and method == "GET":
                    self._send(200, {"token": config.token})
                    return
                if path.startswith("/api/"):
                    if not self._authenticated():
                        self._send(401, {"error": "Pair this browser or configure X-Opportunity-Token before using the API."})
                        return
                    self._api(method, path, self._body() if method in ("POST", "PUT") else {})
                    return
                if method != "GET":
                    raise KeyError("Page not found.")
                fixtures = {"/tests/form-fixture.html": ROOT / "tests" / "form-fixture.html",
                            "/tests/fixture-runner.js": ROOT / "tests" / "fixture-runner.js",
                            "/tests/autofill-core.js": ROOT / "extension" / "autofill.js",
                            "/tests/social-fixture.html": ROOT / "tests" / "social-fixture.html",
                            "/tests/social-fixture.js": ROOT / "tests" / "social-fixture.js",
                            "/tests/post-import-core.js": ROOT / "extension" / "post-import.js"}
                if path in fixtures:
                    target = fixtures[path]
                else:
                    target = (ROOT / "web" / ("index.html" if path == "/" else path.lstrip("/"))).resolve()
                    if not target.is_relative_to((ROOT / "web").resolve()):
                        raise KeyError("Page not found.")
                if not target.is_file():
                    raise KeyError("Page not found.")
                mime = mimetypes.guess_type(str(target))[0] or "application/octet-stream"
                self._send(200, target.read_bytes(), mime + ("; charset=utf-8" if mime.startswith("text/") or "javascript" in mime else ""))
            except ConflictError as exc:
                self._send(409, {"error": str(exc)})
            except (ValueError, TypeError) as exc:
                self._send(400, {"error": str(exc) if isinstance(exc, ValueError) else "Invalid field type. Check the supplied values."})
            except KeyError as exc:
                self._send(404, {"error": str(exc).strip("'")})
            except (BrokenPipeError, ConnectionResetError):
                pass
            except Exception:
                print("Request failed unexpectedly; no personal details logged.", file=sys.stderr)
                self._send(500, {"error": "The local service encountered an error. Retry; your saved data is retained."})

        def _api(self, method, path, payload):
            if path == "/api/state" and method == "GET":
                profile = store.get_profile()
                items = store.list_opportunities()
                for item in items:
                    item["assessment"] = assess(profile, item)
                    item.pop("pack_versions", None)
                self._send(200, {"profile": profile, "settings": store.get_settings(), "opportunities": items,
                                 "integrations": config.public(), "categories": CATEGORIES, "statuses": STATUSES,
                                 "resume": store.get_setting("resume", None), "last_discovery": store.get_setting("last_discovery", None)})
                return
            if path == "/api/profile" and method == "PUT":
                self._send(200, {"profile": store.save_profile(payload)})
                return
            if path == "/api/settings" and method in ("GET", "PUT"):
                self._send(200, {"settings": store.get_settings() if method == "GET" else store.save_settings(payload)})
                return
            if path == "/api/intake" and method == "POST":
                self._send(200, intake(payload, store))
                return
            if path == "/api/discover" and method == "POST":
                self._send(200, discover(store, config))
                return
            if path == "/api/resume" and method == "POST":
                name = str(payload.get("filename", ""))
                suffix = Path(name).suffix.lower()
                if suffix not in (".pdf", ".docx", ".txt"):
                    raise ValueError("Attach a PDF, DOCX, or TXT resume.")
                try:
                    data = base64.b64decode(payload.get("data", ""), validate=True)
                except (ValueError, TypeError) as exc:
                    raise ValueError("The attachment could not be decoded.") from exc
                if not data or len(data) > 5_000_000:
                    raise ValueError("Attach a nonempty file up to 5 MB.")
                if suffix == ".pdf" and not data.startswith(b"%PDF-"):
                    raise ValueError("The file does not look like a PDF. Export it as PDF and try again.")
                if suffix == ".docx":
                    try:
                        with zipfile.ZipFile(io.BytesIO(data)) as archive:
                            if "word/document.xml" not in archive.namelist():
                                raise ValueError("Choose a valid DOCX file.")
                    except zipfile.BadZipFile as exc:
                        raise ValueError("Choose a valid DOCX file.") from exc
                file = config.data_dir / ("resume" + suffix)
                file.write_bytes(data)
                meta = {"filename": re.sub(r"[^\w .-]", "_", name)[:120], "suffix": suffix, "bytes": len(data)}
                store.put_setting("resume", meta)
                self._send(200, {"resume": meta})
                return
            if path == "/api/resume/raw" and method == "GET":
                meta = store.get_setting("resume", None)
                if not meta:
                    raise KeyError("No resume attached. Add one in Profile.")
                self._send(200, (config.data_dir / ("resume" + meta["suffix"])).read_bytes(),
                           mimetypes.guess_type(meta["filename"])[0] or "application/octet-stream", meta["filename"])
                return
            if path == "/api/export.csv" and method == "GET":
                out = io.StringIO(newline="")
                columns = ["title", "organization", "category", "url", "application_url", "deadline", "status", "submitted_at", "notes"]
                writer = csv.DictWriter(out, columns)
                writer.writeheader()
                for item in store.list_opportunities():
                    writer.writerow({k: ("'" + str(item.get(k, "")) if str(item.get(k, "")).lstrip().startswith(("=", "+", "-", "@")) else item.get(k, "")) for k in columns})
                self._send(200, "\ufeff" + out.getvalue(), "text/csv; charset=utf-8", "opportunities.csv")
                return
            match = re.fullmatch(r"/api/opportunities/([a-zA-Z0-9]+)(?:/(.*))?", path)
            if not match:
                raise KeyError("API endpoint not found.")
            item_id, action = match.groups()
            item = store.get_opportunity(item_id)
            if not action and method == "GET":
                item["assessment"] = assess(store.get_profile(), item)
                self._send(200, {"opportunity": item})
            elif not action and method == "PUT":
                if "deadline" in payload:
                    payload["deadline"], payload["deadline_note"] = parse_deadline(payload["deadline"])
                self._send(200, {"opportunity": store.update_opportunity(item_id, payload)})
            elif action == "prepare" and method == "POST":
                ai = configured_ai(config) if payload.get("use_ai", True) else None
                if payload.get("use_ai") is True and ai is None:
                    raise ValueError("AI is not configured. Use Prepare from profile or add AI settings and restart.")
                pack = prepare(store.get_profile(), item, ai)
                self._send(200, {"opportunity": store.save_pack(item_id, pack)})
            elif action == "pack" and method == "PUT":
                if not item["pack"]:
                    raise ValueError("Prepare this application before editing its answer pack.")
                answers = payload.get("answers", [])
                if not isinstance(answers, list) or len(answers) > 100 or any(not isinstance(a, dict) for a in answers):
                    raise ValueError("Use at most 100 question and answer pairs.")
                cleaned = [{"question": str(a.get("question", "")).strip()[:1000], "answer": str(a.get("answer", "")).strip()[:15000], "source": "Edited by you"}
                           for a in answers if a.get("question") and a.get("answer")]
                updated = {**item["pack"], "answers": cleaned, "resume": str(payload.get("resume", item["pack"]["resume"]))[:100000],
                           "statement": str(payload.get("statement", item["pack"]["statement"]))[:100000]}
                self._send(200, {"opportunity": store.save_pack(item_id, updated, payload.get("base_version"))})
            elif action == "status" and method == "POST":
                self._send(200, {"opportunity": store.set_status(item_id, payload.get("status"))})
            elif action in ("documents/resume", "documents/statement") and method == "GET":
                if not item["pack"]:
                    raise ValueError("Prepare this application before downloading documents.")
                kind = action.split("/")[-1]
                self._send(200, render_document(item, item["pack"], kind), "text/html; charset=utf-8", kind + "-draft.html")
            else:
                raise KeyError("API action not found.")

    server = ThreadingHTTPServer((config.host, config.port), Handler)
    server.daemon_threads = True
    return server
