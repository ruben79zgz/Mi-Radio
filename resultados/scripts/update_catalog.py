#!/usr/bin/env python3
from __future__ import annotations

import json
import time
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
OUT = ROOT / "resultados" / "data" / "catalog.json"
BASE = "https://site.api.espn.com/apis/site/v2/sports/soccer"

LEAGUES = [
    ("esp.1","LaLiga","España","ES"),("esp.2","LaLiga Hypermotion","España","ES"),
    ("esp.copa_del_rey","Copa del Rey","España","ES"),("eng.1","Premier League","Inglaterra","GB"),
    ("eng.2","Championship","Inglaterra","GB"),("ger.1","Bundesliga","Alemania","DE"),
    ("ger.2","2. Bundesliga","Alemania","DE"),("ita.1","Serie A","Italia","IT"),
    ("ita.2","Serie B","Italia","IT"),("fra.1","Ligue 1","Francia","FR"),
    ("fra.2","Ligue 2","Francia","FR"),("ned.1","Eredivisie","Países Bajos","NL"),
    ("por.1","Primeira Liga","Portugal","PT"),("bel.1","Jupiler Pro League","Bélgica","BE"),
    ("sco.1","Premiership","Escocia","GB"),("tur.1","Süper Lig","Turquía","TR"),
    ("uefa.champions","Champions League","Europa","EU"),("uefa.europa","Europa League","Europa","EU"),
    ("uefa.europa.conf","Conference League","Europa","EU"),("usa.1","MLS","Estados Unidos","US"),
    ("mex.1","Liga MX","México","MX"),("arg.1","Primera División","Argentina","AR"),
    ("bra.1","Brasileirão","Brasil","BR"),("ksa.1","Saudi Pro League","Arabia Saudí","SA"),
    ("aus.1","A-League","Australia","AU"),("jpn.1","J1 League","Japón","JP"),
]

HEADERS = {
    "User-Agent":"MiResultados/1.3.1 (+https://github.com/ruben79zgz/Mi-Radio)",
    "Accept":"application/json",
}


def fetch_json(url: str, attempts: int = 2) -> dict:
    last = None
    for attempt in range(attempts):
        try:
            req = urllib.request.Request(url, headers=HEADERS)
            with urllib.request.urlopen(req, timeout=35) as response:
                return json.loads(response.read().decode("utf-8"))
        except Exception as exc:
            last = exc
            if attempt + 1 < attempts:
                time.sleep(2)
    raise last or RuntimeError("fetch failed")


def team_from_item(item: dict, league: dict) -> dict | None:
    team = item.get("team") if isinstance(item, dict) and isinstance(item.get("team"), dict) else item
    if not isinstance(team, dict):
        return None
    tid = team.get("id")
    name = team.get("displayName") or team.get("name") or team.get("shortDisplayName")
    if not tid or not name:
        return None
    logos = team.get("logos") or []
    logo = team.get("logo") or (logos[0].get("href") if logos and isinstance(logos[0], dict) else "")
    return {
        "id": int(tid) if str(tid).isdigit() else str(tid),
        "name": name,
        "shortName": team.get("shortDisplayName") or team.get("abbreviation") or name,
        "abbreviation": team.get("abbreviation") or "",
        "logo": logo or "",
        "leagueCode": league["code"],
        "leagueName": league["name"],
        "country": league["country"],
        "alpha2": league["alpha2"],
    }


def main() -> int:
    previous = {}
    if OUT.exists():
        try:
            previous = json.loads(OUT.read_text(encoding="utf-8"))
        except Exception:
            previous = {}

    teams: dict[str, dict] = {}
    working_leagues = []
    failed = []

    for code, name, country, alpha2 in LEAGUES:
        league = {"code":code,"name":name,"country":country,"alpha2":alpha2}
        url = f"{BASE}/{code}/teams?limit=1000"
        try:
            data = fetch_json(url)
            raw = data.get("sports") or []
            items = []
            if raw and isinstance(raw[0], dict):
                leagues = raw[0].get("leagues") or []
                if leagues and isinstance(leagues[0], dict):
                    items = leagues[0].get("teams") or []
            if not items:
                items = data.get("teams") or []

            count = 0
            for item in items:
                normalized = team_from_item(item, league)
                if not normalized:
                    continue
                key = f"{normalized['leagueCode']}:{normalized['id']}"
                teams[key] = normalized
                count += 1

            working_leagues.append({**league,"teams":count})
            print(f"{code}: {count} equipos")
        except Exception as exc:
            failed.append({"code":code,"error":str(exc)})
            print(f"{code}: ERROR {exc}")

    # Si una liga falla temporalmente, recupera sus equipos de la copia anterior.
    for team in previous.get("teams") or []:
        if not isinstance(team, dict):
            continue
        code = str(team.get("leagueCode") or "")
        if any(x["code"] == code for x in failed):
            teams.setdefault(f"{code}:{team.get('id')}", team)

    payload = {
        "updatedAt": datetime.now(timezone.utc).isoformat().replace("+00:00","Z"),
        "source":"ESPN public teams endpoints",
        "leagues":working_leagues,
        "failed":failed,
        "teams":sorted(teams.values(), key=lambda x:(x["country"],x["leagueName"],x["name"])),
    }

    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(payload, ensure_ascii=False, separators=(",",":")), encoding="utf-8")
    print(f"Catálogo: {len(payload['teams'])} equipos · {len(working_leagues)} ligas OK · {len(failed)} fallos")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
