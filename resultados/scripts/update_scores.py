#!/usr/bin/env python3
from __future__ import annotations

import json
import re
import time
import urllib.parse
import urllib.request
from datetime import datetime, timezone
from pathlib import Path
from zoneinfo import ZoneInfo

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "resultados" / "data" / "scores.json"
MADRID = ZoneInfo("Europe/Madrid")

ESPN_BASE = "https://site.api.espn.com/apis/site/v2/sports/soccer/all/scoreboard"
SPORTSDB_BASE = "https://www.thesportsdb.com/api/v1/json/123"

HEADERS = {
    "User-Agent": "MiResultados/1.1 (+https://github.com/ruben79zgz/Mi-Radio)",
    "Accept": "application/json",
}

COUNTRY_WORDS = {
    "english": "Inglaterra",
    "spanish": "España",
    "german": "Alemania",
    "italian": "Italia",
    "french": "Francia",
    "portuguese": "Portugal",
    "dutch": "Países Bajos",
    "belgian": "Bélgica",
    "scottish": "Escocia",
    "turkish": "Turquía",
    "greek": "Grecia",
    "swiss": "Suiza",
    "austrian": "Austria",
    "polish": "Polonia",
    "danish": "Dinamarca",
    "swedish": "Suecia",
    "norwegian": "Noruega",
    "russian": "Rusia",
    "ukrainian": "Ucrania",
    "argentine": "Argentina",
    "brazilian": "Brasil",
    "mexican": "México",
    "colombian": "Colombia",
    "chilean": "Chile",
    "peruvian": "Perú",
    "uruguayan": "Uruguay",
    "paraguayan": "Paraguay",
    "ecuadorian": "Ecuador",
    "american": "Estados Unidos",
    "canadian": "Canadá",
    "australian": "Australia",
    "japanese": "Japón",
    "chinese": "China",
    "saudi": "Arabia Saudí",
    "indian": "India",
    "korean": "Corea del Sur",
}


def fetch_json(url: str, params: dict[str, str] | None = None, attempts: int = 3) -> dict:
    if params:
        url += ("&" if "?" in url else "?") + urllib.parse.urlencode(params)

    last_error: Exception | None = None
    for attempt in range(attempts):
        try:
            req = urllib.request.Request(url, headers=HEADERS)
            with urllib.request.urlopen(req, timeout=45) as response:
                return json.loads(response.read().decode("utf-8"))
        except Exception as exc:
            last_error = exc
            if attempt < attempts - 1:
                time.sleep(2 * (attempt + 1))

    raise last_error or RuntimeError("No se pudo consultar el proveedor")


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


def parse_iso_timestamp(value: str | None) -> int:
    if not value:
        return 0
    try:
        dt = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
        if dt.tzinfo is None:
            dt = dt.replace(tzinfo=timezone.utc)
        return int(dt.timestamp())
    except ValueError:
        return 0


def clean_season_slug(slug: str) -> str:
    value = re.sub(r"^\d{4}(?:-\d{2,4})?-", "", slug or "")
    value = value.replace("-", " ").strip()
    if not value:
        return "Fútbol"
    if value == "laliga":
        return "LaLiga"
    if value.startswith("laliga "):
        return "LaLiga " + value[len("laliga "):]
    replacements = {
        "uefa": "UEFA",
        "fifa": "FIFA",
        "afc": "AFC",
        "concacaf": "CONCACAF",
        "mls": "MLS",
        "nwsl": "NWSL",
        "liga mx": "Liga MX",
    }
    words = []
    for word in value.split():
        low = word.lower()
        if low in replacements:
            words.append(replacements[low])
        else:
            words.append(word.capitalize())
    text = " ".join(words)
    for key, repl in replacements.items():
        if " " in key:
            text = re.sub(rf"\b{re.escape(key.title())}\b", repl, text)
    return text


def country_from_slug(slug: str) -> str:
    low = (slug or "").lower()
    if "laliga" in low or "copa-del-rey" in low or "liga-f" in low:
        return "España"
    for word, country in COUNTRY_WORDS.items():
        if word in low:
            return country
    if any(token in low for token in ("uefa", "fifa", "concacaf", "libertadores", "sudamericana", "afc", "caf")):
        return "Internacional"
    return "Internacional"


def espn_status(raw: dict) -> tuple[str, str]:
    status = raw.get("status") or {}
    type_info = status.get("type") or {}
    state = str(type_info.get("state") or "").lower()
    completed = bool(type_info.get("completed"))
    detail = str(type_info.get("detail") or type_info.get("shortDetail") or type_info.get("description") or "")

    if completed or state == "post":
        return "finished", detail or "Final"
    if state == "in":
        return "inprogress", detail or "En directo"

    lowered = detail.lower()
    if "postpon" in lowered:
        return "postponed", detail
    if "cancel" in lowered:
        return "canceled", detail
    if "suspend" in lowered or "interrupt" in lowered:
        return "interrupted", detail
    return "notstarted", detail or "Programado"


def espn_competitor(comp: dict, side: str) -> dict:
    for item in comp.get("competitors") or []:
        if item.get("homeAway") == side:
            return item
    return {}


def espn_team(item: dict) -> dict:
    team = item.get("team") or {}
    logo = team.get("logo") or ""
    if not logo:
        logos = team.get("logos") or []
        if logos and isinstance(logos[0], dict):
            logo = logos[0].get("href") or ""
    return {
        "id": number(team.get("id")) or team.get("id"),
        "name": team.get("displayName") or team.get("shortDisplayName") or team.get("name") or "Equipo",
        "logo": logo,
        "country": {},
    }


def normalize_espn_event(raw: dict) -> dict | None:
    competitions = raw.get("competitions") or []
    if not competitions:
        return None
    comp = competitions[0]
    home = espn_competitor(comp, "home")
    away = espn_competitor(comp, "away")
    if not home or not away:
        return None

    season = raw.get("season") or {}
    slug = str(season.get("slug") or "")
    league_name = clean_season_slug(slug)
    country = country_from_slug(slug)
    state, description = espn_status(raw)

    home_team = espn_team(home)
    away_team = espn_team(away)
    if country != "Internacional":
        home_team["country"] = {"name": country}
        away_team["country"] = {"name": country}

    return {
        "id": number(raw.get("id")) or raw.get("id"),
        "provider": "espn",
        "startTimestamp": parse_iso_timestamp(raw.get("date")),
        "status": {
            "type": state,
            "description": description,
        },
        "tournament": {
            "id": slug or league_name,
            "name": league_name,
            "priority": 500,
            "uniqueTournament": {
                "id": slug or league_name,
                "name": league_name,
            },
            "category": {
                "name": country,
            },
        },
        "homeTeam": home_team,
        "awayTeam": away_team,
        "homeScore": {"current": number(home.get("score"))},
        "awayScore": {"current": number(away.get("score"))},
        "time": {
            "displayClock": (raw.get("status") or {}).get("displayClock") or "",
            "period": (raw.get("status") or {}).get("period"),
        },
    }


def sportsdb_timestamp(raw: dict) -> int:
    value = raw.get("strTimestamp")
    if value:
        parsed = parse_iso_timestamp(str(value))
        if parsed:
            return parsed

    day = raw.get("dateEventLocal") or raw.get("dateEvent")
    clock = raw.get("strTimeLocal") or raw.get("strTime") or "00:00:00"
    if day:
        try:
            dt = datetime.fromisoformat(f"{day}T{clock}").replace(tzinfo=MADRID)
            return int(dt.timestamp())
        except ValueError:
            pass
    return 0


def sportsdb_status(raw: dict) -> tuple[str, str]:
    text = str(raw.get("strStatus") or "").strip()
    low = text.casefold()
    if "postpon" in low:
        return "postponed", text
    if "cancel" in low:
        return "canceled", text
    if any(word in low for word in ("finished", "match finished", "ft", "aet", "pen")):
        return "finished", text or "Final"
    if any(word in low for word in ("live", "1st half", "2nd half", "half time", "ht", "in progress")):
        return "inprogress", text or "En directo"
    return "notstarted", text or "Programado"


def normalize_sportsdb_event(raw: dict) -> dict:
    state, description = sportsdb_status(raw)
    league_id = number(raw.get("idLeague"))
    home_id = number(raw.get("idHomeTeam"))
    away_id = number(raw.get("idAwayTeam"))
    country = raw.get("strCountry") or "Internacional"

    return {
        "id": number(raw.get("idEvent")) or raw.get("idEvent"),
        "provider": "thesportsdb",
        "startTimestamp": sportsdb_timestamp(raw),
        "status": {"type": state, "description": description},
        "tournament": {
            "id": league_id,
            "name": raw.get("strLeague") or "Fútbol",
            "priority": 999,
            "uniqueTournament": {"id": league_id, "name": raw.get("strLeague") or "Fútbol"},
            "category": {"name": country},
        },
        "homeTeam": {
            "id": home_id,
            "name": raw.get("strHomeTeam") or "Local",
            "logo": raw.get("strHomeTeamBadge") or "",
            "country": {"name": country},
        },
        "awayTeam": {
            "id": away_id,
            "name": raw.get("strAwayTeam") or "Visitante",
            "logo": raw.get("strAwayTeamBadge") or "",
            "country": {"name": country},
        },
        "homeScore": {"current": number(raw.get("intHomeScore"))},
        "awayScore": {"current": number(raw.get("intAwayScore"))},
    }


def previous() -> dict:
    if not OUT.exists():
        return {"updatedAt": None, "days": {}, "live": []}
    try:
        data = json.loads(OUT.read_text(encoding="utf-8"))
        return data if isinstance(data, dict) else {"updatedAt": None, "days": {}, "live": []}
    except Exception:
        return {"updatedAt": None, "days": {}, "live": []}


def fetch_espn_day(compact_day: str) -> list[dict]:
    """Recorre páginas sin repetir datos. Si ESPN ignora page, se detiene al detectar duplicados."""
    collected: list[dict] = []
    seen_ids: set[str] = set()

    for page in range(1, 8):
        data = fetch_json(
            ESPN_BASE,
            {"dates": compact_day, "limit": "100", "page": str(page)},
            attempts=3 if page == 1 else 2,
        )
        raw_events = data.get("events") if isinstance(data, dict) else None
        if not isinstance(raw_events, list):
            if page == 1:
                raise RuntimeError("ESPN no devolvió una lista de eventos")
            break

        new_count = 0
        for item in raw_events:
            if not isinstance(item, dict):
                continue
            event_id = str(item.get("id") or "")
            if event_id and event_id in seen_ids:
                continue
            normalized = normalize_espn_event(item)
            if not normalized:
                continue
            if event_id:
                seen_ids.add(event_id)
            collected.append(normalized)
            new_count += 1

        print(f"ESPN página {page}: {len(raw_events)} recibidos · {new_count} nuevos")

        if not raw_events or new_count == 0 or len(raw_events) < 100:
            break

    return collected


def main() -> int:
    now = datetime.now(timezone.utc)
    today = now.astimezone(MADRID).date().isoformat()
    compact_day = today.replace("-", "")
    old = previous()

    provider = ""
    events: list[dict] = []

    try:
        events = fetch_espn_day(compact_day)
        if not events:
            raise RuntimeError("ESPN devolvió 0 partidos")
        provider = "ESPN public scoreboard"
        print(f"ESPN OK: {len(events)} partidos tras paginación")
    except Exception as exc:
        print(f"ERROR ESPN: {exc}")

    if not events:
        try:
            data = fetch_json(
                SPORTSDB_BASE + "/eventsday.php",
                {"d": today, "s": "Soccer"},
                attempts=2,
            )
            raw_events = data.get("events") if isinstance(data, dict) else None
            if not isinstance(raw_events, list):
                raise RuntimeError("TheSportsDB no devolvió una lista de eventos")
            events = [normalize_sportsdb_event(item) for item in raw_events if isinstance(item, dict)]
            provider = "TheSportsDB free API"
            print(f"TheSportsDB OK: {len(events)} partidos")
        except Exception as exc:
            print(f"ERROR TheSportsDB: {exc}")

    if not events:
        if old.get("updatedAt"):
            print("No hay datos nuevos; se conserva la última copia válida.")
            return 0
        raise RuntimeError("No hay ningún proveedor disponible")

    live = [item for item in events if item.get("status", {}).get("type") == "inprogress"]

    payload = {
        "updatedAt": now.isoformat().replace("+00:00", "Z"),
        "source": provider,
        "days": {today: events},
        "live": live,
    }

    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(
        json.dumps(payload, ensure_ascii=False, separators=(",", ":")),
        encoding="utf-8",
    )

    leagues = {
        str(item.get("tournament", {}).get("name") or "")
        for item in events
        if item.get("tournament")
    }
    print(
        f"Guardado: {len(events)} partidos · {len(leagues)} competiciones · "
        f"{len(live)} en directo · proveedor={provider}"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
