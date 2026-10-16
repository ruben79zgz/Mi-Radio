#!/usr/bin/env python3
from __future__ import annotations

import json
import time
import urllib.parse
import urllib.request
from datetime import datetime, timedelta, timezone
from pathlib import Path
from zoneinfo import ZoneInfo

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "resultados" / "data" / "engine.json"
MADRID = ZoneInfo("Europe/Madrid")
TSD = "https://www.thesportsdb.com/api/v1/json/3"

LEAGUES = [
    {"code":"esp.rfef.1","name":"Primera Federación · Grupo 1","country":"España","alpha2":"ES","provider":"thesportsdb","providerId":"5086"},
    {"code":"esp.rfef.2","name":"Primera Federación · Grupo 2","country":"España","alpha2":"ES","provider":"thesportsdb","providerId":"5088"},
]

POLICY = {
    "schedule": {"ttlMinutes": 360, "priority": 70},
    "standings": {"ttlMinutes": 360, "priority": 80},
    "team": {"ttlMinutes": 10080, "priority": 60},
    "finalMatch": {"ttlMinutes": 525600, "priority": 90},
}

HEADERS = {
    "User-Agent":"MiResultadosDataEngine/1.3 (+https://github.com/ruben79zgz/Mi-Radio)",
    "Accept":"application/json",
}


def fetch_json(url: str, params: dict[str, str] | None = None, attempts: int = 3) -> dict:
    if params:
        url += ("&" if "?" in url else "?") + urllib.parse.urlencode(params)
    last: Exception | None = None
    for attempt in range(attempts):
        try:
            req = urllib.request.Request(url, headers=HEADERS)
            with urllib.request.urlopen(req, timeout=45) as response:
                return json.loads(response.read().decode("utf-8"))
        except Exception as exc:
            last = exc
            if attempt < attempts - 1:
                time.sleep(2 * (attempt + 1))
    raise last or RuntimeError("fetch failed")


def current_season(now: datetime) -> str:
    local = now.astimezone(MADRID)
    start = local.year if local.month >= 7 else local.year - 1
    return f"{start}-{start+1}"


def iso(dt: datetime) -> str:
    return dt.astimezone(timezone.utc).isoformat().replace("+00:00","Z")


def expires(now: datetime, ttl_minutes: int) -> str:
    return iso(now + timedelta(minutes=ttl_minutes))


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


def parse_timestamp(raw: dict) -> int:
    value = raw.get("strTimestamp")
    if value:
        try:
            dt = datetime.fromisoformat(str(value).replace("Z","+00:00"))
            if dt.tzinfo is None:
                dt = dt.replace(tzinfo=MADRID)
            return int(dt.timestamp())
        except ValueError:
            pass
    day = raw.get("dateEventLocal") or raw.get("dateEvent")
    clock = raw.get("strTimeLocal") or raw.get("strTime") or "00:00:00"
    if day:
        try:
            dt = datetime.fromisoformat(f"{day}T{clock}").replace(tzinfo=MADRID)
            return int(dt.timestamp())
        except ValueError:
            pass
    return 0


def event_status(raw: dict) -> tuple[str,str]:
    text = str(raw.get("strStatus") or "").strip()
    low = text.casefold()
    home = number(raw.get("intHomeScore"))
    away = number(raw.get("intAwayScore"))
    stamp = parse_timestamp(raw)
    now = int(datetime.now(timezone.utc).timestamp())

    if raw.get("strPostponed") in ("yes","1",1,True) or "postpon" in low:
        return "postponed", text or "Aplazado"
    if "cancel" in low:
        return "canceled", text or "Cancelado"
    if any(x in low for x in ("finished","match finished","ft","aet","pen")):
        return "finished", text or "Final"
    if any(x in low for x in ("live","1st half","2nd half","half time","ht","in progress")):
        return "inprogress", text or "En directo"
    if stamp and home is not None and away is not None and now > stamp + 3*3600:
        return "finished", text or "Final"
    return "notstarted", text or "Programado"


def normalize_team(raw: dict, prefix: str, league: dict) -> dict:
    side = "Home" if prefix == "home" else "Away"
    return {
        "id": number(raw.get(f"id{side}Team")) or raw.get(f"id{side}Team"),
        "name": raw.get(f"str{side}Team") or ("Local" if prefix == "home" else "Visitante"),
        "logo": raw.get(f"str{side}TeamBadge") or "",
        "country":{"name":league["country"]},
        "leagueCode":league["code"],
        "leagueName":league["name"],
    }


def normalize_event(raw: dict, league: dict) -> dict:
    state, description = event_status(raw)
    return {
        "id": number(raw.get("idEvent")) or raw.get("idEvent"),
        "provider":"thesportsdb",
        "providerEventId": str(raw.get("idEvent") or ""),
        "leagueCode":league["code"],
        "startTimestamp":parse_timestamp(raw),
        "status":{"type":state,"description":description},
        "tournament":{
            "id":league["providerId"],
            "name":league["name"],
            "priority":800,
            "uniqueTournament":{"id":league["providerId"],"name":league["name"]},
            "category":{"name":league["country"],"alpha2":league["alpha2"]},
        },
        "homeTeam":normalize_team(raw,"home",league),
        "awayTeam":normalize_team(raw,"away",league),
        "homeScore":{"current":number(raw.get("intHomeScore"))},
        "awayScore":{"current":number(raw.get("intAwayScore"))},
        "extra":{
            "venue":raw.get("strVenue") or "",
            "round":raw.get("intRound") or "",
            "season":raw.get("strSeason") or "",
            "tv":raw.get("strTVStation") or "",
        },
    }


def normalize_table(raw: dict) -> dict:
    gf = number(raw.get("intGoalsFor"))
    ga = number(raw.get("intGoalsAgainst"))
    gd = number(raw.get("intGoalDifference"))
    if gd is None and gf is not None and ga is not None:
        gd = gf-ga
    return {
        "rank":number(raw.get("intRank")),
        "teamId":number(raw.get("idTeam")) or raw.get("idTeam"),
        "team":raw.get("strTeam") or "",
        "logo":raw.get("strBadge") or raw.get("strTeamBadge") or "",
        "played":number(raw.get("intPlayed")),
        "wins":number(raw.get("intWin")),
        "draws":number(raw.get("intDraw")),
        "losses":number(raw.get("intLoss")),
        "goalsFor":gf,
        "goalsAgainst":ga,
        "goalDifference":gd,
        "points":number(raw.get("intPoints")),
        "form":raw.get("strForm") or "",
    }


def team_from_event(team: dict, league: dict) -> dict | None:
    if not team.get("id") or not team.get("name"):
        return None
    return {
        "id":team["id"],
        "name":team["name"],
        "shortName":team["name"],
        "logo":team.get("logo") or "",
        "leagueCode":league["code"],
        "leagueName":league["name"],
        "country":league["country"],
        "alpha2":league["alpha2"],
        "provider":"thesportsdb",
    }


def dataset(now: datetime, source: str, kind: str, data, *, confidence="medium", note="") -> dict:
    policy = POLICY[kind]
    return {
        "source":source,
        "kind":kind,
        "priority":policy["priority"],
        "confidence":confidence,
        "updatedAt":iso(now),
        "expiresAt":expires(now,policy["ttlMinutes"]),
        "ttlMinutes":policy["ttlMinutes"],
        "note":note,
        "data":data,
    }


def previous() -> dict:
    if not OUT.exists():
        return {}
    try:
        value=json.loads(OUT.read_text(encoding="utf-8"))
        return value if isinstance(value,dict) else {}
    except Exception:
        return {}


def main() -> int:
    now=datetime.now(timezone.utc)
    season=current_season(now)
    old=previous()
    datasets=dict(old.get("datasets") or {})
    teams:dict[str,dict]={str(x.get("id")):x for x in (old.get("teams") or []) if isinstance(x,dict) and x.get("id")}
    status=[]

    for league in LEAGUES:
        code=league["code"]
        lid=league["providerId"]

        # Calendario: cambia despacio. Es la fuente que además nos permite descubrir
        # equipos de la categoría sin depender de que ESPN los conozca.
        try:
            raw=fetch_json(f"{TSD}/eventsseason.php",{"id":lid,"s":season})
            rows=raw.get("events") if isinstance(raw,dict) else None
            if not isinstance(rows,list):
                raise RuntimeError("sin events")
            events=[normalize_event(x,league) for x in rows if isinstance(x,dict)]
            events.sort(key=lambda x:(x.get("startTimestamp") or 0,str(x.get("id") or "")))
            datasets[f"schedule:{code}"]=dataset(now,"TheSportsDB","schedule",events,confidence="medium")
            for event in events:
                for side in ("homeTeam","awayTeam"):
                    item=team_from_event(event.get(side) or {},league)
                    if item:
                        teams[str(item["id"])]=item
            status.append({"dataset":f"schedule:{code}","ok":True,"count":len(events)})
            print(f"{code} schedule: {len(events)}")
        except Exception as exc:
            status.append({"dataset":f"schedule:{code}","ok":False,"error":str(exc)})
            print(f"{code} schedule ERROR: {exc}")

        # Clasificación: no se consulta cada minuto. 6h de TTL y se conserva la
        # última válida si la liga no está disponible en el endpoint gratuito.
        try:
            raw=fetch_json(f"{TSD}/lookuptable.php",{"l":lid,"s":season})
            rows=raw.get("table") if isinstance(raw,dict) else None
            if not isinstance(rows,list) or not rows:
                raise RuntimeError("tabla no disponible")
            table=[normalize_table(x) for x in rows if isinstance(x,dict)]
            datasets[f"standings:{code}"]=dataset(now,"TheSportsDB","standings",table,confidence="medium")
            status.append({"dataset":f"standings:{code}","ok":True,"count":len(table)})
            print(f"{code} standings: {len(table)}")
        except Exception as exc:
            status.append({"dataset":f"standings:{code}","ok":False,"error":str(exc)})
            print(f"{code} standings ERROR: {exc}")

    # Zaragoza es nuestro caso de prueba: ficha estática de larga duración.
    try:
        raw=fetch_json(f"{TSD}/lookupteam.php",{"id":"133737"})
        rows=raw.get("teams") if isinstance(raw,dict) else None
        if isinstance(rows,list) and rows:
            t=rows[0]
            team={
                "id":number(t.get("idTeam")) or t.get("idTeam"),
                "name":t.get("strTeam") or "Real Zaragoza",
                "shortName":t.get("strTeamShort") or t.get("strTeam") or "Real Zaragoza",
                "logo":t.get("strBadge") or "",
                "leagueCode":"esp.rfef.2",
                "leagueName":"Primera Federación · Grupo 2",
                "country":"España",
                "alpha2":"ES",
                "provider":"thesportsdb",
                "venue":t.get("strStadium") or "",
                "venueCapacity":number(t.get("intStadiumCapacity")),
                "location":t.get("strLocation") or "",
                "manager":t.get("strManager") or "",
            }
            teams[str(team["id"])]=team
            datasets["team:133737"]=dataset(now,"TheSportsDB","team",team,confidence="high")
            status.append({"dataset":"team:133737","ok":True})
            print("Real Zaragoza: OK")
        else:
            raise RuntimeError("equipo no disponible")
    except Exception as exc:
        status.append({"dataset":"team:133737","ok":False,"error":str(exc)})
        print(f"Real Zaragoza ERROR: {exc}")

    payload={
        "schemaVersion":1,
        "updatedAt":iso(now),
        "season":season,
        "policy":POLICY,
        "providers":{
            "espn":{"role":"live/major leagues","priority":90},
            "thesportsdb":{"role":"coverage gaps/static data","priority":70},
        },
        "datasets":datasets,
        "teams":sorted(teams.values(),key=lambda x:(x.get("country",""),x.get("leagueName",""),x.get("name",""))),
        "status":status,
    }

    OUT.parent.mkdir(parents=True,exist_ok=True)
    OUT.write_text(json.dumps(payload,ensure_ascii=False,separators=(",",":")),encoding="utf-8")
    print(f"Engine OK: {len(datasets)} datasets · {len(payload['teams'])} teams · season={season}")
    return 0


if __name__=="__main__":
    raise SystemExit(main())
