#!/usr/bin/env python3
"""Build static, crawlable pages for MovieDeck.

The app itself is a single page that fills in its content with JavaScript,
so search engines mostly see one page. This script writes a real HTML page
for every popular movie and series (title, overview, cast, trailer, where to
stream and similar titles), plus hub pages per type and genre, the sitemap
and a small slug index the app uses for canonical links.

Pages are never removed once made, so links that search engines have
already indexed keep working.

Usage:
    python3 tools/build_seo.py                 # normal run (GitHub Action)
    python3 tools/build_seo.py --limit 40      # only add up to 40 new titles of each type
    python3 tools/build_seo.py --changed-out changed.txt   # list new or changed page URLs
    python3 tools/build_seo.py --ping-file changed.txt     # send those URLs to IndexNow
    python3 tools/build_seo.py --cache DIR --offline
        # read API responses from DIR only and list the missing URLs in
        # DIR/missing.txt instead of fetching them (for local testing)
"""

import argparse
import concurrent.futures as cf
import datetime as dt
import hashlib
import html
import json
import os
import re
import sys
import time
import unicodedata
import urllib.error
import urllib.parse
import urllib.request

SITE = "https://moviedeck.xyz"
API = "https://api.themoviedb.org/3"
KEY = os.environ.get("TMDB_KEY") or "4803cc94c4172a32fc2851dda48d254f"
IMG = "https://image.tmdb.org/t/p"
ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MANIFEST = os.path.join(ROOT, "data", "seo-manifest.json")
SLUGS = os.path.join(ROOT, "data", "slugs.json")
TODAY = dt.date.today().isoformat()
# IndexNow tells Bing, Yandex and others about new or changed pages straight away.
# The same key is in /032c9238e6270c6378cb6e75e773873c.txt at the site root.
INDEXNOW_KEY = "032c9238e6270c6378cb6e75e773873c"

# Lists that decide which titles get a page. Every title that has ever had
# a page keeps it, so this only controls what gets added.
SOURCES = (
    [("movie", "/movie/popular", p) for p in range(1, 16)]
    + [("movie", "/movie/top_rated", p) for p in range(1, 16)]
    + [("movie", "/trending/movie/week", p) for p in range(1, 6)]
    + [("tv", "/tv/popular", p) for p in range(1, 11)]
    + [("tv", "/tv/top_rated", p) for p in range(1, 11)]
    + [("tv", "/trending/tv/week", p) for p in range(1, 6)]
    + [("movie", f"/discover/movie?with_original_language={lang}&sort_by=popularity.desc", p)
       for lang in ("hi", "te", "ta", "ml", "ko", "ja") for p in range(1, 4)]
    + [("tv", f"/discover/tv?with_original_language={lang}&sort_by=popularity.desc", p)
       for lang in ("hi", "ko", "ja") for p in range(1, 4)]
)

REGIONS = (("US", "United States"), ("IN", "India"), ("GB", "United Kingdom"))

# People pages: the top-billed cast of every title with a page, plus directors
# and creators. New people per run are capped so the daily job stays quick.
PEOPLE_TOP_BILLED = 5
PEOPLE_NEW_PER_RUN = 1500

# Big franchises that always get a "movies in order" page. Collections that any
# movie with a page belongs to are added automatically too.
COLLECTION_SEEDS = [10, 1241, 119, 86311, 9485, 328, 87359, 404609, 528, 10194, 263, 645,
                    2344, 8091, 295, 84, 2150, 748, 87096, 8650, 1570, 1575, 131292, 131296,
                    131295, 284433, 86066, 531241, 556, 2980]
LANGS = {"en": "English", "hi": "Hindi", "te": "Telugu", "ta": "Tamil", "ml": "Malayalam",
         "kn": "Kannada", "ko": "Korean", "ja": "Japanese", "es": "Spanish", "fr": "French",
         "de": "German", "it": "Italian", "zh": "Chinese", "cn": "Cantonese", "pt": "Portuguese",
         "tr": "Turkish", "th": "Thai", "ru": "Russian", "sv": "Swedish", "da": "Danish",
         "no": "Norwegian", "pl": "Polish", "id": "Indonesian", "tl": "Tagalog", "ar": "Arabic"}

esc = lambda s: html.escape(str(s or ""), quote=True)


# ---------------------------------------------------------------- fetching

class Fetcher:
    def __init__(self, cache=None, offline=False):
        self.cache, self.offline, self.missing = cache, offline, set()
        if cache:
            os.makedirs(cache, exist_ok=True)

    def _path(self, url):
        return os.path.join(self.cache, hashlib.sha1(url.encode()).hexdigest() + ".json")

    def get(self, path, **params):
        sep = "&" if "?" in path else "?"
        url = f"{API}{path}{sep}{urllib.parse.urlencode(params)}" if params else f"{API}{path}"
        if self.cache and os.path.exists(self._path(url)):
            with open(self._path(url), encoding="utf-8") as f:
                return json.load(f)
        if self.offline:
            self.missing.add(url)
            return None
        full = url + ("&" if "?" in url else "?") + "api_key=" + KEY
        for attempt in range(5):
            try:
                with urllib.request.urlopen(full, timeout=30) as r:
                    data = json.load(r)
                break
            except urllib.error.HTTPError as e:
                if e.code == 404:
                    return None
                if e.code == 429 or e.code >= 500:
                    time.sleep(2 ** attempt)
                    continue
                raise
            except (urllib.error.URLError, TimeoutError):
                time.sleep(2 ** attempt)
        else:
            return None
        if self.cache:
            with open(self._path(url), "w", encoding="utf-8") as f:
                json.dump(data, f)
        return data


# ---------------------------------------------------------------- helpers

def slugify(text):
    text = unicodedata.normalize("NFKD", text or "").encode("ascii", "ignore").decode()
    text = re.sub(r"[^a-zA-Z0-9]+", "-", text.lower()).strip("-")
    return text[:60].rstrip("-") or "title"


def page_path(kind, tid, slug):
    return f"/{kind}/{slug}-{tid}/"


def year_of(d):
    return (d or "")[:4]


def runtime_text(mins):
    if not mins:
        return ""
    h, m = divmod(int(mins), 60)
    return f"{h}h {m}m" if h else f"{m}m"


def iso_duration(mins):
    if not mins:
        return None
    h, m = divmod(int(mins), 60)
    return f"PT{h}H{m}M" if h else f"PT{m}M"


def nice_date(d):
    try:
        return dt.date.fromisoformat(d).strftime("%-d %B %Y")
    except (TypeError, ValueError):
        return ""


def clip(text, limit):
    text = re.sub(r"\s+", " ", text or "").strip()
    if len(text) <= limit:
        return text
    cut = text[:limit - 1].rsplit(" ", 1)[0].rstrip(",;:.-")
    return cut + "…"


def write_if_changed(path, content):
    """Write the file only when its content changed. Returns True if written."""
    os.makedirs(os.path.dirname(path), exist_ok=True)
    if os.path.exists(path):
        with open(path, encoding="utf-8") as f:
            if f.read() == content:
                return False
    with open(path, "w", encoding="utf-8") as f:
        f.write(content)
    return True


FAVICON = ("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 64 64'%3E"
           "%3Cdefs%3E%3ClinearGradient id='g' x1='0' y1='0' x2='1' y2='1'%3E%3Cstop offset='0' "
           "stop-color='%23ff007f'/%3E%3Cstop offset='1' stop-color='%237000ff'/%3E%3C/linearGradient%3E"
           "%3C/defs%3E%3Crect x='6' y='22' width='52' height='34' rx='6' fill='url(%23g)'/%3E%3Cpath "
           "d='M8 10l48-4 2 12-48 4z' fill='url(%23g)'/%3E%3C/svg%3E")


def head(title, desc, canonical, image, og_type="website", ld=None):
    lds = "".join(
        f'\n<script type="application/ld+json">{json.dumps(x, ensure_ascii=False, separators=(",", ":"))}</script>'
        for x in (ld or []))
    img = (f'\n<meta property="og:image" content="{esc(image)}">'
           f'\n<meta name="twitter:image" content="{esc(image)}">') if image else ""
    return f"""<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>{esc(title)}</title>
<meta name="description" content="{esc(desc)}">
<link rel="canonical" href="{esc(canonical)}">
<meta name="theme-color" content="#0b0b12">
<meta property="og:site_name" content="MovieDeck">
<meta property="og:type" content="{og_type}">
<meta property="og:title" content="{esc(title)}">
<meta property="og:description" content="{esc(desc)}">
<meta property="og:url" content="{esc(canonical)}">{img}
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="{esc(title)}">
<meta name="twitter:description" content="{esc(desc)}">
<link rel="icon" href="{FAVICON}">
<link rel="icon" type="image/png" sizes="192x192" href="/assets/icons/icon-192.png">
<link rel="apple-touch-icon" href="/assets/icons/apple-touch-icon.png">
<link rel="preconnect" href="https://image.tmdb.org">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&display=swap" rel="stylesheet">
<link rel="stylesheet" href="/assets/seo.css?v=3">{lds}
</head>
<body>
<header class="top">
  <a class="brand" href="/"><span class="mark" aria-hidden="true"></span>MovieDeck</a>
  <nav class="top-nav" aria-label="Browse">
    <a href="/movie/">Movies</a>
    <a href="/tv/">TV Shows</a>
    <a href="/collection/">Collections</a>
  </nav>
  <form class="top-search" action="/" method="get" role="search">
    <input type="search" name="q" placeholder="Search movies and shows" aria-label="Search movies and shows">
  </form>
</header>
"""


FOOT = """<footer class="foot">
  <nav aria-label="More">
    <a href="/">Home</a><a href="/movie/">Popular movies</a><a href="/tv/">Popular TV shows</a><a href="/collection/">Movie collections</a><a href="/person/">Popular people</a>
  </nav>
  <p>Movie and TV data from <a href="https://www.themoviedb.org/" rel="noopener">TMDB</a>. This product uses the TMDB API but is not endorsed or certified by TMDB. Streaming availability by JustWatch.</p>
  <p>MovieDeck doesn't host any files. All media is hosted by third-party services.</p>
</footer>
</body>
</html>
"""


def card(t, known):
    """A poster card linking to a title page (or into the app if it has none)."""
    kind = t["kind"]
    slug = known.get(kind, {}).get(str(t["id"]))
    href = page_path(kind, t["id"], slug) if slug else f"/?{kind}={t['id']}"
    poster = (f'<img src="{IMG}/w342{esc(t["poster"])}" alt="{esc(t["name"])} poster" '
              f'loading="lazy" width="342" height="513">') if t.get("poster") else '<span class="noimg"></span>'
    yr = f'<span class="cy">{esc(year_of(t.get("date")))}</span>' if t.get("date") else ""
    return f'<a class="card" href="{esc(href)}">{poster}<span class="ct">{esc(t["name"])}</span>{yr}</a>'


# ---------------------------------------------------------------- title page

def summarize(kind, d):
    name = d.get("title") or d.get("name") or ""
    return {
        "kind": kind, "id": d["id"], "name": name,
        "date": d.get("release_date") or d.get("first_air_date") or "",
        "poster": d.get("poster_path"), "pop": d.get("popularity") or 0,
        "genres": [g["id"] for g in d.get("genres") or []] or d.get("genre_ids") or [],
    }


def title_page(kind, d, slug, known, genre_names, by_genre):
    tid = d["id"]
    is_tv = kind == "tv"
    name = d.get("name") if is_tv else d.get("title")
    date = d.get("first_air_date") if is_tv else d.get("release_date")
    yr = year_of(date)
    url = SITE + page_path(kind, tid, slug)
    poster = f"{IMG}/w500{d['poster_path']}" if d.get("poster_path") else None
    backdrop = f"{IMG}/w1280{d['backdrop_path']}" if d.get("backdrop_path") else poster
    genres = [g["name"] for g in d.get("genres") or []]
    credits = d.get("credits") or {}
    cast = [c for c in credits.get("cast") or [] if c.get("name")][:12]
    crew = credits.get("crew") or []
    directors = [c["name"] for c in crew if c.get("job") == "Director"][:3]
    creators = [c["name"] for c in d.get("created_by") or []][:3]
    writers = [c["name"] for c in crew if c.get("department") == "Writing"][:3]
    videos = [v for v in (d.get("videos") or {}).get("results") or []
              if v.get("site") == "YouTube" and v.get("type") in ("Trailer", "Teaser")]
    videos.sort(key=lambda v: (v.get("type") != "Trailer", not v.get("official"), v.get("published_at") or ""))
    trailer = videos[0] if videos else None
    providers = (d.get("watch/providers") or {}).get("results") or {}
    label = "TV series" if is_tv else "movie"
    rating = d.get("vote_average") or 0

    # Copy for search results: what it is, then the overview.
    lead = f"{name} ({yr})" if yr else name
    title = f"{lead} – Cast, Trailer & Where to Watch | MovieDeck"
    desc = clip(f"{lead}: {d.get('overview') or ''} See the cast, trailer, ratings and where to stream it.", 158)

    ld = {
        "@context": "https://schema.org",
        "@type": "TVSeries" if is_tv else "Movie",
        "name": name, "url": url, "description": clip(d.get("overview"), 500),
    }
    if poster: ld["image"] = poster
    if genres: ld["genre"] = genres
    if is_tv:
        if date: ld["startDate"] = date
        if d.get("number_of_seasons"): ld["numberOfSeasons"] = d["number_of_seasons"]
        if d.get("number_of_episodes"): ld["numberOfEpisodes"] = d["number_of_episodes"]
        if creators: ld["creator"] = [{"@type": "Person", "name": n} for n in creators]
    else:
        if date: ld["datePublished"] = date
        if iso_duration(d.get("runtime")): ld["duration"] = iso_duration(d.get("runtime"))
        if directors: ld["director"] = [{"@type": "Person", "name": n} for n in directors]
    if cast: ld["actor"] = [{"@type": "Person", "name": c["name"]} for c in cast[:8]]
    if d.get("original_language"):
        ld["inLanguage"] = d["original_language"]
    if trailer:
        ld["trailer"] = {"@type": "VideoObject", "name": f"{name} – {trailer.get('name') or 'Trailer'}",
                         "embedUrl": f"https://www.youtube.com/embed/{trailer['key']}",
                         "thumbnailUrl": f"https://i.ytimg.com/vi/{trailer['key']}/hqdefault.jpg",
                         "description": f"{trailer.get('type', 'Trailer')} for {name}."}
        if trailer.get("published_at"):
            ld["trailer"]["uploadDate"] = trailer["published_at"][:10]
    hub = "/tv/" if is_tv else "/movie/"
    crumbs = {
        "@context": "https://schema.org", "@type": "BreadcrumbList",
        "itemListElement": [
            {"@type": "ListItem", "position": 1, "name": "Home", "item": SITE + "/"},
            {"@type": "ListItem", "position": 2, "name": "TV Shows" if is_tv else "Movies", "item": SITE + hub},
            {"@type": "ListItem", "position": 3, "name": name, "item": url},
        ],
    }

    out = [head(title, desc, url, backdrop, "video.tv_show" if is_tv else "video.movie", [ld, crumbs])]
    bg = f' style="--backdrop:url(\'{IMG}/w1280{esc(d["backdrop_path"])}\')"' if d.get("backdrop_path") else ""
    out.append(f'<main>\n<section class="hero"{bg}>\n<div class="hero-in">')
    if poster:
        out.append(f'<img class="poster" src="{esc(poster)}" alt="{esc(name)} poster" width="500" height="750">')
    out.append('<div class="info">')
    out.append(f'<nav class="crumbs" aria-label="Breadcrumb"><a href="/">Home</a><span>›</span>'
               f'<a href="{hub}">{"TV Shows" if is_tv else "Movies"}</a><span>›</span><span>{esc(name)}</span></nav>')
    out.append(f'<h1>{esc(name)}{f" <span class=yr>({yr})</span>" if yr else ""}</h1>')
    if d.get("tagline"):
        out.append(f'<p class="tagline">{esc(d["tagline"])}</p>')
    facts = []
    if rating: facts.append(f'<li class="rate">★ {rating:.1f}</li>')
    facts.append(f"<li>{'Series' if is_tv else 'Movie'}</li>")
    if is_tv and d.get("number_of_seasons"):
        n = d["number_of_seasons"]
        facts.append(f"<li>{n} season{'s' if n != 1 else ''}</li>")
    elif runtime_text(d.get("runtime")):
        facts.append(f"<li>{runtime_text(d.get('runtime'))}</li>")
    if yr: facts.append(f"<li>{yr}</li>")
    out.append(f'<ul class="facts">{"".join(facts)}</ul>')
    if d.get("genres"):
        links = []
        for g in d["genres"]:
            gs = genre_slug(g["name"], kind)
            if gs in by_genre:
                links.append(f'<a class="chip" href="/genre/{gs}/">{esc(g["name"])}</a>')
            else:
                links.append(f'<span class="chip">{esc(g["name"])}</span>')
        out.append(f'<div class="chips">{"".join(links)}</div>')
    play = f"/?{kind}={tid}&play=1" + ("&s=1&e=1" if is_tv else "")
    if date and date > TODAY:
        # Not out yet: say when, and open its page in the app.
        btns = [f'<a class="btn primary" href="/?{kind}={tid}">Out {esc(nice_date(date))}</a>']
    else:
        btns = [f'<a class="btn primary" href="{play}">▶ Watch on MovieDeck</a>']
    if trailer:
        btns.append(f'<a class="btn" href="https://www.youtube.com/watch?v={esc(trailer["key"])}" '
                    f'target="_blank" rel="noopener">Watch trailer</a>')
    out.append(f'<div class="actions">{"".join(btns)}</div>')
    out.append("</div>\n</div>\n</section>")

    # About
    out.append('<div class="wrap">\n<section class="block about">')
    out.append(f"<h2>About {esc(name)}</h2>")
    if d.get("overview"):
        out.append(f"<p>{esc(d['overview'])}</p>")
    bc = d.get("belongs_to_collection") or {}
    cslug = known.get("collection", {}).get(str(bc.get("id")))
    if not is_tv and cslug:
        out.append(f'<p class="in-coll">Part of the <a href="/collection/{cslug}-{bc["id"]}/">'
                   f'{esc(coll_title(bc.get("name")))} series</a>. See every film in order.</p>')
    facts = []
    if is_tv:
        if creators: facts.append(("Created by", ", ".join(creators)))
        if date: facts.append(("First aired", nice_date(date)))
        if d.get("last_air_date") and d.get("status") == "Ended":
            facts.append(("Last aired", nice_date(d["last_air_date"])))
        nets = [n["name"] for n in d.get("networks") or []][:3]
        if nets: facts.append(("Network", ", ".join(nets)))
        if d.get("number_of_episodes"): facts.append(("Episodes", str(d["number_of_episodes"])))
    else:
        if directors: facts.append(("Director", ", ".join(directors)))
        if writers: facts.append(("Writers", ", ".join(dict.fromkeys(writers))))
        if date: facts.append(("Release date", nice_date(date)))
        if runtime_text(d.get("runtime")): facts.append(("Runtime", runtime_text(d.get("runtime"))))
    if d.get("status"): facts.append(("Status", d["status"]))
    lang = d.get("original_language")
    if lang: facts.append(("Original language", LANGS.get(lang, lang.upper())))
    if facts:
        out.append('<dl class="facts-list">' + "".join(
            f"<div><dt>{esc(k)}</dt><dd>{esc(v)}</dd></div>" for k, v in facts) + "</dl>")
    out.append("</section>")

    # Where to watch
    rows = []
    for code, region in REGIONS:
        r = providers.get(code) or {}
        names = []
        for key in ("flatrate", "free", "ads"):
            for p in r.get(key) or []:
                if p.get("provider_name") and p["provider_name"] not in [n for n, _ in names]:
                    names.append((p["provider_name"], p.get("logo_path")))
        if names:
            logos = ""
            for n, lp in sorted(names)[:8]:
                img = (f'<img src="{IMG}/w92{esc(lp)}" alt="" width="28" height="28" loading="lazy">'
                       if lp else "")
                logos += f"<li>{img}{esc(n)}</li>"
            rows.append(f'<div class="region"><h3>{esc(region)}</h3><ul class="prov">{logos}</ul></div>')
    if rows:
        out.append(f'<section class="block"><h2>Where to stream {esc(name)}</h2>'
                   f'<div class="regions">{"".join(rows)}</div></section>')

    # Seasons
    if is_tv:
        seasons = [s for s in d.get("seasons") or [] if s.get("season_number")]
        if seasons:
            items = "".join(
                f'<li><a href="/?tv={tid}&s={s["season_number"]}&e=1"><strong>{esc(s.get("name") or "Season " + str(s["season_number"]))}</strong>'
                f'<span>{s.get("episode_count") or 0} episodes{(" · " + year_of(s.get("air_date"))) if s.get("air_date") else ""}</span></a></li>'
                for s in seasons)
            out.append(f'<section class="block"><h2>Seasons</h2><ul class="seasons">{items}</ul></section>')

    # Cast
    if cast:
        people = ""
        for c in cast:
            face = (f'<img src="{IMG}/w185{esc(c["profile_path"])}" alt="{esc(c["name"])}" '
                    f'loading="lazy" width="185" height="278">' if c.get("profile_path")
                    else '<span class="noface"></span>')
            pslug = known.get("person", {}).get(str(c.get("id")))
            if pslug:
                people += (f'<li><a class="person" href="/person/{pslug}-{c["id"]}/">{face}'
                           f'<strong>{esc(c["name"])}</strong></a>'
                           f'<span>{esc(c.get("character") or "")}</span></li>')
            else:
                people += (f'<li>{face}<strong>{esc(c["name"])}</strong>'
                           f'<span>{esc(c.get("character") or "")}</span></li>')
        out.append(f'<section class="block"><h2>Cast</h2><ul class="cast">{people}</ul></section>')

    # Similar titles: TMDB recommendations first, then the same genre.
    recs = [summarize(kind, r) for r in (d.get("recommendations") or {}).get("results") or []
            if r.get("poster_path")]
    seen = {tid}
    picks = []
    for r in recs:
        if r["id"] not in seen and str(r["id"]) in known.get(kind, {}):
            picks.append(r); seen.add(r["id"])
    for r in recs:
        if len(picks) >= 12: break
        if r["id"] not in seen:
            picks.append(r); seen.add(r["id"])
    if len(picks) < 12 and d.get("genres"):
        for t in by_genre.get(genre_slug(d["genres"][0]["name"], kind), {}).get("items", []):
            if len(picks) >= 12: break
            if t["id"] not in seen:
                picks.append(t); seen.add(t["id"])
    if picks:
        out.append(f'<section class="block"><h2>More like {esc(name)}</h2>'
                   f'<div class="grid">{"".join(card(t, known) for t in picks[:12])}</div></section>')

    out.append("</div>\n</main>\n")
    out.append(FOOT)
    return "\n".join(out)


# ---------------------------------------------------------------- hubs

def genre_slug(name, kind):
    return f"{slugify(name)}-{'tv-shows' if kind == 'tv' else 'movies'}"


def hub_page(path, h1, intro, items, known, chips=""):
    url = SITE + path
    title = f"{h1} | MovieDeck"
    desc = clip(intro, 158)
    ld = {"@context": "https://schema.org", "@type": "CollectionPage", "name": h1, "url": url,
          "description": desc,
          "mainEntity": {"@type": "ItemList", "itemListElement": [
              {"@type": "ListItem", "position": i + 1,
               "url": SITE + page_path(t["kind"], t["id"], known[t["kind"]][str(t["id"])])}
              for i, t in enumerate(items[:50])]}}
    first = next((t for t in items if t.get("poster")), None)
    img = f"{IMG}/w500{first['poster']}" if first else None
    return (head(title, desc, url, img, "website", [ld])
            + f'<main class="wrap hub">\n<h1>{esc(h1)}</h1>\n<p class="intro">{esc(intro)}</p>\n{chips}'
            + f'<div class="grid">{"".join(card(t, known) for t in items)}</div>\n</main>\n' + FOOT)


# ---------------------------------------------------------------- collections

def coll_title(name):
    return re.sub(r"\s+Collection$", "", (name or "").strip()) or "Collection"


def coll_parts(c):
    parts = [p for p in c.get("parts") or [] if p.get("poster_path") and not p.get("adult")]
    return sorted(parts, key=lambda p: (p.get("release_date") or "9999", p.get("title") or ""))


def collection_page(c, slug, known):
    cid = c["id"]
    name = coll_title(c.get("name"))
    parts = coll_parts(c)
    url = SITE + f"/collection/{slug}-{cid}/"
    dated = [p for p in parts if p.get("release_date")]
    span = ""
    if dated:
        a, b = dated[0], dated[-1]
        span = f"from {a['title']} ({year_of(a['release_date'])}) to {b['title']} ({year_of(b['release_date'])})"
    n = len(parts)
    title = f"{name} Movies in Order: All {n} Films | MovieDeck"
    desc = clip(f"Every {name} movie in release order{', ' + span if span else ''}. "
                f"{c.get('overview') or ''}", 158)
    movie_url = lambda p: (SITE + page_path("movie", p["id"], known["movie"][str(p["id"])])
                           if str(p["id"]) in known["movie"] else f"{SITE}/?movie={p['id']}")
    ld = {"@context": "https://schema.org", "@type": "ItemList", "name": f"{name} movies in order",
          "url": url, "numberOfItems": n, "itemListOrder": "https://schema.org/ItemListOrderAscending",
          "itemListElement": [{"@type": "ListItem", "position": i + 1, "url": movie_url(p),
                               "name": p.get("title")} for i, p in enumerate(parts)]}
    crumbs = {"@context": "https://schema.org", "@type": "BreadcrumbList", "itemListElement": [
        {"@type": "ListItem", "position": 1, "name": "Home", "item": SITE + "/"},
        {"@type": "ListItem", "position": 2, "name": "Collections", "item": SITE + "/collection/"},
        {"@type": "ListItem", "position": 3, "name": name, "item": url}]}
    image = f"{IMG}/w1280{c['backdrop_path']}" if c.get("backdrop_path") else None
    out = [head(title, desc, url, image, "website", [ld, crumbs])]
    bg = f' style="--backdrop:url(\'{IMG}/w1280{esc(c["backdrop_path"])}\')"' if c.get("backdrop_path") else ""
    out.append(f'<main>\n<section class="hero"{bg}>\n<div class="hero-in">')
    if c.get("poster_path"):
        out.append(f'<img class="poster" src="{IMG}/w500{esc(c["poster_path"])}" alt="{esc(name)} collection poster" width="500" height="750">')
    out.append('<div class="info">')
    out.append('<nav class="crumbs" aria-label="Breadcrumb"><a href="/">Home</a><span>›</span>'
               f'<a href="/collection/">Collections</a><span>›</span><span>{esc(name)}</span></nav>')
    out.append(f"<h1>{esc(name)} Movies in Order</h1>")
    facts = [f"<li>{n} film{'s' if n != 1 else ''}</li>"]
    if dated:
        y1, y2 = year_of(dated[0]["release_date"]), year_of(dated[-1]["release_date"])
        facts.append(f"<li>{y1}{'–' + y2 if y2 != y1 else ''}</li>")
    rated = [p["vote_average"] for p in parts if p.get("vote_average") and p.get("vote_count", 0) >= 50]
    if rated:
        facts.append(f'<li class="rate">★ {sum(rated) / len(rated):.1f} average</li>')
    out.append(f'<ul class="facts">{"".join(facts)}</ul>')
    if c.get("overview"):
        out.append(f'<p class="lede">{esc(c["overview"])}</p>')
    out.append("</div>\n</div>\n</section>")
    out.append(f'<div class="wrap">\n<section class="block"><h2>All {esc(name)} movies, in release order</h2><ol class="order">')
    for i, p in enumerate(parts, 1):
        key = str(p["id"])
        href = page_path("movie", p["id"], known["movie"][key]) if key in known["movie"] else f"/?movie={p['id']}"
        date = p.get("release_date") or ""
        when = nice_date(date) if date else "Release date to be announced"
        if date and date > TODAY:
            when = f"Coming {nice_date(date)}"
        rating = f' · ★ {p["vote_average"]:.1f}' if p.get("vote_average") and p.get("vote_count", 0) >= 20 else ""
        out.append(
            f'<li><a class="o-poster" href="{esc(href)}"><img src="{IMG}/w185{esc(p["poster_path"])}" '
            f'alt="{esc(p.get("title"))} poster" loading="lazy" width="185" height="278"></a>'
            f'<div class="o-body"><span class="o-num">{i}</span>'
            f'<h3><a href="{esc(href)}">{esc(p.get("title"))}</a></h3>'
            f'<p class="o-meta">{esc(when)}{rating}</p>'
            f'<p>{esc(clip(p.get("overview"), 240))}</p></div></li>')
    out.append("</ol></section>\n</div>\n</main>\n")
    out.append(FOOT)
    return "\n".join(out)


def collections_hub(colls, known):
    items = sorted(colls.values(), key=lambda c: -sum(p.get("popularity") or 0 for p in coll_parts(c)))
    url = SITE + "/collection/"
    h1 = "Movie Collections & Franchises"
    intro = ("Every film in the biggest movie series, in release order: Star Wars, Harry Potter, the "
             "Marvel films, James Bond, Fast & Furious and more.")
    ld = {"@context": "https://schema.org", "@type": "CollectionPage", "name": h1, "url": url,
          "description": intro, "mainEntity": {"@type": "ItemList", "itemListElement": [
              {"@type": "ListItem", "position": i + 1,
               "url": f"{SITE}/collection/{known['collection'][str(c['id'])]}-{c['id']}/"}
              for i, c in enumerate(items[:50])]}}
    cards = []
    for c in items:
        name = coll_title(c.get("name"))
        n = len(coll_parts(c))
        img = (f'<img src="{IMG}/w342{esc(c["poster_path"])}" alt="{esc(name)} collection poster" '
               f'loading="lazy" width="342" height="513">') if c.get("poster_path") else '<span class="noimg"></span>'
        cards.append(f'<a class="card" href="/collection/{known["collection"][str(c["id"])]}-{c["id"]}/">{img}'
                     f'<span class="ct">{esc(name)}</span><span class="cy">{n} films</span></a>')
    return (head(f"{h1} – Watch Order Guides | MovieDeck", clip(intro, 158), url, None, "website", [ld])
            + f'<main class="wrap hub">\n<h1>{esc(h1)}</h1>\n<p class="intro">{esc(intro)}</p>\n'
            + f'<div class="grid">{"".join(cards)}</div>\n</main>\n' + FOOT)


# ---------------------------------------------------------------- people

def person_credits(p):
    """Their best-known movies and shows, most popular first, one entry per title."""
    cc = p.get("combined_credits") or {}
    seen, out = set(), []
    entries = [(c, "cast") for c in cc.get("cast") or []] + [(c, "crew") for c in cc.get("crew") or []]
    # Order by how widely known a title is, so famous work comes first.
    entries.sort(key=lambda e: (-(e[0].get("vote_count") or 0), -(e[0].get("popularity") or 0)))
    for c, role in entries:
        kind = c.get("media_type")
        if kind not in ("movie", "tv") or not c.get("poster_path") or c.get("adult"):
            continue
        # Talk shows and award shows clutter actor pages.
        if kind == "tv" and set(c.get("genre_ids") or []) & {10767, 10763, 10764}:
            continue
        # Skip one-off TV guest spots.
        if kind == "tv" and role == "cast" and (c.get("episode_count") or 0) < 2:
            continue
        key = (kind, c["id"])
        if key in seen:
            continue
        seen.add(key)
        out.append({**summarize(kind, c), "role": c.get("character") if role == "cast" else c.get("job")})
    return out


def person_page(p, slug, known):
    pid = p["id"]
    name = p.get("name") or ""
    url = SITE + f"/person/{slug}-{pid}/"
    credits = person_credits(p)
    dept = p.get("known_for_department") or "Acting"
    noun = {"Acting": "actor", "Directing": "director", "Writing": "writer",
            "Production": "producer"}.get(dept, "filmmaker")
    if dept == "Acting" and p.get("gender") == 1:
        noun = "actress"
    top = [c["name"] for c in credits[:3]]
    known_for = (", ".join(top[:-1]) + " and " + top[-1]) if len(top) > 1 else (top[0] if top else "")
    title = f"{name} Movies and TV Shows | MovieDeck"
    lead = f"{name} is {'an' if noun[0] in 'aeiou' else 'a'} {noun}" + (f" known for {known_for}" if known_for else "") + "."
    desc = clip(f"{lead} See every movie and TV show with {name}, plus biography and photos.", 158)
    photo = f"{IMG}/h632{p['profile_path']}" if p.get("profile_path") else None
    ld = {"@context": "https://schema.org", "@type": "Person", "name": name, "url": url,
          "jobTitle": noun.capitalize()}
    if photo: ld["image"] = photo
    if p.get("birthday"): ld["birthDate"] = p["birthday"]
    if p.get("deathday"): ld["deathDate"] = p["deathday"]
    if p.get("place_of_birth"): ld["birthPlace"] = p["place_of_birth"]
    if p.get("biography"): ld["description"] = clip(p["biography"], 500)
    imdb = p.get("imdb_id")
    if imdb: ld["sameAs"] = [f"https://www.imdb.com/name/{imdb}/"]
    crumbs = {"@context": "https://schema.org", "@type": "BreadcrumbList", "itemListElement": [
        {"@type": "ListItem", "position": 1, "name": "Home", "item": SITE + "/"},
        {"@type": "ListItem", "position": 2, "name": "People", "item": SITE + "/person/"},
        {"@type": "ListItem", "position": 3, "name": name, "item": url}]}
    out = [head(title, desc, url, photo, "profile", [ld, crumbs])]
    out.append('<main>\n<section class="hero">\n<div class="hero-in">')
    if photo:
        out.append(f'<img class="poster" src="{IMG}/w500{esc(p["profile_path"])}" alt="{esc(name)}" width="500" height="750">')
    out.append('<div class="info">')
    out.append('<nav class="crumbs" aria-label="Breadcrumb"><a href="/">Home</a><span>›</span>'
               f'<a href="/person/">People</a><span>›</span><span>{esc(name)}</span></nav>')
    out.append(f"<h1>{esc(name)}</h1>")
    facts = [f"<li>{esc(noun.capitalize())}</li>"]
    if credits: facts.append(f"<li>{len(credits)} titles</li>")
    if p.get("birthday"):
        facts.append(f"<li>Born {esc(nice_date(p['birthday']))}</li>")
    out.append(f'<ul class="facts">{"".join(facts)}</ul>')
    bio = (p.get("biography") or "").strip()
    if bio:
        paras = [x.strip() for x in bio.split("\n") if x.strip()][:4]
        out.append("".join(f'<p class="lede">{esc(x)}</p>' for x in paras))
    else:
        out.append(f'<p class="lede">{esc(lead)}</p>')
    info = []
    if p.get("place_of_birth"): info.append(("Born in", p["place_of_birth"]))
    if p.get("deathday"): info.append(("Died", nice_date(p["deathday"])))
    if info:
        out.append('<dl class="facts-list">' + "".join(
            f"<div><dt>{esc(k)}</dt><dd>{esc(v)}</dd></div>" for k, v in info) + "</dl>")
    out.append("</div>\n</div>\n</section>")
    if credits:
        cards = ""
        for c in credits[:36]:
            role = f'<span class="cy">{esc(c["role"])}</span>' if c.get("role") else ""
            cards += card(c, known).replace("</a>", f"{role}</a>", 1) if role else card(c, known)
        out.append(f'<div class="wrap">\n<section class="block"><h2>Movies and TV shows with {esc(name)}</h2>'
                   f'<div class="grid">{cards}</div></section>\n</div>')
    out.append("</main>\n")
    out.append(FOOT)
    return "\n".join(out)


def people_hub(people, known):
    items = sorted(people.values(), key=lambda p: -(p.get("popularity") or 0))
    url = SITE + "/person/"
    h1 = "Popular Actors and Directors"
    intro = "The people behind today's most popular movies and shows. Open anyone to see everything they've been in."
    ld = {"@context": "https://schema.org", "@type": "CollectionPage", "name": h1, "url": url,
          "description": intro, "mainEntity": {"@type": "ItemList", "itemListElement": [
              {"@type": "ListItem", "position": i + 1,
               "url": f"{SITE}/person/{known['person'][str(p['id'])]}-{p['id']}/"}
              for i, p in enumerate(items[:50])]}}
    cards = []
    for p in items:
        img = (f'<img src="{IMG}/w185{esc(p["profile_path"])}" alt="{esc(p.get("name"))}" '
               f'loading="lazy" width="185" height="278">')
        dept = p.get("known_for_department") or ""
        cards.append(f'<a class="card" href="/person/{known["person"][str(p["id"])]}-{p["id"]}/">{img}'
                     f'<span class="ct">{esc(p.get("name"))}</span><span class="cy">{esc(dept)}</span></a>')
    return (head(f"{h1} | MovieDeck", clip(intro, 158), url, None, "website", [ld])
            + f'<main class="wrap hub">\n<h1>{esc(h1)}</h1>\n<p class="intro">{esc(intro)}</p>\n'
            + f'<div class="grid">{"".join(cards)}</div>\n</main>\n' + FOOT)


# ---------------------------------------------------------------- main

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--cache")
    ap.add_argument("--offline", action="store_true")
    ap.add_argument("--limit", type=int, default=0, help="max new titles to add this run")
    ap.add_argument("--workers", type=int, default=8)
    ap.add_argument("--changed-out", help="write the URLs of new or changed pages to this file")
    ap.add_argument("--ping-file", help="only send the URLs in this file to IndexNow, then stop")
    args = ap.parse_args()
    if args.ping_file:
        with open(args.ping_file, encoding="utf-8") as f:
            urls = [u.strip() for u in f if u.strip()]
        if urls:
            ping_indexnow(urls + [SITE + "/sitemap.xml"])
        return 0
    fx = Fetcher(args.cache, args.offline)

    manifest = {"movie": {}, "tv": {}, "collection": {}, "person": {}}
    if os.path.exists(MANIFEST):
        with open(MANIFEST, encoding="utf-8") as f:
            manifest.update(json.load(f))

    # 1. Collect candidates from the lists.
    found = {"movie": {}, "tv": {}}
    with cf.ThreadPoolExecutor(args.workers) as pool:
        pages = list(pool.map(lambda s: (s[0], fx.get(s[1], page=s[2])), SOURCES))
    for kind, data in pages:
        for r in (data or {}).get("results") or []:
            if r.get("poster_path") and r.get("overview") and not r.get("adult"):
                found[kind].setdefault(str(r["id"]), r.get("popularity") or 0)

    wanted = {k: set(manifest[k]) for k in ("movie", "tv")}
    added = 0
    for kind in ("movie", "tv"):
        new_here = 0
        for tid, _ in sorted(found[kind].items(), key=lambda kv: -kv[1]):
            if tid in wanted[kind]:
                continue
            if args.limit and new_here >= args.limit:
                break
            wanted[kind].add(tid); new_here += 1
        added += new_here

    # 2. Fetch details for every title that has (or will get) a page.
    jobs = [(k, tid) for k in ("movie", "tv") for tid in sorted(wanted[k], key=int)]

    def detail(job):
        kind, tid = job
        return kind, tid, fx.get(f"/{kind}/{tid}",
                                 append_to_response="credits,videos,recommendations,watch/providers")

    details = {"movie": {}, "tv": {}}
    with cf.ThreadPoolExecutor(args.workers) as pool:
        for kind, tid, d in pool.map(detail, jobs):
            if d and d.get("id") and (d.get("overview") or tid in manifest[kind]) and not d.get("adult"):
                details[kind][tid] = d

    # Collections: the seed list, any a movie with a page belongs to, and every
    # collection that already has a page.
    coll_ids = set(manifest["collection"]) | {str(i) for i in COLLECTION_SEEDS}
    for d in details["movie"].values():
        bc = d.get("belongs_to_collection")
        if bc and bc.get("id"):
            coll_ids.add(str(bc["id"]))
    collections = {}
    with cf.ThreadPoolExecutor(args.workers) as pool:
        for cid, c in pool.map(lambda cid: (cid, fx.get(f"/collection/{cid}")), sorted(coll_ids, key=int)):
            if c and c.get("id") and (len(coll_parts(c)) >= 2 or cid in manifest["collection"]):
                collections[cid] = c

    # People: top-billed cast, directors and creators of every title with a page.
    counts = {}
    for kind in ("movie", "tv"):
        for d in details[kind].values():
            credits = d.get("credits") or {}
            for c in (credits.get("cast") or [])[:PEOPLE_TOP_BILLED]:
                counts[str(c["id"])] = counts.get(str(c["id"]), 0) + 1
            for c in credits.get("crew") or []:
                if c.get("job") == "Director":
                    counts[str(c["id"])] = counts.get(str(c["id"]), 0) + 1
            for c in d.get("created_by") or []:
                counts[str(c["id"])] = counts.get(str(c["id"]), 0) + 1
    cap = args.limit * 2 if args.limit else PEOPLE_NEW_PER_RUN
    new_people = [pid for pid, _ in sorted(counts.items(), key=lambda kv: (-kv[1], int(kv[0])))
                  if pid not in manifest["person"]][:cap]
    people = {}
    with cf.ThreadPoolExecutor(args.workers) as pool:
        for pid, pd in pool.map(lambda pid: (pid, fx.get(f"/person/{pid}", append_to_response="combined_credits")),
                                sorted(set(manifest["person"]) | set(new_people), key=int)):
            if pd and pd.get("id") and not pd.get("adult") and (
                    pid in manifest["person"] or (pd.get("profile_path") and len(person_credits(pd)) >= 3)):
                people[pid] = pd

    if args.offline and fx.missing:
        with open(os.path.join(args.cache, "missing.txt"), "w") as f:
            f.write("\n".join(sorted(fx.missing)))
        print(f"{len(fx.missing)} responses missing; listed in {args.cache}/missing.txt")
        return 2

    # 3. Slugs stay the same once given, so URLs never change.
    known = {"movie": {}, "tv": {}, "collection": {}}
    for kind in ("movie", "tv"):
        for tid, entry in manifest[kind].items():
            known[kind][tid] = entry["slug"]
        for tid, d in details[kind].items():
            if tid not in known[kind]:
                known[kind][tid] = slugify(d.get("title") or d.get("name"))
    for cid, entry in manifest["collection"].items():
        known["collection"][cid] = entry["slug"]
    for cid, c in collections.items():
        known["collection"].setdefault(cid, slugify(coll_title(c.get("name"))))
    known["person"] = {pid: e["slug"] for pid, e in manifest["person"].items()}
    for pid, pd in people.items():
        known["person"].setdefault(pid, slugify(pd.get("name")))

    # Genre hubs from everything we know about.
    summaries = [summarize(k, d) for k in ("movie", "tv") for d in details[k].values()]
    genre_names = {}
    by_genre = {}
    for k in ("movie", "tv"):
        for d in details[k].values():
            for g in d.get("genres") or []:
                gs = genre_slug(g["name"], k)
                by_genre.setdefault(gs, {"name": g["name"], "kind": k, "items": []})
                by_genre[gs]["items"].append(summarize(k, d))
    by_genre = {gs: v for gs, v in by_genre.items() if len(v["items"]) >= 8}
    for v in by_genre.values():
        v["items"].sort(key=lambda t: -t["pop"])

    # 4. Title pages.
    written = 0
    changed = []
    for kind in ("movie", "tv"):
        for tid, d in details[kind].items():
            slug = known[kind][tid]
            content = title_page(kind, d, slug, known, genre_names, by_genre)
            path = os.path.join(ROOT, kind, f"{slug}-{tid}", "index.html")
            digest = hashlib.sha1(content.encode()).hexdigest()[:12]
            prev = manifest[kind].get(tid, {})
            if write_if_changed(path, content):
                written += 1
                changed.append(SITE + page_path(kind, tid, slug))
            manifest[kind][tid] = {"slug": slug, "hash": digest,
                                   "lastmod": prev.get("lastmod") if prev.get("hash") == digest else TODAY,
                                   "pop": round(d.get("popularity") or 0, 1)}

    # 5. Hubs.
    hubs = []
    for kind, h1, intro in (
        ("movie", "Popular Movies",
         "Browse popular and top-rated movies on MovieDeck. Open any film to see its cast, trailer, "
         "ratings, where it's streaming and similar movies."),
        ("tv", "Popular TV Shows",
         "Browse popular and top-rated TV series on MovieDeck. Open any show to see its seasons, cast, "
         "trailer, ratings and where it's streaming."),
    ):
        items = sorted((s for s in summaries if s["kind"] == kind), key=lambda t: -t["pop"])
        chips = "".join(f'<a class="chip" href="/genre/{gs}/">{esc(v["name"])}</a>'
                        for gs, v in sorted(by_genre.items(), key=lambda kv: kv[1]["name"])
                        if v["kind"] == kind)
        chips = f'<div class="chips">{chips}</div>\n' if chips else ""
        write_if_changed(os.path.join(ROOT, kind, "index.html"),
                         hub_page(f"/{kind}/", h1, intro, items, known, chips))
        hubs.append(f"/{kind}/")
    for gs, v in by_genre.items():
        what = "TV Shows" if v["kind"] == "tv" else "Movies"
        h1 = f"Best {v['name']} {what}"
        intro = (f"The most popular {v['name'].lower()} {what.lower()} right now. Open any title to see "
                 f"its cast, trailer, ratings and where to stream it.")
        write_if_changed(os.path.join(ROOT, "genre", gs, "index.html"),
                         hub_page(f"/genre/{gs}/", h1, intro, v["items"], known))
        hubs.append(f"/genre/{gs}/")
    for cid, c in collections.items():
        slug = known["collection"][cid]
        content = collection_page(c, slug, known)
        digest = hashlib.sha1(content.encode()).hexdigest()[:12]
        prev = manifest["collection"].get(cid, {})
        if write_if_changed(os.path.join(ROOT, "collection", f"{slug}-{cid}", "index.html"), content):
            written += 1
            changed.append(SITE + page_path("collection", cid, slug))
        manifest["collection"][cid] = {
            "slug": slug, "hash": digest,
            "lastmod": prev.get("lastmod") if prev.get("hash") == digest else TODAY,
            "pop": round(sum(p.get("popularity") or 0 for p in coll_parts(c)), 1)}
    if collections:
        write_if_changed(os.path.join(ROOT, "collection", "index.html"), collections_hub(collections, known))
        hubs.append("/collection/")
    for pid, pd in people.items():
        slug = known["person"][pid]
        content = person_page(pd, slug, known)
        digest = hashlib.sha1(content.encode()).hexdigest()[:12]
        prev = manifest["person"].get(pid, {})
        if write_if_changed(os.path.join(ROOT, "person", f"{slug}-{pid}", "index.html"), content):
            written += 1
            changed.append(SITE + page_path("person", pid, slug))
        manifest["person"][pid] = {
            "slug": slug, "hash": digest,
            "lastmod": prev.get("lastmod") if prev.get("hash") == digest else TODAY,
            "pop": round(pd.get("popularity") or 0, 1)}
    if people:
        write_if_changed(os.path.join(ROOT, "person", "index.html"), people_hub(people, known))
        hubs.append("/person/")

    # 6. Sitemap, manifest and the slug index for the app.
    urls = [f"  <url><loc>{SITE}/</loc><changefreq>daily</changefreq><priority>1.0</priority></url>",
            f"  <url><loc>{SITE}/app/</loc><changefreq>monthly</changefreq><priority>0.7</priority></url>"]
    urls += [f"  <url><loc>{SITE}{h}</loc><lastmod>{TODAY}</lastmod><changefreq>daily</changefreq>"
             f"<priority>0.8</priority></url>" for h in sorted(hubs)]
    for kind in ("collection", "movie", "tv", "person"):
        for tid, e in sorted(manifest[kind].items(), key=lambda kv: -kv[1].get("pop", 0)):
            urls.append(f"  <url><loc>{SITE}{page_path(kind, tid, e['slug'])}</loc>"
                        f"<lastmod>{e['lastmod']}</lastmod></url>")
    write_if_changed(os.path.join(ROOT, "sitemap.xml"),
                     '<?xml version="1.0" encoding="UTF-8"?>\n'
                     '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n'
                     + "\n".join(urls) + "\n</urlset>\n")
    os.makedirs(os.path.dirname(MANIFEST), exist_ok=True)
    write_if_changed(MANIFEST, json.dumps(manifest, indent=0, sort_keys=True) + "\n")
    write_if_changed(SLUGS, json.dumps(known,
                                       sort_keys=True, separators=(",", ":")) + "\n")
    print(f"titles: {len(details['movie'])} movies, {len(details['tv'])} series "
          f"({added} new); collections: {len(collections)}; people: {len(people)}; pages written: {written}; hubs: {len(hubs)}")
    if args.changed_out:
        with open(args.changed_out, "w", encoding="utf-8") as f:
            f.write("\n".join(changed))
    return 0


def ping_indexnow(urls):
    for i in range(0, len(urls), 10000):
        body = json.dumps({"host": "moviedeck.xyz", "key": INDEXNOW_KEY,
                           "keyLocation": f"{SITE}/{INDEXNOW_KEY}.txt",
                           "urlList": urls[i:i + 10000]}).encode()
        req = urllib.request.Request("https://api.indexnow.org/indexnow", data=body,
                                     headers={"Content-Type": "application/json; charset=utf-8"})
        try:
            with urllib.request.urlopen(req, timeout=30) as r:
                print(f"IndexNow: sent {len(urls[i:i + 10000])} URLs ({r.status})")
        except Exception as e:  # never fail the build over a ping
            print(f"IndexNow: {e}")


if __name__ == "__main__":
    sys.exit(main())
