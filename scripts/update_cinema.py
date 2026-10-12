#!/usr/bin/env python3
from __future__ import annotations

import json
import re
import urllib.request
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import date, datetime, timedelta, timezone
from html.parser import HTMLParser
from pathlib import Path
from urllib.parse import urljoin, urlparse
from zoneinfo import ZoneInfo

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "cartelera-data.json"

BASE = "https://vivezaragoza.es"
SOURCE = BASE + "/cartelera"
MADRID = ZoneInfo("Europe/Madrid")
DAYS = 7

CINEMAS = [
    "Cine Palafox Zaragoza",
    "Cinesa Grancasa",
    "Cinesa Puerto Venecia",
    "Cines Aragonia",
    "Cines Artesiete La Torre",
    "Cines Cervantes",
]

VOID_TAGS = {
    "area", "base", "br", "col", "embed", "hr", "img", "input",
    "link", "meta", "param", "source", "track", "wbr",
}
DATE_RE = re.compile(r"\b(20\d{2}-\d{2}-\d{2})\b")
TIME_RE = re.compile(r"^\s*([01]?\d|2[0-3]):([0-5]\d)\s*(.*)$")


def fetch_text(url: str) -> str:
    req = urllib.request.Request(
        url,
        headers={
            "User-Agent": (
                "Mozilla/5.0 (compatible; MiRadioCinemaUpdater/19.3; "
                "+https://github.com/ruben79zgz/Mi-Radio)"
            ),
            "Accept": "text/html,application/xhtml+xml,*/*",
            "Accept-Language": "es-ES,es;q=0.9",
        },
    )
    with urllib.request.urlopen(req, timeout=35) as response:
        raw = response.read()
    return raw.decode("utf-8", errors="replace")


def clean_text(value: str) -> str:
    return re.sub(r"\s+", " ", value or "").strip()


def iso_date(value: str | None) -> str | None:
    if not value:
        return None
    match = DATE_RE.search(value)
    if not match:
        return None
    try:
        return date.fromisoformat(match.group(1)).isoformat()
    except ValueError:
        return None


def normalize_text(value: str) -> str:
    value = clean_text(value).casefold()
    replacements = {
        "á": "a", "é": "e", "í": "i", "ó": "o", "ú": "u",
        "ü": "u", "ñ": "n",
    }
    for source, target in replacements.items():
        value = value.replace(source, target)
    return value


def is_movie_path(href: str) -> tuple[bool, str]:
    try:
        path = urlparse(urljoin(BASE, href)).path.rstrip("/")
    except Exception:
        return False, ""
    prefix = "/cartelera/"
    if not path.startswith(prefix):
        return False, ""
    slug = path[len(prefix):].strip("/")
    if not slug or "/" in slug:
        return False, ""
    return True, slug


class ListingParser(HTMLParser):
    def __init__(self, default_date: str) -> None:
        super().__init__(convert_charrefs=True)
        self.default_date = default_date
        self.stack: list[tuple[str, str]] = []
        self.anchor: dict | None = None
        self.heading_tag: str | None = None
        self.heading_texts: list[str] = []
        self.pending_heading = ""
        self.current_movie: str | None = None
        self.current_cinema: str | None = None
        self.movies: dict[str, dict] = {}
        self.sessions: list[dict] = []
        self.date_urls: dict[str, set[str]] = {}
        self.explicit_dates: set[str] = set()
        self.last_poster = ""

    def current_date(self) -> str:
        return self.stack[-1][1] if self.stack else self.default_date

    def _date_from_attrs(self, attrs: dict[str, str], fallback: str) -> str:
        for key, value in attrs.items():
            if "date" in key or "fecha" in key or "day" in key or "dia" in key or key == "datetime":
                found = iso_date(value)
                if found:
                    self.explicit_dates.add(found)
                    return found
        for value in attrs.values():
            found = iso_date(value)
            if found:
                self.explicit_dates.add(found)
                return found
        return fallback

    def handle_starttag(self, tag: str, attrs) -> None:
        tag = tag.lower()
        attr_map = {str(k).lower(): clean_text(str(v or "")) for k, v in attrs}
        parent_date = self.current_date()
        local_date = self._date_from_attrs(attr_map, parent_date)

        for key in ("href", "data-url", "data-href", "onclick", "action"):
            value = attr_map.get(key, "")
            found = iso_date(value)
            if found and value:
                candidate = value
                if key == "onclick":
                    urls = re.findall(r"https?://[^'\"\s)]+|/[^'\"\s)]+", value)
                    if urls:
                        candidate = urls[0]
                self.date_urls.setdefault(found, set()).add(urljoin(BASE, candidate))

        if tag not in VOID_TAGS:
            self.stack.append((tag, local_date))

        if tag == "a":
            self.anchor = {
                "href": attr_map.get("href", ""),
                "texts": [],
                "date": local_date,
            }

        if tag == "h2":
            self.heading_tag = tag
            self.heading_texts = []

        if tag == "img":
            src = (
                attr_map.get("src")
                or attr_map.get("data-src")
                or attr_map.get("data-lazy-src")
                or ""
            )
            alt = normalize_text(attr_map.get("alt", ""))
            if src and ("cartel" in alt or "poster" in alt):
                self.last_poster = urljoin(BASE, src)

    def handle_data(self, data: str) -> None:
        text = clean_text(data)
        if not text:
            return

        if self.anchor is not None:
            self.anchor["texts"].append(text)

        if self.heading_tag:
            self.heading_texts.append(text)

        if text in CINEMAS:
            self.current_cinema = text
            return

        if self.current_movie and self.current_cinema is None:
            movie = self.movies.setdefault(self.current_movie, {})
            age = re.search(r"(?<!\w)(TP|\+\d{1,2})(?!\w)", text, flags=re.I)
            duration = re.search(r"\b(\d{2,3})\s*min\b", text, flags=re.I)
            if age and not movie.get("age"):
                movie["age"] = age.group(1).upper()
            if duration and not movie.get("duration"):
                movie["duration"] = int(duration.group(1))
            if "·" in text and duration and not movie.get("genre"):
                tail = clean_text(text.split("·", 1)[1])
                if 1 < len(tail) <= 60:
                    movie["genre"] = tail

    def handle_endtag(self, tag: str) -> None:
        tag = tag.lower()

        if tag == "a" and self.anchor is not None:
            href = self.anchor.get("href", "")
            text = clean_text(" ".join(self.anchor.get("texts", [])))
            anchor_date = self.anchor.get("date") or self.default_date

            movie_link, slug = is_movie_path(href)
            lowered = normalize_text(text)

            if movie_link:
                title = ""
                if text and "trailer" not in lowered and "ficha" not in lowered:
                    title = text
                elif self.pending_heading:
                    title = self.pending_heading

                if title:
                    self.current_movie = slug
                    self.current_cinema = None
                    movie = self.movies.setdefault(slug, {})
                    movie.setdefault("slug", slug)
                    movie["title"] = title
                    movie.setdefault("page", urljoin(BASE, href))
                    if self.last_poster:
                        movie.setdefault("poster", self.last_poster)
                    self.pending_heading = ""

            time_match = TIME_RE.match(text)
            if (
                time_match
                and self.current_movie
                and self.current_cinema
                and href
            ):
                hour = f"{int(time_match.group(1)):02d}:{time_match.group(2)}"
                session_format = clean_text(time_match.group(3))
                self.sessions.append(
                    {
                        "date": anchor_date,
                        "movie": self.current_movie,
                        "cinema": self.current_cinema,
                        "time": hour,
                        "format": session_format,
                        "buyUrl": urljoin(BASE, href),
                    }
                )

            self.anchor = None

        if tag == self.heading_tag:
            heading = clean_text(" ".join(self.heading_texts))
            if heading:
                self.pending_heading = heading
            self.heading_tag = None
            self.heading_texts = []

        if tag not in VOID_TAGS:
            for index in range(len(self.stack) - 1, -1, -1):
                if self.stack[index][0] == tag:
                    del self.stack[index:]
                    break


class DetailParser(HTMLParser):
    def __init__(self) -> None:
        super().__init__(convert_charrefs=True)
        self.meta: dict[str, str] = {}
        self.images: list[tuple[int, str]] = []

    def handle_starttag(self, tag: str, attrs) -> None:
        attr_map = {str(k).lower(): clean_text(str(v or "")) for k, v in attrs}
        if tag.lower() == "meta":
            key = (
                attr_map.get("property")
                or attr_map.get("name")
                or ""
            ).casefold()
            content = attr_map.get("content", "")
            if key and content:
                self.meta[key] = content

        if tag.lower() == "img":
            src = (
                attr_map.get("src")
                or attr_map.get("data-src")
                or attr_map.get("data-lazy-src")
                or ""
            )
            if not src:
                return
            alt = normalize_text(attr_map.get("alt", ""))
            src_lower = src.casefold()
            score = 0
            if "cartel" in alt or "poster" in alt:
                score += 20
            if "poster" in src_lower or "w500" in src_lower or "tmdb" in src_lower:
                score += 8
            if "logo" in src_lower:
                score -= 20
            self.images.append((score, urljoin(BASE, src)))

    def poster(self) -> str:
        if self.images:
            self.images.sort(key=lambda item: item[0], reverse=True)
            if self.images[0][0] > 0:
                return self.images[0][1]
        for key in ("og:image", "twitter:image"):
            value = self.meta.get(key, "")
            if value:
                return urljoin(BASE, value)
        return ""


def parse_listing(html: str, default_day: str) -> ListingParser:
    parser = ListingParser(default_day)
    parser.feed(html)
    return parser


def fingerprint(sessions: list[dict]) -> set[tuple[str, str, str, str]]:
    return {
        (
            item.get("movie", ""),
            item.get("cinema", ""),
            item.get("time", ""),
            item.get("format", ""),
        )
        for item in sessions
    }


def similarity(left: set, right: set) -> float:
    if not left and not right:
        return 1.0
    union = left | right
    return len(left & right) / max(1, len(union))


def candidate_urls_from_html(html: str, day_iso: str) -> list[str]:
    found: list[str] = []
    escaped = re.escape(day_iso)
    for match in re.finditer(
        rf"['\"]([^'\"]*(?:cartelera|cine)[^'\"]*{escaped}[^'\"]*)['\"]",
        html,
        flags=re.I,
    ):
        value = match.group(1).replace("&amp;", "&")
        found.append(urljoin(BASE, value))
    return found


def extract_next_rsc_strings(html: str) -> list[str]:
    """Decodifica los bloques de datos que Next.js incrusta en self.__next_f."""
    chunks: list[str] = []
    pattern = re.compile(
        r'self\.__next_f\.push\(\[1,("(?:\\.|[^"\\])*")\]\)'
    )
    for match in pattern.finditer(html):
        try:
            value = json.loads(match.group(1))
        except Exception:
            continue
        if isinstance(value, str):
            chunks.append(value)
    return chunks


def find_cartelera_props(html: str) -> dict | None:
    """Localiza el objeto de props con hoy/dias/peliculas dentro del RSC."""
    chunks = extract_next_rsc_strings(html)
    decoder = json.JSONDecoder()

    # Primero buscamos dentro de cada chunk. Suele contener el objeto completo.
    candidates = chunks + ["".join(chunks)]
    for text in candidates:
        for marker in ('{"hoy":', '{\\"hoy\\":'):
            pos = text.find(marker)
            if pos < 0:
                continue

            source = text[pos:]
            if marker.startswith('{\\'):
                try:
                    source = bytes(source, "utf-8").decode("unicode_escape")
                except Exception:
                    continue

            try:
                value, _ = decoder.raw_decode(source)
            except Exception:
                continue

            if (
                isinstance(value, dict)
                and isinstance(value.get("dias"), list)
                and isinstance(value.get("peliculas"), list)
            ):
                return value

    return None


def session_format_label(raw: dict) -> str:
    parts: list[str] = []

    version = normalize_text(str(raw.get("version", "")))
    if version and version not in {"doblada", "doblado", "castellano", "espanol"}:
        if "vose" in version or "subtit" in version:
            parts.append("VOSE")
        elif "original" in version:
            parts.append("VO")
        else:
            parts.append(clean_text(str(raw.get("version", ""))).upper())

    formato = clean_text(str(raw.get("formato", "")))
    if formato:
        parts.append(formato.upper())

    sala = clean_text(str(raw.get("sala", "")))
    if sala:
        parts.append(f"Sala {sala}")

    # Conserva el orden y evita duplicados como ISENSE / Sala 10 iSense.
    unique: list[str] = []
    seen: set[str] = set()
    for part in parts:
        key = normalize_text(part)
        if key in seen:
            continue
        seen.add(key)
        unique.append(part)
    return " · ".join(unique)


def load_week() -> tuple[dict[str, dict], list[dict], list[str]]:
    today = datetime.now(MADRID).date()
    target_days = [(today + timedelta(days=i)).isoformat() for i in range(DAYS)]

    base_html = fetch_text(SOURCE)
    props = find_cartelera_props(base_html)
    base = parse_listing(base_html, target_days[0])

    if not props:
        # Fallback conservador: si Next.js cambia, mostramos solo lo que el HTML
        # visible permite verificar. Nunca copiamos hoy en fechas futuras.
        print("Cartelera RSC no disponible; se usa solo el HTML verificable de hoy.")
        movies = dict(base.movies)
        sessions = [
            item for item in base.sessions
            if item.get("date") == target_days[0]
        ]
        return movies, sessions, target_days

    cinema_map = {
        str(slug): clean_text(str(name))
        for slug, name in (props.get("cines") or {}).items()
        if slug and name
    }

    movies: dict[str, dict] = {}
    html_movies = base.movies

    for raw in props.get("peliculas") or []:
        if not isinstance(raw, dict):
            continue
        slug = clean_text(str(raw.get("slug", "")))
        if not slug:
            continue

        html_movie = html_movies.get(slug, {})
        duration = raw.get("duracion_min")
        try:
            duration = int(duration) if duration not in (None, "") else None
        except (TypeError, ValueError):
            duration = None

        movie = {
            "slug": slug,
            "title": clean_text(str(raw.get("titulo", "")))
                or html_movie.get("title")
                or slug.replace("-", " ").title(),
            "poster": clean_text(str(raw.get("poster_url", "")))
                or html_movie.get("poster", ""),
            "duration": duration or html_movie.get("duration"),
            "age": html_movie.get("age", ""),
            "genre": html_movie.get("genre", ""),
            "page": urljoin(BASE, f"/cartelera/{slug}"),
        }
        movies[slug] = movie

    sessions: list[dict] = []
    invalid_dates = 0

    for raw in props.get("sesiones") or []:
        if not isinstance(raw, dict):
            continue

        slug = clean_text(str(raw.get("pelicula_slug", "")))
        venue_slug = clean_text(str(raw.get("venue_slug", "")))
        start_raw = clean_text(str(raw.get("inicio", "")))
        if not slug or not venue_slug or not start_raw:
            continue

        try:
            start = datetime.fromisoformat(start_raw.replace("Z", "+00:00"))
            if start.tzinfo is None:
                start = start.replace(tzinfo=MADRID)
            start_local = start.astimezone(MADRID)
        except ValueError:
            invalid_dates += 1
            continue

        day_iso = start_local.date().isoformat()
        if day_iso not in target_days:
            continue

        cinema = cinema_map.get(venue_slug)
        if not cinema:
            cinema = venue_slug.replace("-", " ").title()

        if slug not in movies:
            movies[slug] = {
                "slug": slug,
                "title": slug.replace("-", " ").title(),
                "poster": "",
                "duration": None,
                "age": "",
                "genre": "",
                "page": urljoin(BASE, f"/cartelera/{slug}"),
            }

        sessions.append(
            {
                "date": day_iso,
                "movie": slug,
                "cinema": cinema,
                "time": start_local.strftime("%H:%M"),
                "format": session_format_label(raw),
                "buyUrl": urljoin(BASE, clean_text(str(raw.get("compra_url", ""))))
                    if raw.get("compra_url") else "",
                "soldOut": bool(raw.get("agotada", False)),
            }
        )

    dedup: dict[tuple, dict] = {}
    for item in sessions:
        key = (
            item.get("date"),
            item.get("movie"),
            item.get("cinema"),
            item.get("time"),
            item.get("format"),
        )
        dedup.setdefault(key, item)

    sessions = sorted(
        dedup.values(),
        key=lambda item: (
            item.get("date", ""),
            item.get("movie", ""),
            item.get("cinema", ""),
            item.get("time", ""),
        ),
    )

    print(
        f"Cartelera RSC: {len(movies)} películas, "
        f"{len(sessions)} sesiones útiles, "
        f"{len(cinema_map)} cines"
    )
    if invalid_dates:
        print(f"Cartelera RSC: {invalid_dates} sesiones con fecha inválida ignoradas")

    return movies, sessions, target_days


def fetch_poster(movie: dict) -> tuple[str, str]:
    slug = movie.get("slug", "")
    url = movie.get("page") or (urljoin(BASE, f"/cartelera/{slug}") if slug else "")
    if not url:
        return slug, movie.get("poster", "")
    try:
        html = fetch_text(url)
        parser = DetailParser()
        parser.feed(html)
        poster = parser.poster() or movie.get("poster", "")
        return slug, poster
    except Exception as exc:
        print(f"Poster {slug}: {exc}")
        return slug, movie.get("poster", "")


def previous_payload() -> dict | None:
    if not OUT.exists():
        return None
    try:
        value = json.loads(OUT.read_text(encoding="utf-8"))
        return value if isinstance(value, dict) else None
    except Exception:
        return None


def main() -> int:
    previous = previous_payload()

    try:
        movies, sessions, target_days = load_week()
    except Exception as exc:
        print(f"Cartelera ERROR: {exc}")
        if previous and previous.get("movies"):
            print("Se conserva la última cartelera válida.")
            return 0
        raise

    if len(sessions) < 10 or not movies:
        print(
            f"Cartelera insuficiente: {len(movies)} películas, "
            f"{len(sessions)} sesiones"
        )
        if previous and previous.get("movies"):
            print("Se conserva la última cartelera válida.")
            return 0

    active_slugs = {item["movie"] for item in sessions}
    movies = {
        slug: movie
        for slug, movie in movies.items()
        if slug in active_slugs
    }

    # El RSC suele traer el póster directamente. Solo consultamos la ficha
    # para las películas que realmente vengan sin imagen.
    missing_posters = [movie for movie in movies.values() if not movie.get("poster")]
    if missing_posters:
        with ThreadPoolExecutor(max_workers=5) as executor:
            futures = [
                executor.submit(fetch_poster, movie)
                for movie in missing_posters
            ]
            for future in as_completed(futures):
                slug, poster = future.result()
                if slug in movies and poster:
                    movies[slug]["poster"] = poster

    by_movie: dict[str, list[dict]] = {slug: [] for slug in movies}
    for item in sessions:
        if item["movie"] in by_movie:
            by_movie[item["movie"]].append(
                {
                    "date": item["date"],
                    "cinema": item["cinema"],
                    "time": item["time"],
                    "format": item.get("format", ""),
                    "buyUrl": item.get("buyUrl", ""),
                    "soldOut": bool(item.get("soldOut", False)),
                    "price": None,
                }
            )

    movie_list: list[dict] = []
    for slug, movie in movies.items():
        movie_list.append(
            {
                "id": slug,
                "title": movie.get("title") or slug.replace("-", " ").title(),
                "poster": movie.get("poster", ""),
                "age": movie.get("age", ""),
                "duration": movie.get("duration"),
                "genre": movie.get("genre", ""),
                "page": movie.get("page") or urljoin(BASE, f"/cartelera/{slug}"),
                "sessions": by_movie.get(slug, []),
            }
        )

    movie_list.sort(key=lambda item: normalize_text(item["title"]))

    day_stats = []
    for day_iso in target_days:
        count = sum(
            1
            for movie in movie_list
            for session in movie["sessions"]
            if session["date"] == day_iso
        )
        day_stats.append({"date": day_iso, "sessions": count})

    payload = {
        "source": SOURCE,
        "updatedAt": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
        "city": "Zaragoza",
        "priceNote": (
            "La fuente no publica un precio fiable por sesión. "
            "La hora enlaza a la compra oficial cuando está disponible."
        ),
        "cinemas": CINEMAS,
        "days": day_stats,
        "movies": movie_list,
    }

    OUT.write_text(
        json.dumps(payload, ensure_ascii=False, separators=(",", ":")),
        encoding="utf-8",
    )

    days_with_sessions = sum(1 for item in day_stats if item["sessions"] > 0)
    print(
        f"Cartelera OK: {len(movie_list)} películas, {len(sessions)} sesiones, "
        f"{days_with_sessions}/{len(target_days)} días con horarios"
    )
    for item in day_stats:
        print(f"  {item['date']}: {item['sessions']} sesiones")

    if days_with_sessions < 3:
        print(
            "AVISO: la fuente solo ha permitido leer pocos días. "
            "La app mostrará los días disponibles sin inventar horarios."
        )

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
