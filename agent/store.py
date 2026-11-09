"""Persistence. Application progress is independent of preparation versions."""

import hashlib
import json
import sqlite3
import uuid
from contextlib import contextmanager
from datetime import datetime, timezone
from pathlib import Path
from urllib.parse import parse_qsl, urlencode, urlsplit, urlunsplit

STATUSES = ("new", "shortlisted", "prepared", "filled", "submitted", "archived")
CATEGORIES = ("Job", "Internship", "Hackathon", "Research fellowship", "Competition", "Scholarship", "Grant", "Other")


class ConflictError(ValueError):
    pass


def now():
    return datetime.now(timezone.utc).isoformat(timespec="seconds")


def canonical_url(value):
    if not value:
        return ""
    parsed = urlsplit(value.strip())
    if parsed.scheme not in ("https", "http") or not parsed.hostname or parsed.username or parsed.password:
        raise ValueError("Use a complete http:// or https:// listing URL without embedded credentials.")
    query = [(k, v) for k, v in parse_qsl(parsed.query, keep_blank_values=True)
             if not k.lower().startswith("utm_") and k.lower() not in ("fbclid", "gclid")]
    return urlunsplit((parsed.scheme.lower(), parsed.netloc.lower(), parsed.path.rstrip("/"), urlencode(sorted(query)), ""))


class Store:
    def __init__(self, data_dir: Path):
        self.data_dir = Path(data_dir)
        self.data_dir.mkdir(parents=True, exist_ok=True)
        self.db = self.data_dir / "opportunities.sqlite3"
        with self.connect() as conn:
            conn.execute("PRAGMA journal_mode=WAL")
            conn.executescript("""
                CREATE TABLE IF NOT EXISTS settings (key TEXT PRIMARY KEY, value TEXT NOT NULL);
                CREATE TABLE IF NOT EXISTS opportunities (
                    id TEXT PRIMARY KEY, dedupe_key TEXT UNIQUE NOT NULL, data TEXT NOT NULL
                );
            """)

    @contextmanager
    def connect(self):
        conn = sqlite3.connect(self.db, timeout=20)
        conn.row_factory = sqlite3.Row
        try:
            with conn:
                yield conn
        finally:
            conn.close()

    def get_setting(self, key, default):
        with self.connect() as conn:
            row = conn.execute("SELECT value FROM settings WHERE key=?", (key,)).fetchone()
        return json.loads(row[0]) if row else default

    def put_setting(self, key, value):
        with self.connect() as conn:
            conn.execute("INSERT INTO settings VALUES(?,?) ON CONFLICT(key) DO UPDATE SET value=excluded.value",
                         (key, json.dumps(value, ensure_ascii=False)))
        return value

    def get_profile(self):
        return self.get_setting("profile", {})

    def save_profile(self, profile):
        if not isinstance(profile, dict):
            raise ValueError("Profile must be an object.")
        fields = ("name", "first_name", "last_name", "email", "phone", "location", "country", "linkedin",
                  "github", "portfolio", "education", "experience", "projects", "skills", "achievements",
                  "research_interests", "resume_text", "preferences", "degree", "graduation_year", "citizenship")
        cleaned = {k: str(profile.get(k, "")).strip()[:30000] for k in fields}
        answers = profile.get("answers", [])
        if not isinstance(answers, list) or any(not isinstance(x, dict) for x in answers):
            raise ValueError("Reusable answers must be a list of question and answer objects.")
        cleaned["answers"] = [{"question": str(a.get("question", "")).strip()[:1000],
                               "answer": str(a.get("answer", "")).strip()[:10000]}
                              for a in answers[:100] if a.get("question") and a.get("answer")]
        return self.put_setting("profile", cleaned)

    def get_settings(self):
        return self.get_setting("sources", {"sources": [], "search_queries": []})

    def save_settings(self, settings):
        if not isinstance(settings, dict) or not isinstance(settings.get("sources", []), list):
            raise ValueError("Sources must be a list.")
        if len(settings.get("sources", [])) > 30:
            raise ValueError("Use at most 30 sources per discovery run.")
        sources = []
        for source in settings.get("sources", []):
            if not isinstance(source, dict) or source.get("type") not in ("rss", "greenhouse", "lever"):
                raise ValueError("Choose RSS/Atom, Greenhouse, or Lever for each source.")
            sources.append({"name": str(source.get("name", "Source"))[:160], "type": source["type"],
                            "url": str(source.get("url", ""))[:2000],
                            "category": str(source.get("category", "Other"))[:100],
                            "enabled": bool(source.get("enabled", True))})
        queries = settings.get("search_queries", [])
        if not isinstance(queries, list):
            raise ValueError("Search queries must be a list.")
        return self.put_setting("sources", {"sources": sources,
                                           "search_queries": [str(q).strip()[:300] for q in queries[:10] if str(q).strip()]})

    def upsert_opportunity(self, item):
        title = str(item.get("title", "")).strip()[:500]
        if not title:
            raise ValueError("Enter an opportunity title.")
        url = canonical_url(str(item.get("url", "")))
        key = url or hashlib.sha256((title + str(item.get("organization", "")) + str(item.get("description", ""))).encode()).hexdigest()
        with self.connect() as conn:
            conn.execute("BEGIN IMMEDIATE")
            row = conn.execute("SELECT data FROM opportunities WHERE dedupe_key=?", (key,)).fetchone()
            if row:
                return json.loads(row[0]), False
            data = {k: item.get(k, "") for k in ("title", "organization", "category", "description", "application_url",
                                                       "deadline", "deadline_note", "requirements", "source")}
            data.update(id=uuid.uuid4().hex, title=title, url=url, category=item.get("category") or "Other",
                        description=str(item.get("description", ""))[:80000], status="new", pack=None,
                        created_at=now(), updated_at=now(), submitted_at=None, history=[], notes="")
            if not data["application_url"]:
                data["application_url"] = url
            if data["application_url"]:
                data["application_url"] = canonical_url(str(data["application_url"]))
            conn.execute("INSERT INTO opportunities VALUES(?,?,?)", (data["id"], key, json.dumps(data, ensure_ascii=False)))
        return data, True

    def list_opportunities(self):
        with self.connect() as conn:
            rows = conn.execute("SELECT data FROM opportunities ORDER BY rowid DESC LIMIT 5000").fetchall()
        return [json.loads(row[0]) for row in rows]

    def get_opportunity(self, item_id):
        with self.connect() as conn:
            row = conn.execute("SELECT data FROM opportunities WHERE id=?", (item_id,)).fetchone()
        if not row:
            raise KeyError("Opportunity not found.")
        return json.loads(row[0])

    def _change(self, item_id, fn):
        with self.connect() as conn:
            conn.execute("BEGIN IMMEDIATE")
            row = conn.execute("SELECT data FROM opportunities WHERE id=?", (item_id,)).fetchone()
            if not row:
                raise KeyError("Opportunity not found.")
            data = json.loads(row[0])
            fn(data)
            data["updated_at"] = now()
            conn.execute("UPDATE opportunities SET data=? WHERE id=?", (json.dumps(data, ensure_ascii=False), item_id))
        return data

    def set_status(self, item_id, status):
        if status not in STATUSES:
            raise ValueError("Unknown application status.")

        def change(data):
            if status in ("filled", "prepared") and data["pack"] is None:
                raise ValueError("Prepare an answer pack before marking this application filled.")
            if data["status"] == "submitted" and status in ("filled", "prepared"):
                return
            data["status"] = status
            if status == "submitted" and not data["submitted_at"]:
                data["submitted_at"] = now()
            data["history"].append({"at": now(), "action": status})
        return self._change(item_id, change)

    def save_pack(self, item_id, pack, expected_version=None):
        if not isinstance(pack, dict):
            raise ValueError("Answer pack must be an object.")

        def change(data):
            previous = data["pack"]
            if expected_version is not None and expected_version != (previous or {}).get("version", 0):
                raise ConflictError("This application changed in another tab. Reload it before saving your edits.")
            value = dict(pack)
            value.update(version=(previous or {}).get("version", 0) + 1, prepared_at=now(), opportunity_id=item_id)
            if previous:
                data.setdefault("pack_versions", []).append(previous)
            data["pack"] = value
            if data["status"] not in ("submitted", "archived", "filled"):
                data["status"] = "prepared"
            data["history"].append({"at": now(), "action": "pack_saved", "version": value["version"]})
        return self._change(item_id, change)

    def update_opportunity(self, item_id, values):
        def change(data):
            for key in ("notes", "deadline", "deadline_note", "requirements", "organization", "category"):
                if key in values:
                    data[key] = values[key]
            if "application_url" in values:
                data["application_url"] = canonical_url(values["application_url"])
        return self._change(item_id, change)
