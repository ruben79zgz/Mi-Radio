#!/usr/bin/env python3
from __future__ import annotations

import json
import re
import urllib.request
from datetime import date, datetime, time, timedelta, timezone
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import urljoin
from zoneinfo import ZoneInfo

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "epg-data.json"
TV_CONFIG = ROOT / "tv.js"

TDT_URL = "https://www.tdtchannels.com/epg/TV.json"
TVGUIA_BASE = "https://www.tvguia.es"
MADRID = ZoneInfo("Europe/Madrid")

# Los 14 canales incluidos actualmente en AMC Channels de Prime Video España.
# TVGuia se usa únicamente como fuente de programación; nunca como fuente de vídeo.
AMC_GUIDE = [
    ("TVGUIA.vin-tv", "Vin TV", "vin-tv"),
    ("TVGUIA.amc-break", "AMC Break", "amc-break"),
    ("TVGUIA.amc", "AMC", "amc"),
    ("TVGUIA.canal-hollywood", "Canal Hollywood", "canal-hollywood"),
    ("TVGUIA.somos", "Somos", "somos"),
    ("TVGUIA.amc-western", "AMC Western", "amc-western"),
    ("TVGUIA.odisea", "Odisea", "odisea"),
    ("TVGUIA.amc-crime", "AMC Crime", "amc-crime"),
    ("TVGUIA.xtrm", "XTRM", "xtrm"),
    ("TVGUIA.dark", "DARK", "dark"),
    ("TVGUIA.canal-cocina", "Canal Cocina", "canal-cocina"),
    ("TVGUIA.amc-living", "AMC Living", "amc-living"),
    ("TVGUIA.sundance-tv", "Sundance TV", "sundance-tv"),
    ("TVGUIA.historia", "Historia", "historia"),
]

MONTHS_ES = {
    "enero": 1,
    "febrero": 2,
    "marzo": 3,
    "abril": 4,
    "mayo": 5,
    "junio": 6,
    "julio": 7,
    "agosto": 8,
    "septiembre": 9,
    "setiembre": 9,
    "octubre": 10,
    "noviembre": 11,
    "diciembre": 12,
}

TIME_RE = re.compile(r"^([01]?\d|2[0-3]):([0-5]\d)$")
DATE_RE = re.compile(
    r"del\s+(\d{1,2})\s+de\s+([A-Za-zÁÉÍÓÚÜÑáéíóúüñ]+)\s+de\s+(\d{4})",
    re.IGNORECASE,
)


def fetch_bytes(url: str, *, accept: str) -> bytes:
    req = urllib.request.Request(
        url,
        headers={
            "User-Agent": (
                "Mozilla/5.0 (compatible; MiRadioGuideUpdater/19.2; "
                "+https://github.com/ruben79zgz/Mi-Radio)"
            ),
            "Accept": accept,
            "Accept-Language": "es-ES,es;q=0.9,en;q=0.6",
        },
    )
    with urllib.request.urlopen(req, timeout=45) as response:
        return response.read()


def fetch_json(url: str):
    raw = fetch_bytes(url, accept="application/json,text/plain,*/*")
    return json.loads(raw.decode("utf-8-sig"))


class VisibleTextParser(HTMLParser):
    SKIP_TAGS = {"script", "style", "noscript", "svg"}

    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.texts: list[str] = []
        self.images: list[dict[str, str]] = []
        self._skip_depth = 0

    def handle_starttag(self, tag: str, attrs) -> None:
        tag_lower = tag.lower()
        if tag_lower in self.SKIP_TAGS:
            self._skip_depth += 1
            return

        if tag_lower == "img" and not self._skip_depth:
            attr_map = {str(key).lower(): str(value or "") for key, value in attrs}
            src = (
                attr_map.get("src")
                or attr_map.get("data-src")
                or attr_map.get("data-lazy-src")
                or ""
            ).strip()
            if src:
                self.images.append(
                    {
                        "src": src,
                        "alt": attr_map.get("alt", "").strip(),
                        "title": attr_map.get("title", "").strip(),
                    }
                )

    def handle_endtag(self, tag: str) -> None:
        if tag.lower() in self.SKIP_TAGS and self._skip_depth:
            self._skip_depth -= 1

    def handle_data(self, data: str) -> None:
        if self._skip_depth:
            return
        text = re.sub(r"\s+", " ", data).strip()
        if text:
            self.texts.append(text)


def parse_spanish_date(text: str) -> date | None:
    match = DATE_RE.search(text)
    if not match:
        return None
    day, month_name, year = match.groups()
    month = MONTHS_ES.get(month_name.casefold())
    if not month:
        return None
    try:
        return date(int(year), month, int(day))
    except ValueError:
        return None


def normalize_logo_key(value: str) -> str:
    return re.sub(r"[^a-z0-9]+", "", value.casefold())


def find_tvguia_logo(parser: VisibleTextParser, channel_name: str) -> str:
    channel_key = normalize_logo_key(channel_name)
    candidates: list[tuple[int, str]] = []

    for image in parser.images:
        src = image.get("src", "").strip()
        if not src:
            continue

        lower_src = src.casefold()
        if "/sites/default/files/logo/" not in lower_src:
            continue

        haystack = normalize_logo_key(
            " ".join(
                [
                    image.get("alt", ""),
                    image.get("title", ""),
                    src.rsplit("/", 1)[-1],
                ]
            )
        )

        score = 0
        if channel_key and channel_key in haystack:
            score += 10
        if "tvguia" in haystack:
            score -= 20
        if lower_src.endswith((".png", ".jpg", ".jpeg", ".webp", ".svg")):
            score += 1

        candidates.append((score, urljoin(TVGUIA_BASE, src)))

    if not candidates:
        return ""

    candidates.sort(key=lambda item: item[0], reverse=True)
    best_score, best_url = candidates[0]
    return best_url if best_score >= 0 else ""


def parse_tvguia_page(html: str, channel_name: str) -> tuple[list[dict], str]:
    parser = VisibleTextParser()
    parser.feed(html)
    texts = parser.texts
    logo = find_tvguia_logo(parser, channel_name)

    heading_index = next(
        (
            i
            for i, value in enumerate(texts)
            if value.casefold().startswith("programación ")
            and channel_name.casefold() in value.casefold()
        ),
        -1,
    )
    if heading_index < 0:
        heading_index = next(
            (i for i, value in enumerate(texts) if value.casefold().startswith("programación ")),
            -1,
        )
    if heading_index < 0:
        raise ValueError(f"No se encontró el encabezado de {channel_name}")

    start_index = next(
        (
            i
            for i in range(heading_index + 1, len(texts))
            if texts[i].casefold() == "parrilla tv"
        ),
        -1,
    )
    if start_index < 0:
        raise ValueError(f"No se encontró la parrilla de {channel_name}")

    page_date = parse_spanish_date(" ".join(texts[heading_index : start_index + 1]))
    if page_date is None:
        raise ValueError(f"No se pudo leer la fecha de {channel_name}")

    rows: list[dict] = []
    i = start_index + 1
    while i < len(texts):
        token = texts[i]
        if token.casefold().startswith("programacion tv"):
            break

        match = TIME_RE.fullmatch(token)
        if not match:
            i += 1
            continue

        title = texts[i + 1].strip() if i + 1 < len(texts) else ""
        if not title or TIME_RE.fullmatch(title) or title.casefold().startswith("programacion tv"):
            i += 1
            continue

        category = ""
        if i + 2 < len(texts):
            candidate = texts[i + 2].strip()
            if (
                candidate
                and not TIME_RE.fullmatch(candidate)
                and not candidate.casefold().startswith("programacion tv")
                and len(candidate) <= 80
            ):
                category = candidate

        hour, minute = map(int, token.split(":"))
        start = datetime.combine(page_date, time(hour, minute), tzinfo=MADRID)
        rows.append(
            {
                "start": start,
                "title": title,
                "category": category,
            }
        )

        # Saltamos hasta la siguiente hora. Así las descripciones largas no
        # pueden confundirse con títulos ni categorías.
        i += 2
        while i < len(texts) and not TIME_RE.fullmatch(texts[i]):
            if texts[i].casefold().startswith("programacion tv"):
                break
            i += 1

    if not rows:
        raise ValueError(f"TVGuia no devolvió programas para {channel_name}")

    # Evita duplicados si la página contiene bloques repetidos para móvil/escritorio.
    unique: dict[tuple[int, str], dict] = {}
    for row in rows:
        key = (int(row["start"].timestamp()), row["title"])
        unique.setdefault(key, row)
    return sorted(unique.values(), key=lambda item: item["start"]), logo


def fetch_tvguia_channel(guide_id: str, channel_name: str, slug: str) -> dict:
    rows: list[dict] = []
    errors: list[str] = []
    logo = ""

    for tomorrow, path in (
        (False, f"/tv/programacion-{slug}"),
        (True, f"/tv-manana/programacion-{slug}"),
    ):
        url = TVGUIA_BASE + path
        try:
            raw = fetch_bytes(url, accept="text/html,application/xhtml+xml,*/*")
            html = raw.decode("utf-8", errors="replace")
            page_rows, page_logo = parse_tvguia_page(html, channel_name)
            rows.extend(page_rows)
            if page_logo and not logo:
                logo = page_logo
        except Exception as exc:
            label = "mañana" if tomorrow else "hoy"
            errors.append(f"{label}: {exc}")

    if not rows:
        raise RuntimeError("; ".join(errors) or "Sin datos")

    rows.sort(key=lambda item: item["start"])
    unique: dict[tuple[int, str], dict] = {}
    for row in rows:
        key = (int(row["start"].timestamp()), row["title"])
        unique.setdefault(key, row)
    rows = sorted(unique.values(), key=lambda item: item["start"])

    events: list[dict] = []
    for index, row in enumerate(rows):
        start = row["start"]
        if index + 1 < len(rows):
            candidate_end = rows[index + 1]["start"]
            # Una parrilla incompleta no debe convertir un programa en uno de 12 horas.
            end = candidate_end if timedelta(0) < candidate_end - start <= timedelta(hours=6) else start + timedelta(hours=2)
        else:
            end = start + timedelta(hours=2)

        events.append(
            {
                "hi": int(start.timestamp()),
                "hf": int(end.timestamp()),
                "t": row["title"],
                "g": row["category"],
            }
        )

    return {
        "name": guide_id,
        "display_name": channel_name,
        "source": "TVGuia",
        "logo": logo,
        "events": events,
    }


def previous_tvguia_channels() -> dict[str, dict]:
    if not OUT.exists():
        return {}
    try:
        previous = json.loads(OUT.read_text(encoding="utf-8"))
        root = previous.get("data", [])
        if not isinstance(root, list):
            return {}
        return {
            channel.get("name"): channel
            for channel in root
            if isinstance(channel, dict)
            and str(channel.get("name", "")).startswith("TVGUIA.")
        }
    except Exception:
        return {}


def build_tvguia_channels() -> list[dict]:
    previous = previous_tvguia_channels()
    now_local = datetime.now(MADRID)

    # La parrilla de AMC no necesita 24 descargas al día. Se refresca cada
    # seis horas y se conserva la última copia buena entre medias. Si aún no
    # tenemos logos, forzamos una actualización inmediata para rellenarlos.
    missing_logos = any(
        not str(previous.get(guide_id, {}).get("logo", "")).strip()
        for guide_id, _, _ in AMC_GUIDE
    )
    refresh = len(previous) < len(AMC_GUIDE) or missing_logos or now_local.hour % 6 == 0
    if not refresh:
        return [previous[guide_id] for guide_id, _, _ in AMC_GUIDE if guide_id in previous]

    result: list[dict] = []
    for guide_id, channel_name, slug in AMC_GUIDE:
        try:
            channel = fetch_tvguia_channel(guide_id, channel_name, slug)
            result.append(channel)
            logo_status = "logo OK" if channel.get("logo") else "sin logo"
            print(
                f"TVGuia OK: {channel_name} "
                f"({len(channel['events'])} programas, {logo_status})"
            )
        except Exception as exc:
            cached = previous.get(guide_id)
            if cached:
                result.append(cached)
                print(f"TVGuia ERROR: {channel_name}; se conserva la copia anterior: {exc}")
            else:
                print(f"TVGuia ERROR: {channel_name}; sin copia anterior: {exc}")

    return result


def main() -> int:
    data = fetch_json(TDT_URL)

    # Guardamos solo los canales que Mi Radio usa en su guía.
    # Así la PWA sigue descargando un JSON pequeño.
    config_text = TV_CONFIG.read_text(encoding="utf-8")
    wanted = set(re.findall(r"epgId:\s*['\"]([^'\"]+)['\"]", config_text))

    if isinstance(data, list) and wanted:
        tdt_channels = [channel for channel in data if channel.get("name") in wanted]
    elif isinstance(data, list):
        tdt_channels = data
    else:
        raise RuntimeError("Formato EPG inesperado de TDTChannels")

    amc_channels = build_tvguia_channels()

    payload = {
        "source": {
            "tdt": TDT_URL,
            "amc": TVGUIA_BASE,
        },
        "updatedAt": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
        "data": tdt_channels + amc_channels,
    }
    OUT.write_text(
        json.dumps(payload, ensure_ascii=False, separators=(",", ":")),
        encoding="utf-8",
    )
    print(
        f"EPG guardada: {len(tdt_channels)} canales TDT + "
        f"{len(amc_channels)} canales AMC"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
