#!/usr/bin/env python3
from __future__ import annotations

import json
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "epg-data.json"
URL = "https://www.tdtchannels.com/epg/TV.json"

def main() -> int:
    req = urllib.request.Request(
        URL,
        headers={
            "User-Agent": "Mozilla/5.0 (compatible; MiRadioEPGUpdater/1.0; +https://github.com/ruben79zgz/Mi-Radio)",
            "Accept": "application/json,text/plain,*/*",
        },
    )
    with urllib.request.urlopen(req, timeout=45) as response:
        raw = response.read()

    data = json.loads(raw.decode("utf-8-sig"))
    payload = {
        "source": URL,
        "updatedAt": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
        "data": data,
    }
    OUT.write_text(json.dumps(payload, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"EPG guardada: {len(raw)} bytes")
    return 0

if __name__ == "__main__":
    raise SystemExit(main())
