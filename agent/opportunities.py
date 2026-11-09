"""Opportunity intake, explicit-fact assessment, and configured discovery."""

import json
import re
import xml.etree.ElementTree as ET
from concurrent.futures import ThreadPoolExecutor
from datetime import date, datetime, timezone
from html import unescape
from html.parser import HTMLParser
from urllib.parse import quote, urlencode

from .network import fetch_text, request_json


class ListingHTML(HTMLParser):
    def __init__(self):
        super().__init__()
        self.title = ""
        self.parts = []
        self.in_title = False
        self.skip = 0
        self.meta = {}

    def handle_starttag(self, tag, attrs):
        attrs = dict(attrs)
        if tag in ("script", "style", "noscript", "svg"):
            self.skip += 1
        if tag == "title":
            self.in_title = True
        if tag == "meta":
            self.meta[attrs.get("property") or attrs.get("name", "")] = attrs.get("content", "")
        if tag in ("p", "div", "section", "li", "br", "h1", "h2", "h3") and not self.skip:
            self.parts.append("\n")

    def handle_endtag(self, tag):
        if tag in ("script", "style", "noscript", "svg"):
            self.skip = max(0, self.skip - 1)
        if tag == "title":
            self.in_title = False

    def handle_data(self, data):
        if self.in_title:
            self.title += data
        elif not self.skip:
            self.parts.append(data)


def plain_text(html):
    parser = ListingHTML()
    parser.feed(str(html))
    return "\n".join(re.sub(r"\s+", " ", line).strip() for line in "".join(parser.parts).splitlines() if line.strip())


def parse_deadline(raw):
    value = str(raw or "").strip()
    if not value:
        return "", "No deadline recorded. Check the official listing."
    try:
        if re.fullmatch(r"\d{4}-\d{2}-\d{2}", value):
            day = date.fromisoformat(value)
            return value, ("Date has passed; check whether applications are still open. " if day < date.today() else "") + "Closing time and timezone are unknown; confirm with the organizer."
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
        if parsed.tzinfo is None:
            return value, "Timezone is unknown; confirm with the organizer."
        return parsed.isoformat(), "Deadline has passed; verify the listing." if parsed < datetime.now(timezone.utc) else ""
    except ValueError:
        return "", "Could not parse the deadline; confirm the date, time, and timezone in the listing."


def infer_category(text):
    text = text.lower()
    for phrase, category in (("hackathon", "Hackathon"), ("fellow", "Research fellowship"), ("scholarship", "Scholarship"),
                             ("intern", "Internship"), ("competition", "Competition"), ("grant", "Grant")):
        if phrase in text:
            return category
    return "Other"


def intake(payload, store):
    url = str(payload.get("url", "")).strip()
    text = str(payload.get("text") or payload.get("description") or "").strip()
    title = str(payload.get("title", "")).strip()
    if url and not text:
        html, url = fetch_text(url)
        parsed = ListingHTML()
        parsed.feed(html)
        title = title or parsed.meta.get("og:title") or parsed.title.strip()
        text = plain_text(html)
    if not text:
        raise ValueError("Paste a listing URL or the opportunity description.")
    deadline, note = parse_deadline(payload.get("deadline", ""))
    requirements = payload.get("requirements", {})
    if not isinstance(requirements, dict):
        raise ValueError("Eligibility requirements must be an object of explicit facts.")
    item, created = store.upsert_opportunity({
        "url": url, "title": title or text.splitlines()[0][:160], "description": text,
        "organization": str(payload.get("organization", ""))[:300],
        "category": str(payload.get("category") or infer_category(title + " " + text[:2000]))[:100],
        "application_url": str(payload.get("application_url") or url), "deadline": deadline,
        "deadline_note": note, "requirements": requirements, "source": str(payload.get("source", "Added by you"))[:300]})
    return {"opportunity": item, "created": created}


def assess(profile, opportunity):
    requirements = opportunity.get("requirements") or {}
    missing, mismatches, matches = [], [], []
    for field, wanted in requirements.items():
        if field not in ("country", "citizenship", "degree", "graduation_year"):
            missing.append(f"Check requirement: {field} — {wanted}")
            continue
        actual = str(profile.get(field, "")).strip()
        if not actual:
            missing.append(f"Add your {field.replace('_', ' ')} to check the requirement: {wanted}.")
        elif actual.casefold() != str(wanted).strip().casefold():
            mismatches.append(f"{field.replace('_', ' ').title()}: listing specifies {wanted}; your profile says {actual}. Verify acceptable alternatives.")
        else:
            matches.append(f"{field.replace('_', ' ').title()} matches: {actual}")
    if not requirements:
        missing.append("Review eligibility in the official listing; no structured requirements have been recorded.")
    skills = [x.strip() for x in re.split(r"[,;\n]", profile.get("skills", "")) if len(x.strip()) > 1]
    desc = opportunity.get("description", "").casefold()
    keywords = [skill for skill in skills if re.search(r"(?<!\w)" + re.escape(skill.casefold()) + r"(?!\w)", desc)]
    return {"eligibility": "mismatch" if mismatches else "unknown" if missing else "matches",
            "missing": missing, "mismatches": mismatches, "matches": matches, "matched_skills": keywords,
            "fit_note": f"{len(keywords)} of {len(skills)} profile skill phrases appear in the listing. This is a text match, not a hiring prediction." if skills else "Add skills to see matching phrases."}


def parse_feed(text):
    try:
        root = ET.fromstring(text)
    except ET.ParseError as exc:
        raise ValueError("Source did not return valid RSS or Atom XML.") from exc
    items = []
    for node in list(root.findall(".//item")) + list(root.findall("{http://www.w3.org/2005/Atom}entry")):
        values = {}
        for child in node:
            key = child.tag.rsplit("}", 1)[-1]
            if key == "link":
                if not child.attrib.get("rel") or child.attrib.get("rel") == "alternate":
                    values[key] = child.attrib.get("href") or (child.text or "")
            else:
                values[key] = "".join(child.itertext())
        title, url = values.get("title", ""), values.get("link", "")
        if title and url:
            items.append({"title": title, "url": url.strip(), "text": plain_text(values.get("description") or values.get("summary") or values.get("content") or title)})
    return items[:100]


def _source_items(source):
    kind, value = source["type"], source["url"].strip()
    if kind == "rss":
        text, _ = fetch_text(value)
        return parse_feed(text)
    if not re.fullmatch(r"[a-zA-Z0-9_-]{1,100}", value):
        raise ValueError("For Greenhouse or Lever, enter the company board slug, not its full URL.")
    if kind == "greenhouse":
        body = request_json(f"https://boards-api.greenhouse.io/v1/boards/{quote(value)}/jobs?content=true")
        return [{"title": j["title"], "url": j["absolute_url"], "text": plain_text(j.get("content", "")) or j["title"]}
                for j in body.get("jobs", [])[:100]]
    body = request_json(f"https://api.lever.co/v0/postings/{quote(value)}?mode=json")
    return [{"title": j["text"], "url": j["hostedUrl"], "application_url": j.get("applyUrl", ""),
             "text": j.get("descriptionPlain") or plain_text(j.get("description", "")) or j["text"]}
            for j in body[:100]]


def discover(store, config=None):
    settings = store.get_settings()
    sources = [s for s in settings["sources"] if s.get("enabled", True)]
    added, duplicates, errors, checked = 0, 0, [], 0

    def run_source(source):
        try:
            return source, _source_items(source), None
        except (ValueError, KeyError, TypeError) as exc:
            return source, [], str(exc) if isinstance(exc, ValueError) else "Unexpected source response. Check its format."

    with ThreadPoolExecutor(max_workers=4) as executor:
        for source, items, error in executor.map(run_source, sources):
            checked += 1
            if error:
                errors.append({"source": source["name"], "error": error})
            for item in items:
                try:
                    result = intake({**item, "source": source["name"], "category": source.get("category") or "Other"}, store)
                    added += int(result["created"])
                    duplicates += int(not result["created"])
                except ValueError as exc:
                    errors.append({"source": source["name"], "error": str(exc)})
    if config and config.search_key:
        for query in settings.get("search_queries", []):
            checked += 1
            try:
                response = request_json("https://api.search.brave.com/res/v1/web/search?" + urlencode({"q": query, "count": 10}),
                                        headers={"X-Subscription-Token": config.search_key})
                for row in response.get("web", {}).get("results", []):
                    result = intake({"title": row["title"], "url": row["url"], "text": plain_text(row.get("description") or row["title"]),
                                     "source": "Web search: " + query}, store)
                    added += int(result["created"])
                    duplicates += int(not result["created"])
            except (ValueError, KeyError, TypeError) as exc:
                errors.append({"source": "Web search", "error": str(exc) if isinstance(exc, ValueError) else "Unexpected search response."})
    elif settings.get("search_queries"):
        errors.append({"source": "Web search", "error": "Add BRAVE_SEARCH_API_KEY in .env and restart to enable saved searches."})
    if not checked:
        errors.append({"source": "Setup", "error": "Add an RSS/Atom feed or company board in Connections, or configure web search."})
    result = {"added": added, "duplicates": duplicates, "checked": checked, "errors": errors}
    store.put_setting("last_discovery", result)
    return result
