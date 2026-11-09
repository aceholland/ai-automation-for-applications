"""Local configuration. Provider secrets never enter browser responses."""

import os
import secrets
from dataclasses import dataclass
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent


def load_env(path=None):
    path = Path(path or ROOT / ".env")
    if path.exists():
        for line in path.read_text(encoding="utf-8-sig").splitlines():
            line = line.strip()
            if line and not line.startswith("#") and "=" in line:
                key, value = line.split("=", 1)
                os.environ.setdefault(key.strip(), value.strip().strip("\"'"))


@dataclass
class Config:
    data_dir: Path
    host: str = "127.0.0.1"
    port: int = 8765
    ai_enabled: bool = False
    ai_key: str = ""
    ai_model: str = ""
    ai_base: str = "https://api.openai.com/v1"
    search_key: str = ""
    token: str = ""

    def __post_init__(self):
        self.data_dir = Path(self.data_dir)
        self.data_dir.mkdir(parents=True, exist_ok=True)
        token_file = self.data_dir / "pairing-token.txt"
        if not self.token:
            if token_file.exists():
                self.token = token_file.read_text().strip()
            else:
                self.token = secrets.token_urlsafe(32)
                token_file.write_text(self.token, encoding="utf-8")
                try:
                    token_file.chmod(0o600)
                except OSError:
                    pass

    @property
    def ai_ready(self):
        return bool(self.ai_enabled and self.ai_key and self.ai_model)

    def public(self):
        return {"ai": self.ai_ready, "ai_model": self.ai_model if self.ai_ready else "",
                "search": bool(self.search_key), "storage": "Local on this computer",
                "submission": "You review and submit", "version": "1.0.0"}

    @classmethod
    def from_env(cls):
        load_env()
        return cls(Path(os.environ.get("OPPORTUNITY_DATA_DIR", str(ROOT / "data"))),
                   host=os.environ.get("OPPORTUNITY_HOST", "127.0.0.1"),
                   port=int(os.environ.get("OPPORTUNITY_PORT", "8765")),
                   ai_enabled=os.environ.get("AI_ENABLED", "0") == "1",
                   ai_key=os.environ.get("AI_API_KEY", ""), ai_model=os.environ.get("AI_MODEL", ""),
                   ai_base=os.environ.get("AI_BASE_URL", "https://api.openai.com/v1").rstrip("/"),
                   search_key=os.environ.get("BRAVE_SEARCH_API_KEY", ""),
                   token=os.environ.get("OPPORTUNITY_TOKEN", ""))
