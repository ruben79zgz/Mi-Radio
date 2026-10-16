#!/usr/bin/env python3
from __future__ import annotations

import io
import json
import re
import time
import urllib.parse
import urllib.request
import zlib
from datetime import datetime, timedelta, timezone
from pathlib import Path
from zoneinfo import ZoneInfo
from pypdf import PdfReader

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "resultados" / "data" / "engine.json"
MADRID = ZoneInfo("Europe/Madrid")
TSD = "https://www.thesportsdb.com/api/v1/json/3"

LEAGUES = [
    {"code":"esp.rfef.1","name":"Primera Federación · Grupo 1","country":"España","alpha2":"ES","provider":"thesportsdb","providerId":"5086"},
    {"code":"esp.rfef.2","name":"Primera Federación · Grupo 2","country":"España","alpha2":"ES","provider":"thesportsdb","providerId":"5088"},
]

RFEF = {
    "esp.rfef.1": {
        "pdf":"https://rfef.es/sites/default/files/2026-06/Primera_Federacion_Grupo_I.pdf",
        "teams":[
            "AD Mérida","Arenas Club","Athletic Club \"B\"","Barakaldo CF","CD Coria",
            "CD Extremadura","CD Lugo","CD Mirandés","CP Cacereño","CyD Leonesa",
            "Pontevedra CF","Racing Club Ferrol","RC Deportivo Fabril","Real Avilés Industrial",
            "Real Unión Club","SD Ponferradina","UD Logroñés","UD Ourense",
            "Unionistas de Salamanca CF","Zamora CF"
        ],
    },
    "esp.rfef.2": {
        "pdf":"https://rfef.es/sites/default/files/2026-06/Primera_Federacion_Grupo_II.pdf",
        "teams":[
            "AD Alcorcón","Águilas FC","Algeciras CF","Antequera CF","Atlético Madrileño",
            "CD Teruel","CE Europa","CF Rayo Majadahonda","FC Cartagena","Gimnàstic de Tarragona",
            "Hércules de Alicante CF","Juventud de Torremolinos CF","Real Jaén CF",
            "Real Madrid Castilla","Real Murcia CF","Real Zaragoza","SD Huesca","UD Ibiza",
            "UE Sant Andreu","Villarreal CF \"B\""
        ],
    },
}

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


def fetch_json(url: str, params: dict[str, str] | None = None, attempts: int = 2, timeout: int = 15) -> dict:
    if params:
        url += ("&" if "?" in url else "?") + urllib.parse.urlencode(params)
    last: Exception | None = None
    for attempt in range(attempts):
        try:
            req = urllib.request.Request(url, headers=HEADERS)
            with urllib.request.urlopen(req, timeout=timeout) as response:
                return json.loads(response.read().decode("utf-8"))
        except Exception as exc:
            last = exc
            if attempt < attempts - 1:
                time.sleep(2 * (attempt + 1))
    raise last or RuntimeError("fetch failed")


def fetch_bytes(url: str, attempts: int = 2) -> bytes:
    last: Exception | None = None
    for attempt in range(attempts):
        try:
            req = urllib.request.Request(url, headers=HEADERS)
            with urllib.request.urlopen(req, timeout=35) as response:
                return response.read()
        except Exception as exc:
            last = exc
            if attempt < attempts - 1:
                time.sleep(2 * (attempt + 1))
    raise last or RuntimeError("fetch bytes failed")


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


def stable_team_id(code: str, name: str) -> int:
    if code == "esp.rfef.2" and name == "Real Zaragoza":
        return 133737
    return 900_000_000 + (zlib.crc32(f"{code}:{name}".encode("utf-8")) % 90_000_000)


def normalize_space(value: str) -> str:
    return re.sub(r"\s+", " ", value or "").strip()


def parse_rfef_schedule(pdf_bytes: bytes, league: dict) -> list[dict]:
    config = RFEF[league["code"]]
    teams = config["teams"]
    teams_by_length = sorted(teams, key=len, reverse=True)
    reader = PdfReader(io.BytesIO(pdf_bytes))

    lines: list[str] = []
    for page in reader.pages:
        text = page.extract_text() or ""
        lines.extend(normalize_space(line) for line in text.splitlines() if normalize_space(line))

    events: list[dict] = []
    current_round: int | None = None
    current_date: str | None = None
    match_index = 0

    for line in lines:
        journey = re.match(r"^Jornada\s+(\d+)\s+\((\d{2}/\d{2}/\d{4})\)$", line, flags=re.I)
        if journey:
            current_round = int(journey.group(1))
            day, month, year = map(int, journey.group(2).split("/"))
            current_date = f"{year:04d}-{month:02d}-{day:02d}"
            continue

        if not current_round or not current_date:
            continue

        pair = None
        for home in teams_by_length:
            prefix = home + " "
            if not line.startswith(prefix):
                continue
            away = normalize_space(line[len(prefix):])
            if away in teams and away != home:
                pair = (home, away)
                break

        if not pair:
            continue

        home, away = pair
        match_index += 1
        day_dt = datetime.fromisoformat(current_date + "T12:00:00").replace(tzinfo=MADRID)
        events.append({
            "id": stable_team_id(league["code"], f"{current_round}:{home}:{away}"),
            "provider":"rfef",
            "providerEventId":"",
            "leagueCode":league["code"],
            "startTimestamp":int(day_dt.timestamp()),
            "timeConfirmed":False,
            "status":{"type":"notstarted","description":"Horario por confirmar"},
            "tournament":{
                "id":league["providerId"],
                "name":league["name"],
                "priority":800,
                "uniqueTournament":{"id":league["providerId"],"name":league["name"]},
                "category":{"name":league["country"],"alpha2":league["alpha2"]},
            },
            "homeTeam":{
                "id":stable_team_id(league["code"], home),
                "name":home,
                "logo":"",
                "country":{"name":league["country"]},
                "leagueCode":league["code"],
                "leagueName":league["name"],
            },
            "awayTeam":{
                "id":stable_team_id(league["code"], away),
                "name":away,
                "logo":"",
                "country":{"name":league["country"]},
                "leagueCode":league["code"],
                "leagueName":league["name"],
            },
            "homeScore":{"current":None},
            "awayScore":{"current":None},
            "extra":{
                "venue":"",
                "round":current_round,
                "season":"2026-2027",
                "tv":"",
                "officialSource":"RFEF",
            },
        })

    # El calendario oficial debe tener 38 jornadas x 10 partidos.
    if len(events) < 300:
        raise RuntimeError(f"RFEF PDF parse incompleto: {len(events)} partidos")
    return events


def merge_schedule(primary: list[dict], fallback: list[dict]) -> list[dict]:
    """TheSportsDB aporta hora/estadio si responde; RFEF garantiza el calendario."""
    if not primary:
        return fallback
    result = list(primary)

    def key(event: dict) -> tuple[str, str, str]:
        return (
            str(event.get("leagueCode") or ""),
            normalize_space(str(event.get("homeTeam", {}).get("name") or "")).casefold(),
            normalize_space(str(event.get("awayTeam", {}).get("name") or "")).casefold(),
        )

    existing = {key(event) for event in primary}
    for event in fallback:
        if key(event) not in existing:
            result.append(event)
    result.sort(key=lambda x:(x.get("startTimestamp") or 0,str(x.get("id") or "")))
    return result


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

        # Calendario: la RFEF oficial garantiza las 38 jornadas; TheSportsDB,
        # cuando responde, añade hora exacta, estadio y resultado.
        rfef_events: list[dict] = []
        tsd_events: list[dict] = []

        try:
            pdf_bytes=fetch_bytes(RFEF[code]["pdf"])
            rfef_events=parse_rfef_schedule(pdf_bytes,league)
            status.append({"dataset":f"schedule-rfef:{code}","ok":True,"count":len(rfef_events)})
            print(f"{code} RFEF schedule: {len(rfef_events)}")
        except Exception as exc:
            status.append({"dataset":f"schedule-rfef:{code}","ok":False,"error":str(exc)})
            print(f"{code} RFEF schedule ERROR: {exc}")

        try:
            raw=fetch_json(f"{TSD}/eventsseason.php",{"id":lid,"s":season},attempts=1,timeout=12)
            rows=raw.get("events") if isinstance(raw,dict) else None
            if not isinstance(rows,list):
                raise RuntimeError("sin events")
            tsd_events=[normalize_event(x,league) for x in rows if isinstance(x,dict)]
            tsd_events.sort(key=lambda x:(x.get("startTimestamp") or 0,str(x.get("id") or "")))
            status.append({"dataset":f"schedule-tsd:{code}","ok":True,"count":len(tsd_events)})
            print(f"{code} TSD schedule: {len(tsd_events)}")
        except Exception as exc:
            status.append({"dataset":f"schedule-tsd:{code}","ok":False,"error":str(exc)})
            print(f"{code} TSD schedule ERROR: {exc}")

        events=merge_schedule(tsd_events,rfef_events)
        if events:
            source="RFEF + TheSportsDB" if tsd_events and rfef_events else ("RFEF" if rfef_events else "TheSportsDB")
            datasets[f"schedule:{code}"]=dataset(
                now,source,"schedule",events,
                confidence="high" if rfef_events else "medium",
                note="RFEF fija emparejamientos/fechas; TheSportsDB enriquece horas y estadio cuando responde."
            )
            for event in events:
                for side in ("homeTeam","awayTeam"):
                    team=event.get(side) or {}
                    if not team.get("id") or not team.get("name"):
                        continue
                    item={
                        "id":team["id"],
                        "name":team["name"],
                        "shortName":team["name"],
                        "logo":team.get("logo") or "",
                        "leagueCode":league["code"],
                        "leagueName":league["name"],
                        "country":league["country"],
                        "alpha2":league["alpha2"],
                        "provider":event.get("provider") or "rfef",
                    }
                    existing=teams.get(str(item["id"]))
                    if not existing or (not existing.get("logo") and item.get("logo")):
                        teams[str(item["id"])]=item
            status.append({"dataset":f"schedule:{code}","ok":True,"count":len(events),"source":source})
            print(f"{code} merged schedule: {len(events)} source={source}")
        else:
            status.append({"dataset":f"schedule:{code}","ok":False,"error":"sin calendario"})
            print(f"{code} schedule ERROR: ninguna fuente disponible")

        # Clasificación: no se consulta cada minuto. 6h de TTL y se conserva la
        # última válida si la liga no está disponible en el endpoint gratuito.
        try:
            raw=fetch_json(f"{TSD}/lookuptable.php",{"l":lid,"s":season},attempts=1,timeout=12)
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
        raw=fetch_json(f"{TSD}/lookupteam.php",{"id":"133737"},attempts=1,timeout=12)
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
