"""Bounded requests to public hosts, pinned to validated DNS addresses."""

import http.client
import ipaddress
import json
import socket
import ssl
from urllib.parse import urljoin, urlsplit

MAX_BYTES = 2_000_000


def validate_public_url(url):
    try:
        parsed = urlsplit(url)
        if parsed.scheme not in ("http", "https") or not parsed.hostname or parsed.username or parsed.password:
            raise ValueError("Use a public http:// or https:// URL without credentials.")
        port = parsed.port or (443 if parsed.scheme == "https" else 80)
        if port not in (80, 443):
            raise ValueError("Source URLs must use standard web ports (80 or 443).")
        try:
            addresses = [str(ipaddress.ip_address(parsed.hostname))]
        except ValueError:
            addresses = list(dict.fromkeys(x[4][0] for x in socket.getaddrinfo(parsed.hostname, port, type=socket.SOCK_STREAM)))
        if not addresses or any(not ipaddress.ip_address(ip).is_global for ip in addresses):
            raise ValueError("Only public internet sources are allowed; local and private addresses are blocked.")
        return parsed, addresses
    except (OSError, UnicodeError) as exc:
        raise ValueError("The source hostname could not be resolved. Check the URL and internet connection.") from exc


class _PinnedHTTPS(http.client.HTTPSConnection):
    def __init__(self, host, address, port, timeout):
        super().__init__(host, port, timeout=timeout, context=ssl.create_default_context())
        self.address = address

    def connect(self):
        self.sock = socket.create_connection((self.address, self.port), self.timeout)
        self.sock = self._context.wrap_socket(self.sock, server_hostname=self.host)


def request(url, method="GET", headers=None, body=None, timeout=12, max_bytes=MAX_BYTES, redirects=4):
    parsed, addresses = validate_public_url(url)
    port = parsed.port or (443 if parsed.scheme == "https" else 80)
    conn = (_PinnedHTTPS(parsed.hostname, addresses[0], port, timeout) if parsed.scheme == "https"
            else http.client.HTTPConnection(addresses[0], port, timeout=timeout))
    path = parsed.path or "/"
    if parsed.query:
        path += "?" + parsed.query
    req_headers = {"User-Agent": "OpportunityDesk/1.0 (personal application assistant)", "Host": parsed.netloc,
                   "Accept-Encoding": "identity", **(headers or {})}
    try:
        conn.request(method, path, body=body, headers=req_headers)
        response = conn.getresponse()
        if response.status in (301, 302, 303, 307, 308):
            if redirects <= 0 or method != "GET" or any(k.lower() in ("authorization", "x-subscription-token") for k in req_headers):
                raise ValueError("Unexpected redirect. Use the provider's direct HTTPS endpoint.")
            location = response.getheader("Location")
            if not location:
                raise ValueError("Source returned an invalid redirect.")
            return request(urljoin(url, location), method, headers, body, timeout, max_bytes, redirects - 1)
        if response.status >= 400:
            raise ValueError(f"Remote service returned HTTP {response.status}. Check credentials, limits, or the source URL.")
        raw = response.read(max_bytes + 1)
        if len(raw) > max_bytes:
            raise ValueError("Source is too large. Paste the relevant listing text instead.")
        return raw, url
    except (OSError, http.client.HTTPException, ssl.SSLError) as exc:
        raise ValueError("Could not reach the remote service. Check the connection, source URL, or provider settings.") from exc
    finally:
        conn.close()


def fetch_text(url):
    raw, final = request(url)
    return raw.decode("utf-8", errors="replace"), final


def request_json(url, method="GET", headers=None, payload=None, timeout=12):
    body = json.dumps(payload).encode() if payload is not None else None
    raw, _ = request(url, method, {"Accept": "application/json", **({"Content-Type": "application/json"} if body else {}),
                                  **(headers or {})}, body, timeout)
    try:
        return json.loads(raw)
    except (ValueError, UnicodeError) as exc:
        raise ValueError("The provider returned invalid JSON. Check its API endpoint.") from exc
