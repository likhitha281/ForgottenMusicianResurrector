"""
Forgotten Musician Resurrector — Backend (Open Source Stack)
=============================================================
Pipeline:
  1. Last.fm API         → find artists by genre tag + listener data
  2. MusicBrainz API     → verify era, get exact release history
  3. Last.fm API         → fetch full bios + play stats
  4. Brave Search API    → silence check (any activity in last 2 years?)
  5. Playwright          → scrape Bandcamp for bio, location, tags
  6. Groq (Llama 3.3 70B) → synthesise cold case profiles
"""

import os
import re
import json
import asyncio
from typing import Optional

import httpx
from fastapi import FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from dotenv import load_dotenv
from playwright.async_api import async_playwright

load_dotenv()

LASTFM_API_KEY = os.getenv("LASTFM_API_KEY")
# No Brave key needed — using DuckDuckGo (free, no signup)
GROQ_API_KEY   = os.getenv("GROQ_API_KEY")

app = FastAPI(title="Forgotten Musician Resurrector API")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
)


# ── Models ────────────────────────────────────────────────────────────────────

class SearchRequest(BaseModel):
    genre: str
    era: str


# ── Helpers ───────────────────────────────────────────────────────────────────

def parse_era(era: str) -> tuple[int, int]:
    """Convert '2010–2015' or '2010-2015' to (2010, 2015)."""
    parts = re.split(r"[–\-]", era.strip())
    return int(parts[0].strip()), int(parts[1].strip())


def strip_html(text: str) -> str:
    text = re.sub(r"<a[^>]*>.*?</a>", "", text, flags=re.DOTALL)
    text = re.sub(r"<[^>]+>", "", text)
    return text.strip()


# ── Step 1: Last.fm tag search ────────────────────────────────────────────────

async def lastfm_tag_artists(tag: str, limit: int = 50) -> list[dict]:
    """
    Returns top artists for a genre tag from Last.fm.
    Falls back to a simplified tag if the exact one returns nothing.
    """
    tags_to_try = [tag, tag.split()[0], tag.replace(" ", "-")]

    async with httpx.AsyncClient(timeout=15) as client:
        for t in tags_to_try:
            resp = await client.get(
                "http://ws.audioscrobbler.com/2.0/",
                params={
                    "method": "tag.gettopartists",
                    "tag": t,
                    "api_key": LASTFM_API_KEY,
                    "format": "json",
                    "limit": limit,
                },
            )
            resp.raise_for_status()
            data = resp.json()
            artists = data.get("topartists", {}).get("artist", [])
            if artists:
                print(f"  Last.fm: found {len(artists)} artists for tag '{t}'")
                return artists

    return []


# ── Step 2: MusicBrainz era filter ───────────────────────────────────────────

MB_HEADERS = {
    "User-Agent": "ForgottenMusicianResurrector/1.0 (hackathon-project)"
}


async def mb_search_artist(name: str) -> Optional[dict]:
    """Search MusicBrainz for an artist by name. Rate-limited to 1 req/sec."""
    async with httpx.AsyncClient(timeout=15, headers=MB_HEADERS) as client:
        resp = await client.get(
            "https://musicbrainz.org/ws/2/artist",
            params={"query": f'artist:"{name}"', "fmt": "json", "limit": 3},
        )
        resp.raise_for_status()
        artists = resp.json().get("artists", [])
        return artists[0] if artists else None


async def mb_artist_releases(mbid: str) -> list[dict]:
    """Fetch all releases for an artist. Rate-limited to 1 req/sec."""
    async with httpx.AsyncClient(timeout=20, headers=MB_HEADERS) as client:
        resp = await client.get(
            "https://musicbrainz.org/ws/2/release",
            params={"artist": mbid, "fmt": "json", "limit": 100},
        )
        resp.raise_for_status()
        return resp.json().get("releases", [])


async def check_era_match(
    artist: dict, era_start: int, era_end: int
) -> Optional[dict]:
    """
    Cross-references a Last.fm artist with MusicBrainz.
    Returns enriched artist dict if they had releases in the target era, else None.
    """
    name = artist.get("name", "")
    mbid = artist.get("mbid", "")

    # MusicBrainz rate limit: strictly 1 req/sec
    await asyncio.sleep(1.1)

    try:
        mb = await mb_search_artist(name) if not mbid else {"id": mbid}
        if not mb:
            return None

        real_mbid = mb.get("id", mbid)
        if not real_mbid:
            return None

        await asyncio.sleep(1.1)
        releases = await mb_artist_releases(real_mbid)

        years = []
        for r in releases:
            date = r.get("date", "")
            if date and len(date) >= 4:
                try:
                    years.append(int(date[:4]))
                except ValueError:
                    pass

        if not years:
            return None

        had_era_releases = any(era_start <= y <= era_end for y in years)
        if not had_era_releases:
            return None

        last_release = max(years)
        first_release = min(years)

        return {
            "name": name,
            "mbid": real_mbid,
            "listeners": int(artist.get("listeners", 0)),
            "first_release": first_release,
            "last_release": last_release,
            "release_years": sorted(set(years)),
            "peak_year": sorted(years)[-2] if len(years) > 1 else years[0],
            "possibly_quiet": last_release <= era_end + 2,
        }

    except Exception as e:
        print(f"  MusicBrainz failed for '{name}': {e}")
        return None


# ── Step 3: Last.fm artist info (bio + stats) ─────────────────────────────────

async def lastfm_artist_info(name: str) -> dict:
    """Fetch detailed artist info: bio, listeners, playcount, top tags."""
    async with httpx.AsyncClient(timeout=15) as client:
        resp = await client.get(
            "http://ws.audioscrobbler.com/2.0/",
            params={
                "method": "artist.getinfo",
                "artist": name,
                "api_key": LASTFM_API_KEY,
                "format": "json",
            },
        )
        resp.raise_for_status()
        return resp.json().get("artist", {})


# ── Step 4: DuckDuckGo silence check (no API key, no signup) ─────────────────

async def silence_check(artist_name: str) -> dict:
    """
    Uses DuckDuckGo's free Instant Answer API to check for recent artist activity.
    No API key, no account, no credit card — just a plain HTTP call.
    < 3 results = 'went quiet'.
    """
    async with httpx.AsyncClient(timeout=15) as client:
        resp = await client.get(
            "https://api.duckduckgo.com/",
            params={
                "q": f'"{artist_name}" music 2024 OR 2025',
                "format": "json",
                "no_html": 1,
                "skip_disambig": 1,
            },
            headers={"User-Agent": "Mozilla/5.0"},
        )
        resp.raise_for_status()
        data = resp.json()

    related  = data.get("RelatedTopics", [])
    abstract = data.get("AbstractText", "")
    results  = len(related) + (1 if abstract else 0)

    return {
        "recent_result_count": results,
        "went_quiet": results < 3,
        "abstract": abstract[:300] if abstract else "",
    }


# ── Step 5: Playwright — Bandcamp scrape ──────────────────────────────────────

async def scrape_bandcamp(artist_name: str) -> dict:
    """
    Uses Playwright to search Bandcamp and scrape the artist's page.
    Extracts: URL, bio, location, tags.
    """
    result = {"bandcamp_url": None, "bandcamp_bio": "", "location": "", "bandcamp_tags": []}

    try:
        async with async_playwright() as p:
            browser = await p.chromium.launch(headless=True)
            page = await browser.new_page(
                user_agent="Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36"
            )

            # Search Bandcamp
            search_url = f"https://bandcamp.com/search?q={artist_name.replace(' ', '+')}&item_type=b"
            await page.goto(search_url, wait_until="domcontentloaded", timeout=15000)
            await page.wait_for_timeout(2000)

            # First artist result
            link_el = await page.query_selector(".result-info .heading a")
            if not link_el:
                await browser.close()
                return result

            url = await link_el.get_attribute("href")
            if not url:
                await browser.close()
                return result

            result["bandcamp_url"] = url

            # Navigate to artist page
            await page.goto(url, wait_until="domcontentloaded", timeout=15000)
            await page.wait_for_timeout(2500)

            # Bio
            for selector in [".bio-text", "#bio-text", '[class*="bio"]']:
                bio_el = await page.query_selector(selector)
                if bio_el:
                    result["bandcamp_bio"] = (await bio_el.inner_text())[:500]
                    break

            # Location
            for selector in [".location", '[class*="location"]', ".subscriberid"]:
                loc_el = await page.query_selector(selector)
                if loc_el:
                    loc_text = (await loc_el.inner_text()).strip()
                    if loc_text:
                        result["location"] = loc_text
                        break

            # Tags
            tag_els = await page.query_selector_all(".tag, .genre-tag")
            result["bandcamp_tags"] = [
                await t.inner_text() for t in tag_els[:5]
            ]

            await browser.close()

    except Exception as e:
        print(f"  Playwright failed for '{artist_name}': {e}")

    return result


# ── Step 6: Groq — cold case profile generation ───────────────────────────────

async def generate_profiles(genre: str, era: str, artists: list[dict]) -> list[dict]:
    """
    Sends enriched artist data to Groq (Llama 3.3 70B) to generate profiles.
    """
    dump = json.dumps(artists, indent=2)

    async with httpx.AsyncClient(timeout=60) as client:
        resp = await client.post(
            "https://api.groq.com/openai/v1/chat/completions",
            headers={
                "Authorization": f"Bearer {GROQ_API_KEY}",
                "Content-Type": "application/json",
            },
            json={
                "model": "llama-3.3-70b-versatile",
                "temperature": 0.7,
                "max_tokens": 2000,
                "messages": [
                    {
                        "role": "system",
                        "content": (
                            "You are a senior music scout specialising in overlooked talent. "
                            "Given structured artist data, write cold case profiles. "
                            "CRITICAL: Return ONLY a raw JSON array. No markdown. No backticks. No preamble."
                        ),
                    },
                    {
                        "role": "user",
                        "content": f"""Here is enriched data for {genre} artists from {era}.
Fields: name, release history (from MusicBrainz), bio (from Last.fm + Bandcamp),
listener counts, silence check results (went_quiet = true means < 3 recent web hits).

DATA:
{dump}

Return ONLY a JSON array:
[
  {{
    "name": "exact name from data",
    "genre": "their specific subgenre",
    "peakYear": <number>,
    "lastKnownActivity": "year + what they did — use release_years and last_release",
    "currentStatus": "1-2 sentence speculation on where they are now",
    "buzzDescription": "2-3 sentences on their peak using bio + listener data",
    "scoutScore": <1-10>,
    "scoutReason": "one sentence justifying the score for an indie label",
    "location": "city/region from bandcamp data or Unknown"
  }}
]""",
                    },
                ],
            },
        )
        resp.raise_for_status()
        data = resp.json()

    raw = data["choices"][0]["message"]["content"]
    cleaned = raw.replace("```json", "").replace("```", "").strip()
    match = re.search(r"\[[\s\S]*\]", cleaned)
    if not match:
        raise ValueError("Groq returned no valid JSON array")
    return json.loads(match.group())


# ── Main route ────────────────────────────────────────────────────────────────

@app.post("/api/search")
async def search_artists(request: SearchRequest):
    genre = request.genre.strip()
    era   = request.era.strip()

    if not genre:
        raise HTTPException(status_code=400, detail="genre is required")

    era_start, era_end = parse_era(era)

    # ── 1. Last.fm: find candidate artists for the genre tag ───────────────
    print(f"\n[1/6] Last.fm tag search: '{genre}'")
    try:
        raw_artists = await lastfm_tag_artists(genre, limit=50)
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Last.fm error: {e}")

    if not raw_artists:
        raise HTTPException(
            status_code=404,
            detail=f"No artists found for genre '{genre}'. Try a simpler tag (e.g. 'shoegaze' vs 'heavy shoegaze')."
        )

    # ── 2. MusicBrainz: filter to artists active in the era ───────────────
    print(f"[2/6] MusicBrainz era check — scanning up to 15 artists")
    era_matched: list[dict] = []

    for artist in raw_artists[:15]:
        result = await check_era_match(artist, era_start, era_end)
        if result:
            era_matched.append(result)
        if len(era_matched) >= 8:
            break

    if not era_matched:
        raise HTTPException(
            status_code=404,
            detail="No artists with releases in that era. Try adjusting the era range."
        )

    # Prioritise artists who went quiet (core product value)
    era_matched.sort(key=lambda a: (not a["possibly_quiet"], -a["listeners"]))
    candidates = era_matched[:6]

    # ── 3. Last.fm: fetch full bios and play stats ─────────────────────────
    print(f"[3/6] Last.fm artist bios for {len(candidates)} candidates")
    for artist in candidates:
        try:
            info = await lastfm_artist_info(artist["name"])
            bio = strip_html(info.get("bio", {}).get("summary", ""))
            artist["bio"]       = bio[:500]
            artist["playcount"] = int(info.get("stats", {}).get("playcount", 0))
            artist["tags"]      = [t["name"] for t in info.get("tags", {}).get("tag", [])[:5]]
        except Exception as e:
            print(f"  Last.fm info failed for '{artist['name']}': {e}")
            artist["bio"]       = ""
            artist["playcount"] = 0
            artist["tags"]      = []

    # ── 4. Brave Search: silence check ────────────────────────────────────
    print(f"[4/6] DuckDuckGo silence check for {len(candidates)} artists")
    silence_tasks = [silence_check(a["name"]) for a in candidates]
    silence_results = await asyncio.gather(*silence_tasks, return_exceptions=True)

    for i, result in enumerate(silence_results):
        if isinstance(result, Exception):
            print(f"  DDG failed for '{candidates[i]['name']}': {result}")
            candidates[i]["went_quiet"]          = candidates[i]["possibly_quiet"]
            candidates[i]["recent_result_count"] = None
        else:
            candidates[i].update(result)

    # ── 5. Playwright: Bandcamp scrape for top 3 ──────────────────────────
    print(f"[5/6] Playwright Bandcamp scrape for top 3 artists")
    for artist in candidates[:3]:
        bc = await scrape_bandcamp(artist["name"])
        artist.update(bc)

    # ── 6. Groq: generate cold case profiles ──────────────────────────────
    print(f"[6/6] Groq (Llama 3.3 70B): generating profiles")
    try:
        profiles = await generate_profiles(genre, era, candidates)
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Profile generation failed: {e}")

    return {
        "artists": profiles,
        "pipeline": {
            "lastfm_results":      len(raw_artists),
            "musicbrainz_checked": min(15, len(raw_artists)),
            "era_matches":         len(era_matched),
            "went_quiet":          sum(1 for a in candidates if a.get("went_quiet")),
            "profiles_generated":  len(profiles),
        },
    }


@app.get("/health")
async def health():
    return {
        "status": "ok",
        "stack": ["lastfm", "musicbrainz", "duckduckgo", "playwright", "groq_llama3.3"],
    }