#!/usr/bin/env python3
from __future__ import annotations

import json
import urllib.request
from datetime import datetime, timezone
from pathlib import Path
from zoneinfo import ZoneInfo

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "resultados" / "data" / "scores.json"
BASE = "https://api.sofascore.com/api/v1"
MADRID = ZoneInfo("Europe/Madrid")

HEADERS = {
    "User-Agent": "Mozilla/5.0 (compatible; MiResultadosBot/1.0)",
    "Accept": "application/json",
}


def fetch_json(path: str) -> dict:
    req = urllib.request.Request(BASE + path, headers=HEADERS)
    with urllib.request.urlopen(req, timeout=25) as response:
        return json.loads(response.read().decode("utf-8"))


def previous() -> dict:
    if not OUT.exists():
        return {"updatedAt": None, "days": {}, "live": []}
    try:
        data = json.loads(OUT.read_text(encoding="utf-8"))
        return data if isinstance(data, dict) else {"updatedAt": None, "days": {}, "live": []}
    except Exception:
        return {"updatedAt": None, "days": {}, "live": []}


def main() -> int:
    now = datetime.now(timezone.utc)
    today = now.astimezone(MADRID).date().isoformat()
    old = previous()

    days = dict(old.get("days") or {})
    live = list(old.get("live") or [])
    changed = False

    try:
        data = fetch_json(f"/sport/football/scheduled-events/{today}")
        events = data.get("events") if isinstance(data, dict) else None
        if isinstance(events, list):
            days = {today: events}
            changed = True
            print(f"Partidos de hoy: {len(events)}")
    except Exception as exc:
        print(f"ERROR calendario: {exc}")

    try:
        data = fetch_json("/sport/football/events/live")
        events = data.get("events") if isinstance(data, dict) else None
        if isinstance(events, list):
            live = events
            changed = True
            print(f"En directo: {len(events)}")
    except Exception as exc:
        print(f"ERROR directo: {exc}")

    if not changed and old.get("updatedAt"):
        print("Sin datos nuevos; se conserva la copia anterior.")
        return 0

    OUT.parent.mkdir(parents=True, exist_ok=True)
    payload = {
        "updatedAt": now.isoformat().replace("+00:00", "Z"),
        "source": "SofaScore public web data",
        "days": days,
        "live": live,
    }
    OUT.write_text(
        json.dumps(payload, ensure_ascii=False, separators=(",", ":")),
        encoding="utf-8",
    )
    print(f"Guardado: {OUT}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
