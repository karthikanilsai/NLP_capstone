from pathlib import Path
import json
import re

ROOT = Path(__file__).resolve().parent
SOURCE = ROOT / "scraped_data" / "raw" / "insurance_pages.jsonl"
TARGET = ROOT / "scraped_data" / "cleaned" / "insurance_dataset.jsonl"


def clean_text(text: str) -> str:
    text = re.sub(r"\s+", " ", text)
    text = re.sub(r"\b(cookie preferences|accept all cookies|skip to content)\b", " ", text, flags=re.I)
    return text.strip()


def main():
    if not SOURCE.exists():
        print("No scraped data found. Run python ml/scraper.py first.")
        return
    TARGET.parent.mkdir(parents=True, exist_ok=True)
    count = 0
    with SOURCE.open(encoding="utf-8") as source, TARGET.open("w", encoding="utf-8") as target:
        for line in source:
            try:
                row = json.loads(line)
            except json.JSONDecodeError:
                continue
            text = clean_text(row.get("text", ""))
            if len(text) < 80:
                continue
            row["text"] = text
            target.write(json.dumps(row, ensure_ascii=False) + "\n")
            count += 1
    print(f"Wrote {count} cleaned page(s) to {TARGET}")


if __name__ == "__main__":
    main()
