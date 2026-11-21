from pathlib import Path
from datetime import datetime, timezone
import json
import fitz

ROOT = Path(__file__).resolve().parent
PDF_DIR = ROOT / "scraped_data" / "pdfs"
OUT = ROOT / "scraped_data" / "raw" / "insurance_pdfs.jsonl"


def main():
    PDF_DIR.mkdir(parents=True, exist_ok=True)
    OUT.parent.mkdir(parents=True, exist_ok=True)
    count = 0
    with OUT.open("w", encoding="utf-8") as output:
        for path in PDF_DIR.glob("*.pdf"):
            try:
                with fitz.open(path) as doc:
                    text = "\n".join(page.get_text("text") for page in doc)
                if len(text.strip()) < 80:
                    continue
                record = {
                    "title": path.stem,
                    "source_url": "local-file:" + path.name,
                    "collected_at": datetime.now(timezone.utc).isoformat(),
                    "text": " ".join(text.split()),
                }
                output.write(json.dumps(record, ensure_ascii=False) + "\n")
                count += 1
            except Exception as exc:
                print(f"Could not read {path.name}: {exc}")
    print(f"Extracted text from {count} PDF(s)")


if __name__ == "__main__":
    main()
