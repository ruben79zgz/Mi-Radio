#!/usr/bin/env python3
from __future__ import annotations

import json
import time
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from pathlib import Path
from zoneinfo import ZoneInfo

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "resultados" / "data" / "scores.json"
MADRID = ZoneInfo("Europe/Madrid")
BASE = "https://www.thesportsdb.com/api/v1/json/123"

HEADERS = {
    "User-Agent": "MiResultados/1.0 (+https://github.com/ruben79zgz/Mi-Radio)",
    "Accept": "application/json",
}


def fetch_json(path: str, params: dict[str, str] | None = None) -> dict:
    url = BASE + path
    if params:
        url += "?" + urllib.parse.urlencode(params)

    last_error: Exception | None = None
    for attempt in range(3):
        try:
            req = urllib.request.Request(url, headers=HEADERS)
            with urllib.request.urlopen(req, timeout=45) as response:
                return json.loads(response.read().decode("utf-8"))
        except Exception as exc:
            last_error = exc
            if attempt < 2:
                time.sleep(3 * (attempt + 1))

    raise last_error or RuntimeError("No se pudo consultar TheSportsDB")


def number(value):
    if value in (None, ""):
        return None
    try:
        return int(value)
    except (TypeError, ValueError):
        try:
            return float(value)
        except (TypeError, ValueError):
            return None


def event_timestamp(raw: dict) -> int:
    value = raw.get("strTimestamp")
    if value:
        try:
            dt = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
            if dt.tzinfo is None:
                dt = dt.replace(tzinfo=MADRID)
            return int(dt.timestamp())
        except ValueError:
            pass

    day = raw.get("dateEventLocal") or raw.get("dateEvent")
    clock = raw.get("strTimeLocal") or raw.get("strTime") or "00:00:00"
    if day:
        try:
            dt = datetime.fromisoformat(f"{day}T{clock}")
            dt = dt.replace(tzinfo=MADRID)
            return int(dt.timestamp())
        except ValueError:
            pass
    return 0


def status(raw: dict) -> tuple[str, str]:
    text = str(raw.get("strStatus") or "").strip()
    lowered = text.casefold()
    home = number(raw.get("intHomeScore"))
    away = number(raw.get("intAwayScore"))
    start = event_timestamp(raw)
    now = int(datetime.now(timezone.utc).timestamp())

    if raw.get("strPostponed") in ("yes", "1", 1, True) or "postpon" in lowered:
        return "postponed", text or "Postponed"
    if "cancel" in lowered:
        return "canceled", text or "Cancelled"
    if any(word in lowered for word in ("finished", "match finished", "ft", "aet", "pen")):
        return "finished", text or "Ended"
    if any(word in lowered for word in ("live", "1st half", "2nd half", "half time", "ht", "in progress")):
        return "inprogress", text or "Live"

    # TheSportsDB no siempre rellena strStatus. Si ya hay marcador y el partido
    # está dentro de una ventana razonable, lo tratamos como posible directo.
    if home is not None and away is not None and start and start <= now <= start + 3 * 3600:
        return "inprogress", text or "Live"
    if start and now > start + 3 * 3600 and home is not None and away is not None:
        return "finished", text or "Ended"
    return "notstarted", text or "Not started"


def normalize_event(raw: dict) -> dict:
    state, description = status(raw)
    league_id = number(raw.get("idLeague"))
    home_id = number(raw.get("idHomeTeam"))
    away_id = number(raw.get("idAwayTeam"))
    country = raw.get("strCountry") or ""

    event = {
        "id": number(raw.get("idEvent")) or raw.get("idEvent"),
        "provider": "thesportsdb",
        "startTimestamp": event_timestamp(raw),
        "status": {
            "type": state,
            "description": description,
        },
        "tournament": {
            "id": league_id,
            "name": raw.get("strLeague") or "Fútbol",
            "priority": 999,
            "uniqueTournament": {
                "id": league_id,
                "name": raw.get("strLeague") or "Fútbol",
            },
            "category": {
                "name": country or "Internacional",
            },
        },
        "homeTeam": {
            "id": home_id,
            "name": raw.get("strHomeTeam") or "Local",
            "logo": raw.get("strHomeTeamBadge") or "",
            "country": {"name": country} if country else {},
        },
        "awayTeam": {
            "id": away_id,
            "name": raw.get("strAwayTeam") or "Visitante",
            "logo": raw.get("strAwayTeamBadge") or "",
            "country": {"name": country} if country else {},
        },
        "homeScore": {"current": number(raw.get("intHomeScore"))},
        "awayScore": {"current": number(raw.get("intAwayScore"))},
    }
    return event


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

    try:
        data = fetch_json("/eventsday.php", {"d": today, "s": "Soccer"})
        raw_events = data.get("events") if isinstance(data, dict) else None
        if not isinstance(raw_events, list):
            raise RuntimeError("La API no devolvió una lista de eventos")

        events = [normalize_event(item) for item in raw_events if isinstance(item, dict)]
        live = [item for item in events if item.get("status", {}).get("type") == "inprogress"]

        payload = {
            "updatedAt": now.isoformat().replace("+00:00", "Z"),
            "source": "TheSportsDB free API",
            "days": {today: events},
            "live": live,
        }

        OUT.parent.mkdir(parents=True, exist_ok=True)
        OUT.write_text(
            json.dumps(payload, ensure_ascii=False, separators=(",", ":")),
            encoding="utf-8",
        )
        print(f"TheSportsDB OK: {len(events)} partidos, {len(live)} posibles directos")
        print(f"Guardado: {OUT}")
        return 0

    except Exception as exc:
        print(f"ERROR TheSportsDB: {exc}")
        if old.get("updatedAt"):
            print("Se conserva la última copia válida.")
            return 0
        raise


if __name__ == "__main__":
    raise SystemExit(main())
