"""Respectful scraper for explicitly listed public insurance pages.

URLs may be plain URLs or `category|URL`, where category is health, car,
life, travel, or general. Check site terms and robots.txt before crawling.
"""
from pathlib import Path
from datetime import datetime, timezone
from urllib.parse import urlparse
from urllib.robotparser import RobotFileParser
import json
import time
import requests
from bs4 import BeautifulSoup

ROOT = Path(__file__).resolve().parent
URL_FILE = ROOT / "urls.txt"
OUT = ROOT / "scraped_data" / "raw" / "insurance_pages.jsonl"
USER_AGENT = "InsureMateResearchBot/1.0 (educational project)"
HEADERS = {"User-Agent": USER_AGENT}
SKIP_TAGS = ["script", "style", "nav", "footer", "header", "noscript", "svg", "form"]
ALLOWED_CATEGORIES = {"health", "car", "life", "travel", "general"}


def parse_url_line(line: str) -> tuple[str, str]:
    if "|" in line:
        category, url = line.split("|", 1)
        category = category.strip().lower()
        if category in ALLOWED_CATEGORIES:
            return category, url.strip()
    return "general", line.strip()


def allowed_by_robots(url: str) -> bool:
    parsed = urlparse(url)
    robots_url = f"{parsed.scheme}://{parsed.netloc}/robots.txt"
    parser = RobotFileParser()
    parser.set_url(robots_url)
    try:
        response = requests.get(robots_url, headers=HEADERS, timeout=12)
        if response.status_code == 404:
            return True
        response.raise_for_status()
        parser.parse(response.text.splitlines())
        return parser.can_fetch(USER_AGENT, url)
    except requests.RequestException:
        # If robots.txt cannot be checked, do not crawl that host automatically.
        return False


def extract_page(url: str, category: str) -> dict | None:
    if not allowed_by_robots(url):
        print(f"Skipped (robots.txt disallows or could not be checked): {url}")
        return None
    response = requests.get(url, headers=HEADERS, timeout=25)
    response.raise_for_status()
    content_type = response.headers.get("content-type", "").lower()
    if "text/html" not in content_type:
        return None
    soup = BeautifulSoup(response.text, "html.parser")
    title = soup.title.get_text(" ", strip=True) if soup.title else urlparse(url).netloc
    for tag in soup(SKIP_TAGS):
        tag.decompose()
    main = soup.find("main") or soup.find("article") or soup.body or soup
    blocks = []
    for element in main.find_all(["h1", "h2", "h3", "p", "li"]):
        text = " ".join(element.get_text(" ", strip=True).split())
        if len(text) >= 35:
            blocks.append(text)
    unique = list(dict.fromkeys(blocks))
    if not unique:
        return None
    return {
        "provider_domain": urlparse(url).netloc,
        "title": title,
        "source_url": url,
        "category": category,
        "collected_at": datetime.now(timezone.utc).isoformat(),
        "text": "\n".join(unique),
    }


def main():
    if not URL_FILE.exists():
        URL_FILE.write_text(
            "# Add one permitted URL per line. Optional format: health|https://example.com/page\n",
            encoding="utf-8",
        )
        print(f"Created {URL_FILE}. Add URLs and run again.")
        return
    entries = [parse_url_line(line.strip()) for line in URL_FILE.read_text(encoding="utf-8").splitlines()
               if line.strip() and not line.strip().startswith("#")]
    OUT.parent.mkdir(parents=True, exist_ok=True)
    seen = set()
    if OUT.exists():
        for line in OUT.read_text(encoding="utf-8").splitlines():
            try:
                seen.add(json.loads(line).get("source_url"))
            except json.JSONDecodeError:
                pass
    count = 0
    with OUT.open("a", encoding="utf-8") as handle:
        for category, url in entries:
            if url in seen:
                print(f"Skipping already collected: {url}")
                continue
            try:
                record = extract_page(url, category)
                if record:
                    handle.write(json.dumps(record, ensure_ascii=False) + "\n")
                    count += 1
                    print(f"Collected [{category}]: {record['title']}")
                else:
                    print(f"No suitable HTML text found: {url}")
            except requests.RequestException as exc:
                print(f"Failed {url}: {exc}")
            time.sleep(2)
    print(f"Added {count} page(s) to {OUT}")


if __name__ == "__main__":
    main()
